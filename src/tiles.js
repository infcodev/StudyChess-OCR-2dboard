const tileSize = 32;
const scaleFixed = 2 ** 22;

function splitEdges(length) {
  return Array.from({ length: 9 }, (_, index) => {
    const edge = index * length / 8;
    const whole = Math.floor(edge);
    // Python rounds ties to even when splitting the 8x8 grid.
    return edge - whole === 0.5 ? whole + whole % 2 : Math.round(edge);
  });
}

function bilinearWeights(size) {
  const scale = size / tileSize;
  const support = Math.max(1, scale);
  return Array.from({ length: tileSize }, (_, index) => {
    const center = (index + 0.5) * scale;
    const start = Math.max(0, Math.trunc(center - support + 0.5));
    const end = Math.min(size, Math.trunc(center + support + 0.5));
    const weights = Array.from({ length: end - start }, (_, offset) =>
      Math.max(0, 1 - Math.abs((start + offset - center + 0.5) / support)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return { start, weights: weights.map((weight) => Math.round(weight / total * scaleFixed)) };
  });
}

function sample(source, offset, stride, weights) {
  let value = scaleFixed / 2;
  for (const weight of weights) {
    value += source[offset] * weight;
    offset += stride;
  }
  // Match Pillow's byte rounding after each separable pass.
  return Math.min(255, Math.floor(value / scaleFixed));
}

function resizeTile(image, bounds, horizontal, vertical, target, offset) {
  const { x, y, height } = bounds;
  const intermediate = new Uint8Array(height * tileSize * 3);
  for (let row = 0; row < height; row++) {
    const sourceRow = ((y + row) * image.width + x) * 4;
    for (let column = 0; column < tileSize; column++) {
      const { start, weights } = horizontal[column];
      const sourcePixel = sourceRow + 4 * start;
      const resizedPixel = (row * tileSize + column) * 3;
      for (let channel = 0; channel < 3; channel++) {
        intermediate[resizedPixel + channel] = sample(image.data, sourcePixel + channel, 4, weights);
      }
    }
  }
  for (const { start, weights } of vertical) {
    const sourceRow = start * tileSize * 3;
    for (let sampleIndex = 0; sampleIndex < tileSize * 3; sampleIndex++) {
      target[offset++] = sample(intermediate, sourceRow + sampleIndex, tileSize * 3, weights);
    }
  }
}

export function splitTiles(image, { x, y, width, height }) {
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 8 || height < 8 ||
      x + width > image.width || y + height > image.height) {
    throw new RangeError("The crop must contain an 8×8 grid inside the image");
  }
  const rows = splitEdges(height);
  const columns = splitEdges(width);
  const coefficients = new Map();
  const weightsFor = (size) => {
    if (!coefficients.has(size)) coefficients.set(size, bilinearWeights(size));
    return coefficients.get(size);
  };
  const tiles = new Float32Array(64 * tileSize * tileSize * 3);
  for (let row = 0; row < 8; row++) {
    const tileHeight = rows[row + 1] - rows[row];
    for (let column = 0; column < 8; column++) {
      const tileWidth = columns[column + 1] - columns[column];
      resizeTile(image, { x: x + columns[column], y: y + rows[row], height: tileHeight },
        weightsFor(tileWidth), weightsFor(tileHeight), tiles, (row * 8 + column) * tileSize * tileSize * 3);
    }
  }
  return tiles;
}
