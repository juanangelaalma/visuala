export function getRoleRedirectPath(role: string | undefined): string {
  return role === "admin" ? "/admin/dashboard" : "/dashboard";
}
