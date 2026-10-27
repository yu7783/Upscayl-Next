import { translationAtom } from "@/atoms/translations-atom";
import { useAtomValue } from "jotai";
import React from "react";
import { Settings } from "./icons/original-icons";

type TabsProps = {
  selectedTab: number;
  setSelectedTab: (tab: number) => void;
};

const Tabs = ({ selectedTab, setSelectedTab }: TabsProps) => {
  const t = useAtomValue(translationAtom);

  // The settings view is rendered full-screen, so a text tab is hidden behind
  // the overlay and looks out of place next to the rest of the compact UI.
  // Use a compact toolbar row with a gear icon instead.
  if (selectedTab === 2) {
    return null;
  }

  const tabClass = (tab: number) =>
    `btn btn-sm flex-1 gap-2 ${
      selectedTab === tab ? "btn-primary" : "btn-ghost"
    }`;

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-btn border border-base-content/10 bg-base-200/60 px-3 py-2">
      <div className="flex flex-1 items-center gap-1">
        <button
          type="button"
          className={tabClass(0)}
          onClick={() => setSelectedTab(0)}
          title={t("VIDEO_UPSCAYL.TAB_IMAGE")}
          aria-pressed={selectedTab === 0}
        >
          {t("VIDEO_UPSCAYL.TAB_IMAGE")}
        </button>
        <button
          type="button"
          className={tabClass(1)}
          onClick={() => setSelectedTab(1)}
          title={t("VIDEO_UPSCAYL.TAB_VIDEO")}
          aria-pressed={selectedTab === 1}
        >
          {t("VIDEO_UPSCAYL.TAB_VIDEO")}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-2"
        onClick={() => setSelectedTab(2)}
        title={t("SETTINGS.TITLE")}
        aria-label={t("SETTINGS.TITLE")}
        data-tooltip-id="tooltip"
        data-tooltip-content={t("SETTINGS.TITLE")}
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">{t("SETTINGS.TITLE")}</span>
      </button>
    </div>
  );
};

export default Tabs;
