"use client";

import React, { useRef, useState } from "react";
import { percentRectToPixel, pixelRectToPercent, RoiRect } from "@common/roi-helpers";
import useTranslation from "../hooks/use-translation";

type RoiSelectorOverlayProps = {
  imageWidth: number;
  imageHeight: number;
  roiRect: RoiRect | null;
  setRoiRect: (rect: RoiRect | null) => void;
  onRunRoi?: () => void;
};

/**
 * Interactive drag-to-crop overlay placed directly over the displayed image
 * inside `ImageViewer`. Computes exact image coordinates inside an
 * `object-contain` container so crop pixels always match the source file.
 */
const RoiSelectorOverlay = ({
  imageWidth,
  imageHeight,
  roiRect,
  setRoiRect,
  onRunRoi,
}: RoiSelectorOverlayProps) => {
  const t = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [draftPct, setDraftPct] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const getImageDisplayBox = () => {
    const el = containerRef.current;
    if (!el || imageWidth <= 0 || imageHeight <= 0) return null;
    const rect = el.getBoundingClientRect();
    const containerRatio = rect.width / rect.height;
    const imgRatio = imageWidth / imageHeight;

    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > containerRatio) {
      renderW = rect.width;
      renderH = rect.width / imgRatio;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderH = rect.height;
      renderW = rect.height * imgRatio;
      offsetX = (rect.width - renderW) / 2;
    }

    return {
      left: rect.left + offsetX,
      top: rect.top + offsetY,
      width: renderW,
      height: renderH,
      offsetX,
      offsetY,
    };
  };

  const clientToNormalized = (clientX: number, clientY: number) => {
    const box = getImageDisplayBox();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (clientY - box.top) / box.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pt = clientToNormalized(e.clientX, e.clientY);
    if (!pt) return;
    setDragStart(pt);
    setDraftPct({ x: pt.x, y: pt.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const pt = clientToNormalized(e.clientX, e.clientY);
    if (!pt) return;
    const x = Math.min(dragStart.x, pt.x);
    const y = Math.min(dragStart.y, pt.y);
    const width = Math.abs(pt.x - dragStart.x);
    const height = Math.abs(pt.y - dragStart.y);
    setDraftPct({ x, y, width, height });
  };

  const finalizeDrag = () => {
    if (!dragStart || !draftPct) {
      setDragStart(null);
      return;
    }
    const pixelRect = percentRectToPixel(draftPct, imageWidth, imageHeight);
    setRoiRect(pixelRect);
    setDragStart(null);
    setDraftPct(null);
  };

  const activePct =
    draftPct ??
    (roiRect ? pixelRectToPercent(roiRect, imageWidth, imageHeight) : null);

  const box = getImageDisplayBox();

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={finalizeDrag}
      onMouseLeave={finalizeDrag}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Top floating hint / action bar */}
      <div
        className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-box border border-primary/40 bg-base-100/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {roiRect ? (
          <>
            <span className="font-semibold text-primary">
              ✂️{" "}
              {t("ROI.SELECTED_SIZE", {
                width: String(roiRect.width),
                height: String(roiRect.height),
              })}
            </span>
            {onRunRoi && (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={onRunRoi}
              >
                {t("ROI.RUN_BUTTON", {
                  width: String(roiRect.width),
                  height: String(roiRect.height),
                })}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setRoiRect(null)}
            >
              {t("ROI.CLEAR_BUTTON")}
            </button>
          </>
        ) : (
          <span className="font-medium text-base-content/80">
            ✂️ {t("ROI.DRAW_HINT")}
          </span>
        )}
      </div>

      {/* Rendered crop box aligned to the actual object-contain image rectangle */}
      {activePct && box && activePct.width > 0.002 && activePct.height > 0.002 && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{
            left: `${box.offsetX + activePct.x * box.width}px`,
            top: `${box.offsetY + activePct.y * box.height}px`,
            width: `${activePct.width * box.width}px`,
            height: `${activePct.height * box.height}px`,
          }}
        />
      )}
    </div>
  );
};

export default RoiSelectorOverlay;
