import { ImageFormat } from "@electron/types/types";
export type { ImageFormat };

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
  faceRestore?: boolean;
  faceRestoreStrength?: number;
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
  faceRestore?: boolean;
  faceRestoreStrength?: number;
};

export type VideoCodec = "h264" | "h265" | "vp9";
export type VideoContainerFormat = "mp4" | "mkv" | "webm";
export type VideoQualityPreset = "high" | "balanced" | "compact";
export type VideoIntermediateFormat = "jpg" | "png";
export type VideoInterpolationFactor = 1 | 2 | 4;
export type VideoInterpolationEngine = "auto" | "rife" | "ffmpeg";
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
  trimStartSeconds?: number | null;
  trimEndSeconds?: number | null;
  resumable?: boolean;
  resumeSessionId?: string;
  frameInterpolation?: VideoInterpolationFactor;
  interpolationEngine?: VideoInterpolationEngine;
};

export type FfmpegStatus = {
  available: boolean;
  hasFfmpeg: boolean;
  hasFfprobe: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  version: string | null;
  hwEncoders: HardwareVideoEncoder[];
  hasRife: boolean;
  rifePath: string | null;
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
  | "interpolating"
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
  sessionId?: string;
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
  interpolationFactor?: VideoInterpolationFactor;
  interpolationEngineUsed?: string | null;
  trimmedRange?: { start: number; end: number } | null;
};

export type VideoSessionManifest = {
  sessionId: string;
  inputVideo: string;
  outputBasePath: string;
  outputFile: string;
  model: string;
  scale: string;
  useCustomWidth: boolean;
  customWidth: string;
  gpuId: string;
  tileSize: number;
  ttaMode: boolean;
  threads?: string;
  videoCodec: VideoCodec;
  videoContainer: VideoContainerFormat;
  videoQuality: VideoQualityPreset;
  keepAudio: boolean;
  hasAudio: boolean;
  intermediateFormat: VideoIntermediateFormat;
  useHardwareEncoding: boolean;
  deduplicateFrames: boolean;
  frameInterpolation: VideoInterpolationFactor;
  interpolationEngine: VideoInterpolationEngine;
  trimStartSeconds: number | null;
  trimEndSeconds: number | null;
  fps: number;
  fpsRational: string;
  duration: number;
  totalFrames: number;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number[];
  skippedDuplicateFrames: number;
  createdAt: number;
  updatedAt: number;
};

export type BatchVideoUpscaylPayload = Omit<
  VideoUpscaylPayload,
  "videoPath" | "trimStartSeconds" | "trimEndSeconds" | "resumeSessionId"
> & {
  videoPaths: string[];
};

export type BatchVideoItemResult = {
  videoPath: string;
  status: "done" | "error";
  doneInfo?: VideoDoneInfo;
  error?: string;
};

export type BatchVideoProgressInfo = {
  videoIndex: number;
  totalVideos: number;
  currentVideoPath: string;
  completedVideos: number;
  videoProgress: VideoProgressInfo | null;
};

export type BatchVideoDonePayload = {
  results: BatchVideoItemResult[];
  stopped: boolean;
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
  faceRestore?: boolean;
  faceRestoreStrength?: number;
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

export type MultiModelTrashPayload = {
  filePaths: string[];
  protectedPaths?: string[];
};

export type MultiModelTrashResult = {
  trashed: string[];
  failed: Array<{ path: string; error: string }>;
};

export type RoiRectPayload = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoiUpscaylPayload = {
  imagePath: string;
  outputPath: string;
  roi: RoiRectPayload;
  models: string[];
  scale: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  compression: string;
  customWidth: string;
  useCustomWidth: boolean;
  tileSize: number;
  ttaMode: boolean;
  doubleUpscale?: boolean;
  threads?: string;
  faceRestore?: boolean;
  faceRestoreStrength?: number;
};

export type RoiUpscaylDonePayload = {
  cropInputPath: string;
  roi: RoiRectPayload;
  results: MultiModelResult[];
  stopped: boolean;
};

export type BlendImagesPayload = {
  imageAPath: string;
  imageBPath: string;
  outputDir: string;
  baseName: string;
  labelA: string;
  labelB: string;
  alphaPercent: number;
  saveImageAs: ImageFormat;
  compression: number;
  copyMetadata?: boolean;
  sourceMetadataPath?: string;
};

export type BlendImagesResult = {
  outputPath: string;
  width: number;
  height: number;
  alphaPercent: number;
};

export type FaceRestoreStatus = {
  available: boolean;
  engines: string[];
  pythonPath: string | null;
  message?: string;
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
  faceRestore?: boolean;
  faceRestoreStrength?: number;
};

export type ModelManagerProgressInfo = {
  modelId: string;
  fileIndex: number;
  totalFiles: number;
  currentFile: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type ModelManagerListResponse = {
  modelsDir: string;
  entries: import("../model-catalog").CatalogModelStatus[];
};
