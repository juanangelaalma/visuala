export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export type AssetMimeType = "image/jpeg" | "image/png" | "image/webp";

export type AIAsset = {
  id: string;
  userId: string;
  objectKey: string;
  mimeType: AssetMimeType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  validated: boolean;
  deletedAt?: string;
  createdAt: string;
};

export type CreateAssetInput = Omit<AIAsset, "createdAt" | "validated" | "deletedAt">;

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<AIAsset>;
  getOwned(assetId: string, userId: string): Promise<AIAsset | null>;
}

export interface AssetObjectStore {
  write(key: string, bytes: Uint8Array, mimeType: AssetMimeType): Promise<void>;
  read(key: string, maxBytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export type ValidatedImage = {
  mimeType: AssetMimeType;
  byteSize: number;
  width: number;
  height: number;
};
