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
  useCustomWidthAtom,
  videoCodecAtom,
  videoContainerAtom,
  videoKeepAudioAtom,
  videoProgressAtom,
  videoQualityAtom,
} from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import {
  FfmpegStatus,
  VideoCodec,
  VideoContainerFormat,
  VideoMediaInfo,
  VideoQualityPreset,
} from "@common/types/types";
import {
  estimateVideoOutputDimensions,
  formatVideoDuration,
} from "@common/video-upscayl-helpers";
import useLogger from "../../hooks/use-logger";
import SelectModelDialog from "../upscayl-tab/select-model-dialog";
import { SelectImageScale } from "../settings-tab/select-image-scale";

type VideoTabProps = {
  videoPath: string;
  videoInfo: VideoMediaInfo | null;
  ffmpegStatus: FfmpegStatus | null;
  selectVideoHandler: () => Promise<void>;
  upscaylVideoHandler: () => Promise<void>;
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
  selectVideoHandler,
  upscaylVideoHandler,
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
  const [videoCodec, setVideoCodec] = useAtom(videoCodecAtom);
  const [videoContainer, setVideoContainer] = useAtom(videoContainerAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [keepAudio, setKeepAudio] = useAtom(videoKeepAudioAtom);

  const selectedFormatPreset = useMemo(() => {
    const match = FORMAT_PRESETS.find(
      (p) => p.container === videoContainer && p.codec === videoCodec,
    );
    return match?.id ?? "mp4-h264";
  }, [videoCodec, videoContainer]);

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

  const startHandler = () => {
    if (progress.length > 0) {
      toast({
        description: t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE"),
      });
      return;
    }
    if (ffmpegStatus && !ffmpegStatus.available) {
      toast({
        title: t("VIDEO_UPSCAYL.FFMPEG_MISSING_TITLE"),
        description: t("VIDEO_UPSCAYL.FFMPEG_MISSING_DESCRIPTION"),
      });
      return;
    }
    if (!videoPath) {
      toast({ description: t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED") });
      return;
    }
    if (!outputPath) {
      toast({ description: t("VIDEO_UPSCAYL.NO_OUTPUT_FOLDER") });
      return;
    }
    upscaylVideoHandler();
  };

  const isRunning = progress.length > 0;

  return (
    <div className="animate-step-in flex h-screen flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
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
            <p className="font-medium">
              ✓{" "}
              {t("VIDEO_UPSCAYL.FFMPEG_READY", {
                version: ffmpegStatus.version ?? "",
              })}
            </p>
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

      {/* STEP 1: VIDEO SELECTION */}
      <div className="animate-step-in">
        <p className="step-heading">{t("VIDEO_UPSCAYL.SELECT_VIDEO")}</p>
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
      </div>

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

            <label className="flex cursor-pointer items-center justify-between pt-1 text-xs">
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
        {videoInfo && estimatedOutput && (
          <p className="text-xs text-base-content/80">
            {t("APP.SCALE_SELECTION.FROM_TITLE")}
            <span className="font-bold">
              {videoInfo.width}×{videoInfo.height}
            </span>
            {t("APP.SCALE_SELECTION.TO_TITLE")}
            <span className="font-bold">
              {estimatedOutput.width}×{estimatedOutput.height}
            </span>
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
            : t("VIDEO_UPSCAYL.START_BUTTON")}
        </button>
      </div>
    </div>
  );
};

export default VideoTab;
