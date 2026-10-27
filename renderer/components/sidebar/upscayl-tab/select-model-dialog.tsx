"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Maximize2, SwatchBookIcon, X } from "../../icons/original-icons";
import { ModelId, MODELS } from "@common/models-list";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  autoOptimizeAtom,
  compressionAtom,
  doubleUpscaylAtom,
  scaleAtom,
  selectedModelIdAtom,
  threadsAtom,
  tileSizeAtom,
  ttaModeAtom,
} from "@/atoms/user-settings-atom";
import { customModelIdsAtom } from "@/atoms/models-list-atom";
import useTranslation from "@/components/hooks/use-translation";
import { getModelCompatibility } from "@common/model-compatibility";
import { resolveModelSettings } from "@common/model-profiles";

const SelectModelDialog = () => {
  const t = useTranslation();
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom);
  const autoOptimize = useAtomValue(autoOptimizeAtom);

  // Profile settings are only written when auto-optimization is enabled. Custom
  // models have no profile, so the user's own values are kept for them.
  const setScale = useSetAtom(scaleAtom);
  const setTileSize = useSetAtom(tileSizeAtom);
  const setTTAMode = useSetAtom(ttaModeAtom);
  const setCompression = useSetAtom(compressionAtom);
  const setDoubleUpscayl = useSetAtom(doubleUpscaylAtom);
  const setThreads = useSetAtom(threadsAtom);

  // Current values are needed so profiles can be merged in a single place.
  const currentScale = useAtomValue(scaleAtom);
  const currentTileSize = useAtomValue(tileSizeAtom);
  const currentTTAMode = useAtomValue(ttaModeAtom);
  const currentCompression = useAtomValue(compressionAtom);
  const currentDoubleUpscayl = useAtomValue(doubleUpscaylAtom);
  const currentThreads = useAtomValue(threadsAtom);

  const customModelIds = useAtomValue(customModelIdsAtom);
  const [open, setOpen] = useState(false);
  const [zoomedModel, setZoomedModel] = useState<ModelId | null>(null);

  const handleModelSelect = (model: ModelId | string) => {
    setSelectedModelId(model);

    const next = resolveModelSettings(model, autoOptimize, {
      scale: currentScale,
      tileSize: currentTileSize ?? 0,
      ttaMode: currentTTAMode,
      compression: currentCompression,
      doubleUpscayl: currentDoubleUpscayl,
      threads: currentThreads,
    });

    setScale(next.scale);
    setTileSize(next.tileSize);
    setTTAMode(next.ttaMode);
    setCompression(next.compression);
    setDoubleUpscayl(next.doubleUpscayl);
    setThreads(next.threads);

    setOpen(false);
  };

  const handleZoom = (event: React.MouseEvent, model: ModelId) => {
    event.stopPropagation();
    setZoomedModel(model);
  };

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="btn btn-primary justify-start border-border">
            <SwatchBookIcon className="mr-2 h-5 w-5" />
            {selectedModelId in MODELS
              ? t(
                  `APP.MODEL_SELECTION.MODELS.${MODELS[selectedModelId]?.id}.NAME` as any,
                )
              : selectedModelId}
          </button>
        </DialogTrigger>
        <DialogContent className="z-50 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("APP.MODEL_SELECTION.DESCRIPTION")}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[600px] pr-4">
            <div className="flex flex-col gap-4">
              {Object.entries(MODELS).map((modelData) => {
                const modelId = modelData[0] as ModelId;
                const model = modelData[1];
                return (
                  <button
                    key={modelId}
                    className="btn !h-auto !w-full !flex-col !items-start !rounded-sm !p-4"
                    onClick={() => handleModelSelect(modelId)}
                  >
                    <p className="font-semibold">
                      {t(`APP.MODEL_SELECTION.MODELS.${modelId}.NAME`)}
                    </p>
                    <p className="mb-2 text-left font-normal leading-normal text-base-content/70">
                      {t(`APP.MODEL_SELECTION.MODELS.${modelId}.DESCRIPTION`)}
                    </p>
                    <div className="relative h-52 w-full overflow-hidden rounded-sm">
                      <div className="flex h-full w-full">
                        <img
                          src={`public:///original-placeholder.svg`}
                          alt={`Model Before`}
                          className="h-full w-1/2 object-cover"
                        />
                        <img
                          src={`public:///original-placeholder.svg`}
                          alt={`Model After`}
                          className="h-full w-1/2 object-cover"
                        />
                      </div>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-full w-px bg-white opacity-50"></div>
                      </div>
                      <div className="absolute bottom-2 left-2 rounded bg-black bg-opacity-50 px-1 text-xs text-white">
                        {t("APP.MODEL_SELECTION.BEFORE")}
                      </div>
                      <div className="absolute bottom-2 right-2 rounded bg-black bg-opacity-50 px-1 text-xs text-white">
                        {t("APP.MODEL_SELECTION.AFTER")}
                      </div>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-2"
                        onClick={(e) => handleZoom(e, modelId)}
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span className="sr-only">
                          {t("APP.MODEL_SELECTION.ZOOM")}
                        </span>
                      </Button>
                    </div>
                  </button>
                );
              })}
              {customModelIds.length > 0 && (
                <p className="font-semibold text-base-content">
                  {t("APP.MODEL_SELECTION.IMPORTED_CUSTOM_MODELS")}
                </p>
              )}
              {customModelIds.map((customModel) => {
                const compatibility = getModelCompatibility(customModel);
                return (
                  <button
                    key={customModel}
                    className="btn h-auto w-full flex-col items-start gap-1 p-4"
                    onClick={() => handleModelSelect(customModel)}
                    title={customModel}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-left">{customModel}</span>
                      <span className="badge badge-sm badge-success">
                        {compatibility.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!zoomedModel}
        onOpenChange={(open) => !open && setZoomedModel(null)}
      >
        <DialogContent
          className="h-screen w-screen max-w-full p-0"
          hideCloseButton
        >
          <div className="relative flex h-full w-full items-center justify-center bg-black">
            <div className="flex h-full w-full">
              <div className="relative h-full w-1/2">
                <img
                  src={`public:///original-placeholder.svg`}
                  alt={`Zoomed in Image - Before`}
                  className="h-full w-full object-contain"
                />
                <div className="absolute bottom-4 left-4 rounded bg-black bg-opacity-50 px-2 py-1 text-sm text-white">
                  Before
                </div>
              </div>
              <div className="relative h-full w-1/2">
                <img
                  src={`public:///original-placeholder.svg`}
                  alt={`Zoomed in Image - After`}
                  className="h-full w-full object-contain"
                />
                <div className="absolute bottom-4 right-4 rounded bg-black bg-opacity-50 px-2 py-1 text-sm text-white">
                  After
                </div>
              </div>
            </div>
            <button
              className="btn btn-circle btn-secondary absolute right-4 top-4"
              onClick={() => setZoomedModel(null)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SelectModelDialog;
