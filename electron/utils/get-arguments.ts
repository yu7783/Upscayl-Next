import getModelScale from "../../common/check-model-scale";
import { getPlatform } from "./get-device-specs";
import { ImageFormat } from "../types/types";
const slash: string = getPlatform() === "win" ? "\\" : "/";

export const getSingleImageArguments = ({
  inputDir,
  fileNameWithExt,
  outFile,
  modelsPath,
  model,
  scale,
  gpuId,
  saveImageAs,
  customWidth,
  tileSize,
  compression,
  ttaMode,
  threads,
}: {
  inputDir: string;
  fileNameWithExt: string;
  outFile: string;
  modelsPath: string;
  model: string;
  scale: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  customWidth: string;
  tileSize: number;
  compression: string;
  ttaMode: boolean;
  /**
   * Optional "load:proc:save" thread split for upscayl-bin (-j).
   * Leave empty to use the binary default (1:2:2).
   */
  threads?: string;
}) => {
  const modelScale = getModelScale(model);
  let includeScale = modelScale !== scale && !customWidth;
  return [
    // INPUT IMAGE
    "-i",
    inputDir + slash + fileNameWithExt,
    // OUTPUT IMAGE
    "-o",
    outFile,
    // OUTPUT SCALE
    includeScale ? "-s" : "",
    includeScale ? scale : "",
    // MODELS PATH
    "-m",
    modelsPath,
    // MODEL NAME
    "-n",
    model,
    // GPU ID
    gpuId ? "-g" : "",
    gpuId ? gpuId : "",
    // FORMAT
    "-f",
    saveImageAs,
    // CUSTOM WIDTH
    customWidth ? `-w` : "",
    customWidth ? customWidth : "",
    // COMPRESSION
    "-c",
    compression,
    // TILE SIZE
    tileSize ? `-t` : "",
    tileSize ? tileSize.toString() : "",
    // TTA MODE
    ttaMode ? "-x" : "",
    // THREADS
    threads ? "-j" : "",
    threads ? threads : "",
  ];
};

export const getDoubleUpscaleArguments = ({
  inputDir,
  fullfileName,
  outFile,
  modelsPath,
  scale,
  model,
  gpuId,
  saveImageAs,
  customWidth,
  tileSize,
  threads,
}: {
  inputDir: string;
  fullfileName: string;
  outFile: string;
  modelsPath: string;
  scale: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  customWidth: string;
  tileSize: number;
  threads?: string;
}) => {
  const modelScale = getModelScale(model);
  let includeScale = modelScale !== scale && !customWidth;
  return [
    // INPUT IMAGE
    "-i",
    inputDir + slash + fullfileName,
    // OUTPUT IMAGE
    "-o",
    outFile,
    // OUTPUT SCALE
    includeScale ? "-s" : "",
    includeScale ? scale : "",
    // MODELS PATH
    "-m",
    modelsPath,
    // MODEL NAME
    "-n",
    model,
    // GPU ID
    gpuId ? `-g` : "",
    gpuId ? gpuId : "",
    // FORMAT
    "-f",
    saveImageAs,
    // TILE SIZE
    tileSize ? `-t` : "",
    tileSize ? tileSize.toString() : "",
    // THREADS
    threads ? "-j" : "",
    threads ? threads : "",
  ];
};

export const getDoubleUpscaleSecondPassArguments = ({
  outFile,
  modelsPath,
  model,
  gpuId,
  saveImageAs,
  scale,
  customWidth,
  compression,
  tileSize,
  ttaMode,
  threads,
}: {
  outFile: string;
  modelsPath: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  scale: string;
  customWidth: string;
  compression: string;
  tileSize: number;
  ttaMode: boolean;
  threads?: string;
}) => {
  const modelScale = getModelScale(model);
  let includeScale = modelScale !== scale && !customWidth;
  return [
    // INPUT IMAGE
    "-i",
    outFile,
    // OUTPUT IMAGE
    "-o",
    outFile,
    // OUTPUT SCALE
    includeScale ? "-s" : "",
    includeScale ? scale : "",
    // MODELS PATH
    "-m",
    modelsPath,
    // MODEL NAME
    "-n",
    model,
    // GPU ID
    gpuId ? `-g` : "",
    gpuId ? gpuId : "",
    // FORMAT
    "-f",
    saveImageAs,
    // CUSTOM WIDTH
    customWidth ? `-w` : "",
    customWidth ? customWidth : "",
    // COMPRESSION
    "-c",
    compression,
    // TILE SIZE
    tileSize ? `-t` : "",
    tileSize ? tileSize.toString() : "",
    // TTA MODE
    ttaMode ? "-x" : "",
    // THREADS
    threads ? "-j" : "",
    threads ? threads : "",
  ];
};

export const getBatchArguments = ({
  inputDir,
  outputDir,
  modelsPath,
  model,
  gpuId,
  saveImageAs,
  scale,
  customWidth,
  compression,
  tileSize,
  ttaMode,
  threads,
}: {
  inputDir: string;
  outputDir: string;
  modelsPath: string;
  model: string;
  gpuId: string;
  saveImageAs: ImageFormat;
  scale: string;
  customWidth: string;
  compression: string;
  tileSize: number;
  ttaMode: boolean;
  threads?: string;
}) => {
  const modelScale = getModelScale(model);
  let includeScale = modelScale !== scale && !customWidth;

  return [
    // INPUT IMAGE
    "-i",
    inputDir,
    // OUTPUT IMAGE
    "-o",
    outputDir,
    // OUTPUT SCALE
    includeScale ? "-s" : "",
    includeScale ? scale : "",
    // MODELS PATH
    "-m",
    modelsPath,
    // MODEL NAME
    "-n",
    model,
    // GPU ID
    gpuId ? `-g` : "",
    gpuId ? gpuId : "",
    // FORMAT
    "-f",
    saveImageAs,
    // CUSTOM WIDTH
    customWidth ? `-w` : "",
    customWidth ? customWidth : "",
    // COMPRESSION
    "-c",
    compression,
    // TILE SIZE
    tileSize ? `-t` : "",
    tileSize ? tileSize.toString() : "",
    // TTA MODE
    ttaMode ? "-x" : "",
    // THREADS
    threads ? "-j" : "",
    threads ? threads : "",
  ];
};
