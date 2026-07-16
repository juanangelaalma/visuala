const BILLING_CHECKOUT_PATH = /^\/billing\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/checkout$/i;

export function getSafeAuthRedirect(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return BILLING_CHECKOUT_PATH.test(value) ? value : null;
}
