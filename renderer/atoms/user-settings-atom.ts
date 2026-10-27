import { ImageFormat } from "@/lib/valid-formats";
import { ModelId } from "@common/models-list";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const customModelsPathAtom = atomWithStorage<string | null>(
  "customModelsPath",
  null,
);

export const selectedModelIdAtom = atomWithStorage<ModelId | string>(
  "selectedModelId",
  "upscayl-standard-4x",
);
export const doubleUpscaylAtom = atomWithStorage("doubleUpscayl", false);
export const gpuIdAtom = atomWithStorage("gpuId", "");
export const saveImageAsAtom = atomWithStorage<ImageFormat>(
  "saveImageAs",
  "png",
);

export const scaleAtom = atomWithStorage<string>("scale", "4");

export const batchModeAtom = atom<boolean>(false);

/**
 * The path to the last folder the user saved an image to.
 * Reset to "" if rememberOutputFolder is false.
 */
export const savedOutputPathAtom = atomWithStorage<string | null>(
  "savedOutputPath",
  null,
);

export const progressAtom = atom<string>("");

/**
 * Which pass of a multi-pass upscale is currently running.
 * e.g. { pass: 1, totalPasses: 2 } for the first of two double-upscale passes.
 */
export const upscaylPassAtom = atom<{ pass: number; totalPasses: number }>({
  pass: 0,
  totalPasses: 0,
});

/**
 * Structured progress for folder (batch) upscaling. The main process reports
 * how many images have been completed and how many exist in total, so the UI
 * can render a real progress bar instead of a bare counter.
 */
export const batchProgressAtom = atom<{
  pass: number;
  totalPasses: number;
  completed: number;
  total: number;
}>({
  pass: 0,
  totalPasses: 0,
  completed: 0,
  total: 0,
});

export const rememberOutputFolderAtom = atomWithStorage<boolean>(
  "rememberOutputFolder",
  false,
);

export const dontShowCloudModalAtom = atomWithStorage<boolean>(
  "dontShowCloudModal",
  false,
);

export const noImageProcessingAtom = atomWithStorage<boolean>(
  "noImageProcessing",
  false,
);

export const compressionAtom = atomWithStorage<number>("compression", 0);

export const overwriteAtom = atomWithStorage("overwrite", false);

export const turnOffNotificationsAtom = atomWithStorage(
  "turnOffNotifications",
  false,
);

export const ttaModeAtom = atomWithStorage("ttaMode", false);

export const viewTypeAtom = atomWithStorage<"slider" | "lens">(
  "viewType",
  "slider",
);

export const lensSizeAtom = atomWithStorage<number>("lensSize", 100);

export const customWidthAtom = atomWithStorage<number>("customWidth", 0);

export const useCustomWidthAtom = atomWithStorage<boolean>(
  "useCustomWidth",
  false,
);

export const tileSizeAtom = atomWithStorage<number | null>("tileSize", null);

/**
 * Optional "load:proc:save" thread split passed to upscayl-bin (-j).
 * When null the binary/default auto-calculation is used.
 */
export const threadsAtom = atomWithStorage<string | null>("threads", null);

/**
 * When enabled, selecting a built-in model applies that model's recommended
 * settings (scale, tile size, TTA, compression, threads) automatically.
 */
export const autoOptimizeAtom = atomWithStorage<boolean>("autoOptimize", true);

// CLIENT SIDE ONLY
export const showSidebarAtom = atomWithStorage("showSidebar", true);

export const autoUpdateAtom = atomWithStorage("autoUpdate", true);

export const userStatsAtom = atomWithStorage("userStats", {
  totalUpscayls: 0,
  doubleUpscayls: 0,
  batchUpscayls: 0,
  imageUpscayls: 0,
  averageUpscaylTime: 0,
  lastUpscaylDuration: 0,
  lastUsedAt: 0,
});

export const copyMetadataAtom = atomWithStorage<boolean>(
  "copyMetadata",
  false,
);
