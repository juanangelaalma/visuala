import { describe, expect, it } from "vitest";
import { getRoleRedirectPath } from "./get-role-redirect";
import { getSafeAuthRedirect } from "./get-safe-auth-redirect";
import { AuthDomainError, toFriendlyAuthError } from "@/domain/auth/errors";

describe("auth policies", () => {
  it.each([["admin", "/admin/dashboard"], ["user", "/dashboard"], [undefined, "/dashboard"]])("redirects %s role", (role, path) => {
    expect(getRoleRedirectPath(role)).toBe(path);
  });

  it("allows billing checkout redirect", () => {
    expect(getSafeAuthRedirect("/billing/plans/123e4567-e89b-12d3-a456-426614174000/checkout")).toContain("/billing/plans/");
  });

  it.each([null, undefined, "https://evil.test", "/dashboard", new File([], "x")])("rejects unsafe redirect", (value) => {
    expect(getSafeAuthRedirect(value)).toBeNull();
  });

  it("returns domain error message", () => {
    expect(toFriendlyAuthError(new AuthDomainError("session_expired", "Sign in again."))).toBe("Sign in again.");
  });

  it("hides unexpected error", () => {
    expect(toFriendlyAuthError(new Error("database detail"))).toBe("Something went wrong. Please try again.");
  });
});
