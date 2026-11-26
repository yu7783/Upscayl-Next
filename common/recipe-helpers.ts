import {
  ImageFormat,
  VideoCodec,
  VideoContainerFormat,
  VideoIntermediateFormat,
  VideoInterpolationFactor,
  VideoQualityPreset,
} from "./types/types";

export type UpscaylRecipeSettings = {
  model: string;
  multiModelMode: boolean;
  compareModels: string[];
  scale: string;
  doubleUpscayl: boolean;
  saveImageAs: ImageFormat;
  compression: number;
  tileSize: number | null;
  ttaMode: boolean;
  threads: string | null;
  useCustomWidth: boolean;
  customWidth: number;
  videoCodec: VideoCodec;
  videoContainer: VideoContainerFormat;
  videoQuality: VideoQualityPreset;
  videoKeepAudio: boolean;
  videoIntermediateFormat: VideoIntermediateFormat;
  videoUseHwEncode: boolean;
  videoDeduplicateFrames: boolean;
  videoInterpolation: VideoInterpolationFactor;
  videoResumable: boolean;
  blendAlpha: number;
  blendSecondModel: string | null;
  faceRestore: boolean;
  faceRestoreStrength: number;
};

export type UpscaylRecipe = {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  createdAt: number;
  settings: UpscaylRecipeSettings;
};

export const BUILTIN_RECIPES: UpscaylRecipe[] = [
  {
    id: "builtin-photo-natural",
    name: "Photo Natural (4x + Subtle Blend)",
    description: "High-fidelity photo upscale with natural 80% blend & face restore ready",
    builtin: true,
    createdAt: 1,
    settings: {
      model: "high-fidelity-4x",
      multiModelMode: false,
      compareModels: ["high-fidelity-4x", "upscayl-standard-4x"],
      scale: "4",
      doubleUpscayl: false,
      saveImageAs: "png",
      compression: 0,
      tileSize: null,
      ttaMode: false,
      threads: null,
      useCustomWidth: false,
      customWidth: 0,
      videoCodec: "h264",
      videoContainer: "mp4",
      videoQuality: "high",
      videoKeepAudio: true,
      videoIntermediateFormat: "jpg",
      videoUseHwEncode: true,
      videoDeduplicateFrames: true,
      videoInterpolation: 1,
      videoResumable: true,
      blendAlpha: 80,
      blendSecondModel: null,
      faceRestore: true,
      faceRestoreStrength: 65,
    },
  },
  {
    id: "builtin-anime-smooth-60",
    name: "Anime 2x + 2x FPS Video",
    description: "Clean anime lines with frame deduplication and 2x FPS interpolation",
    builtin: true,
    createdAt: 2,
    settings: {
      model: "digital-art-4x",
      multiModelMode: false,
      compareModels: ["digital-art-4x", "ultrasharp-4x"],
      scale: "2",
      doubleUpscayl: false,
      saveImageAs: "png",
      compression: 0,
      tileSize: null,
      ttaMode: false,
      threads: null,
      useCustomWidth: false,
      customWidth: 0,
      videoCodec: "h265",
      videoContainer: "mp4",
      videoQuality: "balanced",
      videoKeepAudio: true,
      videoIntermediateFormat: "jpg",
      videoUseHwEncode: true,
      videoDeduplicateFrames: true,
      videoInterpolation: 2,
      videoResumable: true,
      blendAlpha: 100,
      blendSecondModel: null,
      faceRestore: false,
      faceRestoreStrength: 50,
    },
  },
  {
    id: "builtin-web-compact",
    name: "Fast Web Export (WebP)",
    description: "Fast 2x upscale compressed to crisp WebP for web publishing",
    builtin: true,
    createdAt: 3,
    settings: {
      model: "upscayl-lite-4x",
      multiModelMode: false,
      compareModels: ["upscayl-lite-4x", "upscayl-standard-4x"],
      scale: "2",
      doubleUpscayl: false,
      saveImageAs: "webp",
      compression: 15,
      tileSize: null,
      ttaMode: false,
      threads: null,
      useCustomWidth: false,
      customWidth: 0,
      videoCodec: "h264",
      videoContainer: "mp4",
      videoQuality: "compact",
      videoKeepAudio: true,
      videoIntermediateFormat: "jpg",
      videoUseHwEncode: true,
      videoDeduplicateFrames: true,
      videoInterpolation: 1,
      videoResumable: true,
      blendAlpha: 100,
      blendSecondModel: null,
      faceRestore: false,
      faceRestoreStrength: 50,
    },
  },
];

const VALID_FORMATS = new Set<ImageFormat>(["png", "jpg", "webp"]);
const VALID_CODECS = new Set<VideoCodec>(["h264", "h265", "vp9"]);
const VALID_CONTAINERS = new Set<VideoContainerFormat>(["mp4", "mkv", "webm"]);
const VALID_QUALITIES = new Set<VideoQualityPreset>([
  "high",
  "balanced",
  "compact",
]);

export function sanitizeRecipe(raw: any): UpscaylRecipe | null {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const s = raw.settings;
  if (!s || typeof s !== "object") return null;

  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? raw.id.trim()
      : `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const interp = s.videoInterpolation === 4 ? 4 : s.videoInterpolation === 2 ? 2 : 1;

  return {
    id,
    name: name.slice(0, 80),
    description:
      typeof raw.description === "string"
        ? raw.description.trim().slice(0, 160)
        : undefined,
    builtin: Boolean(raw.builtin),
    createdAt:
      typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now(),
    settings: {
      model:
        typeof s.model === "string" && s.model.trim()
          ? s.model.trim()
          : "upscayl-standard-4x",
      multiModelMode: Boolean(s.multiModelMode),
      compareModels: Array.isArray(s.compareModels)
        ? s.compareModels.filter((m: any) => typeof m === "string" && m.trim())
        : ["upscayl-standard-4x", "high-fidelity-4x"],
      scale:
        typeof s.scale === "string" && s.scale.trim() ? s.scale.trim() : "4",
      doubleUpscayl: Boolean(s.doubleUpscayl),
      saveImageAs: VALID_FORMATS.has(s.saveImageAs) ? s.saveImageAs : "png",
      compression:
        typeof s.compression === "number" && Number.isFinite(s.compression)
          ? Math.max(0, Math.min(100, Math.round(s.compression)))
          : 0,
      tileSize:
        typeof s.tileSize === "number" && Number.isFinite(s.tileSize)
          ? s.tileSize
          : null,
      ttaMode: Boolean(s.ttaMode),
      threads:
        typeof s.threads === "string" && s.threads.trim()
          ? s.threads.trim()
          : null,
      useCustomWidth: Boolean(s.useCustomWidth),
      customWidth:
        typeof s.customWidth === "number" && Number.isFinite(s.customWidth)
          ? Math.max(0, Math.round(s.customWidth))
          : 0,
      videoCodec: VALID_CODECS.has(s.videoCodec) ? s.videoCodec : "h264",
      videoContainer: VALID_CONTAINERS.has(s.videoContainer)
        ? s.videoContainer
        : "mp4",
      videoQuality: VALID_QUALITIES.has(s.videoQuality)
        ? s.videoQuality
        : "balanced",
      videoKeepAudio: s.videoKeepAudio !== false,
      videoIntermediateFormat:
        s.videoIntermediateFormat === "png" ? "png" : "jpg",
      videoUseHwEncode: s.videoUseHwEncode !== false,
      videoDeduplicateFrames: s.videoDeduplicateFrames !== false,
      videoInterpolation: interp,
      videoResumable: s.videoResumable !== false,
      blendAlpha:
        typeof s.blendAlpha === "number" && Number.isFinite(s.blendAlpha)
          ? Math.max(0, Math.min(100, Math.round(s.blendAlpha)))
          : 100,
      blendSecondModel:
        typeof s.blendSecondModel === "string" && s.blendSecondModel.trim()
          ? s.blendSecondModel.trim()
          : null,
      faceRestore: Boolean(s.faceRestore),
      faceRestoreStrength:
        typeof s.faceRestoreStrength === "number" &&
        Number.isFinite(s.faceRestoreStrength)
          ? Math.max(0, Math.min(100, Math.round(s.faceRestoreStrength)))
          : 70,
    },
  };
}

export function serializeRecipes(recipes: UpscaylRecipe[]): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      recipes: recipes.map((r) => ({ ...r, builtin: false })),
    },
    null,
    2,
  );
}

export function parseRecipesJson(jsonText: string): UpscaylRecipe[] {
  const parsed = JSON.parse(jsonText);
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.recipes)
      ? parsed.recipes
      : [];
  const valid: UpscaylRecipe[] = [];
  for (const item of rawList) {
    const cleaned = sanitizeRecipe(item);
    if (cleaned) {
      valid.push({ ...cleaned, builtin: false });
    }
  }
  return valid;
}
