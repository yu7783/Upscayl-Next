"use client";

import React, { useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import {
  customWidthAtom,
  scaleAtom,
  useCustomWidthAtom,
} from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import getFilenameFromPath from "@common/get-file-name";
import { sanitizePath } from "@common/sanitize-path";
import {
  FfmpegStatus,
  VideoDoneInfo,
  VideoMediaInfo,
} from "@common/types/types";
import {
  estimateVideoOutputDimensions,
  formatVideoDuration,
} from "@common/video-upscayl-helpers";
import useTranslation from "../hooks/use-translation";

type VideoWorkspaceProps = {
  version: string;
  videoPath: string;
  videoInfo: VideoMediaInfo | null;
  videoDoneInfo: VideoDoneInfo | null;
  ffmpegStatus: FfmpegStatus | null;
  selectVideoHandler: () => Promise<void>;
  resetVideoHandler: () => void;
};

type VideoCompareView = "side-by-side" | "upscaled" | "original";

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
};

const VideoWorkspace = ({
  version,
  videoPath,
  videoInfo,
  videoDoneInfo,
  ffmpegStatus,
  selectVideoHandler,
  resetVideoHandler,
}: VideoWorkspaceProps) => {
  const t = useTranslation();
  const scale = useAtomValue(scaleAtom);
  const customWidth = useAtomValue(customWidthAtom);
  const useCustomWidth = useAtomValue(useCustomWidthAtom);

  const [compareView, setCompareView] =
    useState<VideoCompareView>("side-by-side");
  const [isPlaying, setIsPlaying] = useState(false);

  const originalVideoRef = useRef<HTMLVideoElement | null>(null);
  const upscaledVideoRef = useRef<HTMLVideoElement | null>(null);

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

  const syncPlayToggle = () => {
    const orig = originalVideoRef.current;
    const upsc = upscaledVideoRef.current;
    if (isPlaying) {
      orig?.pause();
      upsc?.pause();
      setIsPlaying(false);
    } else {
      if (orig && upsc) {
        orig.currentTime = upsc.currentTime;
      }
      orig?.play().catch(() => {});
      upsc?.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const syncRestart = () => {
    const orig = originalVideoRef.current;
    const upsc = upscaledVideoRef.current;
    if (orig) orig.currentTime = 0;
    if (upsc) upsc.currentTime = 0;
    orig?.play().catch(() => {});
    upsc?.play().catch(() => {});
    setIsPlaying(true);
  };

  const handleUpscaledSeek = () => {
    if (originalVideoRef.current && upscaledVideoRef.current) {
      if (
        Math.abs(
          originalVideoRef.current.currentTime -
            upscaledVideoRef.current.currentTime,
        ) > 0.15
      ) {
        originalVideoRef.current.currentTime =
          upscaledVideoRef.current.currentTime;
      }
    }
  };

  // Empty state: no video chosen yet
  if (!videoPath && !videoDoneInfo) {
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-btn bg-base-200 p-6 text-center"
        onDoubleClick={(e) => {
          e.stopPropagation();
          selectVideoHandler();
        }}
      >
        <p className="text-lg font-semibold">{t("VIDEO_UPSCAYL.DROP_TITLE")}</p>
        <p className="max-w-md text-sm text-base-content/70">
          {t("VIDEO_UPSCAYL.DROP_DESCRIPTION")}
        </p>

        {ffmpegStatus && !ffmpegStatus.available && (
          <div className="max-w-md rounded-btn border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <p className="font-semibold">
              {t("VIDEO_UPSCAYL.FFMPEG_MISSING_TITLE")}
            </p>
            <p className="mt-1 text-base-content/80">
              {t("VIDEO_UPSCAYL.FFMPEG_MISSING_DESCRIPTION")}
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={selectVideoHandler}
        >
          {t("VIDEO_UPSCAYL.SELECT_VIDEO_BUTTON")}
        </button>

        <p className="badge badge-primary text-sm">Upscayl-Next v{version}</p>
      </div>
    );
  }

  // Completed state: before/after comparison player + output details
  if (videoDoneInfo) {
    const originalSrc = "file:///" + sanitizePath(videoDoneInfo.inputPath);
    const upscaledSrc = "file:///" + sanitizePath(videoDoneInfo.outputPath);

    return (
      <div
        className="flex h-screen w-full flex-col overflow-hidden bg-base-300"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-content/10 bg-base-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="join">
              <button
                type="button"
                className={`btn join-item btn-xs ${
                  compareView === "side-by-side" ? "btn-primary" : "btn-ghost"
                }`}
                onClick={() => setCompareView("side-by-side")}
              >
                {t("VIDEO_UPSCAYL.COMPARE_SIDE_BY_SIDE")}
              </button>
              <button
                type="button"
                className={`btn join-item btn-xs ${
                  compareView === "upscaled" ? "btn-primary" : "btn-ghost"
                }`}
                onClick={() => setCompareView("upscaled")}
              >
                {t("VIDEO_UPSCAYL.COMPARE_UPSCALED")}
              </button>
              <button
                type="button"
                className={`btn join-item btn-xs ${
                  compareView === "original" ? "btn-primary" : "btn-ghost"
                }`}
                onClick={() => setCompareView("original")}
              >
                {t("VIDEO_UPSCAYL.COMPARE_ORIGINAL")}
              </button>
            </div>

            {compareView === "side-by-side" && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={syncPlayToggle}
                >
                  {isPlaying
                    ? t("VIDEO_UPSCAYL.SYNC_PAUSE")
                    : t("VIDEO_UPSCAYL.SYNC_PLAY")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={syncRestart}
                >
                  {t("VIDEO_UPSCAYL.SYNC_RESTART")}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() =>
                window.electron.send(
                  ELECTRON_COMMANDS.OPEN_FILE_LOCATION,
                  videoDoneInfo.outputPath,
                )
              }
            >
              {t("VIDEO_UPSCAYL.SHOW_IN_FOLDER")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={resetVideoHandler}
            >
              {t("VIDEO_UPSCAYL.RESET_VIDEO")}
            </button>
          </div>
        </div>

        {/* Video player area */}
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {compareView === "side-by-side" ? (
            <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-box border border-base-content/10 bg-black">
                <div className="bg-base-100/90 px-3 py-1 text-xs font-semibold">
                  {t("VIDEO_UPSCAYL.COMPARE_ORIGINAL")}
                </div>
                <video
                  ref={originalVideoRef}
                  src={originalSrc}
                  muted
                  controls
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="min-h-0 w-full flex-1 object-contain"
                />
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden rounded-box border border-primary/40 bg-black">
                <div className="flex items-center justify-between bg-base-100/90 px-3 py-1 text-xs font-semibold text-primary">
                  <span>{t("VIDEO_UPSCAYL.COMPARE_UPSCALED")}</span>
                  <span className="font-normal text-base-content/70">
                    {videoDoneInfo.model} · {videoDoneInfo.scaleLabel}
                  </span>
                </div>
                <video
                  ref={upscaledVideoRef}
                  src={upscaledSrc}
                  controls
                  onPlay={() => {
                    originalVideoRef.current?.play().catch(() => {});
                    setIsPlaying(true);
                  }}
                  onPause={() => {
                    originalVideoRef.current?.pause();
                    setIsPlaying(false);
                  }}
                  onSeeked={handleUpscaledSeek}
                  className="min-h-0 w-full flex-1 object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-box border border-base-content/10 bg-black">
              <video
                src={compareView === "upscaled" ? upscaledSrc : originalSrc}
                controls
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        {/* Output summary footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 bg-base-100 px-4 py-2 text-xs text-base-content/80">
          <span className="truncate font-medium" title={videoDoneInfo.outputPath}>
            ✅ {getFilenameFromPath(videoDoneInfo.outputPath)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-neutral badge-sm">
              {videoDoneInfo.container.toUpperCase()} /{" "}
              {videoDoneInfo.codec.toUpperCase()}
            </span>
            <span className="badge badge-neutral badge-sm">
              {formatBytes(videoDoneInfo.fileSize)}
            </span>
            <span className="badge badge-neutral badge-sm">
              {videoDoneInfo.totalFrames} frames
            </span>
            <span className="badge badge-neutral badge-sm">
              {(videoDoneInfo.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Source preview state: video selected, ready to upscale
  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-base-300"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-base-content/10 bg-base-100 px-4 py-2.5 text-xs">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
            {t("VIDEO_UPSCAYL.SOURCE_INFO")}
          </p>
          <p className="truncate text-sm font-semibold" title={videoPath}>
            {getFilenameFromPath(videoPath)}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={resetVideoHandler}
        >
          {t("VIDEO_UPSCAYL.RESET_VIDEO")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <video
          src={"file:///" + sanitizePath(videoPath)}
          controls
          className="max-h-full max-w-full rounded-box bg-black shadow-lg"
        />
      </div>

      {videoInfo && (
        <div className="grid grid-cols-2 gap-2 border-t border-base-content/10 bg-base-100 px-4 py-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.RESOLUTION")}
            </p>
            <p className="font-semibold">
              {videoInfo.width}×{videoInfo.height}
            </p>
          </div>
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.OUTPUT_RESOLUTION")}
            </p>
            <p className="font-semibold text-primary">
              {estimatedOutput
                ? `${estimatedOutput.width}×${estimatedOutput.height}`
                : "--"}
            </p>
          </div>
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.FPS")}
            </p>
            <p className="font-semibold">
              {videoInfo.fps.toFixed(videoInfo.fps % 1 === 0 ? 0 : 2)} fps
            </p>
          </div>
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.DURATION")}
            </p>
            <p className="font-semibold">
              {formatVideoDuration(videoInfo.duration)}
            </p>
          </div>
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.FRAMES")}
            </p>
            <p className="font-semibold">
              {videoInfo.estimatedFrames > 0
                ? videoInfo.estimatedFrames.toLocaleString()
                : "--"}
            </p>
          </div>
          <div className="rounded-btn bg-base-200 px-3 py-2">
            <p className="text-[10px] uppercase text-base-content/60">
              {t("VIDEO_UPSCAYL.AUDIO")}
            </p>
            <p className="font-semibold">
              {videoInfo.hasAudio
                ? (videoInfo.audioCodec?.toUpperCase() ?? "Yes")
                : t("VIDEO_UPSCAYL.AUDIO_NONE")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoWorkspace;
