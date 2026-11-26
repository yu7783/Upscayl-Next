"use client";
import { useState, useEffect, useCallback } from "react";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { useAtomValue, useSetAtom } from "jotai";
import { customModelIdsAtom } from "../atoms/models-list-atom";
import {
  activeTabAtom,
  batchModeAtom,
  savedOutputPathAtom,
  progressAtom,
  rememberOutputFolderAtom,
  userStatsAtom,
  upscaylPassAtom,
  batchProgressAtom,
  multiModelProgressAtom,
  videoProgressAtom,
  videoBatchModeAtom,
  videoBatchPathsAtom,
} from "../atoms/user-settings-atom";
import useLogger from "../components/hooks/use-logger";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import UpscaylSVGLogo from "@/components/icons/upscayl-logo-svg";
import { translationAtom } from "@/atoms/translations-atom";
import Sidebar from "@/components/sidebar";
import MainContent from "@/components/main-content";
import getDirectoryFromPath from "@common/get-directory-from-path";
import { FEATURE_FLAGS } from "@common/feature-flags";
import {
  BatchVideoDonePayload,
  BatchVideoItemResult,
  BatchVideoProgressInfo,
  FfmpegStatus,
  MultiModelDonePayload,
  MultiModelProgressInfo,
  MultiModelResult,
  VideoDoneInfo,
  VideoMediaInfo,
  VideoProgressInfo,
  VideoSessionManifest,
} from "@common/types/types";
import { ImageFormat, VALID_IMAGE_FORMATS } from "@/lib/valid-formats";
import { initCustomModels } from "@/components/hooks/use-custom-models";
import { OnboardingDialog } from "@/components/main-content/onboarding-dialog";
import useSystemInfo from "@/components/hooks/use-system-info";

const Home = () => {
  const t = useAtomValue(translationAtom);
  const logit = useLogger();
  const { toast } = useToast();
  const { systemInfo } = useSystemInfo();

  initCustomModels();

  const [isLoading, setIsLoading] = useState(true);
  const [imagePath, setImagePath] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoMediaInfo | null>(null);
  const [videoDoneInfo, setVideoDoneInfo] = useState<VideoDoneInfo | null>(
    null,
  );
  const [batchVideoResults, setBatchVideoResults] = useState<
    BatchVideoItemResult[]
  >([]);
  const [videoSessions, setVideoSessions] = useState<VideoSessionManifest[]>(
    [],
  );
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [upscaledImagePath, setUpscaledImagePath] = useState("");
  const [multiModelResults, setMultiModelResults] = useState<
    MultiModelResult[]
  >([]);
  const [multiModelStopped, setMultiModelStopped] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: null,
    height: null,
  });
  const activeTab = useAtomValue(activeTabAtom);
  const setOutputPath = useSetAtom(savedOutputPathAtom);
  const rememberOutputFolder = useAtomValue(rememberOutputFolderAtom);
  const batchMode = useAtomValue(batchModeAtom);
  const [batchFolderPath, setBatchFolderPath] = useState("");
  const [upscaledBatchFolderPath, setUpscaledBatchFolderPath] = useState("");
  const setProgress = useSetAtom(progressAtom);
  const setUpscaylPass = useSetAtom(upscaylPassAtom);
  const setBatchProgress = useSetAtom(batchProgressAtom);
  const setMultiModelProgress = useSetAtom(multiModelProgressAtom);
  const setVideoProgress = useSetAtom(videoProgressAtom);
  const setVideoBatchMode = useSetAtom(videoBatchModeAtom);
  const setVideoBatchPaths = useSetAtom(videoBatchPathsAtom);
  const setModelIds = useSetAtom(customModelIdsAtom);
  const setUserStats = useSetAtom(userStatsAtom);

  const refreshVideoSessions = useCallback(async () => {
    try {
      const sessions: VideoSessionManifest[] = await window.electron.invoke(
        ELECTRON_COMMANDS.LIST_VIDEO_SESSIONS,
      );
      setVideoSessions(Array.isArray(sessions) ? sessions : []);
    } catch {
      setVideoSessions([]);
    }
  }, []);

  // Check FFmpeg / FFprobe readiness and resumable sessions when opening the Video tab
  useEffect(() => {
    if (activeTab !== 1) return;
    let cancelled = false;
    window.electron
      .invoke(ELECTRON_COMMANDS.CHECK_FFMPEG)
      .then((status: FfmpegStatus) => {
        if (!cancelled) setFfmpegStatus(status);
      })
      .catch(() => {});
    refreshVideoSessions();
    return () => {
      cancelled = true;
    };
  }, [activeTab, refreshVideoSessions]);

  const loadVideoPath = useCallback(
    async (path: string) => {
      if (!path) return;
      logit("🎬 Selected Video Path: ", path);
      setVideoPath(path);
      setVideoDoneInfo(null);
      setBatchVideoResults([]);
      setVideoInfo(null);
      const dirname = getDirectoryFromPath(path);
      logit("📁 Selected Video Directory: ", dirname);
      if (!FEATURE_FLAGS.APP_STORE_BUILD) {
        if (!rememberOutputFolder) {
          setOutputPath(dirname);
        }
      }
      try {
        const info: VideoMediaInfo | null = await window.electron.invoke(
          ELECTRON_COMMANDS.GET_VIDEO_INFO,
          path,
        );
        setVideoInfo(info);
        if (info) {
          logit("🎞 Video Metadata: ", JSON.stringify(info));
        }
      } catch (err) {
        logit("⚠️ Could not probe video metadata: ", err);
      }
    },
    [logit, rememberOutputFolder, setOutputPath],
  );

  const selectImageHandler = async () => {
    resetImagePaths();
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FILE);
    if (path === null) return;
    logit("🖼 Selected Image Path: ", path);
    setImagePath(path);
    const dirname = getDirectoryFromPath(path);
    logit("📁 Selected Image Directory: ", dirname);
    if (!FEATURE_FLAGS.APP_STORE_BUILD) {
      if (!rememberOutputFolder) {
        setOutputPath(dirname);
      }
    }
    validateImagePath(path);
  };

  const selectVideoHandler = async () => {
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_VIDEO);
    if (path === null) return;
    await loadVideoPath(path);
  };

  const selectMultipleVideosHandler = async () => {
    const paths: string[] | null = await window.electron.invoke(
      ELECTRON_COMMANDS.SELECT_VIDEOS,
    );
    if (!paths || paths.length === 0) return;
    setVideoBatchMode(true);
    setBatchVideoResults([]);
    setVideoDoneInfo(null);
    setVideoBatchPaths((prev) => {
      const merged = [...prev];
      for (const p of paths) {
        if (!merged.includes(p)) merged.push(p);
      }
      return merged;
    });
    if (!FEATURE_FLAGS.APP_STORE_BUILD && !rememberOutputFolder) {
      setOutputPath(getDirectoryFromPath(paths[0]));
    }
  };

  const resumeVideoSessionHandler = (sessionId: string) => {
    setVideoDoneInfo(null);
    setBatchVideoResults([]);
    setVideoProgress({
      stage: "preparing",
      stageIndex: 1,
      totalStages: 3,
      percent: 0,
      completedFrames: 0,
      totalFrames: 0,
      chunk: 0,
      totalChunks: 0,
      message: t("APP.PROGRESS.WAIT_TITLE"),
      sessionId,
    });
    setProgress(t("APP.PROGRESS.WAIT_TITLE"));
    window.electron.send(ELECTRON_COMMANDS.RESUME_VIDEO_SESSION, sessionId);
    logit("▶️ RESUME_VIDEO_SESSION: ", sessionId);
  };

  const discardVideoSessionHandler = async (sessionId: string) => {
    await window.electron.invoke(
      ELECTRON_COMMANDS.DISCARD_VIDEO_SESSION,
      sessionId,
    );
    await refreshVideoSessions();
  };

  const resetVideoHandler = () => {
    setVideoPath("");
    setVideoInfo(null);
    setVideoDoneInfo(null);
    setBatchVideoResults([]);
    setVideoProgress(null);
    setProgress("");
  };

  const selectFolderHandler = async () => {
    resetImagePaths();
    const path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FOLDER);
    if (path !== null) {
      logit("🖼 Selected Folder Path: ", path);
      setBatchFolderPath(path);
      if (!rememberOutputFolder) {
        setOutputPath(path);
      }
    } else {
      logit("🚫 Folder selection cancelled");
      setBatchFolderPath("");
      if (!rememberOutputFolder) {
        setOutputPath("");
      }
    }
  };

  const validateImagePath = (path: string) => {
    if (path.length > 0) {
      logit("🖼 imagePath: ", path);
      const extension = path.split(".").pop().toLowerCase() as ImageFormat;
      logit("🔤 Extension: ", extension);
      if (!VALID_IMAGE_FORMATS.includes(extension)) {
        toast({
          title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
          description: t("ERRORS.INVALID_IMAGE_ERROR.DESCRIPTION"),
        });
        resetImagePaths();
      }
    } else {
      resetImagePaths();
    }
  };

  // ELECTRON EVENT LISTENERS
  useEffect(() => {
    const handleErrors = (data: string) => {
      if (data.includes("Invalid GPU")) {
        toast({
          title: t("ERRORS.GPU_ERROR.TITLE"),
          description: t("ERRORS.GPU_ERROR.DESCRIPTION", { data }),
          action: (
            <div className="flex flex-col gap-2">
              <ToastAction
                altText={t("ERRORS.COPY_ERROR.TITLE")}
                onClick={() => {
                  navigator.clipboard.writeText(data);
                }}
              >
                {t("ERRORS.COPY_ERROR.TITLE")}
              </ToastAction>
              <a href="https://docs.upscayl.org/" target="_blank">
                <ToastAction altText={t("ERRORS.OPEN_DOCS_TITLE")}>
                  {t("ERRORS.OPEN_DOCS_BUTTON_TITLE")}
                </ToastAction>
              </a>
            </div>
          ),
        });
        resetImagePaths();
      } else if (
        /\b(read|write)\b/i.test(data) &&
        (data.toLowerCase().includes("error") ||
          data.toLowerCase().includes("failed") ||
          data.toLowerCase().includes("cannot"))
      ) {
        if (batchMode) return;
        toast({
          title: t("ERRORS.READ_WRITE_ERROR.TITLE"),
          description: t("ERRORS.READ_WRITE_ERROR.DESCRIPTION", { data }),
          action: (
            <div className="flex flex-col gap-2">
              <ToastAction
                altText="Copy Error"
                onClick={() => {
                  navigator.clipboard.writeText(data);
                }}
              >
                {t("ERRORS.COPY_ERROR.TITLE")}
              </ToastAction>
              <a href="https://docs.upscayl.org/" target="_blank">
                <ToastAction altText={t("ERRORS.OPEN_DOCS_TITLE")}>
                  {t("ERRORS.OPEN_DOCS_BUTTON_TITLE")}
                </ToastAction>
              </a>
            </div>
          ),
        });
        resetImagePaths();
      } else if (data.includes("tile size")) {
        toast({
          title: t("ERRORS.TILE_SIZE_ERROR.TITLE"),
          description: t("ERRORS.TILE_SIZE_ERROR.DESCRIPTION", { data }),
        });
        resetImagePaths();
      } else if (data.includes("uncaughtException")) {
        toast({
          title: t("ERRORS.EXCEPTION_ERROR.TITLE"),
          description: t("ERRORS.EXCEPTION_ERROR.DESCRIPTION"),
        });
        resetImagePaths();
      }
    };
    // LOG
    window.electron.on(ELECTRON_COMMANDS.LOG, (_, data: string) => {
      logit(`🎒 BACKEND REPORTED: `, data);
    });
    // SCALING AND CONVERTING
    window.electron.on(
      ELECTRON_COMMANDS.SCALING_AND_CONVERTING,
      (_, data: string) => {
        setProgress(t("APP.PROGRESS.PROCESSING_TITLE"));
      },
    );
    // UPSCAYL WARNING
    window.electron.on(ELECTRON_COMMANDS.UPSCAYL_WARNING, (_, data: string) => {
      toast({
        title: t("WARNING.GENERIC_WARNING.TITLE"),
        description: data,
      });
    });
    // METADATA ERROR
    window.electron.on(ELECTRON_COMMANDS.METADATA_ERROR, (_, data: string) => {
      toast({
        title: t("ERRORS.METADATA_ERROR.TITLE"),
        description: data,
      });
    });
    // UPSCAYL ERROR
    window.electron.on(ELECTRON_COMMANDS.UPSCAYL_ERROR, (_, data: string) => {
      toast({
        title: t("ERRORS.GENERIC_ERROR.TITLE"),
        description: data,
      });
      setProgress("");
      setVideoProgress(null);
      setMultiModelProgress(null);
      setUpscaylPass({ pass: 0, totalPasses: 0 });
      setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });
    });
    // STOPPED
    window.electron.on(ELECTRON_COMMANDS.STOPPED, () => {
      setProgress("");
      setVideoProgress(null);
      setMultiModelProgress(null);
      setUpscaylPass({ pass: 0, totalPasses: 0 });
      setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });
      refreshVideoSessions();
      logit("🛑 Operation stopped");
    });
    // UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.length > 0 && data.length < 10) {
          setProgress(data);
        } else if (data.includes("converting")) {
          setProgress(t("APP.PROGRESS.SCALING_CONVERTING_TITLE"));
        } else if (data.includes("Successful")) {
          setProgress(t("APP.PROGRESS.SUCCESS_TITLE"));
        }
        handleErrors(data);
        logit(`🚧 UPSCAYL_PROGRESS: `, data);
      },
    );
    // MULTI-MODEL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_PROGRESS,
      (_, data: MultiModelProgressInfo) => {
        setMultiModelProgress(data);
        setProgress(`${data.overallPercent}%`);
        logit(`🔀 MULTI_MODEL_PROGRESS: `, JSON.stringify(data));
      },
    );
    // MULTI-MODEL SINGLE RESULT (incremental)
    window.electron.on(
      ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_RESULT,
      (_, result: MultiModelResult) => {
        setMultiModelResults((prev) => {
          const exists = prev.some((r) => r.modelId === result.modelId);
          return exists
            ? prev.map((r) => (r.modelId === result.modelId ? result : r))
            : [...prev, result];
        });
        logit(`🧩 MULTI_MODEL_RESULT: `, JSON.stringify(result));
      },
    );
    // MULTI-MODEL DONE
    window.electron.on(
      ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_DONE,
      (_, payload: MultiModelDonePayload) => {
        setProgress("");
        setMultiModelProgress(null);
        setUpscaylPass({ pass: 0, totalPasses: 0 });
        setMultiModelResults(payload.results ?? []);
        setMultiModelStopped(Boolean(payload.stopped));
        const succeeded = (payload.results ?? []).filter(
          (r) => r.status === "done",
        ).length;
        if (succeeded > 0) {
          toast({
            title: t("MULTI_MODEL.COMPLETED_SUMMARY", {
              succeeded: String(succeeded),
              total: String(payload.results.length),
            }),
          });
        }
        setUserStats((prev) => ({
          ...prev,
          lastUpscaylDuration: new Date().getTime() - prev.lastUsedAt,
          averageUpscaylTime:
            (prev.averageUpscaylTime * prev.totalUpscayls +
              (new Date().getTime() - prev.lastUsedAt)) /
            (prev.totalUpscayls + 1),
        }));
        logit(`💯 MULTI_MODEL_UPSCAYL_DONE: `, JSON.stringify(payload));
      },
    );
    // VIDEO UPSCAYL PROGRESS (legacy text + structured)
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS,
      (_, data: string) => {
        setProgress(data);
        logit(`🎬 UPSCAYL_VIDEO_PROGRESS: `, data);
      },
    );
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS_INFO,
      (_, data: VideoProgressInfo) => {
        setVideoProgress(data);
        setProgress(data.message);
      },
    );
    // VIDEO UPSCAYL DONE
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE,
      (_, data: VideoDoneInfo | string) => {
        setProgress("");
        setVideoProgress(null);
        refreshVideoSessions();
        if (typeof data === "string") {
          toast({
            title: t("VIDEO_UPSCAYL.SUCCESS_TITLE"),
            description: data,
          });
        } else {
          setVideoDoneInfo(data);
          toast({
            title: t("VIDEO_UPSCAYL.SUCCESS_TITLE"),
            description: data.outputPath,
          });
        }
        setUserStats((prev) => ({
          ...prev,
          lastUpscaylDuration: new Date().getTime() - prev.lastUsedAt,
          averageUpscaylTime:
            (prev.averageUpscaylTime * prev.totalUpscayls +
              (new Date().getTime() - prev.lastUsedAt)) /
            (prev.totalUpscayls + 1),
        }));
        logit(`💯 UPSCAYL_VIDEO_DONE: `, JSON.stringify(data));
      },
    );
    // BATCH VIDEO PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.BATCH_VIDEO_PROGRESS,
      (_, data: BatchVideoProgressInfo) => {
        const prefix = `[${data.videoIndex}/${data.totalVideos}] `;
        if (data.videoProgress) {
          setVideoProgress({
            ...data.videoProgress,
            message: `${prefix}${data.videoProgress.message}`,
          });
          setProgress(`${prefix}${data.videoProgress.message}`);
        } else {
          setProgress(`${prefix}${data.currentVideoPath}`);
        }
      },
    );
    // BATCH VIDEO DONE
    window.electron.on(
      ELECTRON_COMMANDS.BATCH_VIDEO_DONE,
      (_, payload: BatchVideoDonePayload) => {
        setProgress("");
        setVideoProgress(null);
        refreshVideoSessions();
        setBatchVideoResults(payload.results ?? []);
        const succeeded = (payload.results ?? []).filter(
          (r) => r.status === "done",
        ).length;
        toast({
          title: t("VIDEO_UPSCAYL.BATCH_VIDEO_DONE_TITLE"),
          description: t("VIDEO_UPSCAYL.BATCH_VIDEO_SUMMARY", {
            succeeded: String(succeeded),
            total: String(payload.results.length),
          }),
        });
        logit(`💯 BATCH_VIDEO_DONE: `, JSON.stringify(payload));
      },
    );
    // FOLDER UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.includes("Successful")) {
          setProgress(t("APP.PROGRESS.SUCCESS_TITLE"));
        }
        if (data.length > 0 && data.length < 10) {
          setProgress(data);
        }
        handleErrors(data);
        logit(`🚧 FOLDER_UPSCAYL_PROGRESS: `, data);
      },
    );
    // DOUBLE UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.length > 0 && data.length < 10) {
          setProgress(data);
        }
        handleErrors(data);
        logit(`🚧 DOUBLE_UPSCAYL_PROGRESS: `, data);
      },
    );
    // UPSCAYL PASS INFO (single image + double upscale)
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_PASS_INFO,
      (_, data: { pass: number; totalPasses: number }) => {
        setUpscaylPass(data);
        logit(`🔁 UPSCAYL_PASS_INFO: `, JSON.stringify(data));
      },
    );
    // FOLDER UPSCAYL PROGRESS INFO (batch + double upscale)
    window.electron.on(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS_INFO,
      (
        _,
        data: {
          pass: number;
          totalPasses: number;
          completed: number;
          total: number;
        },
      ) => {
        setBatchProgress(data);
        setUpscaylPass({ pass: data.pass, totalPasses: data.totalPasses });
        logit(
          `📊 FOLDER_UPSCAYL_PROGRESS_INFO: `,
          JSON.stringify(data),
        );
      },
    );
    // UPSCAYL DONE
    window.electron.on(ELECTRON_COMMANDS.UPSCAYL_DONE, (_, data: string) => {
      setProgress("");
      setUpscaylPass({ pass: 0, totalPasses: 0 });
      setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });
      setUpscaledImagePath(data);
      setUserStats((prev) => ({
        ...prev,
        lastUpscaylDuration: new Date().getTime() - prev.lastUsedAt,
        averageUpscaylTime:
          (prev.averageUpscaylTime * prev.totalUpscayls +
            (new Date().getTime() - prev.lastUsedAt)) /
          (prev.totalUpscayls + 1),
      }));
      logit("upscaledImagePath: ", data);
      logit(`💯 UPSCAYL_DONE: `, data);
    });
    // FOLDER UPSCAYL DONE
    window.electron.on(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_DONE,
      (_, data: string) => {
        setProgress("");
        setUpscaylPass({ pass: 0, totalPasses: 0 });
        setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });
        setUpscaledBatchFolderPath(data);
        logit(`💯 FOLDER_UPSCAYL_DONE: `, data);
        setUserStats((prev) => ({
          ...prev,
          lastUpscaylDuration: new Date().getTime() - prev.lastUsedAt,
          averageUpscaylTime:
            (prev.averageUpscaylTime * prev.totalUpscayls +
              (new Date().getTime() - prev.lastUsedAt)) /
            (prev.totalUpscayls + 1),
        }));
      },
    );
    // DOUBLE UPSCAYL DONE
    window.electron.on(
      ELECTRON_COMMANDS.DOUBLE_UPSCAYL_DONE,
      (_, data: string) => {
        setProgress("");
        setTimeout(() => setUpscaledImagePath(data), 500);
        setUpscaylPass({ pass: 0, totalPasses: 0 });
        setBatchProgress({ pass: 0, totalPasses: 0, completed: 0, total: 0 });
        logit(`💯 DOUBLE_UPSCAYL_DONE: `, data);
        setUserStats((prev) => ({
          ...prev,
          lastUpscaylDuration: new Date().getTime() - prev.lastUsedAt,
          averageUpscaylTime:
            (prev.averageUpscaylTime * prev.totalUpscayls +
              (new Date().getTime() - prev.lastUsedAt)) /
            (prev.totalUpscayls + 1),
        }));
      },
    );
    // CUSTOM FOLDER LISTENER
    window.electron.on(
      ELECTRON_COMMANDS.CUSTOM_MODEL_FILES_LIST,
      (_, data: string[]) => {
        logit(`📜 CUSTOM_MODEL_FILES_LIST: `, data);
        console.log("🚀 => data:", data);
        setModelIds(data);
      },
    );
  }, []);

  // LOADING STATE
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // SYSTEM INFO
  useEffect(() => {
    if (systemInfo) logit("💻 System Info:", JSON.stringify(systemInfo));
  }, [systemInfo]);

  // HANDLERS
  const resetImagePaths = () => {
    logit("🔄 Resetting image paths");
    setDimensions({
      width: null,
      height: null,
    });
    setProgress("");
    setMultiModelProgress(null);
    setMultiModelResults([]);
    setMultiModelStopped(false);
    setImagePath("");
    setUpscaledImagePath("");
    setBatchFolderPath("");
    setUpscaledBatchFolderPath("");
  };

  if (isLoading) {
    return (
      <UpscaylSVGLogo className="absolute left-1/2 top-1/2 w-36 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
    );
  }

  return (
    <div
      className="flex h-screen w-screen flex-row overflow-hidden bg-base-300"
      onPaste={(e) => console.log(e)}
    >
      <Sidebar
        imagePath={imagePath}
        dimensions={dimensions}
        setUpscaledImagePath={setUpscaledImagePath}
        setMultiModelResults={setMultiModelResults}
        setMultiModelStopped={setMultiModelStopped}
        batchFolderPath={batchFolderPath}
        setUpscaledBatchFolderPath={setUpscaledBatchFolderPath}
        selectImageHandler={selectImageHandler}
        selectFolderHandler={selectFolderHandler}
        videoPath={videoPath}
        videoInfo={videoInfo}
        ffmpegStatus={ffmpegStatus}
        videoSessions={videoSessions}
        setVideoDoneInfo={setVideoDoneInfo}
        setBatchVideoResults={setBatchVideoResults}
        selectVideoHandler={selectVideoHandler}
        selectMultipleVideosHandler={selectMultipleVideosHandler}
        resumeVideoSessionHandler={resumeVideoSessionHandler}
        discardVideoSessionHandler={discardVideoSessionHandler}
      />
      <MainContent
        imagePath={imagePath}
        resetImagePaths={resetImagePaths}
        upscaledBatchFolderPath={upscaledBatchFolderPath}
        setImagePath={setImagePath}
        validateImagePath={validateImagePath}
        selectFolderHandler={selectFolderHandler}
        selectImageHandler={selectImageHandler}
        batchFolderPath={batchFolderPath}
        upscaledImagePath={upscaledImagePath}
        multiModelResults={multiModelResults}
        multiModelStopped={multiModelStopped}
        setDimensions={setDimensions}
        videoPath={videoPath}
        videoInfo={videoInfo}
        videoDoneInfo={videoDoneInfo}
        batchVideoResults={batchVideoResults}
        ffmpegStatus={ffmpegStatus}
        selectVideoHandler={selectVideoHandler}
        loadVideoPath={loadVideoPath}
        resetVideoHandler={resetVideoHandler}
      />
      <OnboardingDialog />
    </div>
  );
};

export default Home;
