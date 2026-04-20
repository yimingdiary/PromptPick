import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  collectorPayloadSchema,
  indexEntrySchema,
  itemRecordSchema,
  type CollectorPayload,
  type IndexEntry,
  type ItemRecord,
  type ReferenceImageRecord
} from "./lib/schema.js";

type CliOptions = {
  issueBody?: string;
  issueBodyFile?: string;
};

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const itemsDir = path.join(dataDir, "items");
const indexFile = path.join(dataDir, "index.json");
const imagesDir = path.join(rootDir, "images");
const ORIGINAL_MAX_EDGE = 2400;
const THUMBNAIL_MAX_EDGE = 720;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--issue-body" && next) {
      options.issueBody = next;
      index += 1;
    } else if (token === "--issue-body-file" && next) {
      options.issueBodyFile = next;
      index += 1;
    }
  }

  return options;
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Issue body does not contain valid JSON.");
}

function buildId(payload: CollectorPayload): string {
  return createHash("sha256")
    .update([payload.sourceUrl, payload.prompt, payload.imageUrl].join("\n"))
    .digest("hex")
    .slice(0, 12);
}

function normalizeTags(payload: CollectorPayload): string[] {
  const sourceTags = payload.tags.length > 0
    ? payload.tags
    : payload.prompt
        .split(/[,，]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6);

  return Array.from(new Set(sourceTags)).slice(0, 8);
}

async function ensureDirectory(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readIssueBody(options: CliOptions): Promise<string> {
  if (options.issueBody) {
    return options.issueBody;
  }

  if (options.issueBodyFile) {
    return readFile(options.issueBodyFile, "utf8");
  }

  throw new Error("Missing issue body. Use --issue-body or --issue-body-file.");
}

async function downloadImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, {
    headers: {
      "user-agent": "PromptNestBot/0.1 (+https://github.com/)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Image download failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function writeImagePair(imageUrl: string, imagePath: string, thumbnailPath: string): Promise<void> {
  const imageBuffer = await downloadImage(imageUrl);
  await sharp(imageBuffer)
    .rotate()
    .resize({
      width: ORIGINAL_MAX_EDGE,
      height: ORIGINAL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 88 })
    .toFile(imagePath);
  await sharp(imageBuffer)
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_EDGE,
      height: THUMBNAIL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 78 })
    .toFile(thumbnailPath);
}

async function readIndex(): Promise<IndexEntry[]> {
  if (!(await fileExists(indexFile))) {
    return [];
  }

  const raw = await readFile(indexFile, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return indexEntrySchema.array().parse(parsed);
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
  await writeFile(indexFile, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function setGithubOutput(name: string, value: string): void {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const line = `${name}=${value}\n`;
  void writeFile(process.env.GITHUB_OUTPUT, line, { flag: "a" });
}

async function main(): Promise<void> {
  await ensureDirectory(itemsDir);
  await ensureDirectory(imagesDir);

  const options = parseArgs(process.argv.slice(2));
  const issueBody = await readIssueBody(options);
  const payload = collectorPayloadSchema.parse(JSON.parse(extractJsonBlock(issueBody)));
  const id = buildId(payload);
  const itemFile = path.join(itemsDir, `${id}.json`);
  const currentIndex = await readIndex();

  if (await fileExists(itemFile)) {
    setGithubOutput("status", "duplicate");
    setGithubOutput("item_id", id);
    console.log(`Duplicate item: ${id}`);
    return;
  }

  const collectedDate = new Date(payload.collectedAt);
  const monthFolder = `${collectedDate.getUTCFullYear()}-${String(collectedDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const imageFolder = path.join(imagesDir, monthFolder);
  const thumbnailFolder = path.join(imageFolder, "thumbs");
  const referenceFolder = path.join(imageFolder, "references");
  const referenceThumbnailFolder = path.join(referenceFolder, "thumbs");
  await ensureDirectory(imageFolder);
  await ensureDirectory(thumbnailFolder);
  await ensureDirectory(referenceFolder);
  await ensureDirectory(referenceThumbnailFolder);

  const imagePath = path.join(imageFolder, `${id}.webp`);
  const thumbnailPath = path.join(thumbnailFolder, `${id}.webp`);
  await writeImagePair(payload.imageUrl, imagePath, thumbnailPath);

  const referenceImages: ReferenceImageRecord[] = [];
  const referenceImageUrls = Array.from(new Set(payload.referenceImageUrls.filter((url) => url !== payload.imageUrl)));
  for (const [index, imageUrl] of referenceImageUrls.entries()) {
    const basename = `${id}-ref-${index + 1}`;
    const referenceImagePath = path.join(referenceFolder, `${basename}.webp`);
    const referenceThumbnailPath = path.join(referenceThumbnailFolder, `${basename}.webp`);
    await writeImagePair(imageUrl, referenceImagePath, referenceThumbnailPath);
    referenceImages.push({
      imageUrl,
      image: `/images/${monthFolder}/references/${basename}.webp`,
      thumbnail: `/images/${monthFolder}/references/thumbs/${basename}.webp`,
      label: "智能参考"
    });
  }

  const now = new Date().toISOString();
  const itemRecord: ItemRecord = itemRecordSchema.parse({
    ...payload,
    id,
    tags: normalizeTags(payload),
    image: `/images/${monthFolder}/${id}.webp`,
    thumbnail: `/images/${monthFolder}/thumbs/${id}.webp`,
    referenceImages,
    status: "done",
    capturedAt: now,
    createdAt: now,
    updatedAt: now
  });

  const nextIndexEntry: IndexEntry = indexEntrySchema.parse({
    id: itemRecord.id,
    title: itemRecord.title,
    prompt: itemRecord.prompt,
    model: itemRecord.model,
    ratio: itemRecord.ratio,
    resolution: itemRecord.resolution,
    width: itemRecord.width,
    height: itemRecord.height,
    tags: itemRecord.tags,
    image: itemRecord.thumbnail || itemRecord.image,
    sourceUrl: itemRecord.sourceUrl,
    createdAt: itemRecord.createdAt
  });

  const nextIndex = [nextIndexEntry, ...currentIndex].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  await writeFile(itemFile, `${JSON.stringify(itemRecord, null, 2)}\n`, "utf8");
  await writeIndex(nextIndex);

  setGithubOutput("status", "created");
  setGithubOutput("item_id", id);
  setGithubOutput("image_path", itemRecord.image);

  console.log(`Created item: ${id}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  setGithubOutput("status", "failed");
  setGithubOutput("error_message", message.replace(/\n/g, " "));
  console.error(message);
  process.exitCode = 1;
});
