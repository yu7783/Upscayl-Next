"use client";
import useLogger from "../hooks/use-logger";
import { useState, useMemo, useEffect } from "react";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  activeTabAtom,
  batchModeAtom,
  savedOutputPathAtom,
  progressAtom,
  viewTypeAtom,
  rememberOutputFolderAtom,
  upscaylPassAtom,
  batchProgressAtom,
  multiModelProgressAtom,
  videoProgressAtom,
  videoBatchModeAtom,
  videoBatchPathsAtom,
  roiModeAtom,
  roiRectAtom,
} from "../../atoms/user-settings-atom";
import { useToast } from "@/components/ui/use-toast";
import { sanitizePath } from "@common/sanitize-path";
import getDirectoryFromPath from "@common/get-directory-from-path";
import getFilenameFromPath from "@common/get-file-name";
import { FEATURE_FLAGS } from "@common/feature-flags";
import { isVideoPath } from "@common/video-formats";
import {
  BatchVideoItemResult,
  FfmpegStatus,
  MultiModelResult,
  RoiUpscaylDonePayload,
  VideoDoneInfo,
  VideoMediaInfo,
} from "@common/types/types";
import { ImageFormat, VALID_IMAGE_FORMATS } from "@/lib/valid-formats";
import ProgressBar from "./progress-bar";
import InstructionsCard from "./instructions-card";
import MoreOptionsDrawer from "./more-options-drawer";
import useUpscaylVersion from "../hooks/use-upscayl-version";
import MacTitlebarDragRegion from "./mac-titlebar-drag-region";
import LensViewer from "./lens-view";
import ImageViewer from "./image-viewer";
import useTranslation from "../hooks/use-translation";
import SliderView from "./slider-view";
import MultiModelCompareView from "./multi-model-compare-view";
import BlendPanel from "./blend-panel";
import VideoWorkspace from "./video-workspace";

type MainContentProps = {
  imagePath: string;
  resetImagePaths: () => void;
  upscaledBatchFolderPath: string;
  setImagePath: React.Dispatch<React.SetStateAction<string>>;
  validateImagePath: (path: string) => void;
  selectFolderHandler: () => void;
  selectImageHandler: () => void;
  upscaledImagePath: string;
  multiModelResults: MultiModelResult[];
  setMultiModelResults: React.Dispatch<React.SetStateAction<MultiModelResult[]>>;
  multiModelStopped: boolean;
  roiPreview: RoiUpscaylDonePayload | null;
  onExitRoiPreview: () => void;
  onRunRoiUpscale: () => void;
  onUpscaleFullFromRoi: () => void;
  batchFolderPath: string;
  setDimensions: React.Dispatch<
    React.SetStateAction<{
      width: number;
      height: number;
    }>
  >;
  videoPath: string;
  videoInfo: VideoMediaInfo | null;
  videoDoneInfo: VideoDoneInfo | null;
  batchVideoResults: BatchVideoItemResult[];
  ffmpegStatus: FfmpegStatus | null;
  selectVideoHandler: () => Promise<void>;
  loadVideoPath: (path: string) => Promise<void>;
  resetVideoHandler: () => void;
};

const MainContent = ({
  imagePath,
  resetImagePaths,
  upscaledBatchFolderPath,
  setImagePath,
  validateImagePath,
  selectFolderHandler,
  selectImageHandler,
  upscaledImagePath,
  multiModelResults,
  setMultiModelResults,
  multiModelStopped,
  roiPreview,
  onExitRoiPreview,
  onRunRoiUpscale,
  onUpscaleFullFromRoi,
  batchFolderPath,
  setDimensions,
  videoPath,
  videoInfo,
  videoDoneInfo,
  batchVideoResults,
  ffmpegStatus,
  selectVideoHandler,
  loadVideoPath,
  resetVideoHandler,
}: MainContentProps) => {
  const t = useTranslation();
  const logit = useLogger();
  const { toast } = useToast();
  const version = useUpscaylVersion();

  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [outputPath, setOutputPath] = useAtom(savedOutputPathAtom);
  const progress = useAtomValue(progressAtom);
  const batchMode = useAtomValue(batchModeAtom);
  const upscaylPass = useAtomValue(upscaylPassAtom);
  const batchProgress = useAtomValue(batchProgressAtom);
  const multiModelProgress = useAtomValue(multiModelProgressAtom);
  const videoProgress = useAtomValue(videoProgressAtom);
  const setVideoBatchMode = useSetAtom(videoBatchModeAtom);
  const setVideoBatchPaths = useSetAtom(videoBatchPathsAtom);
  const roiMode = useAtomValue(roiModeAtom);
  const [roiRect, setRoiRect] = useAtom(roiRectAtom);
  const [singleBlendOpen, setSingleBlendOpen] = useState(false);

  const viewType = useAtomValue(viewTypeAtom);
  const rememberOutputFolder = useAtomValue(rememberOutputFolderAtom);
  const [zoomAmount, setZoomAmount] = useState("100");

  const isVideoTab = activeTab === 1;
  const hasMultiModelResults =
    !batchMode &&
    imagePath.length > 0 &&
    multiModelResults.some(
      (item) => item.status === "done" && item.outputPath.length > 0,
    );

  const sanitizedUpscaledImagePath = useMemo(
    () => sanitizePath(upscaledImagePath),
    [upscaledImagePath],
  );

  const showInformationCard = useMemo(() => {
    if (isVideoTab) return false;
    if (!batchMode) {
      return (
        imagePath.length === 0 &&
        upscaledImagePath.length === 0 &&
        !hasMultiModelResults
      );
    } else {
      return (
        batchFolderPath.length === 0 && upscaledBatchFolderPath.length === 0
      );
    }
  }, [
    isVideoTab,
    batchMode,
    imagePath,
    upscaledImagePath,
    hasMultiModelResults,
    batchFolderPath,
    upscaledBatchFolderPath,
  ]);

  // DRAG AND DROP HANDLERS
  const handleDragEnter = (e) => {
    e.preventDefault();
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const openFolderHandler = () => {
    logit("📂 OPEN_FOLDER: ", upscaledBatchFolderPath);
    window.electron.send(
      ELECTRON_COMMANDS.OPEN_FOLDER,
      upscaledBatchFolderPath,
    );
  };

  const sanitizedImagePath = useMemo(
    () => sanitizePath(imagePath),
    [imagePath],
  );

  const handleDrop = (e) => {
    e.preventDefault();
    if (
      e.dataTransfer.items.length === 0 ||
      e.dataTransfer.files.length === 0
    ) {
      logit("👎 No valid files dropped");
      toast({
        title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
        description: t("ERRORS.INVALID_IMAGE_ERROR.ADDITIONAL_DESCRIPTION"),
      });
      return;
    }

    const type = e.dataTransfer.items[0].type ?? "";
    const filePath = e.dataTransfer.files[0].path;
    const extension = e.dataTransfer.files[0].name.split(".").at(-1) ?? "";
    logit("⤵️ Dropped file: ", JSON.stringify({ type, filePath, extension }));

    const droppedVideoPaths = Array.from(e.dataTransfer.files)
      .map((f: any) => ({ path: f.path as string, type: f.type as string }))
      .filter((f) => f.type?.includes("video") || isVideoPath(f.path))
      .map((f) => f.path);

    if (droppedVideoPaths.length > 1) {
      logit("🎬 Dropped multiple videos: ", String(droppedVideoPaths.length));
      setActiveTab(1);
      setVideoBatchMode(true);
      setVideoBatchPaths((prev) => {
        const merged = [...prev];
        for (const p of droppedVideoPaths) {
          if (!merged.includes(p)) merged.push(p);
        }
        return merged;
      });
      if (!FEATURE_FLAGS.APP_STORE_BUILD && !rememberOutputFolder) {
        setOutputPath(getDirectoryFromPath(droppedVideoPaths[0]));
      }
      return;
    }

    if (type.includes("video") || isVideoPath(filePath)) {
      logit("🎬 Dropped video file: ", filePath);
      setActiveTab(1);
      setVideoBatchMode(false);
      loadVideoPath(filePath);
      return;
    }

    if (isVideoTab) {
      toast({
        title: t("VIDEO_UPSCAYL.DROP_TITLE"),
        description: t("VIDEO_UPSCAYL.DROP_DESCRIPTION"),
      });
      return;
    }

    resetImagePaths();
    if (
      !type.includes("image") ||
      !VALID_IMAGE_FORMATS.includes(extension.toLowerCase() as ImageFormat)
    ) {
      logit("🚫 Invalid file dropped");
      toast({
        title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
        description: t("ERRORS.INVALID_IMAGE_ERROR.ADDITIONAL_DESCRIPTION"),
      });
    } else {
      logit("🖼 Setting image path: ", filePath);
      setImagePath(filePath);
      const dirname = getDirectoryFromPath(filePath);
      logit("🗂 Setting output path: ", dirname);
      if (!FEATURE_FLAGS.APP_STORE_BUILD) {
        if (!rememberOutputFolder) {
          setOutputPath(dirname);
        }
      }
      validateImagePath(filePath);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isVideoTab) return;
    e.preventDefault();
    if (outputPath) {
      resetImagePaths();
      if (e.clipboardData.files.length) {
        const fileObject = e.clipboardData.files[0];
        const currentDate = new Date(Date.now());
        const currentTime = `${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;
        const fileName = `.temp-${currentTime}-${fileObject.name || "image"}`;
        const file = {
          name: fileName,
          path: outputPath,
          extension: fileName.split(".").pop() as ImageFormat,
          size: fileObject.size,
          type: fileObject.type.split("/")[0],
          encodedBuffer: "",
        };

        logit(
          "📋 Pasted file: ",
          JSON.stringify({
            name: file.name,
            path: file.path,
            extension: file.extension,
          }),
        );

        if (
          file.type === "image" &&
          VALID_IMAGE_FORMATS.includes(file.extension)
        ) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const result = event.target?.result;
            if (typeof result === "string") {
              file.encodedBuffer = Buffer.from(result, "utf-8").toString(
                "base64",
              );
            } else if (result instanceof ArrayBuffer) {
              file.encodedBuffer = Buffer.from(new Uint8Array(result)).toString(
                "base64",
              );
            } else {
              logit("🚫 Invalid file pasted");
              toast({
                title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
                description: t(
                  "ERRORS.INVALID_IMAGE_ERROR.CLIPBOARD_DESCRIPTION",
                ),
              });
            }
            window.electron.send(ELECTRON_COMMANDS.PASTE_IMAGE, file);
          };
          reader.readAsArrayBuffer(fileObject);
        } else {
          logit("🚫 Invalid file pasted");
          toast({
            title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
            description: t("ERRORS.INVALID_IMAGE_ERROR.CLIPBOARD_DESCRIPTION"),
          });
        }
      } else {
        logit("🚫 Invalid file pasted");
        toast({
          title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
          description: t("ERRORS.INVALID_IMAGE_ERROR.CLIPBOARD_DESCRIPTION"),
        });
      }
    } else {
      toast({
        title: t("ERRORS.NO_OUTPUT_FOLDER_ERROR.TITLE"),
        description: t("ERRORS.NO_OUTPUT_FOLDER_ERROR.DESCRIPTION"),
      });
    }
  };

  useEffect(() => {
    const handlePasteEvent = (e) => handlePaste(e);
    const handlePasteImageSaveSuccess = (_: any, imageFilePath: string) => {
      setImagePath(imageFilePath);
      validateImagePath(imageFilePath);
    };
    const handlePasteImageSaveError = (_: any, error: string) => {
      toast({
        title: t("ERRORS.NO_IMAGE_ERROR.TITLE"),
        description: error,
      });
    };
    window.addEventListener("paste", handlePasteEvent);
    window.electron.on(
      ELECTRON_COMMANDS.PASTE_IMAGE_SAVE_SUCCESS,
      handlePasteImageSaveSuccess,
    );
    window.electron.on(
      ELECTRON_COMMANDS.PASTE_IMAGE_SAVE_ERROR,
      handlePasteImageSaveError,
    );
    return () => {
      window.removeEventListener("paste", handlePasteEvent);
    };
  }, [t, outputPath, isVideoTab]);

  const showProgressOverlay =
    progress.length > 0 &&
    (isVideoTab
      ? !videoDoneInfo && batchVideoResults.length === 0
      : upscaledImagePath.length === 0 &&
        upscaledBatchFolderPath.length === 0 &&
        !hasMultiModelResults);

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDoubleClick={
        isVideoTab
          ? selectVideoHandler
          : batchMode
            ? selectFolderHandler
            : selectImageHandler
      }
    >
      <MacTitlebarDragRegion />

      {showProgressOverlay && (
        <ProgressBar
          batchMode={batchMode}
          progress={progress}
          upscaylPass={upscaylPass}
          batchProgress={batchProgress}
          multiModelProgress={multiModelProgress}
          videoProgress={videoProgress}
        />
      )}

      {/* VIDEO WORKSPACE */}
      {isVideoTab && (
        <VideoWorkspace
          version={version}
          videoPath={videoPath}
          videoInfo={videoInfo}
          videoDoneInfo={videoDoneInfo}
          batchVideoResults={batchVideoResults}
          ffmpegStatus={ffmpegStatus}
          selectVideoHandler={selectVideoHandler}
          resetVideoHandler={resetVideoHandler}
        />
      )}

      {/* DEFAULT PANE INFO */}
      {showInformationCard && (
        <InstructionsCard version={version} batchMode={batchMode} />
      )}

      {!isVideoTab && (
        <MoreOptionsDrawer
          zoomAmount={zoomAmount}
          setZoomAmount={setZoomAmount}
          resetImagePaths={resetImagePaths}
        />
      )}

      {/* SHOW SELECTED IMAGE */}
      {!isVideoTab &&
        !batchMode &&
        upscaledImagePath.length === 0 &&
        !hasMultiModelResults &&
        imagePath.length > 0 && (
          <ImageViewer
            imagePath={imagePath}
            setDimensions={setDimensions}
            roiMode={roiMode}
            roiRect={roiRect}
            setRoiRect={setRoiRect}
            onRunRoi={onRunRoiUpscale}
          />
        )}

      {/* MULTI-MODEL / ROI COMPARISON VIEW */}
      {!isVideoTab && hasMultiModelResults && (
        <MultiModelCompareView
          imagePath={imagePath}
          outputPath={outputPath}
          results={multiModelResults}
          wasStopped={multiModelStopped}
          zoomAmount={zoomAmount}
          onUpdateResults={setMultiModelResults}
          roiPreview={roiPreview}
          onExitRoiPreview={onExitRoiPreview}
          onUpscaleFullFromRoi={onUpscaleFullFromRoi}
        />
      )}

      {/* BATCH UPSCALE SHOW SELECTED FOLDER */}
      {!isVideoTab &&
        batchMode &&
        upscaledBatchFolderPath.length === 0 &&
        batchFolderPath.length > 0 && (
          <p className="select-none text-base-content">
            <span className="font-bold">
              {t("APP.PROGRESS.BATCH.SELECTED_FOLDER_TITLE")}
            </span>{" "}
            {batchFolderPath}
          </p>
        )}

      {/* BATCH UPSCALE DONE INFO */}
      {!isVideoTab && batchMode && upscaledBatchFolderPath.length > 0 && (
        <div className="z-50 flex flex-col items-center">
          <p className="select-none py-4 font-bold text-base-content">
            {t("APP.PROGRESS.BATCH.DONE_TITLE")}
          </p>
          <button
            className="bg-gradient-blue btn btn-primary rounded-btn p-3 font-medium text-white/90 transition-colors"
            onClick={openFolderHandler}
          >
            {t("APP.PROGRESS.BATCH.OPEN_UPSCAYLED_FOLDER_TITLE")}
          </button>
        </div>
      )}

      {/* SINGLE IMAGE BLEND FLOATING TOGGLE */}
      {!isVideoTab &&
        !batchMode &&
        !hasMultiModelResults &&
        upscaledImagePath.length > 0 &&
        imagePath.length > 0 && (
          <button
            type="button"
            className={`btn btn-xs absolute right-4 top-4 z-40 shadow-md ${
              singleBlendOpen ? "btn-primary" : "btn-neutral"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setSingleBlendOpen((v) => !v);
            }}
          >
            🎨 {t("BLEND.BUTTON_OPEN")}
          </button>
        )}

      {/* SINGLE IMAGE BLEND PANEL */}
      {!isVideoTab &&
        !batchMode &&
        !hasMultiModelResults &&
        singleBlendOpen &&
        upscaledImagePath.length > 0 &&
        imagePath.length > 0 && (
          <div
            className="h-screen w-full"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <BlendPanel
              imageAPath={imagePath}
              imageBPath={upscaledImagePath}
              labelA={t("MULTI_MODEL.ORIGINAL_OPTION")}
              labelB="Upscaled"
              outputDir={outputPath || getDirectoryFromPath(upscaledImagePath)}
              baseName={
                getFilenameFromPath(imagePath).replace(/\.[^/.]+$/, "") ||
                "upscayl"
              }
              sourceMetadataPath={imagePath}
            />
          </div>
        )}

      {!isVideoTab &&
        !batchMode &&
        !hasMultiModelResults &&
        !singleBlendOpen &&
        viewType === "lens" &&
        upscaledImagePath &&
        imagePath && (
          <LensViewer
            sanitizedImagePath={sanitizedImagePath}
            sanitizedUpscaledImagePath={sanitizedUpscaledImagePath}
          />
        )}

      {/* COMPARISON SLIDER */}
      {!isVideoTab &&
        !batchMode &&
        !hasMultiModelResults &&
        !singleBlendOpen &&
        viewType === "slider" &&
        imagePath.length > 0 &&
        upscaledImagePath.length > 0 && (
          <SliderView
            sanitizedImagePath={sanitizedImagePath}
            sanitizedUpscaledImagePath={sanitizedUpscaledImagePath}
            zoomAmount={zoomAmount}
          />
        )}
    </div>
  );
};

export default MainContent;
