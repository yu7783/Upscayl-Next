import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  blendRgbaBuffers,
  buildBlendOutputPath,
  clampBlendAlpha,
} from "../../common/blend-helpers";
import decodePath from "../../common/decode-path";
import {
  BlendImagesPayload,
  BlendImagesResult,
} from "../../common/types/types";
import { copyMetadata } from "../utils/copy-metadata";
import logit from "../utils/logit";
import slash from "../utils/slash";

/**
 * Blend two images cleanly at `alphaPercent` (0% = Image A, 100% = Image B).
 * Automatically resizes Image A to match Image B's resolution with Lanczos3
 * when blending an original low-res source with an upscaled generation.
 */
export async function blendImagesFile(
  payload: BlendImagesPayload,
): Promise<BlendImagesResult> {
  const pathA = decodePath(payload.imageAPath);
  const pathB = decodePath(payload.imageBPath);
  const outputDir = decodePath(payload.outputDir);

  if (!fs.existsSync(pathA) || !fs.statSync(pathA).isFile()) {
    throw new Error(`Image A not found: ${pathA}`);
  }
  if (!fs.existsSync(pathB) || !fs.statSync(pathB).isFile()) {
    throw new Error(`Image B not found: ${pathB}`);
  }
  if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
    throw new Error(`Output folder not found: ${outputDir}`);
  }

  const { percent, alpha } = clampBlendAlpha(payload.alphaPercent);

  const metaB = await sharp(pathB).metadata();
  const targetWidth = metaB.width;
  const targetHeight = metaB.height;
  if (!targetWidth || !targetHeight) {
    throw new Error("Could not read target image dimensions for blending.");
  }

  const [rawA, rawB] = await Promise.all([
    sharp(pathA)
      .resize(targetWidth, targetHeight, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(pathB).ensureAlpha().raw().toBuffer(),
  ]);

  const blended = blendRgbaBuffers(rawA, rawB, alpha);

  const outputPath = buildBlendOutputPath({
    outputDir,
    separator: slash,
    baseName: payload.baseName || path.parse(pathB).name,
    labelA: payload.labelA || "A",
    labelB: payload.labelB || "B",
    alphaPercent: percent,
    saveImageAs: payload.saveImageAs,
  });

  const quality = Math.max(
    1,
    Math.min(100, 100 - Math.max(0, Math.min(99, payload.compression || 0))),
  );

  let pipeline = sharp(Buffer.from(blended), {
    raw: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
    },
  });

  if (payload.saveImageAs === "jpg") {
    pipeline = pipeline.flatten({ background: "#000000" }).jpeg({ quality });
  } else if (payload.saveImageAs === "webp") {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.png({
      compressionLevel: Math.min(
        9,
        Math.round(((payload.compression || 0) / 100) * 9),
      ),
    });
  }

  await pipeline.toFile(outputPath);

  if (payload.copyMetadata && payload.sourceMetadataPath) {
    try {
      await copyMetadata(decodePath(payload.sourceMetadataPath), outputPath);
    } catch (err) {
      logit("⚠️ Could not copy metadata to blended image: ", err);
    }
  }

  logit(
    `🎨 Saved blended image (${100 - percent}% A + ${percent}% B): `,
    outputPath,
  );

  return {
    outputPath,
    width: targetWidth,
    height: targetHeight,
    alphaPercent: percent,
  };
}

export async function handleBlendImages(
  _event: unknown,
  payload: BlendImagesPayload,
): Promise<BlendImagesResult> {
  return blendImagesFile(payload);
}
