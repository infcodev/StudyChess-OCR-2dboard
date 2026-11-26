# StudyChess OCR for 2D boards

Read a chess position from a screenshot in the browser. StudyChess OCR locates one 8×8 board, classifies all 64 squares in one batch per crop, and returns FEN piece placement in the image’s visual order. It also returns per-square confidence scores and flags readings that need review. Inference runs on the CPU with ONNX Runtime Web and WebAssembly.

**Bring a compatible ONNX classifier.** v0.1.0 includes the MIT-licensed reader and demo source. See the [model contract](MODEL.md) for the required tensors and class order. The release excludes model weights, training data, screenshots, and evaluation reports.

## Run the demo

Use Node.js 22.15 or newer with Corepack.

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/infcodev/StudyChess-OCR-2dboard.git
cd StudyChess-OCR-2dboard
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm demo
```

Open the local URL printed by Vite. Choose your ONNX model and a PNG, JPEG, or WebP screenshot, then select **Leer tablero**. The demo shows the selected crop on the screenshot and reconstructs the board beside it. The model and screenshot stay in your browser.

To build and preview the static demo, run `corepack pnpm demo:build` followed by `corepack pnpm demo:preview`.

## Use it in a browser app

Run this command in your app to install the package from the tagged GitHub source.

```sh
npm install https://github.com/infcodev/StudyChess-OCR-2dboard/archive/refs/tags/v0.1.0.tar.gz onnxruntime-web@1.26.0
```

Serve `ort-wasm-simd-threaded.mjs` and `ort-wasm-simd-threaded.wasm` from `node_modules/onnxruntime-web/dist/` at `/ort/` on your app’s origin. Use both files from the same ONNX Runtime Web version as the JavaScript import. Serve your compatible model at `/models/chess-board-classifier.onnx`.

Draw the screenshot onto a canvas and pass the result of `context.getImageData(0, 0, canvas.width, canvas.height)` to `readBoard`. Set the two runtime asset URLs before creating the first session.

```js
import * as runtime from "onnxruntime-web/wasm";
import { createBoardRecognizer } from "@infcodev/studychess-ocr-2dboard";

const { origin } = globalThis.location;
runtime.env.wasm.numThreads = 1;
runtime.env.wasm.wasmPaths = {
  mjs: `${origin}/ort/ort-wasm-simd-threaded.mjs`,
  wasm: `${origin}/ort/ort-wasm-simd-threaded.wasm`,
};

const recognizer = await createBoardRecognizer({
  runtime,
  model: `${origin}/models/chess-board-classifier.onnx`,
});

export function readBoard(imageData) {
  return recognizer.recognize(imageData);
}

export async function disposeBoardReader() {
  await recognizer.release();
}
```

For a responsive interface, run inference in a Web Worker as the [demo](demo/ocr-worker.js) does. Reuse the recognizer across screenshots and release it when the app is done with it. If you already know the board bounds, call `recognizer.classifyCrop(imageData, { x, y, width, height })` with coordinates in source-image pixels.

## Read the result

| Status | Meaning |
| --- | --- |
| `ok` | The reading passed the built-in review checks. |
| `needs_review` | The reading includes `reviewReasons` and may flag individual squares in `reviewSquares`. |
| `no_board` | The reader found no board. |

When a reading is available, `placement` encodes the rows from top to bottom and the squares from left to right. `squareConfidences` and `reviewSquares` use the same order, starting at index 0 in the top-left corner. Before building a full FEN, have the user confirm which side is at the bottom and whose turn it is. Supply the remaining FEN fields in your app.

## License

The reader and demo code are MIT licensed. The board geometry includes code from Fenshot and TensorFlow Chessbot under their MIT notices. See the [project license](LICENSE) and [geometry attribution](src/geometry/README.md).
