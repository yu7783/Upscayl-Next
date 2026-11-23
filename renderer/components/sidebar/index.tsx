"use client";
import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  activeTabAtom,
  batchModeAtom,
  batchProgressAtom,
  compressionAtom,
  dontShowCloudModalAtom,
  multiModelModeAtom,
  multiModelProgressAtom,
  noImageProcessingAtom,
  savedOutputPathAtom,
  overwriteAtom,
  progressAtom,
  scaleAtom,
  customWidthAtom,
  useCustomWidthAtom,
  tileSizeAtom,
  showSidebarAtom,
  selectedCompareModelsAtom,
  selectedModelIdAtom,
  doubleUpscaylAtom,
  gpuIdAtom,
  saveImageAsAtom,
  upscaylPassAtom,
  userStatsAtom,
  ttaModeAtom,
  copyMetadataAtom,
  threadsAtom,
  videoCodecAtom,
  videoContainerAtom,
  videoDeduplicateFramesAtom,
  videoIntermediateFormatAtom,
  videoKeepAudioAtom,
  videoProgressAtom,
  videoQualityAtom,
  videoUseHwEncodeAtom,
} from "../../atoms/user-settings-atom";
import useLogger from "../hooks/use-logger";
import {
  BatchUpscaylPayload,
  DoubleUpscaylPayload,
  FfmpegStatus,
  ImageUpscaylPayload,
  MultiModelResult,
  MultiModelUpscaylPayload,
  VideoDoneInfo,
  VideoMediaInfo,
  VideoUpscaylPayload,
} from "@common/types/types";
import { useToast } from "@/components/ui/use-toast";
import UpscaylSteps from "./upscayl-tab/upscayl-steps";
import VideoTab from "./video-tab";
import SettingsTab from "./settings-tab";
import Footer from "../footer";
import { NewsModal } from "../news-modal";
import Tabs from "../tabs";
import Header from "../header";
import { ChevronLeftIcon } from "../icons/original-icons";
import { logAtom } from "@/atoms/log-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { resolveUpscaylMode } from "@common/resolve-upscayl-mode";
import useUpscaylVersion from "../hooks/use-upscayl-version";
import useTranslation from "../hooks/use-translation";
import UpscaylLogo from "./upscayl-logo";
import SidebarToggleButton from "./sidebar-button";

const Sidebar = ({
  setUpscaledImagePath,
  setMultiModelResults,
  setMultiModelStopped,
  batchFolderPath,
  setUpscaledBatchFolderPath,
  dimensions,
  imagePath,
  selectImageHandler,
  selectFolderHandler,
  videoPath,
  videoInfo,
  ffmpegStatus,
  setVideoDoneInfo,
  selectVideoHandler,
}: {
  setUpscaledImagePath: React.Dispatch<React.SetStateAction<string>>;
  setMultiModelResults: React.Dispatch<React.SetStateAction<MultiModelResult[]>>;
  setMultiModelStopped: React.Dispatch<React.SetStateAction<boolean>>;
  batchFolderPath: string;
  setUpscaledBatchFolderPath: React.Dispatch<React.SetStateAction<string>>;
  dimensions: {
    width: number | null;
    height: number | null;
  };
  imagePath: string;
  selectImageHandler: () => Promise<void>;
  selectFolderHandler: () => Promise<void>;
  videoPath: string;
  videoInfo: VideoMediaInfo | null;
  ffmpegStatus: FfmpegStatus | null;
  setVideoDoneInfo: React.Dispatch<React.SetStateAction<VideoDoneInfo | null>>;
  selectVideoHandler: () => Promise<void>;
}) => {
  const t = useTranslation();
  const logit = useLogger();
  const { toast } = useToast();
  const version = useUpscaylVersion();

  // LOCAL STATES
  const [selectedModelId] = useAtom(selectedModelIdAtom);
  const [doubleUpscayl, setDoubleUpscayl] = useAtom(doubleUpscaylAtom);
  const [gpuId, setGpuId] = useAtom(gpuIdAtom);
  const [saveImageAs, setSaveImageAs] = useAtom(saveImageAsAtom);

  const [selectedTab, setSelectedTab] = useAtom(activeTabAtom);
  const [showCloudModal, setShowCloudModal] = useState(false);

  // ATOMIC STATES
  const overwrite = useAtomValue(overwriteAtom);
  const outputPath = useAtomValue(savedOutputPathAtom);
  const [compression, setCompression] = useAtom(compressionAtom);
  const setProgress = useSetAtom(progressAtom);
  const [batchMode, setBatchMode] = useAtom(batchModeAtom);
  const multiModelMode = useAtomValue(multiModelModeAtom);
  const selectedCompareModels = useAtomValue(selectedCompareModelsAtom);
  const setMultiModelProgress = useSetAtom(multiModelProgressAtom);
  const setVideoProgress = useSetAtom(videoProgressAtom);
  const videoCodec = useAtomValue(videoCodecAtom);
  const videoContainer = useAtomValue(videoContainerAtom);
  const videoQuality = useAtomValue(videoQualityAtom);
  const videoKeepAudio = useAtomValue(videoKeepAudioAtom);
  const videoIntermediateFormat = useAtomValue(videoIntermediateFormatAtom);
  const videoUseHwEncode = useAtomValue(videoUseHwEncodeAtom);
  const videoDeduplicateFrames = useAtomValue(videoDeduplicateFramesAtom);
  const logData = useAtomValue(logAtom);
  const [scale] = useAtom(scaleAtom);
  const setDontShowCloudModal = useSetAtom(dontShowCloudModalAtom);
  const noImageProcessing = useAtomValue(noImageProcessingAtom);
  const customWidth = useAtomValue(customWidthAtom);
  const useCustomWidth = useAtomValue(useCustomWidthAtom);
  const tileSize = useAtomValue(tileSizeAtom);
  const threads = useAtomValue(threadsAtom);
  const [showSidebar, setShowSidebar] = useAtom(showSidebarAtom);
  const setUserStats = useSetAtom(userStatsAtom);
  const ttaMode = useAtomValue(ttaModeAtom);
  const [copyMetadata] = useAtom(copyMetadataAtom);
  const setUpscaylPass = useSetAtom(upscaylPassAtom);
  const setBatchProgress = useSetAtom(batchProgressAtom);

  const upscaylHandler = async () => {
    logit("🔄 Resetting Upscaled Image Path");
    setUpscaledImagePath("");
    setUpscaledBatchFolderPath("");
    setMultiModelResults([]);
    setMultiModelStopped(false);
    setMultiModelProgress(null);
    setVideoProgress(null);
    setUpscaylPass({ pass: 0, totalPasses: 0 });
    setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });

    const mode = resolveUpscaylMode({
      batchMode,
      doubleUpscayl,
      imagePath,
      batchFolderPath,
      multiModelMode,
      multiModelCount: selectedCompareModels.length,
    });

    if (mode === "invalid") {
      if (!batchMode && multiModelMode && imagePath.length > 0 && selectedCompareModels.length < 2) {
        toast({
          description: t("MULTI_MODEL.NEED_TWO_MODELS"),
        });
        logit("🚫 Multi-model compare requires at least 2 models");
        return;
      }
      toast({
        title: t("ERRORS.NO_IMAGE_ERROR.TITLE"),
        description: t("ERRORS.NO_IMAGE_ERROR.DESCRIPTION"),
      });
      logit("🚫 No valid image or folder selected");
      return;
    }

    setProgress(t("APP.PROGRESS.WAIT_TITLE"));

    if (mode === "batch") {
      // Batch Upscayl. Batch takes priority so a persisted Double Upscayl
      // flag can no longer send an empty imagePath to the double pipeline
      // (GitHub issue #1405). Double is forwarded as a second pass instead.
      window.electron.send<BatchUpscaylPayload>(
        ELECTRON_COMMANDS.FOLDER_UPSCAYL,
        {
          batchFolderPath,
          outputPath,
          model: selectedModelId,
          gpuId: gpuId.length === 0 ? null : gpuId,
          saveImageAs,
          scale,
          noImageProcessing,
          compression: compression.toString(),
          customWidth: customWidth > 0 ? customWidth.toString() : null,
          useCustomWidth,
          tileSize,
          ttaMode,
          copyMetadata,
          doubleUpscale: doubleUpscayl,
          threads: threads ?? undefined,
        },
      );
      setUserStats((prev) => ({
        ...prev,
        totalUpscayls: prev.totalUpscayls + 1,
        lastUsedAt: new Date().getTime(),
        batchUpscayls: prev.batchUpscayls + 1,
      }));
      logit("🏁 FOLDER_UPSCAYL", doubleUpscayl ? "(DOUBLE)" : "");
      return;
    }

    if (mode === "multi-model") {
      window.electron.send<MultiModelUpscaylPayload>(
        ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL,
        {
          imagePath,
          outputPath,
          models: selectedCompareModels,
          gpuId: gpuId.length === 0 ? null : gpuId,
          saveImageAs,
          scale,
          overwrite,
          noImageProcessing,
          compression: compression.toString(),
          customWidth: customWidth > 0 ? customWidth.toString() : null,
          useCustomWidth,
          tileSize,
          ttaMode,
          copyMetadata,
          doubleUpscale: doubleUpscayl,
          threads: threads ?? undefined,
        },
      );
      setUserStats((prev) => ({
        ...prev,
        totalUpscayls: prev.totalUpscayls + 1,
        lastUsedAt: new Date().getTime(),
        imageUpscayls: prev.imageUpscayls + 1,
      }));
      logit("🏁 MULTI_MODEL_UPSCAYL", selectedCompareModels.join(", "));
      return;
    }

    if (mode === "double") {
      // Double Upscayl (single image, two passes)
      window.electron.send<DoubleUpscaylPayload>(
        ELECTRON_COMMANDS.DOUBLE_UPSCAYL,
        {
          imagePath,
          outputPath,
          model: selectedModelId,
          gpuId: gpuId.length === 0 ? null : gpuId,
          saveImageAs,
          scale,
          noImageProcessing,
          compression: compression.toString(),
          customWidth: customWidth > 0 ? customWidth.toString() : null,
          useCustomWidth,
          tileSize,
          ttaMode,
          copyMetadata,
          threads: threads ?? undefined,
        },
      );
      setUserStats((prev) => ({
        ...prev,
        totalUpscayls: prev.totalUpscayls + 1,
        lastUsedAt: new Date().getTime(),
        doubleUpscayls: prev.doubleUpscayls + 1,
        imageUpscayls: prev.imageUpscayls + 1,
      }));
      logit("🏁 DOUBLE_UPSCAYL");
      return;
    }

    // Single Image Upscayl
    window.electron.send<ImageUpscaylPayload>(ELECTRON_COMMANDS.UPSCAYL, {
      imagePath,
      outputPath,
      model: selectedModelId,
      gpuId: gpuId.length === 0 ? null : gpuId,
      saveImageAs,
      scale,
      overwrite,
      noImageProcessing,
      compression: compression.toString(),
      customWidth: customWidth > 0 ? customWidth.toString() : null,
      useCustomWidth,
      tileSize,
      ttaMode,
      copyMetadata,
      threads: threads ?? undefined,
    });
    setUserStats((prev) => ({
      ...prev,
      totalUpscayls: prev.totalUpscayls + 1,
      lastUsedAt: new Date().getTime(),
      imageUpscayls: prev.imageUpscayls + 1,
    }));
    logit("🏁 UPSCAYL");
  };

  const upscaylVideoHandler = async () => {
    if (!videoPath) {
      toast({
        title: t("ERRORS.NO_IMAGE_ERROR.TITLE"),
        description: t("VIDEO_UPSCAYL.NO_VIDEO_SELECTED"),
      });
      return;
    }

    if (!outputPath) {
      toast({
        title: t("ERRORS.NO_OUTPUT_FOLDER_ERROR.TITLE"),
        description: t("VIDEO_UPSCAYL.NO_OUTPUT_FOLDER"),
      });
      return;
    }

    setUpscaledImagePath("");
    setUpscaledBatchFolderPath("");
    setMultiModelResults([]);
    setMultiModelProgress(null);
    setVideoDoneInfo(null);
    setVideoProgress({
      stage: "preparing",
      stageIndex: 1,
      totalStages: 3,
      percent: 0,
      completedFrames: 0,
      totalFrames: videoInfo?.estimatedFrames ?? 0,
      chunk: 0,
      totalChunks: 0,
      message: t("APP.PROGRESS.WAIT_TITLE"),
    });
    setProgress(t("APP.PROGRESS.WAIT_TITLE"));

    window.electron.send<VideoUpscaylPayload>(ELECTRON_COMMANDS.UPSCAYL_VIDEO, {
      videoPath,
      outputPath,
      model: selectedModelId,
      gpuId: gpuId.length === 0 ? null : gpuId,
      saveImageAs,
      scale,
      compression: compression.toString(),
      customWidth: customWidth > 0 ? customWidth.toString() : null,
      useCustomWidth,
      tileSize,
      ttaMode,
      threads: threads ?? undefined,
      videoCodec,
      videoContainer,
      videoQuality,
      keepAudio: videoKeepAudio,
      intermediateFormat: videoIntermediateFormat,
      useHardwareEncoding: videoUseHwEncode,
      deduplicateFrames: videoDeduplicateFrames,
    });

    setUserStats((prev) => ({
      ...prev,
      totalUpscayls: prev.totalUpscayls + 1,
      lastUsedAt: new Date().getTime(),
    }));
    logit("🏁 UPSCAYL_VIDEO");
  };

  return (
    <>
      {/* TOP LOGO WHEN SIDEBAR IS HIDDEN */}
      {!showSidebar && <UpscaylLogo />}

      <SidebarToggleButton
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
      />

      <div
        className={`relative flex h-screen min-w-[350px] max-w-[350px] flex-col bg-base-100 ${showSidebar ? "" : "hidden"}`}
      >
        <button
          className="absolute -right-0 top-1/2 z-50 -translate-y-1/2 translate-x-1/2 rounded-full bg-base-100 p-4"
          onClick={() => setShowSidebar((prev) => !prev)}
        >
          <ChevronLeftIcon />
        </button>

        {window.electron.platform === "mac" && (
          <div className="mac-titlebar pt-8"></div>
        )}

        <Header version={version} />

        <NewsModal />

        <Tabs selectedTab={selectedTab} setSelectedTab={setSelectedTab} />

        {selectedTab === 0 && (
          <UpscaylSteps
            selectImageHandler={selectImageHandler}
            selectFolderHandler={selectFolderHandler}
            upscaylHandler={upscaylHandler}
            batchMode={batchMode}
            setBatchMode={setBatchMode}
            imagePath={imagePath}
            doubleUpscayl={doubleUpscayl}
            setDoubleUpscayl={setDoubleUpscayl}
            dimensions={dimensions}
            setGpuId={setGpuId}
            setSaveImageAs={setSaveImageAs}
          />
        )}

        {selectedTab === 1 && (
          <VideoTab
            videoPath={videoPath}
            videoInfo={videoInfo}
            ffmpegStatus={ffmpegStatus}
            selectVideoHandler={selectVideoHandler}
            upscaylVideoHandler={upscaylVideoHandler}
          />
        )}

        {selectedTab === 2 && (
          <div className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-base-300">
            <SettingsTab
              batchMode={batchMode}
              compression={compression}
              setCompression={setCompression}
              gpuId={gpuId}
              setGpuId={setGpuId}
              saveImageAs={saveImageAs}
              setSaveImageAs={setSaveImageAs}
              logData={logData}
              show={showCloudModal}
              setShow={setShowCloudModal}
              setDontShowCloudModal={setDontShowCloudModal}
              onClose={() => setSelectedTab(0)}
            />
          </div>
        )}
        <Footer />
      </div>
    </>
  );
};

export default Sidebar;
