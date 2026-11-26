export type CatalogModelEngine = "ncnn" | "pytorch" | "onnx";

export type CatalogModelFile = {
  filename: string;
  url: string;
};

export type CatalogModelEntry = {
  id: string;
  name: string;
  description: string;
  engine: CatalogModelEngine;
  scale: number;
  tags: string[];
  sizeMB: number;
  license: string;
  homepage: string;
  files: CatalogModelFile[];
};

export type CatalogModelStatus = CatalogModelEntry & {
  installed: boolean;
  installedFiles: string[];
};

const UPSCAYL_CUSTOM_MODELS_RAW =
  "https://raw.githubusercontent.com/upscayl/custom-models/main/models";

/**
 * Curated catalog of widely used open-source super-resolution models that can
 * be installed directly into the user's Custom Models folder.
 */
export const MODEL_CATALOG: CatalogModelEntry[] = [
  {
    id: "4x-UltraSharp",
    name: "4x-UltraSharp (NCNN)",
    description:
      "Crisp detail recovery for photos, textures, and digital renders with minimal ringing.",
    engine: "ncnn",
    scale: 4,
    tags: ["photo", "sharp", "general"],
    sizeMB: 33,
    license: "CC-BY-NC-SA-4.0",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "4x-UltraSharp.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x-UltraSharp.param`,
      },
      {
        filename: "4x-UltraSharp.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x-UltraSharp.bin`,
      },
    ],
  },
  {
    id: "4x-AnimeSharp",
    name: "4x-AnimeSharp (NCNN)",
    description:
      "Clean, sharp line art and flat shading restoration tailored for anime and 2D illustration.",
    engine: "ncnn",
    scale: 4,
    tags: ["anime", "illustration", "sharp"],
    sizeMB: 33,
    license: "CC-BY-NC-SA-4.0",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "4x-AnimeSharp.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x-AnimeSharp.param`,
      },
      {
        filename: "4x-AnimeSharp.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x-AnimeSharp.bin`,
      },
    ],
  },
  {
    id: "4x_NMKD-Superscale-SP_178000_G",
    name: "NMKD Superscale SP (NCNN)",
    description:
      "Balanced all-purpose photo & JPEG-artifact removal model with natural grain preservation.",
    engine: "ncnn",
    scale: 4,
    tags: ["photo", "denoise", "general"],
    sizeMB: 33,
    license: "CC0-1.0",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "4x_NMKD-Superscale-SP_178000_G.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_NMKD-Superscale-SP_178000_G.param`,
      },
      {
        filename: "4x_NMKD-Superscale-SP_178000_G.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_NMKD-Superscale-SP_178000_G.bin`,
      },
    ],
  },
  {
    id: "4x_NMKD-Siax_200k",
    name: "NMKD Siax 200k (NCNN)",
    description:
      "Strong JPEG & compression restoration for degraded web photos and screenshots.",
    engine: "ncnn",
    scale: 4,
    tags: ["photo", "denoise", "restoration"],
    sizeMB: 33,
    license: "CC0-1.0",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "4x_NMKD-Siax_200k.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_NMKD-Siax_200k.param`,
      },
      {
        filename: "4x_NMKD-Siax_200k.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_NMKD-Siax_200k.bin`,
      },
    ],
  },
  {
    id: "4x_foolhardy_Remacri",
    name: "Remacri 4x (NCNN)",
    description:
      "Classic photo & texture upscaler prized for rich micro-contrast without plastic smoothing.",
    engine: "ncnn",
    scale: 4,
    tags: ["photo", "texture"],
    sizeMB: 33,
    license: "CC-BY-NC-SA-4.0",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "4x_foolhardy_Remacri.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_foolhardy_Remacri.param`,
      },
      {
        filename: "4x_foolhardy_Remacri.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/4x_foolhardy_Remacri.bin`,
      },
    ],
  },
  {
    id: "realesr-animevideov3-x4",
    name: "Real-ESRGAN AnimeVideo v3 (NCNN)",
    description:
      "Ultra-fast compact model specifically engineered for high-FPS anime video upscaling.",
    engine: "ncnn",
    scale: 4,
    tags: ["anime", "video", "fast"],
    sizeMB: 3,
    license: "BSD-3-Clause",
    homepage: "https://github.com/xinntao/Real-ESRGAN",
    files: [
      {
        filename: "realesr-animevideov3-x4.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/realesr-animevideov3-x4.param`,
      },
      {
        filename: "realesr-animevideov3-x4.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/realesr-animevideov3-x4.bin`,
      },
    ],
  },
  {
    id: "RealESRGAN_General_x4_v3",
    name: "Real-ESRGAN General v3 (NCNN)",
    description:
      "Lightweight fast general-purpose model ideal for rapid video and batch processing.",
    engine: "ncnn",
    scale: 4,
    tags: ["general", "video", "fast"],
    sizeMB: 5,
    license: "BSD-3-Clause",
    homepage: "https://github.com/xinntao/Real-ESRGAN",
    files: [
      {
        filename: "RealESRGAN_General_x4_v3.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/RealESRGAN_General_x4_v3.param`,
      },
      {
        filename: "RealESRGAN_General_x4_v3.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/RealESRGAN_General_x4_v3.bin`,
      },
    ],
  },
  {
    id: "uniscale_restore",
    name: "UniScale Restore (NCNN)",
    description:
      "Restoration-focused model for heavily compressed scans, old photos, and low-bitrate frames.",
    engine: "ncnn",
    scale: 4,
    tags: ["restoration", "denoise", "photo"],
    sizeMB: 33,
    license: "MIT",
    homepage: "https://github.com/upscayl/custom-models",
    files: [
      {
        filename: "uniscale_restore.param",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/uniscale_restore.param`,
      },
      {
        filename: "uniscale_restore.bin",
        url: `${UPSCAYL_CUSTOM_MODELS_RAW}/uniscale_restore.bin`,
      },
    ],
  },
];

export function filterModelCatalog<T extends CatalogModelEntry>(
  entries: T[],
  {
    query = "",
    tag = "",
    engine = "",
  }: { query?: string; tag?: string; engine?: string } = {},
): T[] {
  const q = query.trim().toLowerCase();
  const t = tag.trim().toLowerCase();
  const e = engine.trim().toLowerCase();

  return entries.filter((entry) => {
    if (e && entry.engine.toLowerCase() !== e) return false;
    if (t && !entry.tags.some((item) => item.toLowerCase() === t)) return false;
    if (!q) return true;
    const haystack = [
      entry.id,
      entry.name,
      entry.description,
      entry.engine,
      ...entry.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function getCatalogTags(entries: CatalogModelEntry[] = MODEL_CATALOG): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      set.add(tag);
    }
  }
  return Array.from(set).sort();
}
