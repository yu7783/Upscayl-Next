const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseFrameRate,
  getVideoThreadCount,
  computeOptimalChunkSize,
  resolveHardwareEncoder,
  resolveVideoEncodingProfile,
  buildVideoExtractArgs,
  buildVideoEncodeArgs,
  buildVideoConcatArgs,
  buildRifeArgs,
  scaleRationalFps,
  parseTimeInput,
  resolveVideoTrimRange,
  planDeduplicatedChunk,
  computeChunkRanges,
  calculateVideoOverallProgress,
  buildVideoOutputFilename,
  estimateVideoOutputDimensions,
  formatVideoDuration,
} = require("../export/common/video-upscayl-helpers.js");

test("parseFrameRate prefers avg_frame_rate over bogus VFR r_frame_rate timebases", () => {
  const result = parseFrameRate({
    avgFrameRate: "30000/1001",
    rFrameRate: "90000/1",
  });
  assert.equal(result.rational, "30000/1001");
  assert.ok(Math.abs(result.fps - 29.97003) < 0.001);
});

test("parseFrameRate rejects 0/0 and unrealistic rates and falls back to nbFrames/duration", () => {
  const result = parseFrameRate({
    avgFrameRate: "0/0",
    rFrameRate: "1000/1",
    nbFrames: 240,
    duration: 10,
  });
  assert.equal(result.fps, 24);
  assert.equal(result.rational, "24");
});

test("parseFrameRate defaults safely to 30/1 when all probe fields are unavailable", () => {
  const result = parseFrameRate({
    avgFrameRate: "0/0",
    rFrameRate: "N/A",
  });
  assert.deepEqual(result, { fps: 30, rational: "30/1" });
});

test("getVideoThreadCount keeps GPU proc threads bounded at 2 (or 1 under VRAM pressure) while scaling save threads", () => {
  assert.equal(getVideoThreadCount({ cpuCount: 16 }), "4:2:6");
  assert.equal(
    getVideoThreadCount({ cpuCount: 16, vramConstrained: true }),
    "4:1:6",
  );
  assert.equal(getVideoThreadCount({ cpuCount: 4 }), "2:2:2");
  assert.equal(getVideoThreadCount({ cpuCount: 1 }), "1:1:2");
});

test("computeOptimalChunkSize uses larger chunks for fast JPEG and smaller chunks for lossless PNG", () => {
  assert.equal(computeOptimalChunkSize(1000, "jpg"), 150);
  assert.equal(computeOptimalChunkSize(1000, "png"), 60);
  assert.equal(computeOptimalChunkSize(45, "jpg"), 45);
});

test("resolveHardwareEncoder picks top-priority encoder per codec and returns null for VP9", () => {
  assert.equal(
    resolveHardwareEncoder("h264", ["h264_qsv", "h264_nvenc"]),
    "h264_nvenc",
  );
  assert.equal(
    resolveHardwareEncoder("h265", ["h264_amf", "hevc_amf"]),
    "hevc_amf",
  );
  assert.equal(
    resolveHardwareEncoder("vp9", ["h264_nvenc", "hevc_nvenc"]),
    null,
  );
  assert.equal(resolveHardwareEncoder("h264", []), null);
});

test("resolveVideoEncodingProfile normalizes incompatible container/codec pairs", () => {
  const vp9Mp4 = resolveVideoEncodingProfile({
    codec: "vp9",
    container: "mp4",
    quality: "high",
  });
  assert.equal(vp9Mp4.container, "webm");
  assert.equal(vp9Mp4.videoEncoder, "libvpx-vp9");
  assert.equal(vp9Mp4.audioEncoder, "libopus");
  assert.equal(vp9Mp4.crf, "24");

  const h264Webm = resolveVideoEncodingProfile({
    codec: "h264",
    container: "webm",
    quality: "compact",
  });
  assert.equal(h264Webm.codec, "vp9");
  assert.equal(h264Webm.container, "webm");

  const hevcMp4 = resolveVideoEncodingProfile({
    codec: "h265",
    container: "mp4",
    quality: "balanced",
  });
  assert.equal(hevcMp4.videoEncoder, "libx265");
  assert.equal(hevcMp4.crf, "22");
});

test("buildVideoExtractArgs enforces CFR, multi-threading, hwaccel, and fast JPEG / level-1 PNG options", () => {
  const jpgArgs = buildVideoExtractArgs({
    inputVideo: "/videos/clip.mp4",
    outputPattern: "/tmp/frame_%08d.jpg",
    fpsRational: "30000/1001",
    intermediateFormat: "jpg",
    useHwDecode: true,
  });
  assert.ok(jpgArgs.includes("-threads"));
  assert.ok(jpgArgs.includes("-hwaccel"));
  assert.ok(jpgArgs.includes("fps=30000/1001"));
  assert.ok(jpgArgs.includes("-q:v"));
  assert.equal(jpgArgs.includes("-vsync"), false);

  const pngArgs = buildVideoExtractArgs({
    inputVideo: "/videos/clip.mp4",
    outputPattern: "/tmp/frame_%08d.png",
    fpsRational: "24/1",
    intermediateFormat: "png",
    useHwDecode: false,
  });
  assert.equal(pngArgs.includes("-hwaccel"), false);
  assert.ok(pngArgs.includes("-compression_level"));
  assert.ok(pngArgs.includes("1"));
});

test("buildVideoEncodeArgs supports mjpeg pipe, GPU hardware encoders, fast CPU presets, even padding, and faststart", () => {
  const nvencArgs = buildVideoEncodeArgs({
    fpsRational: "60/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.mp4",
    codec: "h264",
    container: "mp4",
    quality: "high",
    keepAudio: true,
    hasAudio: true,
    usePipe: true,
    intermediateFormat: "jpg",
    hardwareEncoder: "h264_nvenc",
  });

  assert.ok(nvencArgs.includes("image2pipe"));
  assert.ok(nvencArgs.includes("mjpeg"));
  assert.ok(nvencArgs.includes("pipe:0"));
  assert.ok(nvencArgs.includes("pad=ceil(iw/2)*2:ceil(ih/2)*2"));
  assert.ok(nvencArgs.includes("+faststart"));
  assert.ok(nvencArgs.includes("h264_nvenc"));
  assert.ok(nvencArgs.includes("p4"));
  assert.ok(nvencArgs.includes("aac"));
  assert.equal(nvencArgs.includes("-shortest"), false);

  const cpuFastArgs = buildVideoEncodeArgs({
    fpsRational: "30/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.webm",
    codec: "vp9",
    container: "webm",
    quality: "balanced",
    usePipe: true,
    intermediateFormat: "png",
    hardwareEncoder: null,
  });
  assert.ok(cpuFastArgs.includes("png"));
  assert.ok(cpuFastArgs.includes("libvpx-vp9"));
  assert.ok(cpuFastArgs.includes("-row-mt"));
  assert.ok(cpuFastArgs.includes("4"));
});

test("buildVideoEncodeArgs omits audio mapping and passes -an when muted or source has no audio", () => {
  const mutedArgs = buildVideoEncodeArgs({
    fpsRational: "30/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.mp4",
    keepAudio: false,
    hasAudio: true,
    usePipe: true,
  });
  assert.ok(mutedArgs.includes("-an"));
  assert.equal(mutedArgs.includes("1:a?"), false);

  const hevcArgs = buildVideoEncodeArgs({
    fpsRational: "30/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.mp4",
    codec: "h265",
    container: "mp4",
    keepAudio: true,
    hasAudio: false,
    usePipe: true,
  });
  assert.ok(hevcArgs.includes("-tag:v"));
  assert.ok(hevcArgs.includes("hvc1"));
  assert.ok(hevcArgs.includes("-preset"));
  assert.ok(hevcArgs.includes("fast"));
  assert.ok(hevcArgs.includes("-an"));
});

test("planDeduplicatedChunk skips byte-identical consecutive frames including across chunk boundaries", () => {
  const chunk1 = planDeduplicatedChunk(
    [
      { name: "f1.jpg", hash: "aaa" },
      { name: "f2.jpg", hash: "aaa" },
      { name: "f3.jpg", hash: "bbb" },
    ],
    null,
  );
  assert.deepEqual(chunk1.uniqueFrames, ["f1.jpg", "f3.jpg"]);
  assert.equal(chunk1.skippedCount, 1);
  assert.equal(chunk1.lastHash, "bbb");
  assert.deepEqual(chunk1.emitOrder, [
    { name: "f1.jpg", sourceFrame: "f1.jpg", reusePreviousChunk: false },
    { name: "f2.jpg", sourceFrame: "f1.jpg", reusePreviousChunk: false },
    { name: "f3.jpg", sourceFrame: "f3.jpg", reusePreviousChunk: false },
  ]);

  // First two frames of chunk 2 match chunk 1's last frame ("bbb")
  const chunk2 = planDeduplicatedChunk(
    [
      { name: "f4.jpg", hash: "bbb" },
      { name: "f5.jpg", hash: "bbb" },
      { name: "f6.jpg", hash: "ccc" },
    ],
    chunk1.lastHash,
  );
  assert.deepEqual(chunk2.uniqueFrames, ["f6.jpg"]);
  assert.equal(chunk2.skippedCount, 2);
  assert.deepEqual(chunk2.emitOrder, [
    { name: "f4.jpg", sourceFrame: null, reusePreviousChunk: true },
    { name: "f5.jpg", sourceFrame: null, reusePreviousChunk: true },
    { name: "f6.jpg", sourceFrame: "f6.jpg", reusePreviousChunk: false },
  ]);
});

test("computeChunkRanges splits frame counts evenly with bounded chunk sizes", () => {
  assert.deepEqual(computeChunkRanges(0, 60), []);
  assert.deepEqual(computeChunkRanges(130, 60), [
    { start: 0, end: 60, chunkIndex: 1, totalChunks: 3 },
    { start: 60, end: 120, chunkIndex: 2, totalChunks: 3 },
    { start: 120, end: 130, chunkIndex: 3, totalChunks: 3 },
  ]);
});

test("calculateVideoOverallProgress is monotonic across stages", () => {
  const p1 = calculateVideoOverallProgress("extracting", 0.5);
  const p2 = calculateVideoOverallProgress("extracting", 1);
  const p3 = calculateVideoOverallProgress("upscaling", 0.5);
  const p4 = calculateVideoOverallProgress("encoding", 0.5);
  const p5 = calculateVideoOverallProgress("encoding", 1);

  assert.ok(p1 < p2 && p2 < p3 && p3 < p4 && p4 < p5);
  assert.equal(p5, 1);
});

test("buildVideoOutputFilename uses normalized container extension", () => {
  assert.equal(
    buildVideoOutputFilename({
      inputName: "demo",
      model: "upscayl-standard-4x",
      scale: "2",
      useCustomWidth: false,
      customWidth: "",
      codec: "vp9",
      container: "mp4",
    }),
    "demo_upscayl_upscayl-standard-4x_2x.webm",
  );
  assert.equal(
    buildVideoOutputFilename({
      inputName: "demo",
      model: "digital-art-4x",
      scale: "4",
      useCustomWidth: true,
      customWidth: "1920",
      codec: "h265",
      container: "mkv",
    }),
    "demo_upscayl_digital-art-4x_1920px.mkv",
  );
});

test("estimateVideoOutputDimensions rounds up to even dimensions matching FFmpeg pad filter", () => {
  assert.deepEqual(
    estimateVideoOutputDimensions({
      width: 641,
      height: 361,
      scale: "1",
      useCustomWidth: false,
      customWidth: 0,
    }),
    { width: 642, height: 362 },
  );

  assert.deepEqual(
    estimateVideoOutputDimensions({
      width: 1280,
      height: 720,
      scale: "2",
      useCustomWidth: false,
      customWidth: 0,
    }),
    { width: 2560, height: 1440 },
  );
});

test("formatVideoDuration formats seconds, minutes, and hours", () => {
  assert.equal(formatVideoDuration(0), "0:00");
  assert.equal(formatVideoDuration(65), "1:05");
  assert.equal(formatVideoDuration(3661), "1:01:01");
});

test("parseTimeInput parses seconds, MM:SS, and HH:MM:SS formats", () => {
  assert.equal(parseTimeInput(""), null);
  assert.equal(parseTimeInput("12.5"), 12.5);
  assert.equal(parseTimeInput("1:30"), 90);
  assert.equal(parseTimeInput("01:02:03.5"), 3723.5);
  assert.equal(parseTimeInput("-5"), null);
  assert.equal(parseTimeInput("invalid"), null);
});

test("resolveVideoTrimRange clamps to duration and returns null for full video or inverted range", () => {
  assert.equal(
    resolveVideoTrimRange({ startSeconds: null, endSeconds: null, duration: 60 }),
    null,
  );
  assert.equal(
    resolveVideoTrimRange({ startSeconds: 0, endSeconds: 60, duration: 60 }),
    null,
  );
  assert.equal(
    resolveVideoTrimRange({ startSeconds: 30, endSeconds: 10, duration: 60 }),
    null,
  );
  assert.deepEqual(
    resolveVideoTrimRange({ startSeconds: 5, endSeconds: 15, duration: 60 }),
    {
      start: 5,
      end: 15,
      duration: 10,
      isTrimmed: true,
    },
  );
  assert.deepEqual(
    resolveVideoTrimRange({ startSeconds: 10, endSeconds: 999, duration: 30 }),
    {
      start: 10,
      end: 30,
      duration: 20,
      isTrimmed: true,
    },
  );
});

test("scaleRationalFps multiplies rational and integer frame rates cleanly", () => {
  assert.equal(scaleRationalFps("30000/1001", 2), "60000/1001");
  assert.equal(scaleRationalFps("24", 4), "96");
  assert.equal(scaleRationalFps("30/1", 1), "30/1");
});

test("buildRifeArgs builds proper rife-ncnn-vulkan command flags", () => {
  const args = buildRifeArgs({
    inputDir: "/tmp/in",
    outputDir: "/tmp/out",
    targetFrameCount: 120,
    gpuId: "0",
    format: "jpg",
  });
  assert.ok(args.includes("-i"));
  assert.ok(args.includes("/tmp/in"));
  assert.ok(args.includes("-o"));
  assert.ok(args.includes("/tmp/out"));
  assert.ok(args.includes("-n"));
  assert.ok(args.includes("120"));
  assert.ok(args.includes("-g"));
  assert.ok(args.includes("0"));
  assert.ok(args.includes("-f"));
  assert.ok(args.includes("frame_%08d.jpg"));
});

test("buildVideoExtractArgs adds fast -ss and -t when trim range is specified", () => {
  const args = buildVideoExtractArgs({
    inputVideo: "/videos/clip.mp4",
    outputPattern: "/tmp/frame_%08d.jpg",
    fpsRational: "30/1",
    intermediateFormat: "jpg",
    trimStartSeconds: 5,
    trimDurationSeconds: 10,
  });
  assert.ok(args.includes("-ss"));
  assert.ok(args.includes("5.000"));
  assert.ok(args.includes("-t"));
  assert.ok(args.includes("10.000"));
});

test("buildVideoEncodeArgs supports segmentOnly mode, ffmpeg minterpolate, and trimmed audio", () => {
  const segArgs = buildVideoEncodeArgs({
    fpsRational: "30/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/tmp/seg_00001.mp4",
    codec: "h264",
    container: "mp4",
    usePipe: true,
    segmentOnly: true,
    ffmpegInterpolateFps: "60/1",
  });
  assert.ok(segArgs.includes("-an"));
  assert.equal(segArgs.includes("/videos/in.mp4"), false);
  const vfIdx = segArgs.indexOf("-vf");
  assert.ok(vfIdx !== -1);
  assert.ok(segArgs[vfIdx + 1].includes("minterpolate=fps=60/1"));

  const trimArgs = buildVideoEncodeArgs({
    fpsRational: "30/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.mp4",
    keepAudio: true,
    hasAudio: true,
    usePipe: true,
    trimStartSeconds: 12,
    trimDurationSeconds: 5,
  });
  assert.ok(trimArgs.includes("-ss"));
  assert.ok(trimArgs.includes("12.000"));
  assert.ok(trimArgs.includes("-t"));
  assert.ok(trimArgs.includes("5.000"));
});

test("buildVideoConcatArgs stream-copies segments and optionally muxes trimmed audio", () => {
  const args = buildVideoConcatArgs({
    concatListPath: "/tmp/concat.txt",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/final.mp4",
    codec: "h264",
    container: "mp4",
    keepAudio: true,
    hasAudio: true,
    trimStartSeconds: 2,
    trimDurationSeconds: 8,
  });
  assert.ok(args.includes("-f"));
  assert.ok(args.includes("concat"));
  assert.ok(args.includes("-c:v"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-ss"));
  assert.ok(args.includes("2.000"));
  assert.ok(args.includes("+faststart"));
});

test("buildVideoOutputFilename appends interpolation and trim range tags when active", () => {
  assert.equal(
    buildVideoOutputFilename({
      inputName: "clip",
      model: "upscayl-standard-4x",
      scale: "2",
      useCustomWidth: false,
      customWidth: "",
      codec: "h264",
      container: "mp4",
      interpolationFactor: 2,
      trimRange: { start: 5, end: 10, duration: 5, isTrimmed: true },
    }),
    "clip_upscayl_upscayl-standard-4x_2x_2xfps_5s-10s.mp4",
  );
});

test("calculateVideoOverallProgress handles interpolating stage monotonically", () => {
  const pUp = calculateVideoOverallProgress("upscaling", 1);
  const pIntMid = calculateVideoOverallProgress("interpolating", 0.5);
  const pIntEnd = calculateVideoOverallProgress("interpolating", 1);
  const pEnc = calculateVideoOverallProgress("encoding", 0.5);
  assert.ok(pUp < pIntMid && pIntMid < pIntEnd && pIntEnd < pEnc);
});
