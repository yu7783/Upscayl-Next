"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { ModelId, MODELS } from "@common/models-list";
import {
  ORIGINAL_COMPARE_ID,
  resolveDefaultComparePair,
} from "@common/multi-model-helpers";
import { sanitizePath } from "@common/sanitize-path";
import {
  MultiModelResult,
  MultiModelTrashPayload,
  MultiModelTrashResult,
  RoiRectPayload,
} from "@common/types/types";
import getFilenameFromPath from "@common/get-file-name";
import { useToast } from "@/components/ui/use-toast";
import useTranslation from "../hooks/use-translation";
import LensViewer from "./lens-view";
import SliderView from "./slider-view";
import BlendPanel from "./blend-panel";

type CompareMode = "slider" | "grid" | "lens" | "blend";

type MultiModelCompareViewProps = {
  imagePath: string;
  outputPath: string | null;
  results: MultiModelResult[];
  wasStopped: boolean;
  zoomAmount: string;
  onUpdateResults?: React.Dispatch<React.SetStateAction<MultiModelResult[]>>;
  roiPreview?: {
    cropInputPath: string;
    roi: RoiRectPayload;
  } | null;
  onExitRoiPreview?: () => void;
  onUpscaleFullFromRoi?: () => void;
};

const formatMs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const MultiModelCompareView = ({
  imagePath,
  outputPath,
  results,
  wasStopped,
  zoomAmount,
  onUpdateResults,
  roiPreview,
  onExitRoiPreview,
  onUpscaleFullFromRoi,
}: MultiModelCompareViewProps) => {
  const t = useTranslation();
  const { toast } = useToast();

  const effectiveSourcePath = roiPreview?.cropInputPath || imagePath;

  const succeededResults = useMemo(
    () => results.filter((r) => r.status === "done" && r.outputPath.length > 0),
    [results],
  );
  const failedResults = useMemo(
    () => results.filter((r) => r.status === "error"),
    [results],
  );

  const defaultPair = useMemo(
    () => resolveDefaultComparePair(results),
    [results],
  );

  const [compareMode, setCompareMode] = useState<CompareMode>("slider");
  const [leftId, setLeftId] = useState<string>(defaultPair.leftId);
  const [rightId, setRightId] = useState<string>(defaultPair.rightId);
  const [showOriginalInGrid, setShowOriginalInGrid] = useState<boolean>(true);
  const [gridZoom, setGridZoom] = useState<number>(100);
  const [gridOrigin, setGridOrigin] = useState<string>("50% 50%");
  const [isTrashing, setIsTrashing] = useState<boolean>(false);

  useEffect(() => {
    setLeftId(defaultPair.leftId);
    setRightId(defaultPair.rightId);
  }, [defaultPair.leftId, defaultPair.rightId]);

  const getModelLabel = (id: string) => {
    if (id === ORIGINAL_COMPARE_ID) {
      return t("MULTI_MODEL.ORIGINAL_OPTION");
    }
    if (id in MODELS) {
      return t(`APP.MODEL_SELECTION.MODELS.${MODELS[id as ModelId].id}.NAME` as any);
    }
    return id;
  };

  const options = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      path: string;
      durationMs: number;
      cached?: boolean;
    }> = [
      {
        id: ORIGINAL_COMPARE_ID,
        label: t("MULTI_MODEL.ORIGINAL_OPTION"),
        path: effectiveSourcePath,
        durationMs: 0,
      },
    ];

    for (const item of succeededResults) {
      list.push({
        id: item.modelId,
        label: getModelLabel(item.modelId),
        path: item.outputPath,
        durationMs: item.durationMs,
        cached: item.cached,
      });
    }

    return list;
  }, [effectiveSourcePath, succeededResults, t]);

  const leftOption =
    options.find((opt) => opt.id === leftId) ?? options[0];
  const rightOption =
    options.find((opt) => opt.id === rightId) ??
    options[options.length - 1] ??
    options[0];

  const discardModels = async (modelIdsToTrash: string[]) => {
    if (isTrashing || modelIdsToTrash.length === 0) return;
    const toTrashSet = new Set(modelIdsToTrash);
    const filePaths = results
      .filter((r) => toTrashSet.has(r.modelId) && r.outputPath)
      .map((r) => r.outputPath);

    setIsTrashing(true);
    try {
      const payload: MultiModelTrashPayload = {
        filePaths,
        protectedPaths: [imagePath, effectiveSourcePath],
      };
      const res: MultiModelTrashResult = await window.electron.invoke(
        ELECTRON_COMMANDS.MULTI_MODEL_TRASH_FILES,
        payload,
      );
      if (onUpdateResults) {
        onUpdateResults((prev) =>
          prev.filter((r) => !toTrashSet.has(r.modelId)),
        );
      }
      const remaining = results.filter(
        (r) => !toTrashSet.has(r.modelId) && r.status === "done",
      );
      toast({
        description:
          remaining.length === 0
            ? t("MULTI_MODEL.ALL_DISCARDED")
            : t("MULTI_MODEL.TRASHED_SUMMARY", {
                count: String(res.trashed.length),
              }),
      });
    } catch (err: any) {
      toast({ description: err?.message ?? String(err) });
    } finally {
      setIsTrashing(false);
    }
  };

  const keepOnlyModel = async (winnerModelId: string) => {
    const others = succeededResults
      .filter((r) => r.modelId !== winnerModelId)
      .map((r) => r.modelId);
    if (others.length === 0) return;
    await discardModels(others);
  };

  // Keyboard shortcuts: 1..9 switch Right (B), Left/Right arrow cycle Right (B)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < succeededResults.length) {
          setRightId(succeededResults[idx].modelId);
        }
      } else if (
        (e.key === "ArrowRight" || e.key === "ArrowLeft") &&
        succeededResults.length > 1
      ) {
        const currentIdx = succeededResults.findIndex(
          (r) => r.modelId === rightId,
        );
        const step = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx =
          currentIdx < 0
            ? 0
            : (currentIdx + step + succeededResults.length) %
              succeededResults.length;
        setRightId(succeededResults[nextIdx].modelId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [succeededResults, rightId]);

  const swapSides = () => {
    setLeftId(rightId);
    setRightId(leftId);
  };

  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gridZoom <= 100) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 0), 100);
    const y = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * 100, 0), 100);
    setGridOrigin(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  };

  const gridItems = useMemo(() => {
    if (showOriginalInGrid) return options;
    return options.filter((opt) => opt.id !== ORIGINAL_COMPARE_ID);
  }, [options, showOriginalInGrid]);

  const gridColsClass =
    gridItems.length <= 2
      ? "grid-cols-1 md:grid-cols-2"
      : gridItems.length <= 4
        ? "grid-cols-2"
        : "grid-cols-2 xl:grid-cols-3";

  const baseNameForBlend = useMemo(() => {
    const fn = getFilenameFromPath(imagePath);
    const dot = fn.lastIndexOf(".");
    return dot > 0 ? fn.slice(0, dot) : fn || "upscayl";
  }, [imagePath]);

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-base-300"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* ROI Preview Banner */}
      {roiPreview && (
        <div className="z-30 flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/15 px-4 py-1.5 text-xs">
          <span className="font-semibold text-primary">
            ✂️{" "}
            {t("ROI.PREVIEW_BANNER", {
              width: String(roiPreview.roi.width),
              height: String(roiPreview.roi.height),
            })}
          </span>
          <div className="flex items-center gap-2">
            {onUpscaleFullFromRoi && (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={onUpscaleFullFromRoi}
              >
                🚀 {t("ROI.UPSCALE_FULL_BUTTON")}
              </button>
            )}
            {onExitRoiPreview && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={onExitRoiPreview}
              >
                {t("ROI.EXIT_PREVIEW")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="z-20 flex flex-col gap-2 border-b border-base-content/10 bg-base-100/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* View Mode Switcher */}
          <div className="join">
            <button
              type="button"
              className={`btn join-item btn-xs ${
                compareMode === "slider" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => setCompareMode("slider")}
            >
              {t("MULTI_MODEL.VIEW_SLIDER")}
            </button>
            <button
              type="button"
              className={`btn join-item btn-xs ${
                compareMode === "grid" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => setCompareMode("grid")}
            >
              {t("MULTI_MODEL.VIEW_GRID")}
            </button>
            <button
              type="button"
              className={`btn join-item btn-xs ${
                compareMode === "lens" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => setCompareMode("lens")}
            >
              {t("MULTI_MODEL.VIEW_LENS")}
            </button>
            <button
              type="button"
              className={`btn join-item btn-xs ${
                compareMode === "blend" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => setCompareMode("blend")}
            >
              🎨 {t("MULTI_MODEL.VIEW_BLEND")}
            </button>
          </div>

          {/* Controls specific to view mode */}
          {compareMode !== "grid" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="font-semibold text-base-content/70">
                  {t("MULTI_MODEL.LEFT_LABEL")}
                </span>
                <select
                  className="select select-bordered select-xs max-w-[180px]"
                  value={leftOption.id}
                  onChange={(e) => setLeftId(e.target.value)}
                >
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={swapSides}
                title={t("MULTI_MODEL.SWAP_AB")}
              >
                {t("MULTI_MODEL.SWAP_AB")}
              </button>

              <label className="flex items-center gap-1.5">
                <span className="font-semibold text-base-content/70">
                  {t("MULTI_MODEL.RIGHT_LABEL")}
                </span>
                <select
                  className="select select-bordered select-xs max-w-[180px]"
                  value={rightOption.id}
                  onChange={(e) => setRightId(e.target.value)}
                >
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-xs"
                  checked={showOriginalInGrid}
                  onChange={(e) => setShowOriginalInGrid(e.target.checked)}
                />
                <span>{t("MULTI_MODEL.SHOW_ORIGINAL")}</span>
              </label>

              <label className="flex items-center gap-2">
                <span className="font-medium text-base-content/70">
                  {t("MULTI_MODEL.ZOOM_LABEL")} ({gridZoom}%)
                </span>
                <input
                  type="range"
                  min={100}
                  max={400}
                  step={25}
                  value={gridZoom}
                  onChange={(e) => setGridZoom(Number(e.target.value))}
                  className="range range-primary range-xs w-28"
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {!roiPreview &&
              succeededResults.length > 1 &&
              rightOption.id !== ORIGINAL_COMPARE_ID && (
                <button
                  type="button"
                  className="btn btn-success btn-xs"
                  disabled={isTrashing}
                  onClick={() => keepOnlyModel(rightOption.id)}
                >
                  ✅ {t("MULTI_MODEL.KEEP_WINNER")}
                </button>
              )}
            {outputPath && (
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={() =>
                  window.electron.send(ELECTRON_COMMANDS.OPEN_FOLDER, outputPath)
                }
              >
                {t("MULTI_MODEL.OPEN_FOLDER")}
              </button>
            )}
          </div>
        </div>

        {/* Quick Model Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {results.map((item, idx) => {
              const isFailed = item.status === "error";
              const isLeft = !isFailed && leftOption.id === item.modelId;
              const isRight = !isFailed && rightOption.id === item.modelId;

              return (
                <button
                  key={item.modelId}
                  type="button"
                  disabled={isFailed}
                  title={
                    isFailed
                      ? item.error
                      : `${getModelLabel(item.modelId)} — Click: Set B, Shift+Click: Set A`
                  }
                  onClick={(e) => {
                    if (isFailed) return;
                    if (e.shiftKey) {
                      setLeftId(item.modelId);
                    } else {
                      setRightId(item.modelId);
                    }
                    if (compareMode === "grid") {
                      setCompareMode("slider");
                    }
                  }}
                  className={`badge gap-1.5 py-2.5 text-xs transition-all ${
                    isFailed
                      ? "badge-error cursor-not-allowed opacity-75"
                      : isLeft || isRight
                        ? "badge-primary cursor-pointer"
                        : "badge-neutral cursor-pointer hover:badge-primary/70"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">
                    {idx + 1}
                  </span>
                  <span className="max-w-[140px] truncate font-medium">
                    {getModelLabel(item.modelId)}
                  </span>
                  {isLeft && (
                    <span className="rounded bg-black/25 px-1 text-[10px] font-bold">
                      A
                    </span>
                  )}
                  {isRight && (
                    <span className="rounded bg-black/25 px-1 text-[10px] font-bold">
                      B
                    </span>
                  )}
                  {isFailed ? (
                    <span className="text-[10px]">
                      ({t("MULTI_MODEL.FAILED_BADGE")})
                    </span>
                  ) : item.cached ? (
                    <span className="text-[10px] opacity-80">
                      {t("MULTI_MODEL.CACHED_BADGE")}
                    </span>
                  ) : item.durationMs > 0 ? (
                    <span className="text-[10px] opacity-80">
                      {formatMs(item.durationMs)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <span className="hidden text-[11px] text-base-content/50 lg:inline">
            {t("MULTI_MODEL.SHORTCUT_HINT")}
          </span>
        </div>

        {(wasStopped || failedResults.length > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {wasStopped && (
              <span className="badge badge-warning badge-sm">
                {t("MULTI_MODEL.PARTIAL_STOPPED", {
                  count: String(succeededResults.length),
                })}
              </span>
            )}
            {failedResults.length > 0 && (
              <span className="badge badge-error badge-sm">
                {t("MULTI_MODEL.SOME_FAILED", {
                  count: String(failedResults.length),
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Comparison Canvas */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {compareMode === "slider" && (
          <SliderView
            sanitizedImagePath={sanitizePath(leftOption.path)}
            sanitizedUpscaledImagePath={sanitizePath(rightOption.path)}
            zoomAmount={zoomAmount}
            leftLabel={leftOption.label}
            rightLabel={rightOption.label}
            containerClassName="group h-full w-full"
          />
        )}

        {compareMode === "lens" && (
          <LensViewer
            sanitizedImagePath={sanitizePath(leftOption.path)}
            sanitizedUpscaledImagePath={sanitizePath(rightOption.path)}
            leftLabel={leftOption.label}
            rightLabel={rightOption.label}
          />
        )}

        {compareMode === "blend" && (
          <BlendPanel
            imageAPath={leftOption.path}
            imageBPath={rightOption.path}
            labelA={leftOption.label}
            labelB={rightOption.label}
            outputDir={outputPath || ""}
            baseName={baseNameForBlend}
            sourceMetadataPath={imagePath}
          />
        )}

        {compareMode === "grid" && (
          <div className={`grid h-full w-full gap-3 overflow-y-auto p-3 ${gridColsClass}`}>
            {gridItems.map((item) => (
              <div
                key={item.id}
                className="flex min-h-[260px] flex-col overflow-hidden rounded-box border border-base-content/10 bg-base-100 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 border-b border-base-content/10 px-3 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold">{item.label}</span>
                    {item.cached && (
                      <span className="badge badge-ghost badge-xs">
                        {t("MULTI_MODEL.CACHED_BADGE")}
                      </span>
                    )}
                    {item.durationMs > 0 && (
                      <span className="text-[11px] text-base-content/60">
                        {formatMs(item.durationMs)}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className={`btn btn-xs ${
                        leftOption.id === item.id ? "btn-primary" : "btn-ghost"
                      }`}
                      onClick={() => {
                        setLeftId(item.id);
                        setCompareMode("slider");
                      }}
                    >
                      {t("MULTI_MODEL.SET_AS_A")}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${
                        rightOption.id === item.id ? "btn-primary" : "btn-ghost"
                      }`}
                      onClick={() => {
                        setRightId(item.id);
                        setCompareMode("slider");
                      }}
                    >
                      {t("MULTI_MODEL.SET_AS_B")}
                    </button>
                    {!roiPreview && item.id !== ORIGINAL_COMPARE_ID && (
                      <>
                        {succeededResults.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-success btn-xs"
                            disabled={isTrashing}
                            title={t("MULTI_MODEL.KEEP_THIS_WINNER")}
                            onClick={() => keepOnlyModel(item.id)}
                          >
                            ★
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-error btn-ghost btn-xs"
                          disabled={isTrashing}
                          title={t("MULTI_MODEL.DISCARD_THIS")}
                          onClick={() => discardModels([item.id])}
                        >
                          🗑️
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() =>
                            window.electron.send(
                              ELECTRON_COMMANDS.OPEN_FILE_LOCATION,
                              item.path,
                            )
                          }
                          title={t("MULTI_MODEL.SHOW_IN_FOLDER")}
                        >
                          📂
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className="relative flex-1 overflow-hidden bg-gradient-to-br from-base-300 to-base-100"
                  onMouseMove={handleGridMouseMove}
                >
                  <img
                    src={"file:///" + sanitizePath(item.path)}
                    alt={item.label}
                    draggable="false"
                    style={{
                      transformOrigin: gridOrigin,
                      transform:
                        gridZoom > 100 ? `scale(${gridZoom / 100})` : "scale(1)",
                    }}
                    className="h-full w-full object-contain transition-transform duration-100"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiModelCompareView;
