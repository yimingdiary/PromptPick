import { z } from "zod";

export const collectorPayloadSchema = z.object({
  source: z.string().min(1).max(120),
  sourceUrl: z.url(),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(12000),
  negativePrompt: z.string().max(12000).optional().default(""),
  model: z.string().max(120).optional().default("unknown"),
  sampler: z.string().max(120).optional().default(""),
  ratio: z.string().max(20).optional().default(""),
  resolution: z.string().max(40).optional().default("2K"),
  width: z.number().int().positive().nullable().optional().default(null),
  height: z.number().int().positive().nullable().optional().default(null),
  steps: z.number().int().nonnegative().nullable().optional().default(null),
  cfg: z.number().nonnegative().nullable().optional().default(null),
  seed: z.union([z.number().int(), z.string()]).nullable().optional().default(null),
  imageUrl: z.url(),
  referenceImageUrls: z.array(z.url()).optional().default([]),
  author: z.string().max(120).optional().default("unknown"),
  license: z.string().max(120).optional().default("unknown"),
  tags: z.array(z.string().min(1).max(40)).optional().default([]),
  collectedAt: z.iso.datetime()
});

export const referenceImageRecordSchema = z.object({
  imageUrl: z.url(),
  image: z.string().min(1),
  thumbnail: z.string().min(1).optional(),
  label: z.string().min(1).max(80).optional()
});

export const itemRecordSchema = collectorPayloadSchema.extend({
  id: z.string().min(8).max(240),
  image: z.string().min(1),
  thumbnail: z.string().min(1).optional(),
  referenceImages: z.array(referenceImageRecordSchema).optional().default([]),
  status: z.enum(["done", "failed", "pending"]),
  capturedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const indexEntrySchema = z.object({
  id: z.string().min(8).max(240),
  title: z.string(),
  prompt: z.string(),
  model: z.string(),
  ratio: z.string(),
  resolution: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  tags: z.array(z.string()),
  image: z.string(),
  sourceUrl: z.string(),
  createdAt: z.iso.datetime()
});

export type CollectorPayload = z.infer<typeof collectorPayloadSchema>;
export type ReferenceImageRecord = z.infer<typeof referenceImageRecordSchema>;
export type ItemRecord = z.infer<typeof itemRecordSchema>;
export type IndexEntry = z.infer<typeof indexEntrySchema>;
