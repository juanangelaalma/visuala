export type JobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type JobStage = 'queued' | 'navigating' | 'extracting' | 'complete';

export interface ExtractionRequest {
  requestRef: string;
  idempotencyKey: string;
  marketplace: 'shopee';
  url: string;
}

export interface ExtractionResult {
  title: string;
  images: string[];
  canonicalUrl: string;
  extractionMethod: 'network' | 'dom' | 'network+dom';
  completeness: 'complete' | 'partial';
  description?: string;
  category?: string;
  shopName?: string;
  price?: number;
  originalPrice?: number;
  currency?: 'IDR';
  rating?: number;
  ratingCount?: number;
  soldCount?: number;
  shopId?: string;
  itemId?: string;
}

export interface ExtractionJob extends ExtractionRequest {
  id: string;
  status: JobStatus;
  stage: JobStage;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  result?: ExtractionResult;
  errorCode?: string;
}
