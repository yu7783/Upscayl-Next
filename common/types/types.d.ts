import { ImageFormat } from "@electron/types/types";

export type ImageUpscaylPayload = {
  imagePath: string;
  outputPath: string;
  scale: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  overwrite: boolean;
  compression: string;
  noImageProcessing: boolean;
  customWidth: string;
  useCustomWidth: boolean;
  tileSize: number;
  ttaMode: boolean;
  copyMetadata: boolean;
  /**
   * Optional "load:proc:save" thread split. Empty/undefined keeps the default.
   */
  threads?: string;
};

export type DoubleUpscaylPayload = {
  model: string;
  /**
   * The path to the image to upscale.
   */
  imagePath: string;
  outputPath: string;
  scale: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  compression: string;
  noImageProcessing: boolean;
  customWidth: string;
  useCustomWidth: boolean;
  tileSize: number;
  ttaMode: boolean;
  copyMetadata: boolean;
  /**
   * Optional "load:proc:save" thread split. Empty/undefined keeps the default.
   */
  threads?: string;
};

export type VideoUpscaylPayload = {
  videoPath: string;
  outputPath: string;
  scale: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  compression: string;
  customWidth: string;
  useCustomWidth: boolean;
  tileSize: number;
  ttaMode: boolean;
  /**
   * Optional "load:proc:save" thread split. Empty/undefined keeps the default.
   */
  threads?: string;
};

export type BatchUpscaylPayload = {
  batchFolderPath: string;
  outputPath: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  scale: string;
  compression: string;
  noImageProcessing: boolean;
  customWidth: string;
  useCustomWidth: boolean;
  tileSize: number;
  ttaMode: boolean;
  copyMetadata: boolean;
  /**
   * Run the whole folder twice (the second pass reads the first pass output).
   * Enables Batch + Double Upscayl together and fixes issue #1405.
   */
  doubleUpscale?: boolean;
  /**
   * Optional "load:proc:save" thread split. Empty/undefined lets the app
   * calculate a split from the CPU core count.
   */
  threads?: string;
};
