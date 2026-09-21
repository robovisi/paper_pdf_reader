import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";

const sourcePath = path.resolve(process.argv[2] ?? ".cache/ecdict.csv");
const outputPath = path.resolve(process.argv[3] ?? "public/dictionary");

function normalizeWord(text) {
  return text
    .normalize("NFKC")
    .replace(/([a-z])-\s+([a-z])/gi, "$1$2")
    .replace(/^[^a-z]+|[^a-z-]+$/gi, "")
    .toLowerCase();
}

function shardName(word) {
  return word.slice(0, 2).padEnd(2, "_").replace(/[^a-z0-9]/g, "_");
}

const shards = new Map();
let sourceEntries = 0;
let includedEntries = 0;

const records = createReadStream(sourcePath).pipe(parse({
  columns: true,
  bom: true,
  relax_column_count: true,
  skip_empty_lines: true,
}));

for await (const record of records) {
  sourceEntries += 1;
  const key = normalizeWord(record.word ?? "");
  const definition = record.definition ?? "";
  const translation = record.translation ?? "";
  if (!key || key.length > 80 || (!definition && !translation)) continue;

  const shard = shardName(key);
  let values = shards.get(shard);
  if (!values) {
    values = Object.create(null);
    shards.set(shard, values);
  }

  const sourceWord = (record.word ?? "").normalize("NFKC").trim().toLowerCase();
  const score = (sourceWord === key ? 100 : 0)
    + (record.phonetic ? 10 : 0)
    + (translation ? 4 : 0)
    + (definition ? 2 : 0);
  if (!values[key]) includedEntries += 1;
  if (!values[key] || score > values[key].score) {
    values[key] = {
      score,
      record: [
        record.word ?? key,
        record.phonetic ?? "",
        definition,
        translation,
        record.pos ?? "",
        record.exchange ?? "",
      ],
    };
  }
}

await rm(outputPath, { recursive: true, force: true });
await mkdir(outputPath, { recursive: true });

await Promise.all([...shards.entries()].map(([name, values]) => {
  const records = Object.fromEntries(
    Object.entries(values).map(([word, value]) => [word, value.record]),
  );
  return writeFile(path.join(outputPath, `${name}.json`), JSON.stringify(records), "utf8");
}));

const manifest = {
  name: "ECDICT",
  version: "2026-08-31",
  source: "https://github.com/skywind3000/ECDICT",
  license: "MIT",
  sourceEntries,
  includedEntries,
  shards: [...shards.keys()].sort(),
};

await writeFile(
  path.join(outputPath, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Generated ${includedEntries.toLocaleString()} entries in ${shards.size} shards.`);
