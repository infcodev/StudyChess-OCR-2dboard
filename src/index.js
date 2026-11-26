import { recognizeGray } from "./geometry/index.js";
import { detectionGray, sourceCrop, validateRaster } from "./raster.js";
import { splitTiles } from "./tiles.js";

const classes = ".PNBRQKpnbrqk";
const minimumPieceConfidence = 0.85;
const maximumNearbyEdgeShiftInSquares = 1 / 16;
const minimumConfidenceDrop = 0.25;
const unusableCandidate = { placement: "8/8/8/8/8/8/8/8", meanConfidence: -1, minConfidence: 0 };

function fromProbabilities(probabilities) {
  if (probabilities.length !== 64 * classes.length) throw new Error("Unexpected classifier output length");
  const squareLabels = [];
  const squareConfidences = [];
  for (let square = 0; square < 64; square++) {
    const start = square * classes.length;
    let best = 0;
    for (let piece = 1; piece < classes.length; piece++) {
      if (probabilities[start + piece] > probabilities[start + best]) best = piece;
    }
    const confidence = probabilities[start + best];
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Invalid piece probability");
    squareLabels.push(classes[best]);
    squareConfidences.push(confidence);
  }
  const placement = Array.from({ length: 8 }, (_, row) => squareLabels.slice(8 * row, 8 * row + 8).join("")
    .replace(/\.+/g, (empty) => String(empty.length))).join("/");
  return {
    placement, squareLabels, squareConfidences,
    meanConfidence: squareConfidences.reduce((sum, value) => sum + value, 0) / 64,
    minConfidence: Math.min(...squareConfidences),
  };
}

function nearbyCrop(a, b) {
  const horizontal = Math.max(Math.abs(a.x - b.x), Math.abs(a.x + a.width - b.x - b.width));
  const vertical = Math.max(Math.abs(a.y - b.y), Math.abs(a.y + a.height - b.y - b.height));
  return Math.max(8 * horizontal / a.width, 8 * vertical / a.height) <= maximumNearbyEdgeShiftInSquares;
}

function determineReview(selected, readings) {
  const { plausible, reliable, squareLabels, squareConfidences } = selected;
  const reasons = [];
  if (!plausible) reasons.push("implausible_position");
  if (!reliable) reasons.push("candidate_unreliable");
  const reviewSquares = squareConfidences.flatMap((confidence, index) => confidence < minimumPieceConfidence ? [index] : []);
  if (reviewSquares.length) reasons.push("low_piece_confidence");
  if (reasons.length) return { reviewReasons: reasons, reviewSquares };

  // A minor alignment change can make the same false piece look much more certain.
  const near = Array.from(readings).filter((reading) => nearbyCrop(selected.crop, reading.crop));
  const unstable = squareLabels.flatMap((piece, index) => piece !== "." && near.some((reading) =>
    reading.squareLabels[index] === piece && squareConfidences[index] - reading.squareConfidences[index] >= minimumConfidenceDrop,
  ) ? [index] : []);
  return { reviewReasons: unstable.length ? ["unstable_square_confidence"] : [], reviewSquares: unstable };
}

/** Create one CPU/WASM session with a compatible ONNX classifier. */
export async function createBoardRecognizer({ model, runtime }) {
  const session = await runtime.InferenceSession.create(model, { executionProviders: ["wasm"] });

  const classify = async (image, crop) => {
    const tiles = new runtime.Tensor("float32", splitTiles(image, crop), [64, 32, 32, 3]);
    const { probs } = await session.run({ tiles });
    if (probs?.type !== "float32" || probs.dims?.length !== 2 || probs.dims[0] !== 64 || probs.dims[1] !== classes.length) {
      throw new Error("Expected classifier output probs: float32[64, 13]");
    }
    return fromProbabilities(probs.data);
  };

  return {
    async classifyCrop(image, crop) {
      validateRaster(image);
      return classify(image, crop);
    },
    async recognize(image) {
      validateRaster(image);
      if (image.width < 8 || image.height < 8) return { status: "no_board" };
      const gray = detectionGray(image);
      const cache = new Map();
      const candidates = [];
      const selected = await recognizeGray(gray, async (corners) => {
        const crop = sourceCrop(corners, image, gray);
        if (crop.width < 8 || crop.height < 8) return unusableCandidate;
        const key = `${crop.x},${crop.y},${crop.width},${crop.height}`;
        if (!cache.has(key)) cache.set(key, { ...await classify(image, crop), crop });
        const reading = cache.get(key);
        candidates.push({ crop, placement: reading.placement, meanConfidence: reading.meanConfidence,
          minConfidence: reading.minConfidence });
        return reading;
      });
      if (!selected?.crop) return { status: "no_board" };
      const review = determineReview(selected, cache.values());
      const { crop, placement, squareLabels, squareConfidences, meanConfidence, minConfidence, reliable, plausible } = selected;
      return {
        status: review.reviewReasons.length ? "needs_review" : "ok",
        crop, placement, squareLabels, squareConfidences, meanConfidence, minConfidence,
        geometryReliable: reliable, plausible, candidates, ...review,
      };
    },
    release: () => session.release(),
  };
}
