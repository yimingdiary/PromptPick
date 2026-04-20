import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { itemRecordSchema, type ItemRecord } from "./lib/schema.js";

const rootDir = process.cwd();
const itemsDir = path.join(rootDir, "data", "items");
const THUMBNAIL_MAX_EDGE = 720;

function toStableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toLocalPath(publicPath: string): string | null {
  if (!publicPath.startsWith("/images/")) {
    return null;
  }

  return path.join(rootDir, publicPath.slice(1));
}

function buildThumbnailPath(image: string): { publicPath: string; filePath: string } | null {
  const localImagePath = toLocalPath(image);
  if (!localImagePath) {
    return null;
  }

  const directory = path.dirname(localImagePath);
  const basename = path.basename(localImagePath, path.extname(localImagePath));
  const publicDirectory = path.posix.dirname(image);
  const publicPath = `${publicDirectory}/thumbs/${basename}.webp`;

  return {
    publicPath,
    filePath: path.join(directory, "thumbs", `${basename}.webp`)
  };
}

async function writeThumbnail(image: string): Promise<string | null> {
  const localImagePath = toLocalPath(image);
  const thumbnail = buildThumbnailPath(image);
  if (!localImagePath || !thumbnail) {
    return null;
  }

  await mkdir(path.dirname(thumbnail.filePath), { recursive: true });
  await sharp(localImagePath)
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_EDGE,
      height: THUMBNAIL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 78 })
    .toFile(thumbnail.filePath);

  return thumbnail.publicPath;
}

async function generateThumbnail(item: ItemRecord): Promise<ItemRecord> {
  const nextItem: ItemRecord = item.thumbnail
    ? item
    : itemRecordSchema.parse({
        ...item,
        thumbnail: (await writeThumbnail(item.image)) ?? undefined
      });

  const referenceImages = await Promise.all(
    nextItem.referenceImages.map(async (referenceImage) => {
      if (referenceImage.thumbnail) {
        return referenceImage;
      }

      const thumbnail = await writeThumbnail(referenceImage.image);
      return thumbnail ? { ...referenceImage, thumbnail } : referenceImage;
    })
  );

  return itemRecordSchema.parse({
    ...nextItem,
    referenceImages
  });
}

let updated = 0;

for (const filename of await readdir(itemsDir)) {
  if (!filename.endsWith(".json")) {
    continue;
  }

  const itemFile = path.join(itemsDir, filename);
  const raw = await readFile(itemFile, "utf8");
  const item = itemRecordSchema.parse(JSON.parse(raw) as unknown);
  const nextItem = await generateThumbnail(item);
  const nextRaw = toStableJson(nextItem);

  if (nextRaw !== raw) {
    await writeFile(itemFile, nextRaw, "utf8");
    updated += 1;
  }
}

console.log(`Generated thumbnails for ${updated} item(s).`);
