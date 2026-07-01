import { getAppEnv } from "@/shared/config/env";

export function isAdminEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmails = getAppEnv().ADMIN_EMAILS.split(",").map((adminEmail) => adminEmail.trim().toLowerCase()).filter(Boolean);

  return adminEmails.includes(normalizedEmail);
}
