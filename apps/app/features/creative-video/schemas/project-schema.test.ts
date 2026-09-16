import { describe, expect, it } from "vitest";
import { MAX_ASSET_BYTES } from "@/domain/ai-service/assets";
import { createProjectSchema } from "./project-schema";

describe("createProjectSchema", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts one %s product image", (type) => {
    const image = new File([new Uint8Array([1])], "product", { type });

    expect(createProjectSchema.safeParse(validInput(image)).success).toBe(true);
  });

  it("rejects an empty prompt", () => {
    expect(createProjectSchema.safeParse({ ...validInput(), prompt: " " }).success).toBe(false);
  });

  it("rejects an image above the browser byte ceiling", () => {
    const image = new File([new Uint8Array(MAX_ASSET_BYTES + 1)], "product.png", { type: "image/png" });

    expect(createProjectSchema.safeParse(validInput(image)).success).toBe(false);
  });

  it("rejects a non-file image value", () => {
    expect(createProjectSchema.safeParse({ ...validInput(), image: "product.png" }).success).toBe(false);
  });
});

function validInput(image = new File([new Uint8Array([1])], "product.png", { type: "image/png" })) {
  return { prompt: "Buat konten jualan", image, idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", categoryId: "fnb", categoryVersion: "1" };
}
