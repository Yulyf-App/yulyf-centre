import { build } from "esbuild";
import { writeFile } from "node:fs/promises";

const releaseId = `yulyf-centre-${Date.now().toString(36)}`;
await Promise.all([
  writeFile("dist/release-id.js", `export const RELEASE_ID = ${JSON.stringify(releaseId)};\n`),
  writeFile("dist/release.json", JSON.stringify({ release: releaseId })),
]);

await build({
  entryPoints: ["dist/app.js"],
  outfile: "dist/app.bundle.js",
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ["es2022"],
  format: "iife",
  platform: "browser",
  legalComments: "none",
});
