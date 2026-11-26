"use client";

import React from "react";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import { QueueJob, QueueSnapshot } from "@common/job-queue-helpers";
import useTranslation from "../hooks/use-translation";

type JobQueueDrawerProps = {
  open: boolean;
  onClose: () => void;
  snapshot: QueueSnapshot;
  onRefresh: (snap: QueueSnapshot) => void;
};

const statusBadge = (status: QueueJob["status"]): string => {
  switch (status) {
    case "running":
      return "badge-primary";
    case "done":
      return "badge-success";
    case "error":
      return "badge-error";
    case "cancelled":
      return "badge-warning";
    default:
      return "badge-neutral";
  }
};

const JobQueueDrawer = ({
  open,
  onClose,
  snapshot,
  onRefresh,
}: JobQueueDrawerProps) => {
  const t = useTranslation();

  if (!open) return null;

  const statusLabel = (status: QueueJob["status"]) => {
    switch (status) {
      case "running":
        return t("JOB_QUEUE.STATUS_RUNNING");
      case "done":
        return t("JOB_QUEUE.STATUS_DONE");
      case "error":
        return t("JOB_QUEUE.STATUS_ERROR");
      case "cancelled":
        return t("JOB_QUEUE.STATUS_CANCELLED");
      default:
        return t("JOB_QUEUE.STATUS_PENDING");
    }
  };

  const invokeQueue = async (cmd: string, arg?: any) => {
    const snap: QueueSnapshot = await window.electron.invoke(cmd, arg);
    if (snap) onRefresh(snap);
  };

  const hasPending = snapshot.jobs.some((j) => j.status === "pending");
  const hasFinished = snapshot.jobs.some(
    (j) =>
      j.status === "done" || j.status === "error" || j.status === "cancelled",
  );

  return (
    <div
      className="fixed inset-0 z-[190] flex justify-end bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-base-content/15 bg-base-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-content/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">📋 {t("JOB_QUEUE.TITLE")}</span>
            <span className="badge badge-neutral badge-sm">
              {snapshot.jobs.length}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-base-content/10 bg-base-200/40 px-4 py-2.5">
          {!snapshot.isRunning || snapshot.isPaused ? (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              disabled={!hasPending}
              onClick={() => invokeQueue(ELECTRON_COMMANDS.QUEUE_START)}
            >
              ▶ {t("JOB_QUEUE.START_BUTTON")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-warning btn-xs"
              onClick={() => invokeQueue(ELECTRON_COMMANDS.QUEUE_PAUSE)}
            >
              ⏸ {t("JOB_QUEUE.PAUSE_BUTTON")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={!hasFinished}
            onClick={() => invokeQueue(ELECTRON_COMMANDS.QUEUE_CLEAR)}
          >
            🧹 {t("JOB_QUEUE.CLEAR_BUTTON")}
          </button>
        </div>

        {/* Jobs List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {snapshot.jobs.length === 0 ? (
            <p className="py-12 text-center text-xs text-base-content/60">
              {t("JOB_QUEUE.EMPTY_STATE")}
            </p>
          ) : (
            snapshot.jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-1.5 rounded-box border border-base-content/10 bg-base-200/50 p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="badge badge-outline badge-xs uppercase">
                        {job.type}
                      </span>
                      <span className={`badge badge-xs ${statusBadge(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-semibold" title={job.label}>
                      {job.label}
                    </p>
                    {job.detail && (
                      <p className="truncate text-[11px] text-base-content/65">
                        {job.detail}
                      </p>
                    )}
                    {job.error && (
                      <p className="mt-0.5 text-[11px] text-error">{job.error}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {job.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs px-1"
                          onClick={() =>
                            invokeQueue(ELECTRON_COMMANDS.QUEUE_REORDER, {
                              jobId: job.id,
                              direction: "up",
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs px-1"
                          onClick={() =>
                            invokeQueue(ELECTRON_COMMANDS.QUEUE_REORDER, {
                              jobId: job.id,
                              direction: "down",
                            })
                          }
                        >
                          ↓
                        </button>
                      </>
                    )}
                    {job.status === "done" && job.outputPath && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs px-1.5"
                        title={t("JOB_QUEUE.SHOW_OUTPUT")}
                        onClick={() =>
                          window.electron.send(
                            ELECTRON_COMMANDS.OPEN_FILE_LOCATION,
                            job.outputPath,
                          )
                        }
                      >
                        📂
                      </button>
                    )}
                    {job.status !== "running" && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs px-1 text-error"
                        onClick={() =>
                          invokeQueue(ELECTRON_COMMANDS.QUEUE_REMOVE, job.id)
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {job.status === "running" && (
                  <div className="flex items-center gap-2">
                    <progress
                      className="progress progress-primary flex-1"
                      value={job.progress}
                      max={100}
                    />
                    <span className="font-mono text-[10px]">{job.progress}%</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default JobQueueDrawer;
