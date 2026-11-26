import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const packageSource = fileURLToPath(new URL("../src/", import.meta.url));
const dependencies = fileURLToPath(new URL("../node_modules/", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  publicDir: false,
  plugins: [{
    name: "board-ocr-notices",
    apply: "build",
    generateBundle() {
      const notices = ["fenshot", "tensorflow-chessbot"].map((name) => readFileSync(
        new URL(`../src/geometry/LICENSE-${name}.txt`, import.meta.url),
        "utf8",
      ).trim());
      this.emitFile({ type: "asset", fileName: "assets/board-ocr-notices.txt", source: `${notices.join("\n\n")}\n` });
    },
  }],
  server: { fs: { allow: [root, packageSource, dependencies] } },
  optimizeDeps: { include: ["onnxruntime-web/wasm"] },
  worker: { format: "es" },
});
