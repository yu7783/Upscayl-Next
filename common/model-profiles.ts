/**
 * Recommended settings for the models that ship with Upscayl-Next.
 *
 * The settings panel can apply these values automatically when a major model is
 * selected, so users get a good starting point without having to tune every
 * slider by hand. Custom models keep whatever settings the user already chose.
 */
export type ModelProfile = {
  /** Output scale. */
  scale: string;
  /** Tile size in pixels. 0 lets the binary pick automatically. */
  tileSize: number;
  /** Test-time augmentation. Higher quality, slower. */
  ttaMode: boolean;
  /** Image compression level. */
  compression: number;
  /** Run the model twice for 2x the requested scale. */
  doubleUpscayl: boolean;
  /**
   * "load:proc:save" thread split for upscayl-bin (-j).
   * Empty string keeps the binary default.
   */
  threads: string;
  /** Short explanation shown in the UI. */
  description: string;
};

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "upscayl-standard-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "Balanced speed and quality for general photos.",
  },
  "upscayl-lite-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "2:2:2",
    description: "Fastest model for low-end hardware.",
  },
  "high-fidelity-4x": {
    scale: "4",
    tileSize: 512,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "High quality with a tile size that keeps VRAM usage low.",
  },
  "remacri-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: true,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "Maximum quality with TTA mode enabled.",
  },
  "ultramix-balanced-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "Great for mixed content and everyday photos.",
  },
  "ultrasharp-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "Sharp results for text and graphics.",
  },
  "digital-art-4x": {
    scale: "4",
    tileSize: 0,
    ttaMode: false,
    compression: 0,
    doubleUpscayl: false,
    threads: "1:2:2",
    description: "Optimized for digital art and illustrations.",
  },
};

export const getModelProfile = (modelId: string): ModelProfile | null =>
  MODEL_PROFILES[modelId] ?? null;

/**
 * The subset of user settings a profile can override. Kept separate from the
 * React atoms so the merge rule can be unit tested without a renderer.
 */
export type ModelSettings = {
  scale: string;
  tileSize: number;
  ttaMode: boolean;
  compression: number;
  doubleUpscayl: boolean;
  threads: string | null;
};

/**
 * Resolve the settings to use after a model is picked.
 *
 * - Auto-optimization disabled → keep the current settings untouched.
 * - Custom / unknown model → keep the current settings (no profile exists).
 * - Built-in model → use its profile.
 */
export function resolveModelSettings(
  modelId: string,
  autoOptimize: boolean,
  current: ModelSettings,
): ModelSettings {
  if (!autoOptimize) return current;

  const profile = getModelProfile(modelId);
  if (!profile) return current;

  return {
    scale: profile.scale,
    tileSize: profile.tileSize,
    ttaMode: profile.ttaMode,
    compression: profile.compression,
    doubleUpscayl: profile.doubleUpscayl,
    threads: profile.threads.trim().length > 0 ? profile.threads : null,
  };
}
