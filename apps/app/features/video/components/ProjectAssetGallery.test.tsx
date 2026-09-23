// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectAssetGallery } from "./ProjectAssetGallery";

describe("ProjectAssetGallery", () => {
  it("uses the delete callback and preserves the gallery markup", async () => {
    const onDeleteAsset = vi.fn().mockResolvedValue(undefined);
    const { asFragment } = render(<ProjectAssetGallery assets={[{ id: "asset-1", previewUrl: null, mimeType: "image/png", byteSize: 1024, width: 10, height: 10, moderationStatus: "allowed" }]} onDeleteAsset={onDeleteAsset} />);
    fireEvent.click(screen.getByRole("button", { name: "Hapus aset" }));
    await vi.waitFor(() => expect(onDeleteAsset).toHaveBeenCalledWith("asset-1"));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Hapus aset" }).textContent).toBe("×"));
    expect(asFragment()).toMatchSnapshot();
  });
});
