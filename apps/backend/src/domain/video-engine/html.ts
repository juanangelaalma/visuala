const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Module copy is model- or user-authored, so it is escaped; no value is interpolated into an attribute or a script. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (character) => ESCAPES[character] ?? character);
}
