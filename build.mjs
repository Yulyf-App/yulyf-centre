import { build } from "esbuild";

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
