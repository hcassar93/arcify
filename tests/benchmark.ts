import { SearchIndex, type Entry } from "../src/search";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import os from "node:os";
const entries: Entry[] = [
  ...Array.from({ length: 5000 }, (_, i) => ({
    id: "b" + i,
    kind: "bookmark" as const,
    title: `Project ${i} notes and design reference`,
    detail: `Workspace / Team ${i % 50} / https://example.test/${i}`,
  })),
  ...Array.from({ length: 500 }, (_, i) => ({
    id: "t" + i,
    kind: "tab" as const,
    title: `Open project ${i}`,
    detail: `https://example.test/t/${i}`,
    windowId: 1,
    tabId: i,
  })),
];
const index = new SearchIndex();
index.replace(entries);
const queries = [
  "project",
  ">new",
  "@open",
  "#reference",
  "notes 123",
  "zzzz",
  "project 4999",
];
for (let i = 0; i < 30; i++) index.query(queries[i % queries.length], 1);
const times: number[] = [];
for (let i = 0; i < 500; i++) {
  const start = performance.now();
  index.query(queries[i % queries.length], 1);
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const result = {
  machine: os.cpus()[0].model,
  platform: os.platform(),
  arch: os.arch(),
  node: process.version,
  bookmarks: 5000,
  tabs: 500,
  samples: 500,
  p95Ms: times[474],
  maxMs: times[499],
  scope:
    "Search computation only; popup rendering and installed Chrome latency remain unmeasured.",
};
console.log(JSON.stringify(result, null, 2));
writeFileSync("docs/qa/benchmark.json", JSON.stringify(result, null, 2) + "\n");
if (result.p95Ms >= 50) process.exitCode = 1;
