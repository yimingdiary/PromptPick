import { rebuildDataIndex } from "./lib/data-index.js";

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

const result = await rebuildDataIndex({
  normalizeItems: hasFlag("--normalize-items")
});

if (result.skippedItems.length > 0) {
  console.warn(`Skipped invalid item files: ${result.skippedItems.join(", ")}`);
}

console.log(
  [
    `Rebuilt data/index.json with ${result.entries.length} entries.`,
    result.changed ? "Index updated." : "Index already up to date.",
    result.normalizedItems > 0 ? `Normalized ${result.normalizedItems} item file(s).` : ""
  ]
    .filter(Boolean)
    .join(" ")
);
