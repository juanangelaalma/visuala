import { NextResponse } from "next/server";
import { logout } from "@/application/auth/logout";
import { createWritableAuthServices } from "@/application/auth/services";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export async function POST(request: Request) {
  const { authProvider } = await createWritableAuthServices();
  await logout(authProvider);

  return NextResponse.redirect(new URL("/login", request.url));
}
