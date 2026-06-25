import { NextResponse } from "next/server";
import { logout } from "@/application/auth/logout";
import { createAuthServices } from "@/application/auth/services";

export async function GET(request: Request) {
  const { authProvider } = await createAuthServices();
  await logout(authProvider);

  return NextResponse.redirect(new URL("/login", request.url));
}
