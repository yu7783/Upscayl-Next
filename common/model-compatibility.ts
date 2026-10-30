export type ModelEngine =
  | "ncnn"
  | "onnx"
  | "pytorch"
  | "diffusion"
  | "transformer"
  | "unknown";

export type ModelCompatibility = {
  engine: ModelEngine;
  supportedByBuiltInEngine: boolean;
  /**
   * True when the model is executed by the optional Python backend rather than
   * the bundled NCNN/Vulkan binary. The UI uses this to explain that HAT, DAT,
   * SUPIR, ONNX and PyTorch models need `native/setup.ps1` (or the Start Menu
   * "Set up AI backend" shortcut) before they can run.
   */
  requiresOptionalBackend: boolean;
  label: string;
};

/**
 * File extensions the bundled upscayl-bin can actually load. The binary is an
 * NCNN (Real-ESRGAN style) runtime, so it needs the .param graph and the .bin
 * weights.
 */
export const NCNN_MODEL_EXTENSIONS = [".param", ".bin"] as const;

/**
 * Extensions produced by PyTorch / ONNX toolchains. These are accepted directly
 * by the app so users no longer have to convert them to NCNN first.
 */
export const EXTERNAL_MODEL_EXTENSIONS = [
  ".pth",
  ".pt",
  ".ckpt",
  ".safetensors",
  ".onnx",
] as const;

const tokenPattern = (token: string) =>
  new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i");

const hasToken = (value: string, tokens: string[]) =>
  tokens.some((token) => tokenPattern(token).test(value));

const getExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
};

/**
 * Detect which engine a model belongs to.
 *
 * The app now accepts NCNN, ONNX and PyTorch checkpoints directly. This helper
 * still classifies well-known architectures (SUPIR diffusion, DAT / DAT2
 * transformer) so the UI can show an informative label, but they are no longer
 * blocked: users can select them without running a conversion step first.
 */
export function getModelCompatibility(modelId: string): ModelCompatibility {
  const value = modelId.toLowerCase();
  const extension = getExtension(value);

  if ((NCNN_MODEL_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      engine: "ncnn",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: false,
      label: "NCNN",
    };
  }

  if ((EXTERNAL_MODEL_EXTENSIONS as readonly string[]).includes(extension)) {
    // External checkpoints/graphs are classified by their file type, but the
    // model name still tells us the architecture. Keep both in the label so the
    // UI shows e.g. "PyTorch / HAT" or "PyTorch / Diffusion / SUPIR".
    const baseName = value.slice(0, value.length - extension.length);
    const byName = getModelCompatibility(baseName);
    const architectureLabel =
      byName.engine === "diffusion" || byName.engine === "transformer"
        ? byName.label
        : "";

    if (extension === ".onnx") {
      return {
        engine: "onnx",
        supportedByBuiltInEngine: true,
        requiresOptionalBackend: true,
        label: architectureLabel ? `ONNX / ${architectureLabel}` : "ONNX",
      };
    }

    return {
      engine: "pytorch",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: true,
      label: architectureLabel ? `PyTorch / ${architectureLabel}` : "PyTorch",
    };
  }

  if (
    value.includes("supir") ||
    hasToken(value, [
      "sdxl",
      "diffusion",
      "stable-diffusion",
      "stablediffusion",
    ])
  ) {
    return {
      engine: "diffusion",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: true,
      label: "Diffusion / SUPIR",
    };
  }

  // HAT (Hybrid Attention Transformer) - e.g. "4x-HAT", "HAT-SRx4",
  // "hat_gan". The token check keeps words like "what" from matching.
  if (
    hasToken(value, ["hat"]) ||
    value.includes("hybrid attention") ||
    value.includes("hybridattention")
  ) {
    return {
      engine: "transformer",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: true,
      label: "HAT",
    };
  }

  if (
    value.includes("nomos8kdat") ||
    hasToken(value, ["dat", "dat2"]) ||
    value.includes("dual aggregation")
  ) {
    return {
      engine: "transformer",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: true,
      label: "DAT / DAT2",
    };
  }

  return {
    engine: "ncnn",
    supportedByBuiltInEngine: true,
    requiresOptionalBackend: false,
    label: "NCNN",
  };
}

export type ModelFileSupport = ModelCompatibility & {
  /** Lower-cased extension including the leading dot, or "" when absent. */
  extension: string;
};

/**
 * Classify a file found in the custom models folder.
 *
 * Unlike getModelCompatibility this looks at the extension first. ONNX and
 * PyTorch checkpoints are treated as first-class citizens now, so they no longer
 * carry a "needs conversion" label.
 */
export function getModelFileSupport(fileName: string): ModelFileSupport {
  const extension = getExtension(fileName);

  if ((NCNN_MODEL_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      engine: "ncnn",
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: false,
      label: "NCNN",
      extension,
    };
  }

  if ((EXTERNAL_MODEL_EXTENSIONS as readonly string[]).includes(extension)) {
    const baseName = fileName.slice(0, fileName.length - extension.length);
    const byName = getModelCompatibility(baseName);

    let engine: ModelEngine = "unknown";
    let label = "Unknown";

    if (extension === ".onnx") {
      engine = "onnx";
      label = "ONNX";
    } else if (
      extension === ".pth" ||
      extension === ".pt" ||
      extension === ".ckpt" ||
      extension === ".safetensors"
    ) {
      engine = "pytorch";
      label = "PyTorch";
    }

    // Keep the architecture hint in the label when the name matches a known
    // family (SUPIR / DAT), but never block selection.
    if (byName.engine !== "ncnn" && byName.engine !== "unknown") {
      label = `${label} / ${byName.label}`;
    }

    return {
      engine,
      supportedByBuiltInEngine: true,
      requiresOptionalBackend: true,
      label,
      extension,
    };
  }

  return {
    engine: "unknown",
    supportedByBuiltInEngine: false,
    requiresOptionalBackend: true,
    label: "Unknown",
    extension,
  };
}
