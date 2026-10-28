import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
// Third-party Arc logo. Source and rights distinction: THIRD_PARTY_ASSETS.md.
await mkdir("public/icons", { recursive: true });
const svg = await readFile("public/brand/arc-logo.svg", "utf8");
for (const width of [16, 32, 48, 128])
  await writeFile(
    `public/icons/arcify-${width}.png`,
    new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(),
  );
