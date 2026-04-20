export type IndexEntry = {
  id: string;
  title: string;
  prompt: string;
  model: string;
  ratio: string;
  resolution: string;
  width: number | null;
  height: number | null;
  tags: string[];
  image: string;
  sourceUrl: string;
  createdAt: string;
};

export type ItemRecord = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  author: string;
  license: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  steps: number | null;
  cfg: number | null;
  seed: string | number | null;
  ratio: string;
  resolution: string;
  width: number | null;
  height: number | null;
  tags: string[];
  image: string;
  thumbnail?: string;
  referenceImageUrls?: string[];
  referenceImages?: Array<{
    imageUrl: string;
    image: string;
    thumbnail?: string;
    label?: string;
  }>;
  status: "done" | "failed" | "pending";
  collectedAt: string;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
};
