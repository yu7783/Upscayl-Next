import { translationAtom } from "@/atoms/translations-atom";
import { threadsAtom } from "@/atoms/user-settings-atom";
import { useAtom, useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";

/**
 * upscayl-bin accepts a "load:proc:save" split for its worker threads (-j).
 * Leaving the field empty lets the app pick the split automatically, which is
 * the right choice for almost everyone. Power users can pin an exact split
 * here, for example "2:2:2" on a 4-thread CPU.
 */
const THREADS_PATTERN = /^\d+:\d+:\d+$/;

export function InputThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);
  const t = useAtomValue(translationAtom);
  const [value, setValue] = useState(threads ?? "");
  const [invalid, setInvalid] = useState(false);

  // Keep the field in sync when auto-optimization (or a reset) changes the
  // stored value while the settings tab is open.
  useEffect(() => {
    setValue(threads ?? "");
    setInvalid(false);
  }, [threads]);

  const commit = (next: string) => {
    setValue(next);
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      setInvalid(false);
      setThreads(null);
      return;
    }
    if (!THREADS_PATTERN.test(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setThreads(trimmed);
  };

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("SETTINGS.THREADS.TITLE")}</p>
        <p className="text-xs text-base-content/80">
          {t("SETTINGS.THREADS.DESCRIPTION")}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => commit(e.currentTarget.value)}
          placeholder="Auto (e.g. 2:2:2)"
          className="input input-primary w-40"
        />
        {value.length > 0 && (
          <button className="btn btn-sm btn-outline" onClick={() => commit("")}>
            {t("SETTINGS.THREADS.RESET")}
          </button>
        )}
      </div>
      {invalid && (
        <p className="mt-1 text-xs text-error">
          {t("SETTINGS.THREADS.INVALID")}
        </p>
      )}
    </div>
  );
}

export default InputThreads;
