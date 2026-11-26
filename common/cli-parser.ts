import {
  ImageFormat,
  VideoCodec,
  VideoContainerFormat,
  VideoInterpolationFactor,
  VideoQualityPreset,
} from "./types/types";

export type CliCommandName =
  | "image"
  | "batch"
  | "compare"
  | "video"
  | "blend"
  | "models"
  | "help"
  | "version";

export type ParsedCliArgs = {
  command: CliCommandName;
  input?: string;
  output?: string;
  model: string;
  models: string[];
  scale: string;
  format: ImageFormat;
  compression: number;
  tileSize: number;
  gpuId: string;
  threads?: string;
  tta: boolean;
  doubleUpscale: boolean;
  overwrite: boolean;
  customWidth?: number;
  faceRestore: boolean;
  faceStrength: number;
  // Video flags
  codec: VideoCodec;
  container: VideoContainerFormat;
  quality: VideoQualityPreset;
  keepAudio: boolean;
  fpsMult: VideoInterpolationFactor;
  start?: string;
  end?: string;
  // Blend flags
  imageA?: string;
  imageB?: string;
  alpha: number;
  // Models flags
  search?: string;
  customModelsDir?: string;
  errors: string[];
};

const VALID_COMMANDS = new Set<CliCommandName>([
  "image",
  "batch",
  "compare",
  "video",
  "blend",
  "models",
  "help",
  "version",
]);

const VALID_FORMATS = new Set<ImageFormat>(["png", "jpg", "webp"]);
const VALID_CODECS = new Set<VideoCodec>(["h264", "h265", "vp9"]);
const VALID_CONTAINERS = new Set<VideoContainerFormat>(["mp4", "mkv", "webm"]);
const VALID_QUALITIES = new Set<VideoQualityPreset>([
  "high",
  "balanced",
  "compact",
]);

/**
 * Parse CLI arguments cleanly without external dependencies.
 * Supports `--flag value`, `--flag=value`, and short aliases `-i`, `-o`, `-m`,
 * `-s`, `-f`, `-c`, `-g`, `-t`, `-h`, `-v`.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = argv.filter((a) => a !== "--cli");
  const result: ParsedCliArgs = {
    command: "help",
    model: "upscayl-standard-4x",
    models: [],
    scale: "4",
    format: "png",
    compression: 0,
    tileSize: 0,
    gpuId: "",
    tta: false,
    doubleUpscale: false,
    overwrite: false,
    faceRestore: false,
    faceStrength: 70,
    codec: "h264",
    container: "mp4",
    quality: "balanced",
    keepAudio: true,
    fpsMult: 1,
    alpha: 50,
    errors: [],
  };

  if (args.length === 0) {
    return result;
  }

  let startIdx = 0;
  const first = args[0];
  if (first === "-h" || first === "--help") {
    result.command = "help";
    return result;
  }
  if (first === "-v" || first === "--version") {
    result.command = "version";
    return result;
  }

  if (VALID_COMMANDS.has(first as CliCommandName)) {
    result.command = first as CliCommandName;
    startIdx = 1;
  } else if (!first.startsWith("-")) {
    result.errors.push(`Unknown command "${first}". Run --help for usage.`);
    return result;
  } else {
    // Allow shorthand without subcommand when -i is passed -> default to image
    result.command = "image";
  }

  const readValue = (idx: number, inlineVal?: string): [string, number] => {
    if (inlineVal !== undefined) return [inlineVal, idx];
    const next = args[idx + 1];
    if (next === undefined || next.startsWith("-")) {
      return ["", idx];
    }
    return [next, idx + 1];
  };

  for (let i = startIdx; i < args.length; i += 1) {
    const raw = args[i];
    if (raw === "-h" || raw === "--help") {
      result.command = "help";
      return result;
    }
    if (raw === "-v" || raw === "--version") {
      result.command = "version";
      return result;
    }

    let flag = raw;
    let inlineVal: string | undefined;
    const eqIdx = raw.indexOf("=");
    if (eqIdx > 0 && raw.startsWith("--")) {
      flag = raw.slice(0, eqIdx);
      inlineVal = raw.slice(eqIdx + 1);
    }

    switch (flag) {
      case "-i":
      case "--input": {
        const [val, nextI] = readValue(i, inlineVal);
        result.input = val;
        i = nextI;
        break;
      }
      case "-o":
      case "--output": {
        const [val, nextI] = readValue(i, inlineVal);
        result.output = val;
        i = nextI;
        break;
      }
      case "-m":
      case "--model": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.model = val;
        i = nextI;
        break;
      }
      case "--models": {
        const [val, nextI] = readValue(i, inlineVal);
        result.models = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        i = nextI;
        break;
      }
      case "--models-dir": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.customModelsDir = val;
        i = nextI;
        break;
      }
      case "-s":
      case "--scale": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.scale = val;
        i = nextI;
        break;
      }
      case "-f":
      case "--format": {
        const [val, nextI] = readValue(i, inlineVal);
        const lower = val.toLowerCase() as ImageFormat;
        if (VALID_FORMATS.has(lower)) result.format = lower;
        else result.errors.push(`Invalid image format "${val}". Use png, jpg, or webp.`);
        i = nextI;
        break;
      }
      case "-c":
      case "--compression": {
        const [val, nextI] = readValue(i, inlineVal);
        const n = Number(val);
        if (Number.isFinite(n)) result.compression = Math.max(0, Math.min(100, Math.round(n)));
        i = nextI;
        break;
      }
      case "-t":
      case "--tile": {
        const [val, nextI] = readValue(i, inlineVal);
        const n = Number(val);
        if (Number.isFinite(n) && n >= 0) result.tileSize = Math.round(n);
        i = nextI;
        break;
      }
      case "-g":
      case "--gpu": {
        const [val, nextI] = readValue(i, inlineVal);
        result.gpuId = val;
        i = nextI;
        break;
      }
      case "-j":
      case "--threads": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.threads = val;
        i = nextI;
        break;
      }
      case "--width": {
        const [val, nextI] = readValue(i, inlineVal);
        const n = Number(val);
        if (Number.isFinite(n) && n > 0) result.customWidth = Math.round(n);
        i = nextI;
        break;
      }
      case "--tta":
        result.tta = true;
        break;
      case "--double":
        result.doubleUpscale = true;
        break;
      case "--overwrite":
        result.overwrite = true;
        break;
      case "--face-restore":
        result.faceRestore = true;
        break;
      case "--face-strength": {
        const [val, nextI] = readValue(i, inlineVal);
        const n = Number(val);
        if (Number.isFinite(n)) result.faceStrength = Math.max(0, Math.min(100, Math.round(n)));
        i = nextI;
        break;
      }
      case "--codec": {
        const [val, nextI] = readValue(i, inlineVal);
        const lower = val.toLowerCase() as VideoCodec;
        if (VALID_CODECS.has(lower)) result.codec = lower;
        else result.errors.push(`Invalid video codec "${val}". Use h264, h265, or vp9.`);
        i = nextI;
        break;
      }
      case "--container": {
        const [val, nextI] = readValue(i, inlineVal);
        const lower = val.toLowerCase() as VideoContainerFormat;
        if (VALID_CONTAINERS.has(lower)) result.container = lower;
        else result.errors.push(`Invalid video container "${val}". Use mp4, mkv, or webm.`);
        i = nextI;
        break;
      }
      case "--quality": {
        const [val, nextI] = readValue(i, inlineVal);
        const lower = val.toLowerCase() as VideoQualityPreset;
        if (VALID_QUALITIES.has(lower)) result.quality = lower;
        i = nextI;
        break;
      }
      case "--no-audio":
        result.keepAudio = false;
        break;
      case "--fps-mult": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val === "4") result.fpsMult = 4;
        else if (val === "2") result.fpsMult = 2;
        else result.fpsMult = 1;
        i = nextI;
        break;
      }
      case "--start": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.start = val;
        i = nextI;
        break;
      }
      case "--end": {
        const [val, nextI] = readValue(i, inlineVal);
        if (val) result.end = val;
        i = nextI;
        break;
      }
      case "--a": {
        const [val, nextI] = readValue(i, inlineVal);
        result.imageA = val;
        i = nextI;
        break;
      }
      case "--b": {
        const [val, nextI] = readValue(i, inlineVal);
        result.imageB = val;
        i = nextI;
        break;
      }
      case "--alpha": {
        const [val, nextI] = readValue(i, inlineVal);
        const n = Number(val);
        if (Number.isFinite(n)) result.alpha = Math.max(0, Math.min(100, Math.round(n)));
        i = nextI;
        break;
      }
      case "--search": {
        const [val, nextI] = readValue(i, inlineVal);
        result.search = val;
        i = nextI;
        break;
      }
      case "--list":
        break;
      default:
        result.errors.push(`Unknown option "${raw}".`);
    }
  }

  return result;
}

export function formatCliHelp(version = "2.0.0"): string {
  return `Upscayl-Next CLI v${version} (Sirius)

Usage:
  upscayl-next <command> [options]

Commands:
  image     Upscale a single image
  batch     Upscale all images in a folder
  compare   Upscale a single image with multiple models in succession
  video     Upscale a video (with optional trim & AI FPS interpolation)
  blend     Blend two images together at a given ratio (0-100%)
  models    List bundled and installable catalog models

Common Options:
  -i, --input <path>        Input image, folder, or video file
  -o, --output <dir>        Output directory
  -m, --model <id>          Model ID (default: upscayl-standard-4x)
  --models <m1,m2,...>      Comma-separated models for 'compare'
  --models-dir <dir>        Custom models directory
  -s, --scale <1|2|3|4>     Output scale factor (default: 4)
  --width <px>              Custom output width in pixels
  -f, --format <ext>        png | jpg | webp (default: png)
  -c, --compression <0-100> Compression level (default: 0)
  -t, --tile <px>           Tile size (0 = auto)
  -g, --gpu <id>            GPU ID (e.g. 0, 1, or 0,1)
  -j, --threads <l:p:s>     Thread split (e.g. 2:2:4)
  --double                  Run two passes (double upscale)
  --tta                     Enable TTA mode
  --overwrite               Overwrite existing outputs
  --face-restore            Apply GFPGAN face restoration after upscaling
  --face-strength <0-100>   Face restoration strength (default: 70)

Video Options:
  --codec <h264|h265|vp9>   Video codec (default: h264)
  --container <mp4|mkv|webm> Output container (default: mp4)
  --quality <high|balanced|compact> Quality preset (default: balanced)
  --fps-mult <1|2|4>        AI frame interpolation multiplier (default: 1)
  --start <time>            Trim start (seconds or mm:ss)
  --end <time>              Trim end (seconds or mm:ss)
  --no-audio                Drop audio track

Blend Options:
  --a <file>                First image (0%)
  --b <file>                Second image (100%)
  --alpha <0-100>           Weight of Image B (default: 50)

Examples:
  upscayl-next image -i photo.jpg -o ./out -m high-fidelity-4x -s 4 -f webp
  upscayl-next compare -i art.png -o ./out --models upscayl-standard-4x,digital-art-4x
  upscayl-next blend --a photo.jpg --b upscaled.png -o ./out --alpha 75
  upscayl-next models --search anime
`;
}
