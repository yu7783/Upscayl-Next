import { ImageFormat } from "./types/types";

/**
 * Clamp a blend weight percentage (0 = 100% Image A, 100 = 100% Image B) into
 * [0, 100] and return both the integer percent and normalized [0, 1] alpha.
 */
export function clampBlendAlpha(alphaPercent: number): {
  percent: number;
  alpha: number;
} {
  if (!Number.isFinite(alphaPercent)) {
    return { percent: 50, alpha: 0.5 };
  }
  const percent = Math.round(Math.max(0, Math.min(100, alphaPercent)));
  return { percent, alpha: percent / 100 };
}

/**
 * Build a readable filename for a blended output image, preserving model names
 * and the blend ratio so multiple blend experiments don't overwrite each other.
 */
export function buildBlendOutputPath({
  outputDir,
  separator,
  baseName,
  labelA,
  labelB,
  alphaPercent,
  saveImageAs,
}: {
  outputDir: string;
  separator: string;
  baseName: string;
  labelA: string;
  labelB: string;
  alphaPercent: number;
  saveImageAs: ImageFormat;
}): string {
  const { percent } = clampBlendAlpha(alphaPercent);
  const sanitizeTag = (s: string) =>
    s
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "img";

  const tagA = sanitizeTag(labelA);
  const tagB = sanitizeTag(labelB);
  return `${outputDir}${separator}${baseName}_blend_${tagA}_${100 - percent}_${tagB}_${percent}.${saveImageAs}`;
}

/**
 * Linearly blend two equally sized raw RGBA buffers:
 * `out[i] = round(a[i] * (1 - alpha) + b[i] * alpha)`.
 */
export function blendRgbaBuffers(
  bufA: Uint8Array,
  bufB: Uint8Array,
  alpha: number,
): Uint8Array {
  if (bufA.length !== bufB.length) {
    throw new Error(
      `Buffer length mismatch during blend (${bufA.length} vs ${bufB.length})`,
    );
  }
  const t = Math.max(0, Math.min(1, alpha));
  const inv = 1 - t;
  const out = new Uint8Array(bufA.length);
  for (let i = 0; i < bufA.length; i += 1) {
    out[i] = Math.round(bufA[i] * inv + bufB[i] * t);
  }
  return out;
}
