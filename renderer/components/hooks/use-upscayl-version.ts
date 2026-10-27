import { useState, useEffect } from "react";

const useUpscaylVersion = () => {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const match = navigator?.userAgent?.match(/Upscayl(?:-Next)?\/(v?[\d.]+)/);
    const detectedVersion = match?.[1];
    setVersion(
      detectedVersion
        ? detectedVersion.startsWith("v")
          ? detectedVersion
          : `v${detectedVersion}`
        : null,
    );
  }, []);

  return version;
};

export default useUpscaylVersion;
