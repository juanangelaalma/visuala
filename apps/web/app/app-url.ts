const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_API_URL ?? "http://localhost:3000";

export function getAppUrl(path: string): string {
  return new URL(path, APP_ORIGIN).toString();
}
