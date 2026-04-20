import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { indexEntrySchema, itemRecordSchema, referenceImageRecordSchema, type IndexEntry, type ItemRecord } from "./schema.js";

type RebuildIndexOptions = {
  rootDir?: string;
  normalizeItems?: boolean;
};

type RebuildIndexResult = {
  entries: IndexEntry[];
  changed: boolean;
  normalizedItems: number;
  skippedItems: string[];
};

const STATUS_VALUES = new Set(["done", "failed", "pending"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeResolution(value: unknown, width: number | null, height: number | null): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (width && height) {
    return `${width}x${height}`;
  }

  return "2K";
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function readUrlStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function readReferenceImages(value: unknown): ItemRecord["referenceImages"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => referenceImageRecordSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function normalizeDateTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString();
}

function normalizeStatus(value: unknown): ItemRecord["status"] {
  return typeof value === "string" && STATUS_VALUES.has(value) ? (value as ItemRecord["status"]) : "done";
}

function buildIndexEntry(item: ItemRecord): IndexEntry {
  return indexEntrySchema.parse({
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    model: item.model,
    ratio: item.ratio,
    resolution: item.resolution,
    width: item.width,
    height: item.height,
    tags: item.tags,
    image: item.thumbnail || item.image,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt
  });
}

async function normalizeItem(raw: unknown, filePath: string): Promise<ItemRecord | null> {
  if (!isRecord(raw)) {
    return null;
  }

  const fallbackDate = (await stat(filePath)).mtime.toISOString();
  const filenameId = path.basename(filePath, ".json");
  const collectedAt = normalizeDateTime(raw.collectedAt, fallbackDate);
  const createdAt = normalizeDateTime(raw.createdAt, collectedAt);
  const updatedAt = normalizeDateTime(raw.updatedAt, createdAt);
  const capturedAt = normalizeDateTime(raw.capturedAt, createdAt);
  const imageUrl = readString(raw.imageUrl, readString(raw.image));
  const width = readNullableNumber(raw.width);
  const height = readNullableNumber(raw.height);

  const thumbnail = readString(raw.thumbnail, readString(raw.imageThumbnail));
  const normalized = {
    source: readString(raw.source, "manual-collector"),
    sourceUrl: readString(raw.sourceUrl),
    title: readString(raw.title, filenameId),
    prompt: readString(raw.prompt),
    negativePrompt: readString(raw.negativePrompt),
    model: readString(raw.model, "unknown") || "unknown",
    sampler: readString(raw.sampler),
    ratio: readString(raw.ratio),
    resolution: normalizeResolution(raw.resolution, width, height),
    width,
    height,
    steps: readNullableNumber(raw.steps),
    cfg: readNullableNumber(raw.cfg),
    seed: typeof raw.seed === "string" || typeof raw.seed === "number" ? raw.seed : null,
    imageUrl,
    referenceImageUrls: readUrlStrings(raw.referenceImageUrls),
    author: readString(raw.author, "unknown") || "unknown",
    license: readString(raw.license, "unknown") || "unknown",
    tags: readTags(raw.tags),
    collectedAt,
    id: readString(raw.id, filenameId),
    image: readString(raw.image, imageUrl),
    ...(thumbnail ? { thumbnail } : {}),
    referenceImages: readReferenceImages(raw.referenceImages),
    status: normalizeStatus(raw.status),
    capturedAt,
    createdAt,
    updatedAt
  };

  const parsed = itemRecordSchema.safeParse(normalized);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function toStableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function rebuildDataIndex(options: RebuildIndexOptions = {}): Promise<RebuildIndexResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const dataDir = path.join(rootDir, "data");
  const itemsDir = path.join(dataDir, "items");
  const indexFile = path.join(dataDir, "index.json");
  const entries: IndexEntry[] = [];
  const skippedItems: string[] = [];
  let normalizedItems = 0;

  const filenames = (await readdir(itemsDir)).filter((filename) => filename.endsWith(".json")).sort();

  for (const filename of filenames) {
    const itemFile = path.join(itemsDir, filename);
    const rawText = await readFile(itemFile, "utf8");
    const raw = JSON.parse(rawText) as unknown;
    const item = await normalizeItem(raw, itemFile);

    if (!item) {
      skippedItems.push(filename);
      continue;
    }

    entries.push(buildIndexEntry(item));

    if (options.normalizeItems) {
      const nextText = toStableJson(item);
      if (nextText !== rawText) {
        await writeFile(itemFile, nextText, "utf8");
        normalizedItems += 1;
      }
    }
  }

  entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const nextIndexText = toStableJson(entries);
  let currentIndexText = "";
  try {
    currentIndexText = await readFile(indexFile, "utf8");
  } catch {
    // Missing index files are recreated below.
  }

  const changed = currentIndexText !== nextIndexText;
  if (changed) {
    await writeFile(indexFile, nextIndexText, "utf8");
  }

  return {
    entries,
    changed,
    normalizedItems,
    skippedItems
  };
}
