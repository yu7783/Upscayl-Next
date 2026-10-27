/**
 * Helpers for recovering from Vulkan/VRAM allocation failures reported by
 * upscayl-bin (ncnn).
 *
 * On GPUs with little VRAM, or when another application is using the GPU,
 * ncnn aborts with a message like "vk Allocated memory failed -2". The tile
 * size (-t) splits the image into smaller pieces and lowers peak VRAM usage,
 * so instead of failing the whole upscale we retry with a smaller tile.
 */

/**
 * Lowercase fragments that identify a Vulkan/VRAM allocation failure.
 *
 * The binary is not consistent about casing or spacing, so matching on the
 * normalised text keeps the detection stable across ncnn versions.
 */
const VULKAN_MEMORY_ERROR_PATTERNS = [
  // ncnn / realesrgan-ncnn-vulkan variants:
  //   "vkAllocateMemory failed -2"
  //   "vk AllocateMemory failed -2"
  //   "vkAllocatedMemory failed -2"
  //   "vk Allocated memory failed -2"
  "allocatememory failed",
  "allocatedmemory failed",
  "allocate memory failed",
  "allocated memory failed",
  "vk::systemerror",
  "vk::outofdevicememoryerror",
  "vk_error_out_of_device_memory",
  "vk_error_out_of_host_memory",
  "out of device memory",
  "failed to allocate device memory",
  "failed to allocate memory",
];

/** Smallest tile size ncnn accepts for realesrgan-ncnn-vulkan (0 means auto). */
export const MIN_TILE_SIZE = 32;

/**
 * Tile size used when the current value is 0 (auto) and auto detection asked
 * for more VRAM than the GPU could provide. 512 is a safe middle ground that
 * still keeps the number of tiles reasonable.
 */
export const DEFAULT_RETRY_TILE_SIZE = 512;

/** Tile sizes we step down through when retrying a failed upscale. */
const TILE_SIZE_LADDER = [512, 256, 128, 64, 32] as const;

/** Human readable hint shown when the GPU cannot allocate enough memory. */
export const VULKAN_MEMORY_ERROR_MESSAGE =
  "The GPU ran out of memory while upscaling (Vulkan allocation failed). " +
  "Try a smaller tile size in the settings, close other GPU-heavy apps, " +
  "or select a different GPU.";

/**
 * Returns true when the given output line reports a Vulkan/VRAM allocation
 * failure. Only text that is known to come from the upscayl binary should be
 * passed here.
 */
export function isVulkanMemoryError(text: string): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return VULKAN_MEMORY_ERROR_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

/**
 * Returns the next smaller tile size to try after a Vulkan allocation failure,
 * or null when the smallest supported tile size has already been reached.
 *
 * - 0 / auto / invalid -> 512 (force tiling)
 * - values above 512 -> 512
 * - 512 -> 256 -> 128 -> 64 -> 32 -> null
 * - non-ladder values step down to the next smaller ladder entry
 */
export function getFallbackTileSize(tileSize: number): number | null {
  const current = Number.isFinite(tileSize) ? Math.floor(tileSize) : 0;
  if (current <= 0) return DEFAULT_RETRY_TILE_SIZE;

  for (const candidate of TILE_SIZE_LADDER) {
    if (candidate < current) return candidate;
  }

  return null;
}
