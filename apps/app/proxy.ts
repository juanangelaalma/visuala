import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseProxyClient } from "@/infrastructure/supabase/proxy-client";

const protectedPrefixes = ["/dashboard", "/app"];
const authRoutes = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { supabase, response } = createSupabaseProxyClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthRoute = authRoutes.includes(pathname);

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "Please log in to continue.");
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*", "/login", "/register"],
};

export const proxyConfig = config;
