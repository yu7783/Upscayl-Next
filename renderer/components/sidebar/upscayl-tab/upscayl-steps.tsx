import { useAtom, useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";
import { themeChange } from "theme-change";
import useLogger from "../../hooks/use-logger";
import {
  savedOutputPathAtom,
  progressAtom,
  rememberOutputFolderAtom,
  scaleAtom,
  customWidthAtom,
  useCustomWidthAtom,
  multiModelModeAtom,
  selectedCompareModelsAtom,
  faceRestoreAtom,
  faceRestoreStrengthAtom,
  roiModeAtom,
  roiRectAtom,
} from "../../../atoms/user-settings-atom";
import { FEATURE_FLAGS } from "@common/feature-flags";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { FaceRestoreStatus } from "@common/types/types";
import { useToast } from "@/components/ui/use-toast";
import { translationAtom } from "@/atoms/translations-atom";
import { SelectImageScale } from "../settings-tab/select-image-scale";
import SelectModelDialog from "./select-model-dialog";
import RecipeBar from "../recipe-bar";
import { ImageFormat } from "@/lib/valid-formats";

interface IProps {
  selectImageHandler: () => Promise<void>;
  selectFolderHandler: () => Promise<void>;
  upscaylHandler: () => Promise<void>;
  roiUpscaleHandler?: () => Promise<void>;
  batchMode: boolean;
  setBatchMode: React.Dispatch<React.SetStateAction<boolean>>;
  imagePath: string;
  doubleUpscayl: boolean;
  setDoubleUpscayl: React.Dispatch<React.SetStateAction<boolean>>;
  dimensions: {
    width: number | null;
    height: number | null;
  };
  setSaveImageAs: React.Dispatch<React.SetStateAction<ImageFormat>>;
  setGpuId: React.Dispatch<React.SetStateAction<string>>;
}

function UpscaylSteps({
  selectImageHandler,
  selectFolderHandler,
  upscaylHandler,
  roiUpscaleHandler,
  batchMode,
  setBatchMode,
  imagePath,
  doubleUpscayl,
  setDoubleUpscayl,
  dimensions,
}: IProps) {
  const [scale, setScale] = useAtom(scaleAtom);
  const [outputPath, setOutputPath] = useAtom(savedOutputPathAtom);
  const [progress, setProgress] = useAtom(progressAtom);
  const [multiModelMode, setMultiModelMode] = useAtom(multiModelModeAtom);
  const selectedCompareModels = useAtomValue(selectedCompareModelsAtom);
  const rememberOutputFolder = useAtomValue(rememberOutputFolderAtom);
  const customWidth = useAtomValue(customWidthAtom);
  const useCustomWidth = useAtomValue(useCustomWidthAtom);
  const [faceRestore, setFaceRestore] = useAtom(faceRestoreAtom);
  const [faceRestoreStrength, setFaceRestoreStrength] = useAtom(
    faceRestoreStrengthAtom,
  );
  const [roiMode, setRoiMode] = useAtom(roiModeAtom);
  const roiRect = useAtomValue(roiRectAtom);
  const [faceRestoreStatus, setFaceRestoreStatus] =
    useState<FaceRestoreStatus | null>(null);

  const logit = useLogger();
  const { toast } = useToast();
  const t = useAtomValue(translationAtom);

  useEffect(() => {
    if (!faceRestore) return;
    let cancelled = false;
    window.electron
      .invoke(ELECTRON_COMMANDS.CHECK_FACE_RESTORE)
      .then((status: FaceRestoreStatus) => {
        if (!cancelled) setFaceRestoreStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [faceRestore]);

  const outputHandler = async () => {
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FOLDER);
    if (path !== null) {
      logit("🗂 Setting Output Path: ", path);
      setOutputPath(path);
    } else {
      setOutputPath(null);
    }
  };

  useEffect(() => {
    themeChange(false);
  }, []);

  const upscaylResolution = useMemo(() => {
    const newDimensions = {
      width: dimensions.width,
      height: dimensions.height,
    };

    let doubleScale = parseInt(scale) * parseInt(scale);
    let singleScale = parseInt(scale);

    if (doubleUpscayl) {
      if (useCustomWidth) {
        newDimensions.width = customWidth;
        newDimensions.height = Math.round(
          customWidth * (dimensions.height / dimensions.width),
        );
      } else {
        const newWidth = dimensions.width * doubleScale;
        const newHeight = dimensions.height * doubleScale;
        newDimensions.width = newWidth;
        newDimensions.height = newHeight;
      }
    } else {
      if (useCustomWidth) {
        newDimensions.width = customWidth;
        newDimensions.height = Math.round(
          customWidth * (dimensions.height / dimensions.width),
        );
      } else {
        newDimensions.width = dimensions.width * singleScale;
        newDimensions.height = dimensions.height * singleScale;
      }
    }

    return newDimensions;
  }, [dimensions.width, dimensions.height, doubleUpscayl, scale]);

  const handleStartClick = () => {
    if (progress.length > 0) {
      toast({
        description: t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE"),
      });
      return;
    }
    if (!outputPath) {
      toast({
        description: t("APP.SCALE_SELECTION.NO_OUTPUT_FOLDER_ALERT"),
      });
      return;
    }
    if (!batchMode && multiModelMode && selectedCompareModels.length < 2) {
      toast({
        description: t("MULTI_MODEL.NEED_TWO_MODELS"),
      });
      return;
    }
    upscaylHandler();
  };

  return (
    <div
      className={`animate-step-in animate flex h-screen flex-col gap-5 overflow-y-auto overflow-x-hidden p-5`}
    >
      {/* RECIPES BAR */}
      <RecipeBar />

      {/* MODE TOGGLES */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-row items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={batchMode}
            onChange={() => {
              if (!rememberOutputFolder) {
                setOutputPath("");
              }
              setProgress("");
              setBatchMode((oldValue) => {
                const next = !oldValue;
                if (next) {
                  setMultiModelMode(false);
                  setRoiMode(false);
                }
                return next;
              });
            }}
          />
          <p
            className="mr-1 inline-block cursor-help text-sm"
            data-tooltip-id="tooltip"
            data-tooltip-content={t("APP.BATCH_MODE.DESCRIPTION")}
          >
            {t("APP.BATCH_MODE.TITLE")}
          </p>
        </div>

        <div className="flex flex-row items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={multiModelMode && !batchMode}
            onChange={() => {
              setProgress("");
              setMultiModelMode((oldValue) => {
                const next = !oldValue;
                if (next) setBatchMode(false);
                return next;
              });
            }}
          />
          <p
            className="mr-1 inline-block cursor-help text-sm"
            data-tooltip-id="tooltip"
            data-tooltip-content={t("MULTI_MODEL.TOGGLE_DESCRIPTION")}
          >
            {t("MULTI_MODEL.TOGGLE_TITLE")}
          </p>
        </div>

        {!batchMode && (
          <div className="flex flex-row items-center gap-2">
            <input
              type="checkbox"
              className="toggle toggle-secondary toggle-sm"
              checked={roiMode}
              onChange={(e) => setRoiMode(e.target.checked)}
            />
            <p
              className="mr-1 inline-block cursor-help text-sm"
              data-tooltip-id="tooltip"
              data-tooltip-content={t("ROI.TOGGLE_DESCRIPTION")}
            >
              ✂️ {t("ROI.TOGGLE_TITLE")}
            </p>
          </div>
        )}
      </div>

      {/* STEP 1 */}
      <div className="animate-step-in">
        <p className="step-heading">{t("APP.FILE_SELECTION.TITLE")}</p>
        <button
          className="btn btn-primary"
          onClick={!batchMode ? selectImageHandler : selectFolderHandler}
          data-tooltip-id="tooltip"
          data-tooltip-content={imagePath}
        >
          {batchMode
            ? t("APP.FILE_SELECTION.BATCH_MODE_TYPE")
            : t("APP.FILE_SELECTION.SINGLE_MODE_TYPE")}
        </button>
      </div>

      {/* STEP 2 */}
      <div className="animate-step-in group flex flex-col gap-4">
        <div>
          <p className="step-heading">{t("APP.MODEL_SELECTION.TITLE")}</p>
          <p className="mb-2 text-sm">
            {multiModelMode && !batchMode
              ? t("MULTI_MODEL.DIALOG_TITLE")
              : t("APP.MODEL_SELECTION.DESCRIPTION")}
          </p>

          <SelectModelDialog multiSelect={multiModelMode && !batchMode} />
        </div>

        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            className="checkbox"
            checked={doubleUpscayl}
            onChange={(e) => {
              setDoubleUpscayl(e.target.checked);
            }}
          />
          <p
            className="cursor-pointer text-sm"
            onClick={() => {
              setDoubleUpscayl((prev) => !prev);
            }}
          >
            {batchMode
              ? t("APP.DOUBLE_UPSCAYL-NEXT.BATCH_TITLE")
              : t("APP.DOUBLE_UPSCAYL-NEXT.TITLE")}
          </p>
          <button
            className="badge badge-neutral badge-sm cursor-help"
            data-tooltip-id="tooltip"
            data-tooltip-content={
              batchMode
                ? t("APP.DOUBLE_UPSCAYL-NEXT.BATCH_DESCRIPTION")
                : t("APP.DOUBLE_UPSCAYL-NEXT.DESCRIPTION")
            }
          >
            ?
          </button>
        </div>

        <SelectImageScale scale={scale} setScale={setScale} hideInfo />

        {/* FACE RESTORATION (GFPGAN) */}
        <div className="flex flex-col gap-1.5 rounded-btn border border-base-content/10 bg-base-200/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-xs"
                checked={faceRestore}
                onChange={(e) => setFaceRestore(e.target.checked)}
              />
              <span
                className="cursor-help"
                data-tooltip-id="tooltip"
                data-tooltip-content={t("FACE_RESTORE.TOGGLE_DESCRIPTION")}
              >
                🙂 {t("FACE_RESTORE.TOGGLE_TITLE")}
              </span>
            </label>
            {faceRestore && faceRestoreStatus && (
              <span
                className={`badge badge-xs ${
                  faceRestoreStatus.available ? "badge-success" : "badge-warning"
                }`}
              >
                {faceRestoreStatus.available
                  ? t("FACE_RESTORE.STATUS_READY")
                  : t("FACE_RESTORE.STATUS_MISSING")}
              </span>
            )}
          </div>
          {faceRestore && (
            <div className="flex items-center gap-2 pt-0.5 text-[11px]">
              <span className="shrink-0 text-base-content/70">
                {t("FACE_RESTORE.STRENGTH_LABEL", {
                  value: String(faceRestoreStrength),
                })}
              </span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={faceRestoreStrength}
                onChange={(e) => setFaceRestoreStrength(Number(e.target.value))}
                className="range range-primary range-xs flex-1"
              />
            </div>
          )}
        </div>
      </div>

      {/* STEP 3 */}
      <div className="animate-step-in">
        <div className="flex flex-col pb-2">
          <div className="step-heading flex items-center gap-2">
            <span className="leading-none">
              {t("APP.OUTPUT_PATH_SELECTION.TITLE")}
            </span>
            {FEATURE_FLAGS.APP_STORE_BUILD && (
              <button
                className="badge badge-outline badge-sm cursor-pointer"
                onClick={() =>
                  alert(t("APP.OUTPUT_PATH_SELECTION.MAC_APP_STORE_ALERT"))
                }
              >
                ?
              </button>
            )}
          </div>
          {!outputPath && FEATURE_FLAGS.APP_STORE_BUILD && (
            <div className="text-xs">
              <span className="rounded-btn bg-base-200 px-2 font-medium uppercase text-base-content/50">
                {t("APP.OUTPUT_PATH_SELECTION.NOT_SELECTED")}
              </span>
            </div>
          )}
        </div>
        {!batchMode && !FEATURE_FLAGS.APP_STORE_BUILD && (
          <p className="mb-2 text-sm">
            {!batchMode
              ? t("APP.OUTPUT_PATH_SELECTION.DEFAULT_IMG_PATH")
              : t("APP.OUTPUT_PATH_SELECTION.DEFAULT_FOLDER_PATH")}
          </p>
        )}
        <button
          className="btn btn-primary"
          data-tooltip-content={outputPath}
          data-tooltip-id="tooltip"
          onClick={outputHandler}
        >
          {t("APP.OUTPUT_PATH_SELECTION.BUTTON_TITLE")}
        </button>
      </div>

      {/* STEP 4 */}
      <div className="animate-step-in flex flex-col gap-2">
        <p className="step-heading">{t("APP.SCALE_SELECTION.TITLE")}</p>
        {dimensions.width && dimensions.height && (
          <p className="mb-1 text-sm">
            {t("APP.SCALE_SELECTION.FROM_TITLE")}
            <span className="font-bold">
              {dimensions.width}x{dimensions.height}
            </span>
            {t("APP.SCALE_SELECTION.TO_TITLE")}
            <span className="font-bold">
              {upscaylResolution.width}x{upscaylResolution.height}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={handleStartClick}>
            {progress.length > 0
              ? t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE")
              : multiModelMode && !batchMode
                ? t("MULTI_MODEL.START_BUTTON", {
                    count: String(selectedCompareModels.length),
                  })
                : t("APP.SCALE_SELECTION.START_BUTTON_TITLE")}
          </button>

          {roiMode && !batchMode && roiUpscaleHandler && (
            <button
              type="button"
              className="btn btn-outline btn-primary btn-sm"
              disabled={progress.length > 0}
              onClick={roiUpscaleHandler}
            >
              ✂️{" "}
              {roiRect
                ? t("ROI.RUN_BUTTON", {
                    width: String(roiRect.width),
                    height: String(roiRect.height),
                  })
                : t("ROI.TOGGLE_TITLE")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpscaylSteps;
