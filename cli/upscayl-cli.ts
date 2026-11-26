#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import {
  blendRgbaBuffers,
  buildBlendOutputPath,
  clampBlendAlpha,
} from "../common/blend-helpers";
import { formatCliHelp, parseCliArgs } from "../common/cli-parser";
import {
  filterModelCatalog,
  MODEL_CATALOG,
} from "../common/model-catalog";
import { MODELS } from "../common/models-list";
import { buildMultiModelOutputPath } from "../common/multi-model-helpers";
import {
  buildVideoEncodeArgs,
  buildVideoExtractArgs,
  buildVideoOutputFilename,
  parseFrameRate,
  parseTimeInput,
  resolveVideoTrimRange,
  scaleRationalFps,
} from "../common/video-upscayl-helpers";

const readPackageVersion = (): string => {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "1.3.1";
  } catch {
    return "1.3.1";
  }
};

const resolveRepoRoot = (): string => {
  return path.resolve(__dirname, "..", "..");
};

const resolveBundledModelsDir = (): string => {
  const candidates = [
    path.join(resolveRepoRoot(), "resources", "models"),
    process.resourcesPath ? path.join(process.resourcesPath, "models") : "",
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
};

const resolveUpscaylBinary = (): string | null => {
  const plat =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";
  const binName = process.platform === "win32" ? "upscayl-bin.exe" : "upscayl-bin";
  const candidates = [
    process.env.UPSCAYL_BIN || "",
    path.join(resolveRepoRoot(), "resources", plat, "bin", binName),
    process.resourcesPath ? path.join(process.resourcesPath, "bin", binName) : "",
    binName,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === binName) {
      const check = spawnSync(candidate, ["-h"], { encoding: "utf8", timeout: 3000 });
      if (check.error === undefined) return candidate;
    } else if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const runCommand = (bin: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(bin)} exited with code ${code}`));
    });
  });

const buildBinArgs = ({
  inputPath,
  outputPath,
  modelsDir,
  model,
  scale,
  format,
  compression,
  tileSize,
  gpuId,
  threads,
  tta,
  customWidth,
}: {
  inputPath: string;
  outputPath: string;
  modelsDir: string;
  model: string;
  scale: string;
  format: string;
  compression: number;
  tileSize: number;
  gpuId: string;
  threads?: string;
  tta: boolean;
  customWidth?: number;
}): string[] => {
  const args = [
    "-i",
    inputPath,
    "-o",
    outputPath,
    "-s",
    scale,
    "-m",
    modelsDir,
    "-n",
    model,
    "-f",
    format,
    "-c",
    String(compression),
  ];
  if (customWidth && customWidth > 0) {
    args.push("-w", String(customWidth));
  }
  if (tileSize > 0) {
    args.push("-t", String(tileSize));
  }
  if (gpuId.trim()) {
    args.push("-g", gpuId.trim());
  }
  if (threads?.trim()) {
    args.push("-j", threads.trim());
  }
  if (tta) {
    args.push("-x");
  }
  return args;
};

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  const version = readPackageVersion();

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      console.error(`Error: ${err}`);
    }
    return 2;
  }

  if (parsed.command === "help") {
    console.log(formatCliHelp(version));
    return 0;
  }

  if (parsed.command === "version") {
    console.log(`upscayl-next ${version}`);
    return 0;
  }

  if (parsed.command === "models") {
    const query = (parsed.search || "").trim().toLowerCase();
    console.log("Bundled Models:");
    for (const id of Object.keys(MODELS)) {
      if (!query || id.toLowerCase().includes(query)) {
        console.log(`  - ${id}`);
      }
    }
    console.log("\nDownloadable Catalog Models:");
    const filtered = filterModelCatalog(MODEL_CATALOG, { query: parsed.search });
    for (const entry of filtered) {
      console.log(
        `  - ${entry.id} (${entry.engine}, ${entry.scale}x, ~${entry.sizeMB}MB) [${entry.tags.join(", ")}]`,
      );
    }
    return 0;
  }

  if (parsed.command === "blend") {
    if (!parsed.imageA || !parsed.imageB || !parsed.output) {
      console.error("Usage: upscayl-next blend --a <imgA> --b <imgB> -o <outputDir> [--alpha 50]");
      return 2;
    }
    const imgA = path.resolve(parsed.imageA);
    const imgB = path.resolve(parsed.imageB);
    const outDir = path.resolve(parsed.output);
    fs.mkdirSync(outDir, { recursive: true });
    const { percent, alpha } = clampBlendAlpha(parsed.alpha);
    const metaB = await sharp(imgB).metadata();
    if (!metaB.width || !metaB.height) {
      console.error("Could not determine dimensions of Image B.");
      return 1;
    }
    const [rawA, rawB] = await Promise.all([
      sharp(imgA)
        .resize(metaB.width, metaB.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
        .ensureAlpha()
        .raw()
        .toBuffer(),
      sharp(imgB).ensureAlpha().raw().toBuffer(),
    ]);
    const outBuf = blendRgbaBuffers(rawA, rawB, alpha);
    const outFile = buildBlendOutputPath({
      outputDir: outDir,
      separator: path.sep,
      baseName: path.parse(imgB).name,
      labelA: path.parse(imgA).name,
      labelB: path.parse(imgB).name,
      alphaPercent: percent,
      saveImageAs: parsed.format,
    });
    let pipeline = sharp(Buffer.from(outBuf), {
      raw: { width: metaB.width, height: metaB.height, channels: 4 },
    });
    const quality = Math.max(1, Math.min(100, 100 - parsed.compression));
    if (parsed.format === "jpg") {
      pipeline = pipeline.flatten({ background: "#000000" }).jpeg({ quality });
    } else if (parsed.format === "webp") {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.png();
    }
    await pipeline.toFile(outFile);
    console.log(`Blended image saved: ${outFile}`);
    return 0;
  }

  const bin = resolveUpscaylBinary();
  if (!bin) {
    console.error(
      "Error: upscayl-bin executable not found. Set UPSCAYL_BIN or run from an Upscayl-Next installation.",
    );
    return 1;
  }

  const resolveModelsDir = (modelId: string) =>
    modelId in MODELS
      ? resolveBundledModelsDir()
      : parsed.customModelsDir || resolveBundledModelsDir();

  if (parsed.command === "image") {
    if (!parsed.input || !parsed.output) {
      console.error("Usage: upscayl-next image -i <file> -o <outputDir> [options]");
      return 2;
    }
    const inFile = path.resolve(parsed.input);
    const outDir = path.resolve(parsed.output);
    fs.mkdirSync(outDir, { recursive: true });
    const baseName = path.parse(inFile).name;
    const outFile = path.join(
      outDir,
      `${baseName}_upscayl_${parsed.customWidth ? `${parsed.customWidth}px_` : `${parsed.scale}x_`}${parsed.model}.${parsed.format}`,
    );
    const args = buildBinArgs({
      inputPath: inFile,
      outputPath: outFile,
      modelsDir: resolveModelsDir(parsed.model),
      model: parsed.model,
      scale: parsed.scale,
      format: parsed.format,
      compression: parsed.compression,
      tileSize: parsed.tileSize,
      gpuId: parsed.gpuId,
      threads: parsed.threads,
      tta: parsed.tta,
      customWidth: parsed.customWidth,
    });
    await runCommand(bin, args);
    if (parsed.doubleUpscale) {
      await runCommand(
        bin,
        buildBinArgs({
          inputPath: outFile,
          outputPath: outFile,
          modelsDir: resolveModelsDir(parsed.model),
          model: parsed.model,
          scale: parsed.scale,
          format: parsed.format,
          compression: parsed.compression,
          tileSize: parsed.tileSize,
          gpuId: parsed.gpuId,
          threads: parsed.threads,
          tta: parsed.tta,
          customWidth: parsed.customWidth,
        }),
      );
    }
    console.log(`Saved: ${outFile}`);
    return 0;
  }

  if (parsed.command === "batch") {
    if (!parsed.input || !parsed.output) {
      console.error("Usage: upscayl-next batch -i <inputDir> -o <outputDir> [options]");
      return 2;
    }
    const inDir = path.resolve(parsed.input);
    const outDir = path.resolve(parsed.output);
    fs.mkdirSync(outDir, { recursive: true });
    const args = buildBinArgs({
      inputPath: inDir,
      outputPath: outDir,
      modelsDir: resolveModelsDir(parsed.model),
      model: parsed.model,
      scale: parsed.scale,
      format: parsed.format,
      compression: parsed.compression,
      tileSize: parsed.tileSize,
      gpuId: parsed.gpuId,
      threads: parsed.threads,
      tta: parsed.tta,
      customWidth: parsed.customWidth,
    });
    await runCommand(bin, args);
    console.log(`Batch upscaled into: ${outDir}`);
    return 0;
  }

  if (parsed.command === "compare") {
    if (!parsed.input || !parsed.output || parsed.models.length < 2) {
      console.error(
        "Usage: upscayl-next compare -i <file> -o <outputDir> --models m1,m2,...",
      );
      return 2;
    }
    const inFile = path.resolve(parsed.input);
    const outDir = path.resolve(parsed.output);
    fs.mkdirSync(outDir, { recursive: true });
    const baseName = path.parse(inFile).name;
    for (const modelId of parsed.models) {
      const outFile = buildMultiModelOutputPath({
        outputDir: outDir,
        separator: path.sep,
        fileName: baseName,
        model: modelId,
        scale: parsed.scale,
        useCustomWidth: Boolean(parsed.customWidth),
        customWidth: parsed.customWidth ? String(parsed.customWidth) : "",
        saveImageAs: parsed.format,
        doubleUpscale: parsed.doubleUpscale,
      });
      console.log(`Running model: ${modelId}...`);
      await runCommand(
        bin,
        buildBinArgs({
          inputPath: inFile,
          outputPath: outFile,
          modelsDir: resolveModelsDir(modelId),
          model: modelId,
          scale: parsed.scale,
          format: parsed.format,
          compression: parsed.compression,
          tileSize: parsed.tileSize,
          gpuId: parsed.gpuId,
          threads: parsed.threads,
          tta: parsed.tta,
          customWidth: parsed.customWidth,
        }),
      );
      console.log(`  -> ${outFile}`);
    }
    return 0;
  }

  if (parsed.command === "video") {
    if (!parsed.input || !parsed.output) {
      console.error("Usage: upscayl-next video -i <video> -o <outputDir> [options]");
      return 2;
    }
    const inVideo = path.resolve(parsed.input);
    const outDir = path.resolve(parsed.output);
    fs.mkdirSync(outDir, { recursive: true });
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    const probe = spawnSync(
      ffprobe,
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", inVideo],
      { encoding: "utf8" },
    );
    if (probe.status !== 0) {
      console.error("Error: ffprobe failed or is not installed on PATH.");
      return 1;
    }
    const probeJson = JSON.parse(probe.stdout);
    const vStream = (probeJson.streams || []).find((s: any) => s.codec_type === "video");
    const hasAudio = (probeJson.streams || []).some((s: any) => s.codec_type === "audio");
    const duration = Number(probeJson.format?.duration || 0);
    const { rational: fpsRational } = parseFrameRate({
      avgFrameRate: vStream?.avg_frame_rate,
      rFrameRate: vStream?.r_frame_rate,
      duration,
    });
    const trimRange = resolveVideoTrimRange({
      startSeconds: parseTimeInput(parsed.start),
      endSeconds: parseTimeInput(parsed.end),
      duration,
    });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-cli-vid-"));
    try {
      const rawDir = path.join(tempDir, "raw");
      const upDir = path.join(tempDir, "up");
      fs.mkdirSync(rawDir, { recursive: true });
      fs.mkdirSync(upDir, { recursive: true });
      console.log("1/3 Extracting frames...");
      await runCommand(
        ffmpeg,
        buildVideoExtractArgs({
          inputVideo: inVideo,
          outputPattern: path.join(rawDir, "frame_%08d.jpg"),
          fpsRational,
          intermediateFormat: "jpg",
          trimStartSeconds: trimRange?.start ?? null,
          trimDurationSeconds: trimRange?.duration ?? null,
        }),
      );
      console.log("2/3 Upscaling frames...");
      await runCommand(
        bin,
        buildBinArgs({
          inputPath: rawDir,
          outputPath: upDir,
          modelsDir: resolveModelsDir(parsed.model),
          model: parsed.model,
          scale: parsed.scale,
          format: "jpg",
          compression: 0,
          tileSize: parsed.tileSize,
          gpuId: parsed.gpuId,
          threads: parsed.threads,
          tta: parsed.tta,
          customWidth: parsed.customWidth,
        }),
      );
      const outName = buildVideoOutputFilename({
        inputName: path.parse(inVideo).name,
        model: parsed.model,
        scale: parsed.scale,
        useCustomWidth: Boolean(parsed.customWidth),
        customWidth: parsed.customWidth ? String(parsed.customWidth) : "",
        codec: parsed.codec,
        container: parsed.container,
        trimRange,
        interpolationFactor: parsed.fpsMult,
      });
      const outFile = path.join(outDir, outName);
      console.log("3/3 Encoding video...");
      await runCommand(
        ffmpeg,
        buildVideoEncodeArgs({
          fpsRational,
          inputVideo: inVideo,
          outputFile: outFile,
          codec: parsed.codec,
          container: parsed.container,
          quality: parsed.quality,
          keepAudio: parsed.keepAudio,
          hasAudio,
          usePipe: false,
          framesPattern: path.join(upDir, "frame_%08d.jpg"),
          intermediateFormat: "jpg",
          trimStartSeconds: trimRange?.start ?? null,
          trimDurationSeconds: trimRange?.duration ?? null,
          ffmpegInterpolateFps:
            parsed.fpsMult > 1 ? scaleRationalFps(fpsRational, parsed.fpsMult) : null,
        }),
      );
      console.log(`Video saved: ${outFile}`);
      return 0;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(formatCliHelp(version));
  return 0;
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err?.message ?? err);
      process.exit(1);
    });
}
