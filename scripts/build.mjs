import { build } from "esbuild";
import { cp, rm, mkdir } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await cp("public", "dist", { recursive: true });
await build({
  entryPoints: [
    "src/worker.ts",
    "src/sidebar.ts",
    "src/palette.ts",
    "src/options.ts",
  ],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome142",
  minify: false,
});
console.log("Packaged local-only extension in dist/");
