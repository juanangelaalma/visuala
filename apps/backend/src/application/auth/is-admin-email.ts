import { getEnv } from "@/env";

export function isAdminEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmails = getEnv()
    .ADMIN_EMAILS.split(",")
    .map((adminEmail) => adminEmail.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(normalizedEmail);
}
