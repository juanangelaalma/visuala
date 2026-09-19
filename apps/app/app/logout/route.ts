import { NextResponse } from "next/server";
import { createSupabaseWritableServerClient } from "@/infrastructure/supabase/server-client";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export async function POST(request: Request) {
  const supabase = await createSupabaseWritableServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url));
}
