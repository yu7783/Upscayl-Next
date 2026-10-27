export type UpscaylMode = "batch" | "double" | "single" | "invalid";

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
}: {
  batchMode: boolean;
  doubleUpscayl: boolean;
  imagePath: string;
  batchFolderPath: string;
}): UpscaylMode {
  if (batchMode) {
    return batchFolderPath.length > 0 ? "batch" : "invalid";
  }

  if (imagePath.length === 0) {
    return "invalid";
  }

  return doubleUpscayl ? "double" : "single";
}
