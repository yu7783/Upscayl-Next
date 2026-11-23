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

export type VideoCodec = "h264" | "h265" | "vp9";
export type VideoContainerFormat = "mp4" | "mkv" | "webm";
export type VideoQualityPreset = "high" | "balanced" | "compact";
export type VideoIntermediateFormat = "jpg" | "png";
export type HardwareVideoEncoder =
  | "h264_nvenc"
  | "hevc_nvenc"
  | "h264_amf"
  | "hevc_amf"
  | "h264_qsv"
  | "hevc_qsv"
  | "h264_videotoolbox"
  | "hevc_videotoolbox";

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
  videoCodec?: VideoCodec;
  videoContainer?: VideoContainerFormat;
  videoQuality?: VideoQualityPreset;
  keepAudio?: boolean;
  intermediateFormat?: VideoIntermediateFormat;
  useHardwareEncoding?: boolean;
  deduplicateFrames?: boolean;
};

export type FfmpegStatus = {
  available: boolean;
  hasFfmpeg: boolean;
  hasFfprobe: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  version: string | null;
  hwEncoders: HardwareVideoEncoder[];
};

export type VideoMediaInfo = {
  path: string;
  width: number;
  height: number;
  fps: number;
  fpsRational: string;
  duration: number;
  estimatedFrames: number;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  fileSize: number;
};

export type VideoProgressStage =
  | "preparing"
  | "extracting"
  | "upscaling"
  | "encoding";

export type VideoProgressInfo = {
  stage: VideoProgressStage;
  stageIndex: number;
  totalStages: number;
  percent: number;
  completedFrames: number;
  totalFrames: number;
  chunk: number;
  totalChunks: number;
  message: string;
};

export type VideoDoneInfo = {
  outputPath: string;
  inputPath: string;
  fileSize: number;
  durationMs: number;
  totalFrames: number;
  model: string;
  scaleLabel: string;
  codec: VideoCodec;
  container: VideoContainerFormat;
  usedEncoder: string;
  skippedDuplicateFrames: number;
};

export type MultiModelUpscaylPayload = {
  imagePath: string;
  outputPath: string;
  models: string[];
  scale: string;
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
  doubleUpscale?: boolean;
  threads?: string;
};

export type MultiModelResult = {
  modelId: string;
  outputPath: string;
  durationMs: number;
  status: "done" | "error";
  error?: string;
  cached?: boolean;
};

export type MultiModelProgressInfo = {
  modelIndex: number;
  totalModels: number;
  modelId: string;
  pass: number;
  totalPasses: number;
  modelPercent: number;
  overallPercent: number;
  completedModels: number;
};

export type MultiModelDonePayload = {
  results: MultiModelResult[];
  stopped: boolean;
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
