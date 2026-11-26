import { useState } from "react";
import { sanitizePath } from "@common/sanitize-path";
import { RoiRect } from "@common/roi-helpers";
import RoiSelectorOverlay from "./roi-selector-overlay";

const ImageViewer = ({
  imagePath,
  setDimensions,
  roiMode = false,
  roiRect = null,
  setRoiRect,
  onRunRoi,
}: {
  imagePath: string;
  setDimensions: (dimensions: { width: number; height: number }) => void;
  roiMode?: boolean;
  roiRect?: RoiRect | null;
  setRoiRect?: (rect: RoiRect | null) => void;
  onRunRoi?: () => void;
}) => {
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  return (
    <div className="relative h-full w-full">
      <img
        src={"file:///" + sanitizePath(imagePath)}
        onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
          const w = e.currentTarget.naturalWidth;
          const h = e.currentTarget.naturalHeight;
          setNaturalSize({ width: w, height: h });
          setDimensions({ width: w, height: h });
        }}
        draggable="false"
        alt=""
        className="h-full w-full bg-gradient-to-br from-base-300 to-base-100 object-contain"
      />
      {roiMode &&
        setRoiRect &&
        naturalSize.width > 0 &&
        naturalSize.height > 0 && (
          <RoiSelectorOverlay
            imageWidth={naturalSize.width}
            imageHeight={naturalSize.height}
            roiRect={roiRect}
            setRoiRect={setRoiRect}
            onRunRoi={onRunRoi}
          />
        )}
    </div>
  );
};

export default ImageViewer;
