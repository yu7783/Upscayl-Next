"use client";

import { useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useToast } from "@/components/ui/use-toast";
import { translationAtom } from "@/atoms/translations-atom";
import {
  customWidthAtom,
  progressAtom,
  savedOutputPathAtom,
  scaleAtom,
  ttaModeAtom,
  useCustomWidthAtom,
  videoBatchModeAtom,
  videoBatchPathsAtom,
  videoCodecAtom,
  videoContainerAtom,
  videoDeduplicateFramesAtom,
  videoIntermediateFormatAtom,
  videoInterpolationAtom,
  videoKeepAudioAtom,
  videoProgressAtom,
  videoQualityAtom,
  videoResumableAtom,
  videoTrimEndAtom,
  videoTrimStartAtom,
  videoUseHwEncodeAtom,
} from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import getFilenameFromPath from "@common/get-file-name";
import {
  FfmpegStatus,
  VideoCodec,
  VideoContainerFormat,
  VideoIntermediateFormat,
  VideoInterpolationFactor,
  VideoMediaInfo,
  VideoQualityPreset,
  VideoSessionManifest,
} from "@common/types/types";
import {
  estimateVideoOutputDimensions,
  formatVideoDuration,
  resolveHardwareEncoder,
} from "@common/video-upscayl-helpers";
import useLogger from "../../hooks/use-logger";
import SelectModelDialog from "../upscayl-tab/select-model-dialog";
import { SelectImageScale } from "../settings-tab/select-image-scale";
import RecipeBar from "../recipe-bar";

type VideoTabProps = {
  videoPath: string;
  videoInfo: VideoMediaInfo | null;
  ffmpegStatus: FfmpegStatus | null;
  videoSessions: VideoSessionManifest[];
  selectVideoHandler: () => Promise<void>;
  selectMultipleVideosHandler: () => Promise<void>;
  upscaylVideoHandler: (overrides?: {
    trimStartSeconds?: number | null;
    trimEndSeconds?: number | null;
    resumable?: boolean;
  }) => Promise<void>;
  batchVideoHandler: () => Promise<void>;
  resumeVideoSessionHandler: (sessionId: string) => void;
  discardVideoSessionHandler: (sessionId: string) => Promise<void>;
};

const FORMAT_PRESETS: Array<{
  id: string;
  label: string;
  container: VideoContainerFormat;
  codec: VideoCodec;
}> = [
  { id: "mp4-h264", label: "MP4 (H.264)", container: "mp4", codec: "h264" },
  {
    id: "mp4-h265",
    label: "MP4 (H.265 / HEVC)",
    container: "mp4",
    codec: "h265",
  },
  { id: "mkv-h264", label: "MKV (H.264)", container: "mkv", codec: "h264" },
  {
    id: "mkv-h265",
    label: "MKV (H.265 / HEVC)",
    container: "mkv",
    codec: "h265",
  },
  { id: "webm-vp9", label: "WebM (VP9)", container: "webm", codec: "vp9" },
];

const VideoTab = ({
  videoPath,
  videoInfo,
  ffmpegStatus,
  videoSessions,
  selectVideoHandler,
  selectMultipleVideosHandler,
  upscaylVideoHandler,
  batchVideoHandler,
  resumeVideoSessionHandler,
  discardVideoSessionHandler,
}: VideoTabProps) => {
  const t = useAtomValue(translationAtom);
  const logit = useLogger();
  const { toast } = useToast();
  const [scale, setScale] = useAtom(scaleAtom);
  const [outputPath, setOutputPath] = useAtom(savedOutputPathAtom);
  const progress = useAtomValue(progressAtom);
  const videoProgress = useAtomValue(videoProgressAtom);
  const customWidth = useAtomValue(customWidthAtom);
  const useCustomWidth = useAtomValue(useCustomWidthAtom);
  const ttaMode = useAtomValue(ttaModeAtom);
  const [videoCodec, setVideoCodec] = useAtom(videoCodecAtom);
  const [videoContainer, setVideoContainer] = useAtom(videoContainerAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [keepAudio, setKeepAudio] = useAtom(videoKeepAudioAtom);
  const [intermediateFormat, setIntermediateFormat] = useAtom(
    videoIntermediateFormatAtom,
  );
  const [useHwEncode, setUseHwEncode] = useAtom(videoUseHwEncodeAtom);
  const [deduplicateFrames, setDeduplicateFrames] = useAtom(
    videoDeduplicateFramesAtom,
  );
  const [interpolation, setInterpolation] = useAtom(videoInterpolationAtom);
  const [resumable, setResumable] = useAtom(videoResumableAtom);
  const [videoBatchMode, setVideoBatchMode] = useAtom(videoBatchModeAtom);
  const [videoBatchPaths, setVideoBatchPaths] = useAtom(videoBatchPathsAtom);
  const [trimStart, setTrimStart] = useAtom(videoTrimStartAtom);
  const [trimEnd, setTrimEnd] = useAtom(videoTrimEndAtom);

  const selectedFormatPreset = useMemo(() => {
    const match = FORMAT_PRESETS.find(
      (p) => p.container === videoContainer && p.codec === videoCodec,
    );
    return match?.id ?? "mp4-h264";
  }, [videoCodec, videoContainer]);

  const detectedHwEncoder = useMemo(
    () => resolveHardwareEncoder(videoCodec, ffmpegStatus?.hwEncoders ?? []),
    [videoCodec, ffmpegStatus?.hwEncoders],
  );

  const estimatedOutput = useMemo(() => {
    if (!videoInfo) return null;
    return estimateVideoOutputDimensions({
      width: videoInfo.width,
      height: videoInfo.height,
      scale,
      useCustomWidth,
      customWidth,
    });
  }, [videoInfo, scale, useCustomWidth, customWidth]);

  const outputHandler = async () => {
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FOLDER);
    if (path !== null) {
      logit("🗂 Setting Video Output Path: ", path);
      setOutputPath(path);
    } else {
      setOutputPath(null);
    }
  };

  const handleFormatChange = (presetId: string) => {
    const preset = FORMAT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setVideoContainer(preset.container);
    setVideoCodec(preset.codec);
  };

  const validateBeforeRun = () => {
    if (progress.length > 0) {
      toast({
        description: t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE"),
      });
      return false;
    }
    if (ffmpegStatus && !ffmpegStatus.available) {
      toast({
        title: t("VIDEO_UPSCAYL.FFMPEG_MISSING_TITLE"),
        description: t("VIDEO_UPSCAYL.FFMPEG_MISSING_DESCRIPTION"),
      });
      return false;
    }
    if (!outputPath) {
      toast({ description: t("VIDEO_UPSCAYL.NO_OUTPUT_FOLDER") });
      return false;
    }
    return true;
  };

  const startHandler = () => {
    if (!validateBeforeRun()) return;
    if (videoBatchMode) {
      if (videoBatchPaths.length === 0) {
        toast({ description: t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED") });
        return;
      }
      batchVideoHandler();
      return;
    }
    if (!videoPath) {
      toast({ description: t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED") });
      return;
    }
    upscaylVideoHandler();
  };

  const quickPreviewHandler = () => {
    if (!validateBeforeRun()) return;
    if (!videoPath) {
      toast({ description: t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED") });
      return;
    }
    const endPreview =
      videoInfo && videoInfo.duration > 0
        ? Math.min(5, videoInfo.duration)
        : 5;
    upscaylVideoHandler({
      trimStartSeconds: 0,
      trimEndSeconds: endPreview,
      resumable: false,
    });
  };

  const isRunning = progress.length > 0;

  return (
    <div className="animate-step-in flex h-screen flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
      <RecipeBar />

      {/* FFmpeg Status */}
      {ffmpegStatus && (
        <div
          className={`rounded-btn border px-3 py-2 text-xs ${
            ffmpegStatus.available
              ? "border-success/30 bg-success/10 text-success"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          {ffmpegStatus.available ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                ✓{" "}
                {t("VIDEO_UPSCAYL.FFMPEG_READY", {
                  version: ffmpegStatus.version ?? "",
                })}
              </p>
              <p className="text-[11px] opacity-85">
                {detectedHwEncoder
                  ? `⚡ ${t("VIDEO_UPSCAYL.HW_ENCODE_DETECTED", {
                      encoder: detectedHwEncoder,
                    })}`
                  : t("VIDEO_UPSCAYL.HW_ENCODE_CPU_ONLY")}
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold">
                {t("VIDEO_UPSCAYL.FFMPEG_MISSING_TITLE")}
              </p>
              <p className="mt-1 text-base-content/80">
                {t("VIDEO_UPSCAYL.FFMPEG_MISSING_DESCRIPTION")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Resumable Video Sessions */}
      {videoSessions.length > 0 && !isRunning && (
        <div className="rounded-box border border-primary/30 bg-primary/10 p-3 text-xs">
          <p className="mb-2 font-semibold text-primary">
            ♻️ {t("VIDEO_UPSCAYL.RESUMABLE_SESSIONS_TITLE")}
          </p>
          <div className="flex flex-col gap-2">
            {videoSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex flex-col gap-1.5 rounded-btn bg-base-100/80 p-2"
              >
                <p
                  className="truncate font-medium"
                  title={session.inputVideo}
                >
                  {getFilenameFromPath(session.inputVideo)}
                </p>
                <p className="text-[11px] text-base-content/70">
                  {session.completedChunks.length}/{session.totalChunks} chunks ·{" "}
                  {session.model} · {session.scale}x
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn btn-primary btn-xs flex-1"
                    onClick={() => resumeVideoSessionHandler(session.sessionId)}
                  >
                    {t("VIDEO_UPSCAYL.RESUME_BUTTON")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() =>
                      discardVideoSessionHandler(session.sessionId)
                    }
                  >
                    {t("VIDEO_UPSCAYL.DISCARD_BUTTON")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ttaMode && (
        <div className="rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          ⚠️ {t("VIDEO_UPSCAYL.TTA_WARNING")}
        </div>
      )}

      {/* Batch Video Toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="toggle toggle-primary toggle-sm"
          checked={videoBatchMode}
          onChange={(e) => setVideoBatchMode(e.target.checked)}
          disabled={isRunning}
        />
        <span>{t("VIDEO_UPSCAYL.BATCH_VIDEO_TOGGLE")}</span>
      </label>

      {/* STEP 1: VIDEO SELECTION */}
      <div className="animate-step-in">
        <p className="step-heading">{t("VIDEO_UPSCAYL.SELECT_VIDEO")}</p>
        {videoBatchMode ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                className="btn btn-primary btn-sm flex-1"
                onClick={selectMultipleVideosHandler}
                disabled={isRunning}
              >
                {t("VIDEO_UPSCAYL.ADD_VIDEOS_BUTTON")}
              </button>
              {videoBatchPaths.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setVideoBatchPaths([])}
                  disabled={isRunning}
                >
                  {t("VIDEO_UPSCAYL.CLEAR_VIDEOS_BUTTON")}
                </button>
              )}
            </div>
            <p className="text-xs text-base-content/70">
              {videoBatchPaths.length > 0
                ? t("VIDEO_UPSCAYL.BATCH_VIDEOS_COUNT", {
                    count: String(videoBatchPaths.length),
                  })
                : t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED")}
            </p>
            {videoBatchPaths.length > 0 && (
              <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-btn border border-base-content/10 bg-base-200/50 p-2 text-xs">
                {videoBatchPaths.map((itemPath, idx) => (
                  <div
                    key={itemPath}
                    className="flex items-center justify-between gap-1"
                  >
                    <span className="truncate" title={itemPath}>
                      {idx + 1}. {getFilenameFromPath(itemPath)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs px-1"
                      disabled={isRunning}
                      onClick={() =>
                        setVideoBatchPaths((prev) =>
                          prev.filter((p) => p !== itemPath),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <button
              className="btn btn-primary"
              onClick={selectVideoHandler}
              disabled={isRunning}
            >
              {t("VIDEO_UPSCAYL.SELECT_VIDEO_BUTTON")}
            </button>
            <p className="mt-2 break-all text-xs text-base-content/70">
              {videoPath || t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED")}
            </p>
            {videoInfo && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="badge badge-neutral badge-sm">
                  {videoInfo.width}×{videoInfo.height}
                </span>
                <span className="badge badge-neutral badge-sm">
                  {videoInfo.fps.toFixed(videoInfo.fps % 1 === 0 ? 0 : 2)} fps
                </span>
                {videoInfo.duration > 0 && (
                  <span className="badge badge-neutral badge-sm">
                    {formatVideoDuration(videoInfo.duration)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Trim / Range (single video only) */}
      {!videoBatchMode && videoPath && (
        <div className="rounded-box border border-base-content/10 bg-base-200/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/70">
            {t("VIDEO_UPSCAYL.TRIM_TITLE")}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-base-content/70">
                {t("VIDEO_UPSCAYL.TRIM_START")}
              </span>
              <input
                type="text"
                placeholder="0"
                className="input input-bordered input-xs w-full"
                value={trimStart}
                onChange={(e) => setTrimStart(e.target.value)}
                disabled={isRunning}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-base-content/70">
                {t("VIDEO_UPSCAYL.TRIM_END")}
              </span>
              <input
                type="text"
                placeholder={
                  videoInfo && videoInfo.duration > 0
                    ? formatVideoDuration(videoInfo.duration)
                    : ""
                }
                className="input input-bordered input-xs w-full"
                value={trimEnd}
                onChange={(e) => setTrimEnd(e.target.value)}
                disabled={isRunning}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-xs mt-2 w-full"
            onClick={quickPreviewHandler}
            disabled={isRunning}
          >
            ⚡ {t("VIDEO_UPSCAYL.PREVIEW_5S_BUTTON")}
          </button>
        </div>
      )}

      {/* STEP 2: MODEL & SCALE */}
      <div className="animate-step-in flex flex-col gap-3">
        <div>
          <p className="step-heading">{t("VIDEO_UPSCAYL.MODEL_TITLE")}</p>
          <SelectModelDialog />
        </div>
        <SelectImageScale scale={scale} setScale={setScale} hideInfo />
      </div>

      {/* STEP 3: OUTPUT & ENCODING */}
      <div className="animate-step-in flex flex-col gap-3">
        <div>
          <p className="step-heading">{t("APP.OUTPUT_PATH_SELECTION.TITLE")}</p>
          <button
            className="btn btn-primary"
            data-tooltip-content={outputPath ?? undefined}
            data-tooltip-id="tooltip"
            onClick={outputHandler}
            disabled={isRunning}
          >
            {t("APP.OUTPUT_PATH_SELECTION.BUTTON_TITLE")}
          </button>
          <p className="mt-2 break-all text-xs text-base-content/70">
            {outputPath ?? t("VIDEO_UPSCAYL.NO_OUTPUT_FOLDER")}
          </p>
        </div>

        <div className="rounded-box border border-base-content/10 bg-base-200/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/70">
            {t("VIDEO_UPSCAYL.ENCODING_TITLE")}
          </p>

          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.FORMAT_LABEL")}
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={selectedFormatPreset}
                onChange={(e) => handleFormatChange(e.target.value)}
                disabled={isRunning}
              >
                {FORMAT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.QUALITY_LABEL")}
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={videoQuality}
                onChange={(e) =>
                  setVideoQuality(e.target.value as VideoQualityPreset)
                }
                disabled={isRunning}
              >
                <option value="high">{t("VIDEO_UPSCAYL.QUALITY_HIGH")}</option>
                <option value="balanced">
                  {t("VIDEO_UPSCAYL.QUALITY_BALANCED")}
                </option>
                <option value="compact">
                  {t("VIDEO_UPSCAYL.QUALITY_COMPACT")}
                </option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.INTERPOLATION_LABEL")}
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={String(interpolation)}
                onChange={(e) =>
                  setInterpolation(
                    Number(e.target.value) as VideoInterpolationFactor,
                  )
                }
                disabled={isRunning}
              >
                <option value="1">{t("VIDEO_UPSCAYL.INTERPOLATION_OFF")}</option>
                <option value="2">{t("VIDEO_UPSCAYL.INTERPOLATION_2X")}</option>
                <option value="4">{t("VIDEO_UPSCAYL.INTERPOLATION_4X")}</option>
              </select>
              {interpolation > 1 && (
                <span className="text-[11px] text-primary">
                  {ffmpegStatus?.hasRife
                    ? t("VIDEO_UPSCAYL.INTERPOLATION_RIFE")
                    : t("VIDEO_UPSCAYL.INTERPOLATION_FFMPEG")}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.INTERMEDIATE_LABEL")}
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={intermediateFormat}
                onChange={(e) =>
                  setIntermediateFormat(
                    e.target.value as VideoIntermediateFormat,
                  )
                }
                disabled={isRunning}
              >
                <option value="jpg">
                  {t("VIDEO_UPSCAYL.INTERMEDIATE_JPG")}
                </option>
                <option value="png">
                  {t("VIDEO_UPSCAYL.INTERMEDIATE_PNG")}
                </option>
              </select>
            </label>

            <label className="flex cursor-pointer items-center justify-between pt-1 text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.HW_ENCODE_LABEL")}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-xs"
                checked={useHwEncode && Boolean(detectedHwEncoder)}
                onChange={(e) => setUseHwEncode(e.target.checked)}
                disabled={isRunning || !detectedHwEncoder}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.DEDUP_LABEL")}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-xs"
                checked={deduplicateFrames}
                onChange={(e) => setDeduplicateFrames(e.target.checked)}
                disabled={isRunning}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.RESUMABLE_LABEL")}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-xs"
                checked={resumable}
                onChange={(e) => setResumable(e.target.checked)}
                disabled={isRunning}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-xs">
              <span className="text-base-content/80">
                {t("VIDEO_UPSCAYL.KEEP_AUDIO")}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-xs"
                checked={keepAudio}
                onChange={(e) => setKeepAudio(e.target.checked)}
                disabled={isRunning}
              />
            </label>
          </div>
        </div>
      </div>

      {/* STEP 4: START / PROGRESS */}
      <div className="animate-step-in flex flex-col gap-2 pb-4">
        {!videoBatchMode && videoInfo && estimatedOutput && (
          <p className="text-xs text-base-content/80">
            {t("APP.SCALE_SELECTION.FROM_TITLE")}
            <span className="font-bold">
              {videoInfo.width}×{videoInfo.height}
            </span>
            {t("APP.SCALE_SELECTION.TO_TITLE")}
            <span className="font-bold">
              {estimatedOutput.width}×{estimatedOutput.height}
            </span>
            {interpolation > 1 && (
              <span className="ml-1 font-bold text-primary">
                ({(videoInfo.fps * interpolation).toFixed(0)} fps)
              </span>
            )}
          </p>
        )}

        {isRunning && (
          <div className="rounded-btn border border-base-content/10 bg-base-200 p-3 text-xs">
            <p className="font-medium">
              {videoProgress?.message || progress}
            </p>
            {videoProgress && (
              <progress
                className="progress progress-primary mt-2 w-full"
                value={videoProgress.percent}
                max={100}
              />
            )}
            <button
              className="btn btn-error btn-xs mt-2"
              onClick={() => window.electron.send(ELECTRON_COMMANDS.STOP, null)}
            >
              {t("APP.PROGRESS_BAR.STOP_BUTTON_TITLE")}
            </button>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={startHandler}
          disabled={isRunning}
        >
          {isRunning
            ? t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE")
            : videoBatchMode
              ? t("VIDEO_UPSCAYL.BATCH_VIDEO_START", {
                  count: String(videoBatchPaths.length),
                })
              : t("VIDEO_UPSCAYL.START_BUTTON")}
        </button>
      </div>
    </div>
  );
};

export default VideoTab;
