import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#403b4c"/><path d="M30 40c-8 0-14-6-14-14m82 14c8 0 14-6 14-14M39 40h50v37c0 19-50 19-50 0Z" fill="none" stroke="#f3f1f6" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="62" r="4" fill="#f3f1f6"/><circle cx="76" cy="62" r="4" fill="#f3f1f6"/></svg>';
await writeFile("public/icons/ox.svg", svg);
for (const width of [16, 32, 48, 128])
  await writeFile(
    `public/icons/ox-${width}.png`,
    new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(),
  );
