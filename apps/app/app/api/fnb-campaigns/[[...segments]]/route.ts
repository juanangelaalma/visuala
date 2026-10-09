import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api/client";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const routes = {
  GET: new RegExp(`^(?:|style-presets|${uuid}|${uuid}/(?:render-jobs|download)/${uuid}|${uuid}/composition/[0-9]+)$`),
  POST: new RegExp(`^(?:|${uuid}/(?:assets|generate|approve|render))$`),
  PUT: new RegExp(`^${uuid}/draft$`),
};

type RouteContext = { params: Promise<{ segments?: string[] }> };

async function bridge(request: NextRequest, context: RouteContext) {
  const { segments = [] } = await context.params;
  const path = segments.join("/");
  const method = request.method;

  if (method !== "GET" && method !== "POST" && method !== "PUT") {
    return NextResponse.json({ error: "Endpoint tidak ditemukan." }, { status: 404 });
  }

  if (!routes[method].test(path)) return NextResponse.json({ error: "Endpoint tidak ditemukan." }, { status: 404 });

  if (method !== "GET" && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Asal permintaan tidak diizinkan." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali untuk melanjutkan." }, { status: 401 });

  try {
    const body = method === "GET" ? undefined : path.endsWith("/assets") ? await request.formData() : await request.json();
    const query = path.includes("/composition/") ? "?format=json" : "";

    const payload = await apiFetch<unknown>(`/fnb-campaigns${path ? `/${path}` : ""}${query}`, {
      method, body, accessToken,
    });

    return NextResponse.json(payload, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.payload ?? { error: error.message }, { status: error.status });

    if (error instanceof SyntaxError) return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });

    return NextResponse.json({ error: "Backend tidak dapat dihubungi. Draft Anda tetap tersedia; coba lagi." }, { status: 502 });
  }
}

export const GET = bridge;

export const POST = bridge;

export const PUT = bridge;
