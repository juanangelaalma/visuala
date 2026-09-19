const API_ORIGIN = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getApiUrl(path: string): string {
  return new URL(path, API_ORIGIN).toString();
}
