export type UpscaylMode =
  | "batch"
  | "multi-model"
  | "double"
  | "single"
  | "invalid";

/**
 * Decide which upscaling pipeline should run.
 *
 * Batch mode takes priority over Double Upscayl so that a persisted
 * `doubleUpscayl` flag can never send an empty image path to the single
 * image / double upscale pipeline (GitHub issue #1405).
 */
export function resolveUpscaylMode({
  batchMode,
  doubleUpscayl,
  imagePath,
  batchFolderPath,
  multiModelMode = false,
  multiModelCount = 0,
}: {
  batchMode: boolean;
  doubleUpscayl: boolean;
  imagePath: string;
  batchFolderPath: string;
  multiModelMode?: boolean;
  multiModelCount?: number;
}): UpscaylMode {
  if (batchMode) {
    return batchFolderPath.length > 0 ? "batch" : "invalid";
  }

  if (imagePath.length === 0) {
    return "invalid";
  }

  if (multiModelMode) {
    return multiModelCount >= 2 ? "multi-model" : "invalid";
  }

  return doubleUpscayl ? "double" : "single";
}
