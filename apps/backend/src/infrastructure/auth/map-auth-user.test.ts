import { describe, expect, it } from "vitest";
import { toAuthUser } from "./map-auth-user";

describe("toAuthUser", () => {
  it("maps id, email and metadata", () => {
    const user = { id: "user-1", email: "user@example.com", user_metadata: { full_name: "User", avatar_url: "https://avatar.example.com/a.png" } };

    expect(toAuthUser(user as never)).toEqual({
      id: "user-1",
      email: "user@example.com",
      fullName: "User",
      avatarUrl: "https://avatar.example.com/a.png",
    });
  });

  it("defaults missing metadata to null", () => {
    const user = { id: "user-1", email: "user@example.com", user_metadata: {} };

    expect(toAuthUser(user as never)).toEqual({ id: "user-1", email: "user@example.com", fullName: null, avatarUrl: null });
  });

  it("ignores non string metadata values", () => {
    const user = { id: "user-1", email: "user@example.com", user_metadata: { full_name: 42, avatar_url: false } };

    expect(toAuthUser(user as never)).toMatchObject({ fullName: null, avatarUrl: null });
  });

  it("returns null when the user has no email", () => {
    const user = { id: "user-1", email: undefined, user_metadata: {} };

    expect(toAuthUser(user as never)).toBeNull();
  });
});
