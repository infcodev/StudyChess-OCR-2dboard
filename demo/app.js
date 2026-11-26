const byId = (id) => document.getElementById(id);
const form = byId("ocr-form");
const modelInput = byId("model");
const captureInput = byId("capture");
const run = byId("run");
const status = byId("status");
const preview = byId("preview");
const previewFrame = byId("preview-frame");
const comparison = byId("comparison");
const crop = byId("crop");
const cropNote = byId("crop-note");
const resultPanel = byId("result");
const board = byId("board");
const review = byId("review");
const placement = byId("placement");
const copyButton = byId("copy-placement");
const copyStatus = byId("copy-status");

const pieces = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxFileBytes = 25_000_000;
const timeoutMs = 60_000;
const reviewList = new Intl.ListFormat("es");
const errors = {
  image: "No se pudo abrir la imagen. Elige otro archivo PNG, JPG o WebP.",
  size: "La imagen supera el límite de 16 megapíxeles o de 8192 píxeles por lado. Elige una captura más pequeña.",
  model: "No se pudo iniciar el lector con este modelo. Vuelve a intentarlo o elige un clasificador ONNX compatible.",
  recognition: "No se pudo leer la captura con este modelo. Comprueba el archivo ONNX o prueba con otra captura.",
  unsupported: "Este navegador no puede procesar la captura. Prueba en una versión reciente de Chromium.",
  worker: "No se pudo iniciar el lector. Vuelve a intentarlo o recarga la página.",
  timeout: "La lectura tardó demasiado. Prueba con una captura más pequeña.",
};

let worker;
let timer;
let modelVersion = 0;
let busy = false;
let copyRequest = 0;
let copyFeedbackTimer;
let lastCopyMessage = "";

function announce(state, message) {
  status.dataset.state = state;
  status.textContent = message;
}

function markField(input, helpId, invalid) {
  input.setAttribute("aria-invalid", String(invalid));
  input.setAttribute("aria-describedby", invalid ? `${helpId} status` : helpId);
}

function clearCopyFeedback() {
  clearTimeout(copyFeedbackTimer);
  copyStatus.textContent = "";
  delete copyStatus.dataset.state;
}

async function copyPlacement() {
  const text = placement.value;
  if (!text) return;
  const request = ++copyRequest;
  let state;
  let message;
  try {
    await navigator.clipboard.writeText(text);
    state = "ok";
    message = "Colocación copiada.";
  } catch {
    state = "error";
    message = "No se pudo copiar. Selecciona el texto para copiarlo manualmente.";
  }
  if (request !== copyRequest) return;
  clearCopyFeedback();
  // Distinguish repeated messages so assistive technology announces them again.
  lastCopyMessage = message === lastCopyMessage ? `${message}\u00a0` : message;
  copyStatus.dataset.state = state;
  copyStatus.textContent = lastCopyMessage;
  copyFeedbackTimer = setTimeout(clearCopyFeedback, 5_000);
}

function clearOutput() {
  comparison.hidden = true;
  crop.hidden = true;
  cropNote.hidden = true;
  resultPanel.hidden = true;
  review.hidden = true;
  board.replaceChildren();
  placement.value = "";
  copyRequest += 1;
  clearCopyFeedback();
  preview.width = 1;
  preview.height = 1;
}

function syncInputs() {
  const [model] = modelInput.files;
  const [capture] = captureInput.files;
  const invalidModel = Boolean(model && (
    !/\.onnx$/i.test(model.name) || model.size === 0 || model.size > maxFileBytes
  ));
  const invalidImageType = capture?.type
    ? !imageTypes.has(capture.type)
    : !/\.(?:png|jpe?g|webp)$/i.test(capture?.name ?? "");
  const invalidImage = Boolean(capture && (
    invalidImageType || capture.size === 0 || capture.size > maxFileBytes
  ));
  markField(modelInput, "model-help", invalidModel);
  markField(captureInput, "file-help", invalidImage);
  run.disabled = !model || !capture || invalidModel || invalidImage;

  if (invalidModel) {
    announce("error", "Elige un archivo .onnx de hasta 25 MB.");
  } else if (invalidImage) {
    announce("error", "Elige una captura PNG, JPG o WebP de hasta 25 MB.");
  } else {
    announce("", "");
  }
}

function finishRun() {
  clearTimeout(timer);
  busy = false;
  run.removeAttribute("aria-disabled");
  run.textContent = "Leer tablero";
}

function stopWorker() {
  worker?.terminate();
  worker = undefined;
  finishRun();
}

function showError(code) {
  if (code === "model") markField(modelInput, "model-help", true);
  if (code === "image" || code === "size") markField(captureInput, "file-help", true);
  announce("error", errors[code]);
}

function drawPreview(bitmap) {
  try {
    preview.width = bitmap.width;
    preview.height = bitmap.height;
    previewFrame.style.setProperty("--source-ratio", String(bitmap.width / bitmap.height));
    preview.getContext("2d").drawImage(bitmap, 0, 0);
    comparison.hidden = false;
  } finally {
    bitmap.close();
  }
}

function drawResult(result, width, height) {
  if (result.status === "no_board") {
    announce("no_board", "No se encontró un tablero. Prueba con una captura más cercana.");
    return;
  }

  const { x, y, width: w, height: h } = result.crop;
  const top = 100 * y / height;
  const right = 100 * (width - x - w) / width;
  const bottom = 100 * (height - y - h) / height;
  const left = 100 * x / width;
  crop.style.setProperty("--crop-inset", `${top}% ${right}% ${bottom}% ${left}%`);
  crop.hidden = false;
  cropNote.hidden = false;

  const flagged = new Set(result.reviewSquares);
  const cells = result.squareLabels.map((piece, index) => {
    const square = document.createElement("span");
    square.className = "square";
    square.classList.toggle("dark", (Math.floor(index / 8) + index % 8) % 2 === 1);
    square.classList.toggle("review", flagged.has(index));
    square.textContent = pieces[piece] ?? "";
    return square;
  });
  board.replaceChildren(...cells);
  placement.value = result.placement;
  resultPanel.hidden = false;

  const needsReview = result.status === "needs_review";
  if (needsReview) {
    const marked = [...flagged].map((index) => `fila ${Math.floor(index / 8) + 1}, columna ${index % 8 + 1}`);
    review.textContent = marked.length
      ? `Comprueba las marcas en ${reviewList.format(marked)} y revisa el tablero.`
      : "Comprueba las piezas y el recorte.";
    review.hidden = false;
  }
  announce(result.status, needsReview ? "Revisa la posición detectada." : "Tablero detectado.");
}

function getWorker() {
  if (worker) return worker;
  const instance = new Worker(new URL("./ocr-worker.js", import.meta.url), { type: "module" });
  instance.addEventListener("message", ({ data }) => {
    if (worker !== instance || !busy) {
      data.bitmap?.close();
      return;
    }
    if (data.bitmap) {
      try {
        drawPreview(data.bitmap);
      } catch {
        stopWorker();
        showError("unsupported");
      }
      return;
    }
    if (data.error === "model") stopWorker();
    else finishRun();
    if (data.error) {
      showError(data.error);
      return;
    }
    drawResult(data.result, data.width, data.height);
  });
  const handleWorkerError = () => {
    if (worker !== instance) return;
    stopWorker();
    showError("worker");
  };
  instance.addEventListener("error", handleWorkerError);
  instance.addEventListener("messageerror", handleWorkerError);
  worker = instance;
  return worker;
}

function selectionChanged() {
  if (busy) stopWorker();
  clearOutput();
  syncInputs();
}

if ("commandForElement" in copyButton) {
  placement.addEventListener("command", (event) => {
    if (event.command === "--copy-placement" && event.source === copyButton) void copyPlacement();
  });
} else {
  copyButton.addEventListener("click", copyPlacement);
}

modelInput.addEventListener("change", () => {
  modelVersion += 1;
  selectionChanged();
});
captureInput.addEventListener("change", selectionChanged);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy || run.disabled) return;

  syncInputs();
  if (run.disabled) return;
  clearOutput();
  busy = true;
  run.setAttribute("aria-disabled", "true");
  run.textContent = "Leyendo…";
  announce("busy", "Leyendo el tablero en este navegador…");

  try {
    getWorker().postMessage({
      model: modelInput.files[0],
      modelVersion,
      capture: captureInput.files[0],
    });
    timer = setTimeout(() => {
      stopWorker();
      showError("timeout");
    }, timeoutMs);
  } catch {
    stopWorker();
    showError("worker");
  }
});

syncInputs();
