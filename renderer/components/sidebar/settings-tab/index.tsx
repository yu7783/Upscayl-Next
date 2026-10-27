import SelectTheme from "./select-theme";
import { SaveOutputFolderToggle } from "./save-output-folder-toggle";
import { InputGpuId } from "./input-gpu-id";
import { CustomModelsFolderSelect } from "./select-custom-models-folder";
import { LogArea } from "./log-area";
import { SelectImageScale } from "./select-image-scale";
import { SelectImageFormat } from "./select-image-format";
import { DonateButton } from "./donate-button";
import React, { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { customModelsPathAtom, scaleAtom } from "@/atoms/user-settings-atom";
import { InputCompression } from "./input-compression";
import OverwriteToggle from "./overwrite-toggle";
import { UpscaylCloudModal } from "@/components/upscayl-cloud-modal";
import { ResetSettingsButton } from "./reset-settings-button";
import { FEATURE_FLAGS } from "@common/feature-flags";
import TurnOffNotificationsToggle from "./turn-off-notifications-toggle";
import { InputCustomResolution } from "./input-custom-resolution";
import { InputTileSize } from "./input-tile-size";
import { InputThreads } from "./input-threads";
import AutoOptimizeToggle from "./auto-optimize-toggle";
import LanguageSwitcher from "./language-switcher";
import { translationAtom } from "@/atoms/translations-atom";
import { ImageFormat } from "@/lib/valid-formats";
import AutoUpdateToggle from "./auto-update-toggle";
import TTAModeToggle from "./tta-mode-toggle";
import SystemInfo from "./system-info";
import CopyMetadataToggle from "./copy-metadata-toggle";

interface IProps {
  batchMode: boolean;
  saveImageAs: ImageFormat;
  setSaveImageAs: React.Dispatch<React.SetStateAction<ImageFormat>>;
  compression: number;
  setCompression: React.Dispatch<React.SetStateAction<number>>;
  gpuId: string;
  setGpuId: React.Dispatch<React.SetStateAction<string>>;
  logData: string[];
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  setDontShowCloudModal: React.Dispatch<React.SetStateAction<boolean>>;
  onClose?: () => void;
}

const SettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-4 rounded-btn border border-base-content/10 bg-base-100/70 p-4 shadow-sm backdrop-blur">
    <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/60">
      {title}
    </h3>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);

function SettingsTab({
  batchMode,
  compression,
  setCompression,
  gpuId,
  setGpuId,
  saveImageAs,
  setSaveImageAs,
  logData,
  show,
  setShow,
  setDontShowCloudModal,
  onClose,
}: IProps) {
  const [isCopied, setIsCopied] = useState(false);

  const [customModelsPath, setCustomModelsPath] = useAtom(customModelsPathAtom);
  const [scale, setScale] = useAtom(scaleAtom);
  const t = useAtomValue(translationAtom);

  // HANDLERS
  const setExportType = (format: ImageFormat) => {
    setSaveImageAs(format);
  };

  const handleCompressionChange = (e) => {
    setCompression(e.target.value);
  };

  const handleGpuIdChange = (e) => {
    setGpuId(e.target.value);
    localStorage.setItem("gpuId", e.target.value);
  };

  const copyOnClickHandler = () => {
    navigator.clipboard.writeText(logData.join("\n"));
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const sendToTermbin = async (logData: string[]) => {
    try {
      const response = await fetch("https://termbin.com:9999/", {
        method: "POST",
        body: logData.join("\n"),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const url = await response.text();
      return url.trim();
    } catch (error) {
      console.error("Error sending to termbin:", error);
      throw error;
    }
  };

  return (
    <div className="animate-step-in flex h-screen w-full flex-col overflow-y-auto bg-base-300">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
        <div className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-base-content/10 bg-base-300/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">{t("SETTINGS.TITLE")}</h2>
            <p className="text-xs text-base-content/60">
              {t("SETTINGS.SECTIONS.DESCRIPTION")}
            </p>
          </div>
          {onClose && (
            <button className="btn btn-sm btn-outline" onClick={onClose}>
              {t("SETTINGS.BACK_TO_UPSCAYL-NEXT")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <SettingsSection title={t("SETTINGS.SECTIONS.IMAGE")}>
            <SelectImageFormat
              batchMode={batchMode}
              saveImageAs={saveImageAs}
              setExportType={setExportType}
            />
            <CopyMetadataToggle
              saveImageAs={saveImageAs}
              setExportType={setExportType}
            />
            <SelectImageScale scale={scale} setScale={setScale} />
            <InputCustomResolution />
            <InputCompression
              compression={compression}
              handleCompressionChange={handleCompressionChange}
            />
            <SaveOutputFolderToggle />
            <OverwriteToggle />
          </SettingsSection>

          <SettingsSection title={t("SETTINGS.SECTIONS.PERFORMANCE")}>
            <InputGpuId gpuId={gpuId} handleGpuIdChange={handleGpuIdChange} />
            <InputTileSize />
            <InputThreads />
            <TTAModeToggle />
            <AutoOptimizeToggle />
          </SettingsSection>

          <SettingsSection title={t("SETTINGS.SECTIONS.INTERFACE")}>
            <SelectTheme />
            <LanguageSwitcher />
            <TurnOffNotificationsToggle />
            <AutoUpdateToggle />
          </SettingsSection>

          <SettingsSection title={t("SETTINGS.SECTIONS.MODELS")}>
            <CustomModelsFolderSelect
              customModelsPath={customModelsPath}
              setCustomModelsPath={setCustomModelsPath}
            />
          </SettingsSection>

          <SettingsSection title={t("SETTINGS.SECTIONS.SYSTEM")}>
            <LogArea
              copyOnClickHandler={copyOnClickHandler}
              isCopied={isCopied}
              logData={logData}
            />
            <SystemInfo />
            <ResetSettingsButton />
            {FEATURE_FLAGS.SHOW_UPSCAYL_CLOUD_INFO && (
              <>
                <button
                  className="animate-pulse rounded-btn bg-success p-1 text-sm text-slate-50 shadow-lg shadow-success/40"
                  onClick={() => {
                    setShow(true);
                  }}
                >
                  {t("INTRO")}
                </button>

                <UpscaylCloudModal
                  show={show}
                  setShow={setShow}
                  setDontShowCloudModal={setDontShowCloudModal}
                />
              </>
            )}
          </SettingsSection>

          <SettingsSection title={t("SETTINGS.SECTIONS.SUPPORT")}>
            <DonateButton />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

export default SettingsTab;
