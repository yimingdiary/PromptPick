import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { indexEntrySchema, itemRecordSchema } from "./lib/schema.js";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const itemsDir = path.join(dataDir, "items");
const indexFile = path.join(dataDir, "index.json");

async function main(): Promise<void> {
  const rawIndex = await readFile(indexFile, "utf8");
  indexEntrySchema.array().parse(JSON.parse(rawIndex));

  const entries = await readdir(itemsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const raw = await readFile(path.join(itemsDir, entry), "utf8");
    itemRecordSchema.parse(JSON.parse(raw));
  }

  console.log("Data validation passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

