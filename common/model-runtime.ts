import { getModelCompatibility } from "./model-compatibility";

/**
 * Which runtime should execute a model.
 *
 * - "ncnn":   the bundled upscayl-bin binary (Real-ESRGAN / NCNN models).
 * - "python": the bundled native Python worker. It loads PyTorch
 *             checkpoints (.pth/.pt/.ckpt/.safetensors) through spandrel,
 *             ONNX graphs through onnxruntime, and SUPIR through the
 *             official SUPIR implementation.
 */
export type ModelRuntime = "ncnn" | "python";

const NCNN_MODEL_EXTENSIONS = [".param", ".bin"] as const;
const NATIVE_MODEL_EXTENSIONS = [
  ".pth",
  ".pt",
  ".ckpt",
  ".safetensors",
  ".onnx",
] as const;

const getExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
};

export function hasExternalModelExtension(modelId: string): boolean {
  const extension = getExtension(modelId);
  return (NATIVE_MODEL_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * File names to look for inside the models folder when a model id has no
 * extension. The order matches the most common checkpoint formats first.
 */
export function getNativeModelFileNameCandidates(modelId: string): string[] {
  if (hasExternalModelExtension(modelId)) return [modelId];

  return [
    `${modelId}.safetensors`,
    `${modelId}.pth`,
    `${modelId}.pt`,
    `${modelId}.ckpt`,
    `${modelId}.onnx`,
    `${modelId}.yaml`,
    `${modelId}.yml`,
  ];
}

/**
 * Decide whether a model has to be executed by the native Python backend.
 *
 * NCNN models keep using upscayl-bin. Everything else - HAT, DAT/DAT2, SUPIR,
 * and plain PyTorch/ONNX checkpoints - goes through the Python worker.
 *
 * A transformer-sounding name can still be backed by an NCNN .param/.bin pair
 * (for example "4x-HAT.param"). Pass `hasNcnnFiles` when the models folder has
 * been inspected so those keep using the fast Vulkan binary.
 */
export function resolveModelRuntime(
  modelId: string,
  options: { hasNcnnFiles?: boolean } = {},
): ModelRuntime {
  if (!modelId) return "ncnn";

  const extension = getExtension(modelId);
  if ((NCNN_MODEL_EXTENSIONS as readonly string[]).includes(extension)) {
    return "ncnn";
  }
  if (hasExternalModelExtension(modelId)) return "python";
  if (options.hasNcnnFiles) return "ncnn";

  const compatibility = getModelCompatibility(modelId);
  if (compatibility.engine === "ncnn") return "ncnn";

  return "python";
}

export function isNativeModel(
  modelId: string,
  options: { hasNcnnFiles?: boolean } = {},
): boolean {
  return resolveModelRuntime(modelId, options) === "python";
}

/**
 * Short user-facing name of the native engine used for a model.
 */
export function getNativeEngineLabel(modelId: string): string {
  const extension = getExtension(modelId);
  if (extension === ".onnx") return "ONNX Runtime";

  const compatibility = getModelCompatibility(modelId);
  switch (compatibility.engine) {
    case "diffusion":
      return "SUPIR";
    case "transformer":
      return "HAT / DAT";
    default:
      return "PyTorch";
  }
}
