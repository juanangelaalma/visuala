import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: vi.fn(() => ({ send: mocks.send })), GetObjectCommand: class {}, PutObjectCommand: class {}, DeleteObjectCommand: class {} }));

describe("R2ObjectStore", () => {
  it("rejects ContentLength above the read cap before consuming the body", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "account"); vi.stubEnv("R2_ACCESS_KEY_ID", "key"); vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret"); vi.stubEnv("R2_BUCKET", "bucket");
    const transformToByteArray = vi.fn();
    mocks.send.mockResolvedValue({ ContentLength: 11, Body: { transformToByteArray } });
    const { R2ObjectStore } = await import("./r2-object-store");
    await expect(new R2ObjectStore().read("key", 10)).rejects.toThrow("Asset object is too large.");
    expect(transformToByteArray).not.toHaveBeenCalled();
  });

  it("rejects a streamed body that exceeds the read cap", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "account"); vi.stubEnv("R2_ACCESS_KEY_ID", "key"); vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret"); vi.stubEnv("R2_BUCKET", "bucket");
    mocks.send.mockResolvedValue({ Body: { async *[Symbol.asyncIterator]() { yield Uint8Array.of(1, 2); yield Uint8Array.of(3, 4); } } });
    const { R2ObjectStore } = await import("./r2-object-store");
    await expect(new R2ObjectStore().read("key", 3)).rejects.toThrow("Asset object is too large.");
  });
});
