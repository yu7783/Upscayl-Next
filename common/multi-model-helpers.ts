import { MultiModelResult } from "./types/types";

export const ORIGINAL_COMPARE_ID = "__original__";

/**
 * Deduplicate and clean a list of model IDs while preserving the user's chosen
 * execution order.
 */
export function normalizeModelSelection(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of models) {
    const model = typeof raw === "string" ? raw.trim() : "";
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }

  return result;
}

/**
 * Build the deterministic output file path for a single model in a multi-model
 * run. Mirrors single-image naming so existing files can be reused when
 * overwrite is disabled.
 */
export function buildMultiModelOutputPath({
  outputDir,
  separator,
  fileName,
  model,
  scale,
  useCustomWidth,
  customWidth,
  saveImageAs,
  doubleUpscale = false,
}: {
  outputDir: string;
  separator: string;
  fileName: string;
  model: string;
  scale: string;
  useCustomWidth: boolean;
  customWidth: string;
  saveImageAs: string;
  doubleUpscale?: boolean;
}): string {
  const scaleSegment = useCustomWidth
    ? `${customWidth}px_`
    : doubleUpscale
      ? `${scale}x2_`
      : `${scale}x_`;

  return `${outputDir}${separator}${fileName}_upscayl_${scaleSegment}${model}.${saveImageAs}`;
}

/**
 * Compute overall progress (0..1) across a sequential multi-model run where
 * each model may perform 1 or 2 passes (double upscale).
 */
export function calculateMultiModelProgress({
  modelIndex,
  totalModels,
  pass,
  totalPasses,
  passPercent,
}: {
  modelIndex: number;
  totalModels: number;
  pass: number;
  totalPasses: number;
  passPercent: number;
}): number {
  const safeTotalModels = Math.max(totalModels, 1);
  const safeModelIndex = Math.min(Math.max(modelIndex, 0), safeTotalModels - 1);
  const safeTotalPasses = Math.max(totalPasses, 1);
  const safePass = Math.min(Math.max(pass, 1), safeTotalPasses);
  const clampedPercent = Math.min(Math.max(passPercent, 0), 100);

  const modelFraction = (safePass - 1 + clampedPercent / 100) / safeTotalPasses;
  const overall = (safeModelIndex + modelFraction) / safeTotalModels;
  return Math.min(Math.max(overall, 0), 1);
}

/**
 * Pick the initial pair (A vs B) for the multi-model comparison viewer.
 *
 * - If 2+ models succeeded, compare the first two generated models directly.
 * - If only 1 model succeeded, compare Original vs that model.
 * - If none succeeded, fall back to Original on both sides.
 */
export function resolveDefaultComparePair(
  results: readonly MultiModelResult[],
): { leftId: string; rightId: string } {
  const succeeded = results.filter(
    (item) => item.status === "done" && item.outputPath.length > 0,
  );

  if (succeeded.length >= 2) {
    return {
      leftId: succeeded[0].modelId,
      rightId: succeeded[1].modelId,
    };
  }

  if (succeeded.length === 1) {
    return {
      leftId: ORIGINAL_COMPARE_ID,
      rightId: succeeded[0].modelId,
    };
  }

  return {
    leftId: ORIGINAL_COMPARE_ID,
    rightId: ORIGINAL_COMPARE_ID,
  };
}
