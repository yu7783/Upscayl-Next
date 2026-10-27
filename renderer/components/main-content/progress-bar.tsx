import React, { useEffect, useMemo, useRef, useState } from "react";
import UpscaylSVGLogo from "@/components/icons/upscayl-logo-svg";
import { useAtomValue } from "jotai";
import { translationAtom } from "@/atoms/translations-atom";
import { ELECTRON_COMMANDS } from "@common/electron-commands";
import useLogger from "../hooks/use-logger";

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);

const formatDuration = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
};

function ProgressBar({
  progress,
  batchMode,
  upscaylPass,
  batchProgress,
}: {
  progress: string;
  batchMode: boolean;
  upscaylPass: { pass: number; totalPasses: number };
  batchProgress: {
    pass: number;
    totalPasses: number;
    completed: number;
    total: number;
  };
}) {
  const t = useAtomValue(translationAtom);
  const logit = useLogger();

  const stopHandler = () => {
    window.electron.send(ELECTRON_COMMANDS.STOP);
    logit("🛑 Stopping Upscayl-Next");
  };

  // Track when this progress overlay appeared so we can show elapsed time and
  // estimate the remaining time without changing the existing visual style.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const showBatchProgress =
    batchMode && batchProgress.total > 0 && batchProgress.pass > 0;

  // The upscayl binary reports short percentage strings (e.g. "42.15%").
  const loggedPercent = useMemo(() => {
    const match = progress.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    return clampPercent(parseFloat(match[1].replace(",", ".")));
  }, [progress]);

  const activePass =
    upscaylPass.pass > 0 ? upscaylPass.pass : batchProgress.pass;
  const activeTotalPasses =
    upscaylPass.totalPasses > 0
      ? upscaylPass.totalPasses
      : batchProgress.totalPasses;

  const overallFraction = useMemo(() => {
    if (showBatchProgress) {
      const completed = Math.min(batchProgress.completed, batchProgress.total);
      return (
        ((batchProgress.pass - 1) + completed / batchProgress.total) /
        Math.max(batchProgress.totalPasses, 1)
      );
    }
    if (loggedPercent !== null) {
      return (
        ((Math.max(activePass, 1) - 1) + loggedPercent / 100) /
        Math.max(activeTotalPasses, 1)
      );
    }
    return null;
  }, [
    showBatchProgress,
    batchProgress,
    loggedPercent,
    activePass,
    activeTotalPasses,
  ]);

  const overallPercent =
    overallFraction !== null
      ? Math.round(clampPercent(overallFraction * 100))
      : null;

  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);

  // ETA estimation: a single "elapsed / progress" ratio reacts badly to a slow
  // first image and to pauses between files. Keep a short history and fit a
  // line through it (least squares) to estimate the *current* throughput. For
  // single-pass batch jobs we also use the measured average time per finished
  // file. The two estimates are averaged and smoothed so the UI stays stable.
  const historyRef = useRef<{ t: number; f: number }[]>([]);
  const etaRef = useRef<number | null>(null);
  const firstCompletionAtRef = useRef<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const passKeyRef = useRef(activePass);

  // A new pass starts from a fraction that is lower than the end of the
  // previous pass, so mixing samples would produce a negative slope. Reset the
  // estimator whenever the pass number changes.
  useEffect(() => {
    if (passKeyRef.current === activePass) return;
    passKeyRef.current = activePass;
    historyRef.current = [];
    etaRef.current = null;
    firstCompletionAtRef.current = null;
    setEtaSeconds(null);
  }, [activePass]);

  useEffect(() => {
    if (overallFraction === null) {
      historyRef.current = [];
      etaRef.current = null;
      setEtaSeconds(null);
      return;
    }

    const t = Date.now();
    const f = Math.min(Math.max(overallFraction, 0), 1);
    const history = historyRef.current;
    const last = history[history.length - 1];
    // Sample at most ~4 times per second, but also once every 5 seconds during
    // a stall so a long pause is reflected in the estimate. Capping the sample
    // rate keeps the regression cheap when the binary emits progress rapidly.
    const shouldPush =
      !last ||
      ((t - last.t >= 250 || t - last.t >= 5000) &&
        Math.abs(f - last.f) > 0.0001) ||
      t - last.t >= 5000;
    if (shouldPush) history.push({ t, f });

    // Only the last two minutes matter; older samples would dominate. Keep a
    // hard cap as well so a very fast binary cannot grow the array unbounded.
    while (history.length > 2 && t - history[0].t > 120000) history.shift();
    while (history.length > 120) history.shift();

    let regressionEta: number | null = null;
    if (history.length >= 2 && f > 0.005) {
      const first = history[0];
      const span = t - first.t;
      const spanF = f - first.f;
      if (span >= 2000 && spanF > 0.0005) {
        const meanT =
          history.reduce((sum, item) => sum + item.t, 0) / history.length;
        const meanF =
          history.reduce((sum, item) => sum + item.f, 0) / history.length;
        let numerator = 0;
        let denominator = 0;
        for (const item of history) {
          numerator += (item.t - meanT) * (item.f - meanF);
          denominator += (item.t - meanT) ** 2;
        }
        const slope = denominator > 0 ? numerator / denominator : 0;
        // slope is "fraction per millisecond"
        if (slope > 1e-9) regressionEta = (1 - f) / slope / 1000;
      }
    }

    let fileEta: number | null = null;
    if (
      showBatchProgress &&
      activeTotalPasses <= 1 &&
      batchProgress.total > 0
    ) {
      if (
        batchProgress.completed >= 1 &&
        firstCompletionAtRef.current === null
      ) {
        firstCompletionAtRef.current = t;
      }
      if (firstCompletionAtRef.current !== null && batchProgress.completed >= 2) {
        const remaining = Math.max(
          batchProgress.total - batchProgress.completed,
          0,
        );
        // Measure the average time per *finished* file from the first
        // completion instead of from the overlay start. This ignores model
        // loading and warm-up, which are one-off costs and would otherwise
        // inflate the estimate for small batches.
        const secondsSinceFirstCompletion =
          (t - firstCompletionAtRef.current) / 1000;
        const averagePerFile =
          secondsSinceFirstCompletion / (batchProgress.completed - 1);
        fileEta = averagePerFile * remaining;
      }
    }

    let estimate = regressionEta;
    if (estimate === null) estimate = fileEta;
    else if (fileEta !== null) estimate = estimate * 0.5 + fileEta * 0.5;

    if (estimate !== null) {
      estimate = Math.min(Math.max(estimate, 0), 24 * 60 * 60);
      estimate =
        etaRef.current === null
          ? estimate
          : etaRef.current * 0.6 + estimate * 0.4;
    }

    etaRef.current = estimate;
    setEtaSeconds(estimate);
  }, [
    overallFraction,
    now,
    elapsedSeconds,
    showBatchProgress,
    activeTotalPasses,
    activePass,
    batchProgress.total,
    batchProgress.completed,
  ]);

  const remainingSeconds = etaSeconds;

  const remainingFiles = showBatchProgress
    ? Math.max(
        batchProgress.total - Math.min(batchProgress.completed, batchProgress.total),
        0,
      )
    : null;

  const passLabel =
    upscaylPass.totalPasses > 0 && upscaylPass.pass > 0
      ? t("APP.PROGRESS_BAR.PASS_TITLE", {
          pass: String(upscaylPass.pass),
          totalPasses: String(upscaylPass.totalPasses),
        })
      : "";

  return (
    <div className="absolute z-50 flex h-full w-full flex-col items-center justify-center bg-base-300/50 backdrop-blur-lg">
      <div className="flex w-80 flex-col items-center gap-2 rounded-btn bg-base-100/50 p-4 backdrop-blur-lg">
        <UpscaylSVGLogo className="spinner h-12 w-12" />

        {passLabel && (
          <p className="badge badge-primary badge-sm">{passLabel}</p>
        )}

        <div className="flex w-full flex-col items-center gap-1">
          {overallPercent !== null ? (
            <progress
              className="progress progress-primary w-full"
              value={overallPercent}
              max={100}
            />
          ) : (
            <progress className="progress progress-primary w-full" />
          )}

          <div className="flex w-full items-center justify-between gap-2 text-xs font-bold">
            <span>{overallPercent !== null ? `${overallPercent}%` : "--%"}</span>
            {showBatchProgress && (
              <span className="text-right">
                {t("APP.PROGRESS_BAR.BATCH_COUNT_TITLE", {
                  completed: String(
                    Math.min(batchProgress.completed, batchProgress.total),
                  ),
                  total: String(batchProgress.total),
                  percent: String(overallPercent ?? 0),
                })}
              </span>
            )}
          </div>

          {remainingFiles !== null && (
            <p className="text-xs font-medium text-base-content/70">
              {t("APP.PROGRESS_BAR.REMAINING_FILES_TITLE", {
                count: String(remainingFiles),
              })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
          <span className="badge badge-ghost badge-sm">
            {t("APP.PROGRESS_BAR.ELAPSED_TITLE", {
              time: formatDuration(elapsedSeconds),
            })}
          </span>
          <span className="badge badge-ghost badge-sm">
            {remainingSeconds !== null
              ? t("APP.PROGRESS_BAR.REMAINING_TITLE", {
                  time: `≈ ${formatDuration(remainingSeconds)}`,
                })
              : t("APP.PROGRESS_BAR.ESTIMATING_TITLE")}
          </span>
        </div>

        {batchMode && !showBatchProgress && (
          <p className="rounded-full px-2 font-bold">
            {t("APP.PROGRESS_BAR.BATCH_UPSCAYL_IN_PROGRESS_TITLE")}
          </p>
        )}

        <div className="flex flex-col items-center gap-1">
          <p className="max-h-24 max-w-80 overflow-y-auto whitespace-pre-wrap text-center text-sm font-bold">
            {progress}
          </p>

          <p className="animate-pulse rounded-full px-2 pb-3 text-xs font-medium text-neutral-content/50">
            {t("APP.PROGRESS_BAR.IN_PROGRESS_TITLE")}
          </p>
        </div>

        <button onClick={stopHandler} className="btn btn-outline">
          {t("APP.PROGRESS_BAR.STOP_BUTTON_TITLE")}
        </button>
      </div>
    </div>
  );
}

export default ProgressBar;
