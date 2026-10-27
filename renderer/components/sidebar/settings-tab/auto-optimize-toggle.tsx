import { translationAtom } from "@/atoms/translations-atom";
import {
  autoOptimizeAtom,
  compressionAtom,
  doubleUpscaylAtom,
  scaleAtom,
  selectedModelIdAtom,
  threadsAtom,
  tileSizeAtom,
  ttaModeAtom,
} from "@/atoms/user-settings-atom";
import { resolveModelSettings } from "@common/model-profiles";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

/**
 * When enabled, picking a built-in model applies that model's recommended
 * settings (scale, tile size, TTA, compression, threads). Turning the switch on
 * applies the profile of the currently selected model right away. Custom models
 * are never touched because they have no profile.
 */
const AutoOptimizeToggle = () => {
  const [autoOptimize, setAutoOptimize] = useAtom(autoOptimizeAtom);
  const t = useAtomValue(translationAtom);

  const selectedModelId = useAtomValue(selectedModelIdAtom);
  const currentScale = useAtomValue(scaleAtom);
  const currentTileSize = useAtomValue(tileSizeAtom);
  const currentTTAMode = useAtomValue(ttaModeAtom);
  const currentCompression = useAtomValue(compressionAtom);
  const currentDoubleUpscayl = useAtomValue(doubleUpscaylAtom);
  const currentThreads = useAtomValue(threadsAtom);

  const setScale = useSetAtom(scaleAtom);
  const setTileSize = useSetAtom(tileSizeAtom);
  const setTTAMode = useSetAtom(ttaModeAtom);
  const setCompression = useSetAtom(compressionAtom);
  const setDoubleUpscayl = useSetAtom(doubleUpscaylAtom);
  const setThreads = useSetAtom(threadsAtom);

  const handleToggle = () => {
    const nextEnabled = !autoOptimize;
    setAutoOptimize(nextEnabled);

    if (!nextEnabled) return;

    const next = resolveModelSettings(selectedModelId, true, {
      scale: currentScale,
      tileSize: currentTileSize ?? 0,
      ttaMode: currentTTAMode,
      compression: currentCompression,
      doubleUpscayl: currentDoubleUpscayl,
      threads: currentThreads,
    });

    setScale(next.scale);
    setTileSize(next.tileSize);
    setTTAMode(next.ttaMode);
    setCompression(next.compression);
    setDoubleUpscayl(next.doubleUpscayl);
    setThreads(next.threads);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("SETTINGS.AUTO_OPTIMIZE.TITLE")}</p>
      <p className="text-xs text-base-content/80">
        {t("SETTINGS.AUTO_OPTIMIZE.DESCRIPTION")}
      </p>
      <input
        type="checkbox"
        className="toggle"
        checked={autoOptimize}
        onChange={handleToggle}
      />
    </div>
  );
};

export default AutoOptimizeToggle;
