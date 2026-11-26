export function validateRaster({ width, height, data }) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError("Expected an RGBA raster or ImageData");
  }
}

export function detectionGray({ width, height, data }) {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    const offset = i * 4;
    luma[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
  const longestEdge = Math.max(width, height);
  const maxDetectionEdge = 1600;
  if (longestEdge <= maxDetectionEdge) return { data: luma, width, height };

  const scaledWidth = Math.max(1, Math.round(width * maxDetectionEdge / longestEdge));
  const scaledHeight = Math.max(1, Math.round(height * maxDetectionEdge / longestEdge));
  const scaled = new Float32Array(scaledWidth * scaledHeight);
  const xRatio = width / scaledWidth;
  const yRatio = height / scaledHeight;
  for (let y = 0; y < scaledHeight; y++) {
    const sourceY = (y + 0.5) * yRatio - 0.5;
    const top = Math.floor(sourceY);
    const bottom = Math.min(top + 1, height - 1);
    const fy = sourceY - top;
    for (let x = 0; x < scaledWidth; x++) {
      const sourceX = (x + 0.5) * xRatio - 0.5;
      const left = Math.floor(sourceX);
      const right = Math.min(left + 1, width - 1);
      const fx = sourceX - left;
      const upper = luma[top * width + left] * (1 - fx) + luma[top * width + right] * fx;
      const lower = luma[bottom * width + left] * (1 - fx) + luma[bottom * width + right] * fx;
      scaled[y * scaledWidth + x] = upper * (1 - fy) + lower * fy;
    }
  }
  return { data: scaled, width: scaledWidth, height: scaledHeight };
}

export function sourceCrop(corners, image, gray) {
  const xRatio = image.width / gray.width;
  const yRatio = image.height / gray.height;
  const x = Math.max(0, Math.round(corners.x0 * xRatio));
  const y = Math.max(0, Math.round(corners.y0 * yRatio));
  const right = Math.min(image.width, Math.round(corners.x1 * xRatio));
  const bottom = Math.min(image.height, Math.round(corners.y1 * yRatio));
  return { x, y, width: right - x, height: bottom - y };
}
