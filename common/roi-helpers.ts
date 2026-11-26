export type RoiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoiPercentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MIN_ROI_PIXELS = 16;

/**
 * Clamp a pixel crop rectangle into valid image bounds so `sharp().extract()`
 * never throws on negative coordinates or out-of-range widths/heights.
 */
export function clampRoiRect(
  rect: RoiRect,
  imageWidth: number,
  imageHeight: number,
): RoiRect | null {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth < MIN_ROI_PIXELS ||
    imageHeight < MIN_ROI_PIXELS
  ) {
    return null;
  }

  const x1 = Math.max(0, Math.min(Math.round(rect.x), imageWidth - 1));
  const y1 = Math.max(0, Math.min(Math.round(rect.y), imageHeight - 1));
  const x2 = Math.max(
    x1,
    Math.min(Math.round(rect.x + rect.width), imageWidth),
  );
  const y2 = Math.max(
    y1,
    Math.min(Math.round(rect.y + rect.height), imageHeight),
  );

  const width = x2 - x1;
  const height = y2 - y1;
  if (width < MIN_ROI_PIXELS || height < MIN_ROI_PIXELS) {
    return null;
  }

  return { x: x1, y: y1, width, height };
}

/**
 * Convert a normalized (0..1) selection rectangle from the UI overlay into
 * clamped pixel coordinates on the source image.
 */
export function percentRectToPixel(
  percentRect: RoiPercentRect,
  imageWidth: number,
  imageHeight: number,
): RoiRect | null {
  return clampRoiRect(
    {
      x: percentRect.x * imageWidth,
      y: percentRect.y * imageHeight,
      width: percentRect.width * imageWidth,
      height: percentRect.height * imageHeight,
    },
    imageWidth,
    imageHeight,
  );
}

/**
 * Convert a pixel rectangle back into normalized (0..1) fractions.
 */
export function pixelRectToPercent(
  rect: RoiRect,
  imageWidth: number,
  imageHeight: number,
): RoiPercentRect {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: Math.max(0, Math.min(1, rect.x / imageWidth)),
    y: Math.max(0, Math.min(1, rect.y / imageHeight)),
    width: Math.max(0, Math.min(1, rect.width / imageWidth)),
    height: Math.max(0, Math.min(1, rect.height / imageHeight)),
  };
}

export function isValidRoiRect(rect: RoiRect | null | undefined): rect is RoiRect {
  return (
    Boolean(rect) &&
    Number.isFinite(rect!.x) &&
    Number.isFinite(rect!.y) &&
    Number.isFinite(rect!.width) &&
    Number.isFinite(rect!.height) &&
    rect!.width >= MIN_ROI_PIXELS &&
    rect!.height >= MIN_ROI_PIXELS
  );
}
