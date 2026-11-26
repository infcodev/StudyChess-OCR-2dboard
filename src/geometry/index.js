/**
 * Geometry and candidate arbitration adapted from Fenshot 0.1.6.
 * See the accompanying provenance and MIT license notices.
 */
import { boardness, findBlurredBoardCandidates, findChessboardCorners, snapCorners } from "./detect.js";

export const CONFIDENCE_FLOOR = 0.7;
const EMPTY_PLACEMENT = "8/8/8/8/8/8/8/8";
function isPlausiblePosition(placement) {
    let white = 0;
    let black = 0;
    for (const ch of placement) {
        if (ch === "K")
            white++;
        else if (ch === "k")
            black++;
    }
    return white === 1 && black === 1;
}
/** Detection passes per image: the first board found can be an empty
 *  decorative board (a page can contain several board-like regions,
 *  including this library's own UI); masking it and rescanning finds
 *  the board the user actually means. */
const MAX_SCAN_PASSES = 3;
/** A first-look read this good needs no second look: confident on every
 *  tile, a legal king count, and a box that looks like a board. Normal
 *  chess.com and Lichess screenshots stop here, at the cost they always
 *  had. */
const SETTLED_BOARDNESS = 0.8;
/** Picking the most confident of several alignments flatters the
 *  winner: the maximum of noisy confidences is biased upward, so a wrong
 *  read can clear CONFIDENCE_FLOOR by luck. When another alignment is
 *  nearly as confident (within this margin of the winner's mean) and
 *  reads a DIFFERENT position, the read is contested and not reliable.
 *  Measured on the benchmark and 488 Reddit screenshots: 0.03 removes
 *  every silent misread the second look would otherwise add. */
const CONTEST_MARGIN = 0.03;
async function readAll(boxes, classify) {
    const reads = [];
    for (const corners of boxes)
        reads.push({ result: await classify(corners), corners });
    return reads;
}
/** Highest mean confidence; the earlier box wins a tie. */
function mostConfident(reads) {
    let best = null;
    for (const r of reads) {
        if (!best || r.result.meanConfidence > best.result.meanConfidence)
            best = r;
    }
    return best;
}
function firstLookBoxes(gray) {
    const corners = findChessboardCorners(gray);
    if (!corners)
        return [];
    const snapped = snapCorners(gray, corners);
    const same = snapped.x0 === corners.x0 && snapped.y0 === corners.y0 && snapped.x1 === corners.x1 && snapped.y1 === corners.y1;
    return same ? [corners] : [corners, snapped];
}
function toScan(read, reliable) {
    return {
        ...read.result,
        corners: read.corners,
        reliable,
        plausible: isPlausiblePosition(read.result.placement),
    };
}
async function scanOnce(gray, classify) {
    const boxes = firstLookBoxes(gray);
    const reads = await readAll(boxes, classify);
    const first = mostConfident(reads);
    if (first &&
        first.result.minConfidence >= CONFIDENCE_FLOOR &&
        isPlausiblePosition(first.result.placement) &&
        boardness(gray, first.corners) >= SETTLED_BOARDNESS) {
        return toScan(first, true);
    }
    reads.push(...(await readAll(findBlurredBoardCandidates(gray, boxes), classify)));
    const best = mostConfident(reads);
    if (!best)
        return null;
    const contested = reads.some((r) => r.result.placement !== best.result.placement &&
        r.result.meanConfidence >= best.result.meanConfidence - CONTEST_MARGIN);
    return toScan(best, best.result.minConfidence >= CONFIDENCE_FLOOR && !contested);
}
/** Flatten a region so its gradients vanish and the detector cannot
 *  lock onto it again on the next pass. */
function maskRegion(gray, box) {
    const data = Float32Array.from(gray.data);
    const x0 = Math.max(0, Math.floor(box.x0));
    const y0 = Math.max(0, Math.floor(box.y0));
    const x1 = Math.min(gray.width, Math.ceil(box.x1));
    const y1 = Math.min(gray.height, Math.ceil(box.y1));
    for (let y = y0; y < y1; y++) {
        data.fill(128, y * gray.width + x0, y * gray.width + x1);
    }
    return { data, width: gray.width, height: gray.height };
}
/**
 * Pure recognition core: detect corners, classify, arbitrate against
 * the grid-snap candidate. Platform-independent (no canvas, no ONNX);
 * the classifier is injected. Exercised directly by the golden test
 * suite and usable from Node with any rasterizer.
 *
 * An implausible read is unlikely to be the board the user means: an
 * empty board has no position to analyze, and a kingless scatter is
 * usually the detector locking onto board-free UI (whole-screen
 * captures can include decorative boards, placeholder boards, and
 * card grids that look like boards). When a pass reads implausible,
 * the region is masked and the scan repeats, preferring a plausible
 * board found later. The best implausible read is still returned when
 * nothing better exists, preferring piece-bearing reads over empty
 * ones; callers decide how much to trust it via `plausible`.
 */
export async function recognizeGray(gray, classify) {
    let working = gray;
    let fallback = null;
    for (let pass = 0; pass < MAX_SCAN_PASSES; pass++) {
        const result = await scanOnce(working, classify);
        if (!result)
            break;
        if (result.plausible)
            return result;
        const fallbackIsEmpty = !fallback || fallback.placement === EMPTY_PLACEMENT;
        if (fallbackIsEmpty && (!fallback || result.placement !== EMPTY_PLACEMENT)) {
            fallback = result;
        }
        working = maskRegion(working, result.corners);
    }
    return fallback;
}
