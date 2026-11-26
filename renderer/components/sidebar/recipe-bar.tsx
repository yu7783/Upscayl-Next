"use client";

import React, { useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import {
  blendAlphaAtom,
  blendSecondModelAtom,
  compressionAtom,
  customRecipesAtom,
  customWidthAtom,
  doubleUpscaylAtom,
  faceRestoreAtom,
  faceRestoreStrengthAtom,
  multiModelModeAtom,
  saveImageAsAtom,
  scaleAtom,
  selectedCompareModelsAtom,
  selectedModelIdAtom,
  threadsAtom,
  tileSizeAtom,
  ttaModeAtom,
  useCustomWidthAtom,
  videoCodecAtom,
  videoContainerAtom,
  videoDeduplicateFramesAtom,
  videoIntermediateFormatAtom,
  videoInterpolationAtom,
  videoKeepAudioAtom,
  videoQualityAtom,
  videoResumableAtom,
  videoUseHwEncodeAtom,
} from "@/atoms/user-settings-atom";
import {
  BUILTIN_RECIPES,
  parseRecipesJson,
  serializeRecipes,
  UpscaylRecipe,
} from "@common/recipe-helpers";
import { useToast } from "@/components/ui/use-toast";
import useTranslation from "../hooks/use-translation";

const RecipeBar = () => {
  const t = useTranslation();
  const { toast } = useToast();

  const [customRecipes, setCustomRecipes] = useAtom(customRecipesAtom);
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom);
  const [multiModelMode, setMultiModelMode] = useAtom(multiModelModeAtom);
  const [selectedCompareModels, setSelectedCompareModels] = useAtom(
    selectedCompareModelsAtom,
  );
  const [scale, setScale] = useAtom(scaleAtom);
  const [doubleUpscayl, setDoubleUpscayl] = useAtom(doubleUpscaylAtom);
  const [saveImageAs, setSaveImageAs] = useAtom(saveImageAsAtom);
  const [compression, setCompression] = useAtom(compressionAtom);
  const [tileSize, setTileSize] = useAtom(tileSizeAtom);
  const [ttaMode, setTtaMode] = useAtom(ttaModeAtom);
  const [threads, setThreads] = useAtom(threadsAtom);
  const [useCustomWidth, setUseCustomWidth] = useAtom(useCustomWidthAtom);
  const [customWidth, setCustomWidth] = useAtom(customWidthAtom);
  const [videoCodec, setVideoCodec] = useAtom(videoCodecAtom);
  const [videoContainer, setVideoContainer] = useAtom(videoContainerAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [videoKeepAudio, setVideoKeepAudio] = useAtom(videoKeepAudioAtom);
  const [videoIntermediateFormat, setVideoIntermediateFormat] = useAtom(
    videoIntermediateFormatAtom,
  );
  const [videoUseHwEncode, setVideoUseHwEncode] = useAtom(videoUseHwEncodeAtom);
  const [videoDeduplicateFrames, setVideoDeduplicateFrames] = useAtom(
    videoDeduplicateFramesAtom,
  );
  const [videoInterpolation, setVideoInterpolation] = useAtom(
    videoInterpolationAtom,
  );
  const [videoResumable, setVideoResumable] = useAtom(videoResumableAtom);
  const [blendAlpha, setBlendAlpha] = useAtom(blendAlphaAtom);
  const [blendSecondModel, setBlendSecondModel] = useAtom(blendSecondModelAtom);
  const [faceRestore, setFaceRestore] = useAtom(faceRestoreAtom);
  const [faceRestoreStrength, setFaceRestoreStrength] = useAtom(
    faceRestoreStrengthAtom,
  );

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [savingName, setSavingName] = useState<string>("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allRecipes = useMemo(
    () => [...BUILTIN_RECIPES, ...customRecipes],
    [customRecipes],
  );

  const selectedRecipe = useMemo(
    () => allRecipes.find((r) => r.id === selectedRecipeId) ?? null,
    [allRecipes, selectedRecipeId],
  );

  const applyRecipe = (recipe: UpscaylRecipe) => {
    const s = recipe.settings;
    setSelectedModelId(s.model);
    setMultiModelMode(s.multiModelMode);
    if (s.compareModels.length > 0) {
      setSelectedCompareModels(s.compareModels);
    }
    setScale(s.scale);
    setDoubleUpscayl(s.doubleUpscayl);
    setSaveImageAs(s.saveImageAs);
    setCompression(s.compression);
    setTileSize(s.tileSize);
    setTtaMode(s.ttaMode);
    setThreads(s.threads);
    setUseCustomWidth(s.useCustomWidth);
    setCustomWidth(s.customWidth);
    setVideoCodec(s.videoCodec);
    setVideoContainer(s.videoContainer);
    setVideoQuality(s.videoQuality);
    setVideoKeepAudio(s.videoKeepAudio);
    setVideoIntermediateFormat(s.videoIntermediateFormat);
    setVideoUseHwEncode(s.videoUseHwEncode);
    setVideoDeduplicateFrames(s.videoDeduplicateFrames);
    setVideoInterpolation(s.videoInterpolation);
    setVideoResumable(s.videoResumable);
    setBlendAlpha(s.blendAlpha);
    setBlendSecondModel(s.blendSecondModel);
    setFaceRestore(s.faceRestore);
    setFaceRestoreStrength(s.faceRestoreStrength);
    toast({
      description: t("RECIPES.APPLIED_TOAST", { name: recipe.name }),
    });
  };

  const handleSaveRecipe = () => {
    const trimmed = savingName.trim();
    if (!trimmed) return;
    const newRecipe: UpscaylRecipe = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      builtin: false,
      createdAt: Date.now(),
      settings: {
        model: String(selectedModelId),
        multiModelMode,
        compareModels: selectedCompareModels,
        scale,
        doubleUpscayl,
        saveImageAs,
        compression,
        tileSize,
        ttaMode,
        threads,
        useCustomWidth,
        customWidth,
        videoCodec,
        videoContainer,
        videoQuality,
        videoKeepAudio,
        videoIntermediateFormat,
        videoUseHwEncode,
        videoDeduplicateFrames,
        videoInterpolation,
        videoResumable,
        blendAlpha,
        blendSecondModel,
        faceRestore,
        faceRestoreStrength,
      },
    };
    setCustomRecipes((prev) => [newRecipe, ...prev]);
    setSelectedRecipeId(newRecipe.id);
    setSavingName("");
    setShowSaveInput(false);
    toast({
      description: t("RECIPES.SAVED_TOAST", { name: newRecipe.name }),
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedRecipe || selectedRecipe.builtin) return;
    setCustomRecipes((prev) => prev.filter((r) => r.id !== selectedRecipe.id));
    setSelectedRecipeId("");
    toast({
      description: t("RECIPES.DELETED_TOAST", { name: selectedRecipe.name }),
    });
  };

  const handleExport = () => {
    const json = serializeRecipes(
      customRecipes.length > 0 ? customRecipes : BUILTIN_RECIPES,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "upscayl-next-recipes.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseRecipesJson(text);
      if (imported.length === 0) {
        throw new Error("empty");
      }
      setCustomRecipes((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const deduped = imported.map((r) =>
          existingIds.has(r.id) ? { ...r, id: `${r.id}-${Date.now()}` } : r,
        );
        return [...deduped, ...prev];
      });
      toast({
        description: t("RECIPES.IMPORTED_TOAST", {
          count: String(imported.length),
        }),
      });
    } catch {
      toast({ description: t("RECIPES.IMPORT_ERROR") });
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-btn border border-base-content/10 bg-base-200/70 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-base-content/80">
          🧪 {t("RECIPES.TITLE")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-xs px-1.5"
            onClick={() => setShowSaveInput((v) => !v)}
          >
            {t("RECIPES.SAVE_BUTTON")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs px-1.5"
            onClick={handleExport}
          >
            {t("RECIPES.EXPORT_BUTTON")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs px-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("RECIPES.IMPORT_BUTTON")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          className="select select-bordered select-xs flex-1"
          value={selectedRecipeId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedRecipeId(id);
            const found = allRecipes.find((r) => r.id === id);
            if (found) applyRecipe(found);
          }}
        >
          <option value="">{t("RECIPES.SELECT_PLACEHOLDER")}</option>
          <optgroup label={t("RECIPES.BUILTIN_GROUP")}>
            {BUILTIN_RECIPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </optgroup>
          {customRecipes.length > 0 && (
            <optgroup label={t("RECIPES.CUSTOM_GROUP")}>
              {customRecipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {selectedRecipe && !selectedRecipe.builtin && (
          <button
            type="button"
            className="btn btn-error btn-outline btn-xs"
            onClick={handleDeleteSelected}
          >
            {t("RECIPES.DELETE_BUTTON")}
          </button>
        )}
      </div>

      {showSaveInput && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            type="text"
            className="input input-bordered input-xs flex-1"
            placeholder={t("RECIPES.NAME_PLACEHOLDER")}
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveRecipe();
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!savingName.trim()}
            onClick={handleSaveRecipe}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipeBar;
