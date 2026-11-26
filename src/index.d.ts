import type * as OnnxRuntime from "onnxruntime-web/wasm";

export interface BoardOcrRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface BoardOcrCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoardOcrCandidate {
  crop: BoardOcrCrop;
  placement: string;
  meanConfidence: number;
  minConfidence: number;
}

interface BoardOcrClassification extends Omit<BoardOcrCandidate, "crop"> {
  squareLabels: string[];
  squareConfidences: number[];
}

type BoardOcrReviewReason =
  | "implausible_position"
  | "candidate_unreliable"
  | "low_piece_confidence"
  | "unstable_square_confidence";

interface BoardOcrReading extends BoardOcrClassification {
  status: "ok" | "needs_review";
  crop: BoardOcrCrop;
  geometryReliable: boolean;
  plausible: boolean;
  candidates: BoardOcrCandidate[];
  reviewReasons: BoardOcrReviewReason[];
  reviewSquares: number[];
}

export type BoardOcrResult = { status: "no_board" } | BoardOcrReading;

export interface BoardRecognizer {
  classifyCrop(
    image: BoardOcrRaster,
    crop: BoardOcrCrop,
  ): Promise<BoardOcrClassification>;
  recognize(image: BoardOcrRaster): Promise<BoardOcrResult>;
  release(): Promise<void>;
}

export function createBoardRecognizer(options: {
  model: string;
  runtime: Pick<typeof OnnxRuntime, "InferenceSession" | "Tensor">;
}): Promise<BoardRecognizer>;
