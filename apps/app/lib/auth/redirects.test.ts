import { describe, expect, it } from "vitest";
import { getRoleRedirectPath, getSafeAuthRedirect } from "./redirects";

describe("auth redirect policies", () => {
  it.each([
    ["admin", "/admin/dashboard"],
    ["user", "/dashboard"],
    [undefined, "/dashboard"],
  ])("redirects %s role to %s", (role, path) => {
    expect(getRoleRedirectPath(role)).toBe(path);
  });

  it("allows a billing checkout redirect", () => {
    expect(getSafeAuthRedirect("/billing/plans/123e4567-e89b-12d3-a456-426614174000/checkout")).toContain("/billing/plans/");
  });

  it.each([null, undefined, "https://evil.test", "/dashboard", "/admin/dashboard", 42])("rejects unsafe redirect %s", (value) => {
    expect(getSafeAuthRedirect(value as never)).toBeNull();
  });
});
