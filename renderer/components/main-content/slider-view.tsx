import React, { useCallback, useState } from "react";
import { ReactCompareSlider } from "react-compare-slider";
import useTranslation from "../hooks/use-translation";

const SliderView = ({
  sanitizedImagePath,
  sanitizedUpscaledImagePath,
  zoomAmount,
  leftLabel,
  rightLabel,
  containerClassName,
}: {
  sanitizedImagePath: string;
  sanitizedUpscaledImagePath: string;
  zoomAmount: string;
  leftLabel?: string;
  rightLabel?: string;
  containerClassName?: string;
}) => {
  const t = useTranslation();

  const [backgroundPosition, setBackgroundPosition] = useState("50% 50%");
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: any) => {
    const { left, top, width, height } = e.target.getBoundingClientRect();
    const x = ((e.pageX - left) / width) * 100;
    const y = ((e.pageY - top) / height) * 100;
    setBackgroundPosition(`${x}% ${y}%`);
  }, []);

  const numericZoom = Number(zoomAmount) || 100;
  const scaleTransform =
    isHovered && numericZoom > 100 ? `scale(${numericZoom / 100})` : "scale(1)";

  const resolvedLeftLabel = leftLabel || t("APP.SLIDER.ORIGINAL_TITLE");
  const resolvedRightLabel = rightLabel || t("APP.SLIDER.UPSCAYLED_TITLE");

  return (
    <ReactCompareSlider
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      itemOne={
        <>
          <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {resolvedLeftLabel}
          </p>

          <img
            /* USE REGEX TO GET THE FILENAME AND ENCODE IT INTO PROPER FORM IN ORDER TO AVOID ERRORS DUE TO SPECIAL CHARACTERS */
            src={"file:///" + sanitizedImagePath}
            alt={resolvedLeftLabel}
            onMouseMove={handleMouseMove}
            style={{
              objectFit: "contain",
              backgroundPosition: "0% 0%",
              transformOrigin: backgroundPosition,
              transform: scaleTransform,
            }}
            className="h-full w-full bg-gradient-to-br from-base-300 to-base-100 transition-transform duration-150"
          />
        </>
      }
      itemTwo={
        <>
          <p className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {resolvedRightLabel}
          </p>
          <img
            /* USE REGEX TO GET THE FILENAME AND ENCODE IT INTO PROPER FORM IN ORDER TO AVOID ERRORS DUE TO SPECIAL CHARACTERS */
            src={"file:///" + sanitizedUpscaledImagePath}
            alt={resolvedRightLabel}
            style={{
              objectFit: "contain",
              backgroundPosition: "0% 0%",
              transformOrigin: backgroundPosition,
              transform: scaleTransform,
            }}
            onMouseMove={handleMouseMove}
            className="h-full w-full bg-gradient-to-br from-base-300 to-base-100 transition-transform duration-150"
          />
        </>
      }
      className={containerClassName ?? "group h-screen w-full"}
    />
  );
};

export default SliderView;
