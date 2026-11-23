const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseFrameRate,
  resolveVideoEncodingProfile,
  buildVideoExtractArgs,
  buildVideoEncodeArgs,
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

test("buildVideoExtractArgs enforces CFR extraction via fps filter", () => {
  const args = buildVideoExtractArgs({
    inputVideo: "/videos/clip.mp4",
    outputPattern: "/tmp/frame_%08d.png",
    fpsRational: "30000/1001",
  });
  assert.ok(args.includes("-vf"));
  assert.ok(args.includes("fps=30000/1001"));
  assert.equal(args.includes("-vsync"), false);
});

test("buildVideoEncodeArgs includes even-dimension padding, faststart, pipe input, and avoids -shortest truncation", () => {
  const args = buildVideoEncodeArgs({
    fpsRational: "60/1",
    inputVideo: "/videos/in.mp4",
    outputFile: "/videos/out.mp4",
    codec: "h264",
    container: "mp4",
    quality: "high",
    keepAudio: true,
    hasAudio: true,
    usePipe: true,
  });

  assert.ok(args.includes("image2pipe"));
  assert.ok(args.includes("pipe:0"));
  assert.ok(args.includes("pad=ceil(iw/2)*2:ceil(ih/2)*2"));
  assert.ok(args.includes("+faststart"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("16"));
  assert.ok(args.includes("aac"));
  assert.equal(args.includes("-shortest"), false);
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
  assert.ok(hevcArgs.includes("-an"));
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
