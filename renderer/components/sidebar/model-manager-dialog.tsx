"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import { customModelsPathAtom } from "@/atoms/user-settings-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import {
  CatalogModelStatus,
  filterModelCatalog,
  getCatalogTags,
} from "@common/model-catalog";
import {
  ModelManagerListResponse,
  ModelManagerProgressInfo,
} from "@common/types/types";
import { useToast } from "@/components/ui/use-toast";
import useTranslation from "../hooks/use-translation";

type ModelManagerDialogProps = {
  open: boolean;
  onClose: () => void;
};

const ModelManagerDialog = ({ open, onClose }: ModelManagerDialogProps) => {
  const t = useTranslation();
  const { toast } = useToast();
  const setCustomModelsPath = useSetAtom(customModelsPathAtom);

  const [modelsDir, setModelsDir] = useState<string>("");
  const [entries, setEntries] = useState<CatalogModelStatus[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installProgress, setInstallProgress] =
    useState<ModelManagerProgressInfo | null>(null);

  const refreshCatalog = async () => {
    try {
      const res: ModelManagerListResponse = await window.electron.invoke(
        ELECTRON_COMMANDS.MODEL_MANAGER_LIST,
      );
      setModelsDir(res.modelsDir);
      setEntries(res.entries);
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    refreshCatalog();
  }, [open]);

  useEffect(() => {
    window.electron.on(
      ELECTRON_COMMANDS.MODEL_MANAGER_PROGRESS,
      (_, info: ModelManagerProgressInfo) => {
        setInstallProgress(info);
      },
    );
  }, []);

  const tags = useMemo(() => getCatalogTags(entries), [entries]);
  const filtered = useMemo(
    () => filterModelCatalog(entries, { query, tag: selectedTag }),
    [entries, query, selectedTag],
  );

  const handleInstall = async (entry: CatalogModelStatus) => {
    if (installingId) return;
    setInstallingId(entry.id);
    setInstallProgress({
      modelId: entry.id,
      fileIndex: 1,
      totalFiles: entry.files.length,
      currentFile: entry.files[0]?.filename ?? "",
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
    });
    try {
      const res: ModelManagerListResponse = await window.electron.invoke(
        ELECTRON_COMMANDS.MODEL_MANAGER_INSTALL,
        entry.id,
      );
      setModelsDir(res.modelsDir);
      setEntries(res.entries);
      setCustomModelsPath(res.modelsDir);
      toast({
        description: t("MODEL_MANAGER.INSTALL_SUCCESS", { name: entry.name }),
      });
    } catch (err: any) {
      toast({
        description: t("MODEL_MANAGER.INSTALL_ERROR", {
          name: entry.name,
          error: err?.message ?? String(err),
        }),
      });
    } finally {
      setInstallingId(null);
      setInstallProgress(null);
    }
  };

  const handleDelete = async (entry: CatalogModelStatus) => {
    if (installingId) return;
    try {
      const res: ModelManagerListResponse = await window.electron.invoke(
        ELECTRON_COMMANDS.MODEL_MANAGER_DELETE,
        entry.id,
      );
      setModelsDir(res.modelsDir);
      setEntries(res.entries);
      toast({
        description: t("MODEL_MANAGER.DELETE_SUCCESS", { name: entry.name }),
      });
    } catch (err: any) {
      toast({ description: err?.message ?? String(err) });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-box border border-base-content/15 bg-base-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-base-content/10 px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold">
              📦 {t("MODEL_MANAGER.TITLE")}
            </h2>
            <p className="text-xs text-base-content/70">
              {t("MODEL_MANAGER.DESCRIPTION")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {modelsDir && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() =>
                  window.electron.send(ELECTRON_COMMANDS.OPEN_FOLDER, modelsDir)
                }
              >
                📂 {t("MODEL_MANAGER.OPEN_FOLDER")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-circle btn-ghost btn-xs"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search & Tag Filters */}
        <div className="flex flex-col gap-2 border-b border-base-content/10 bg-base-200/40 px-5 py-3">
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder={t("MODEL_MANAGER.SEARCH_PLACEHOLDER")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`badge cursor-pointer px-2.5 py-2 text-xs ${
                selectedTag === "" ? "badge-primary" : "badge-ghost"
              }`}
              onClick={() => setSelectedTag("")}
            >
              {t("MODEL_MANAGER.ALL_TAGS")}
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`badge cursor-pointer px-2.5 py-2 text-xs ${
                  selectedTag === tag ? "badge-primary" : "badge-ghost"
                }`}
                onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog List */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-base-content/60">
              {t("MODEL_MANAGER.EMPTY_RESULTS")}
            </p>
          ) : (
            filtered.map((entry) => {
              const isThisInstalling = installingId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-box border border-base-content/10 bg-base-200/50 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{entry.name}</span>
                        <span className="badge badge-success badge-xs uppercase">
                          {entry.engine}
                        </span>
                        <span className="badge badge-neutral badge-xs">
                          {entry.scale}x · ~{entry.sizeMB}MB
                        </span>
                        <span className="badge badge-ghost badge-xs">
                          {entry.license}
                        </span>
                        {entry.installed && (
                          <span className="badge badge-primary badge-xs">
                            ✓ {t("MODEL_MANAGER.INSTALLED_BADGE")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-base-content/75">
                        {entry.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-base-300 px-1.5 py-0.5 text-[10px] text-base-content/70"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {entry.installed ? (
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          disabled={Boolean(installingId)}
                          onClick={() => handleDelete(entry)}
                        >
                          {t("MODEL_MANAGER.DELETE_BUTTON")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          disabled={Boolean(installingId)}
                          onClick={() => handleInstall(entry)}
                        >
                          {isThisInstalling
                            ? t("MODEL_MANAGER.INSTALLING_BUTTON", {
                                percent: String(installProgress?.percent ?? 0),
                              })
                            : `⬇ ${t("MODEL_MANAGER.INSTALL_BUTTON")}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {isThisInstalling && installProgress && (
                    <div className="flex flex-col gap-1">
                      <progress
                        className="progress progress-primary w-full"
                        value={installProgress.percent}
                        max={100}
                      />
                      <span className="text-[10px] text-base-content/60">
                        {installProgress.currentFile} ({installProgress.fileIndex}/
                        {installProgress.totalFiles}) · {installProgress.percent}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelManagerDialog;
