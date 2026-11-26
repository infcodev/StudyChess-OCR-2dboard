import * as runtime from "onnxruntime-web/wasm";
import wasmModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import wasmBinaryUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { createBoardRecognizer } from "../src/index.js";

const maxImagePixels = 16_000_000;
const maxImageSide = 8192;
const maxPreviewSide = 1400;

runtime.env.wasm.numThreads = 1;
runtime.env.wasm.initTimeout = 30_000;
runtime.env.wasm.wasmPaths = {
  mjs: new URL(wasmModuleUrl, self.location.href).href,
  wasm: new URL(wasmBinaryUrl, self.location.href).href,
};

let recognizer;
let loadedVersion;

async function getRecognizer(model, version) {
  if (recognizer && loadedVersion === version) return recognizer;
  if (recognizer) {
    const previous = recognizer;
    recognizer = undefined;
    await previous.release();
  }
  const modelUrl = URL.createObjectURL(model);
  try {
    recognizer = await createBoardRecognizer({ runtime, model: modelUrl });
    loadedVersion = version;
    return recognizer;
  } finally {
    URL.revokeObjectURL(modelUrl);
  }
}

function publishPreview(source) {
  const scale = Math.min(1, maxPreviewSide / Math.max(source.width, source.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const bitmap = canvas.transferToImageBitmap();
  try {
    self.postMessage({ bitmap }, [bitmap]);
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

function readCapture(source) {
  const { width, height } = source;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  try {
    context.drawImage(source, 0, 0);
    return context.getImageData(0, 0, width, height);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

self.addEventListener("message", async ({ data: { capture, model, modelVersion } }) => {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
    self.postMessage({ error: "unsupported" });
    return;
  }

  const source = await createImageBitmap(capture).catch(() => undefined);
  if (!source) {
    self.postMessage({ error: "image" });
    return;
  }

  let image;
  try {
    const { width, height } = source;
    if (width * height > maxImagePixels || Math.max(width, height) > maxImageSide) {
      self.postMessage({ error: "size" });
      return;
    }
    publishPreview(source);
    image = readCapture(source);
  } catch {
    self.postMessage({ error: "unsupported" });
    return;
  } finally {
    source.close();
  }

  const reader = await getRecognizer(model, modelVersion).catch(() => undefined);
  if (!reader) {
    self.postMessage({ error: "model" });
    return;
  }

  try {
    const { width, height } = image;
    const result = await reader.recognize(image);
    self.postMessage({ result, width, height });
  } catch {
    self.postMessage({ error: "recognition" });
  }
});
