import React from "react";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { useAtomValue } from "jotai";
import { translationAtom } from "@/atoms/translations-atom";

const CUSTOM_MODELS_URL = "https://github.com/upscayl/custom-models";
const BACKEND_GUIDE_URL =
  "https://github.com/yu7783/Upscayl-Next/blob/main/native/README.md";

type CustomModelsFolderSelectProps = {
  customModelsPath: string | null;
  setCustomModelsPath: (arg: string) => void;
};

export function CustomModelsFolderSelect({
  customModelsPath,
  setCustomModelsPath,
}: CustomModelsFolderSelectProps) {
  const t = useAtomValue(translationAtom);

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm font-medium">{t("SETTINGS.CUSTOM_MODELS.TITLE")}</p>
      <p className="text-xs text-base-content/80">
        {t("SETTINGS.CUSTOM_MODELS.DESCRIPTION")}
      </p>
      <p className="text-xs text-base-content/60">
        {t("SETTINGS.CUSTOM_MODELS.SUPPORTED_FORMATS")}
      </p>
      <p className="rounded-box border border-base-content/10 bg-base-200/50 p-2 text-xs text-base-content/70">
        {t("SETTINGS.CUSTOM_MODELS.BACKEND_NOTE")}
      </p>
      <p className="text-sm text-base-content/60">
        {customModelsPath || t("SETTINGS.CUSTOM_MODELS.NO_FOLDER")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary"
          onClick={async () => {
            const customModelPath = await window.electron.invoke(
              ELECTRON_COMMANDS.SELECT_CUSTOM_MODEL_FOLDER,
            );

            if (customModelPath !== null) {
              setCustomModelsPath(customModelPath);
              window.electron.send(
                ELECTRON_COMMANDS.GET_MODELS_LIST,
                customModelPath,
              );
            } else {
              setCustomModelsPath("");
            }
          }}
        >
          {t("SETTINGS.CUSTOM_MODELS.BUTTON_FOLDER")}
        </button>
        <a
          href={CUSTOM_MODELS_URL}
          className="btn btn-ghost btn-sm"
          target="_blank"
          rel="noreferrer"
        >
          {t("SETTINGS.CUSTOM_MODELS.LINK_TITLE")}
        </a>
        <a
          href={BACKEND_GUIDE_URL}
          className="btn btn-ghost btn-sm"
          target="_blank"
          rel="noreferrer"
        >
          {t("SETTINGS.CUSTOM_MODELS.LINK_BACKEND")}
        </a>
      </div>
    </div>
  );
}
