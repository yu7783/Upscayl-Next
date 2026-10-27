"use client";

import { useAtom, useAtomValue } from "jotai";
import { useToast } from "@/components/ui/use-toast";
import { translationAtom } from "@/atoms/translations-atom";
import {
  progressAtom,
  savedOutputPathAtom,
  scaleAtom,
} from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import useLogger from "../../hooks/use-logger";
import SelectModelDialog from "../upscayl-tab/select-model-dialog";
import { SelectImageScale } from "../settings-tab/select-image-scale";

type VideoTabProps = {
  videoPath: string;
  selectVideoHandler: () => Promise<void>;
  upscaylVideoHandler: () => Promise<void>;
};

const VideoTab = ({
  videoPath,
  selectVideoHandler,
  upscaylVideoHandler,
}: VideoTabProps) => {
  const t = useAtomValue(translationAtom);
  const logit = useLogger();
  const { toast } = useToast();
  const [scale, setScale] = useAtom(scaleAtom);
  const [outputPath, setOutputPath] = useAtom(savedOutputPathAtom);
  const progress = useAtomValue(progressAtom);

  const outputHandler = async () => {
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FOLDER);
    if (path !== null) {
      logit("🗂 Setting Video Output Path: ", path);
      setOutputPath(path);
    } else {
      setOutputPath(null);
    }
  };

  const startHandler = () => {
    if (progress.length > 0) {
      toast({
        description: t("APP.SCALE_SELECTION.IN_PROGRESS_BUTTON_TITLE"),
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

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="animate-step-in">
        <p className="step-heading">{t("VIDEO_UPSCAYL.SELECT_VIDEO")}</p>
        <button className="btn btn-primary" onClick={selectVideoHandler}>
          {t("VIDEO_UPSCAYL.SELECT_VIDEO_BUTTON")}
        </button>
        <p className="mt-2 break-all text-xs text-base-content/70">
          {videoPath || t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED")}
        </p>
      </div>

      <div className="animate-step-in">
        <p className="step-heading">{t("VIDEO_UPSCAYL.MODEL_TITLE")}</p>
        <SelectModelDialog />
      </div>

      <div className="animate-step-in">
        <p className="step-heading">{t("APP.OUTPUT_PATH_SELECTION.TITLE")}</p>
        <button
          className="btn btn-primary"
          data-tooltip-content={outputPath ?? undefined}
          data-tooltip-id="tooltip"
          onClick={outputHandler}
        >
          {t("APP.OUTPUT_PATH_SELECTION.BUTTON_TITLE")}
        </button>
        <p className="mt-2 break-all text-xs text-base-content/70">
          {outputPath ?? t("VIDEO_UPSCAYL.NO_OUTPUT_FOLDER")}
        </p>
      </div>

      <div className="animate-step-in">
        <p className="step-heading">{t("APP.SCALE_SELECTION.TITLE")}</p>
        <SelectImageScale scale={scale} setScale={setScale} hideInfo />
      </div>

      {progress.length > 0 && (
        <div className="animate-step-in rounded-btn bg-base-200 p-3 text-sm">
          <p className="font-medium">{progress}</p>
          <button
            className="btn btn-error btn-sm mt-2"
            onClick={() => window.electron.send(ELECTRON_COMMANDS.STOP, null)}
          >
            {t("APP.PROGRESS_BAR.STOP_BUTTON_TITLE")}
          </button>
        </div>
      )}

      <button className="btn btn-secondary" onClick={startHandler}>
        {t("VIDEO_UPSCAYL.START_BUTTON")}
      </button>
    </div>
  );
};

export default VideoTab;
