"use client";

import React, { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  blendAlphaAtom,
  compressionAtom,
  copyMetadataAtom,
  saveImageAsAtom,
} from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { sanitizePath } from "@common/sanitize-path";
import { BlendImagesPayload, BlendImagesResult } from "@common/types/types";
import getFilenameFromPath from "@common/get-file-name";
import { useToast } from "@/components/ui/use-toast";
import useTranslation from "../hooks/use-translation";

type BlendPanelProps = {
  imageAPath: string;
  imageBPath: string;
  labelA: string;
  labelB: string;
  outputDir: string;
  baseName: string;
  sourceMetadataPath?: string;
};

/**
 * Interactive live model-blending viewer.
 * Shows an instant real-time CSS opacity blend between Image A and Image B and
 * saves a pixel-accurate RGBA blended file via Sharp on click.
 */
const BlendPanel = ({
  imageAPath,
  imageBPath,
  labelA,
  labelB,
  outputDir,
  baseName,
  sourceMetadataPath,
}: BlendPanelProps) => {
  const t = useTranslation();
  const { toast } = useToast();
  const [alphaPercent, setAlphaPercent] = useAtom(blendAlphaAtom);
  const saveImageAs = useAtomValue(saveImageAsAtom);
  const compression = useAtomValue(compressionAtom);
  const copyMetadata = useAtomValue(copyMetadataAtom);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  const handleSave = async () => {
    if (!outputDir || isSaving) return;
    setIsSaving(true);
    try {
      const payload: BlendImagesPayload = {
        imageAPath,
        imageBPath,
        outputDir,
        baseName,
        labelA,
        labelB,
        alphaPercent,
        saveImageAs,
        compression,
        copyMetadata,
        sourceMetadataPath,
      };
      const result: BlendImagesResult = await window.electron.invoke(
        ELECTRON_COMMANDS.BLEND_IMAGES,
        payload,
      );
      setLastSavedPath(result.outputPath);
      toast({
        description: t("BLEND.SAVED_TOAST", {
          path: getFilenameFromPath(result.outputPath),
        }),
      });
    } catch (err: any) {
      toast({
        description: t("BLEND.ERROR_TOAST", {
          error: err?.message ?? String(err),
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const srcA = "file:///" + sanitizePath(imageAPath);
  const srcB = "file:///" + sanitizePath(imageBPath);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Blend Canvas */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-base-300 to-base-100">
        <img
          src={srcA}
          alt={labelA}
          draggable="false"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <img
          src={srcB}
          alt={labelB}
          draggable="false"
          style={{ opacity: alphaPercent / 100 }}
          className="absolute inset-0 h-full w-full object-contain"
        />

        <div className="pointer-events-none absolute left-3 top-3 rounded-btn bg-base-100/85 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
          {labelA}: {100 - alphaPercent}% · {labelB}: {alphaPercent}%
        </div>
      </div>

      {/* Blend Controls Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 bg-base-100 px-4 py-2.5 text-xs">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="max-w-[120px] truncate font-medium text-base-content/70">
            {labelA} ({100 - alphaPercent}%)
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={alphaPercent}
            onChange={(e) => setAlphaPercent(Number(e.target.value))}
            className="range range-primary range-xs flex-1"
          />
          <span className="max-w-[120px] truncate font-medium text-primary">
            {labelB} ({alphaPercent}%)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={isSaving || !outputDir}
            onClick={handleSave}
          >
            {isSaving ? t("BLEND.SAVING_BUTTON") : t("BLEND.SAVE_BUTTON")}
          </button>
          {lastSavedPath && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() =>
                window.electron.send(
                  ELECTRON_COMMANDS.OPEN_FILE_LOCATION,
                  lastSavedPath,
                )
              }
            >
              📂 {t("BLEND.SHOW_IN_FOLDER")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlendPanel;
