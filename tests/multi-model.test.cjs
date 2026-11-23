const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ORIGINAL_COMPARE_ID,
  normalizeModelSelection,
  buildMultiModelOutputPath,
  calculateMultiModelProgress,
  resolveDefaultComparePair,
} = require("../export/common/multi-model-helpers.js");
const {
  resolveUpscaylMode,
} = require("../export/common/resolve-upscayl-mode.js");

test("normalizeModelSelection deduplicates, trims, and preserves order", () => {
  const result = normalizeModelSelection([
    " upscayl-standard-4x ",
    "",
    "high-fidelity-4x",
    "upscayl-standard-4x",
    "digital-art-4x",
    "   ",
  ]);
  assert.deepEqual(result, [
    "upscayl-standard-4x",
    "high-fidelity-4x",
    "digital-art-4x",
  ]);
});

test("buildMultiModelOutputPath produces distinct paths per model and mode", () => {
  const standard = buildMultiModelOutputPath({
    outputDir: "D:\\Out",
    separator: "\\",
    fileName: "portrait",
    model: "upscayl-standard-4x",
    scale: "4",
    useCustomWidth: false,
    customWidth: "",
    saveImageAs: "png",
  });
  const hifi = buildMultiModelOutputPath({
    outputDir: "D:\\Out",
    separator: "\\",
    fileName: "portrait",
    model: "high-fidelity-4x",
    scale: "4",
    useCustomWidth: false,
    customWidth: "",
    saveImageAs: "png",
  });
  const doubled = buildMultiModelOutputPath({
    outputDir: "D:\\Out",
    separator: "\\",
    fileName: "portrait",
    model: "upscayl-standard-4x",
    scale: "4",
    useCustomWidth: false,
    customWidth: "",
    saveImageAs: "png",
    doubleUpscale: true,
  });
  const customWidth = buildMultiModelOutputPath({
    outputDir: "/tmp/out",
    separator: "/",
    fileName: "portrait",
    model: "digital-art-4x",
    scale: "4",
    useCustomWidth: true,
    customWidth: "2048",
    saveImageAs: "webp",
  });

  assert.equal(standard, "D:\\Out\\portrait_upscayl_4x_upscayl-standard-4x.png");
  assert.equal(hifi, "D:\\Out\\portrait_upscayl_4x_high-fidelity-4x.png");
  assert.equal(doubled, "D:\\Out\\portrait_upscayl_4x2_upscayl-standard-4x.png");
  assert.equal(customWidth, "/tmp/out/portrait_upscayl_2048px_digital-art-4x.webp");
  assert.notEqual(standard, hifi);
  assert.notEqual(standard, doubled);
});

test("calculateMultiModelProgress computes smooth monotonic progress across models and passes", () => {
  // 4 models, single pass each
  assert.equal(
    calculateMultiModelProgress({
      modelIndex: 0,
      totalModels: 4,
      pass: 1,
      totalPasses: 1,
      passPercent: 0,
    }),
    0,
  );
  assert.equal(
    calculateMultiModelProgress({
      modelIndex: 1,
      totalModels: 4,
      pass: 1,
      totalPasses: 1,
      passPercent: 50,
    }),
    0.375,
  );
  assert.equal(
    calculateMultiModelProgress({
      modelIndex: 3,
      totalModels: 4,
      pass: 1,
      totalPasses: 1,
      passPercent: 100,
    }),
    1,
  );

  // 2 models, 2 passes (double upscale) each
  assert.equal(
    calculateMultiModelProgress({
      modelIndex: 0,
      totalModels: 2,
      pass: 2,
      totalPasses: 2,
      passPercent: 50,
    }),
    0.375,
  );
  assert.equal(
    calculateMultiModelProgress({
      modelIndex: 1,
      totalModels: 2,
      pass: 1,
      totalPasses: 2,
      passPercent: 100,
    }),
    0.75,
  );
});

test("resolveDefaultComparePair compares the first two succeeded models when 2+ succeed", () => {
  const pair = resolveDefaultComparePair([
    {
      modelId: "broken-model",
      outputPath: "",
      durationMs: 100,
      status: "error",
      error: "boom",
    },
    {
      modelId: "upscayl-standard-4x",
      outputPath: "/out/a.png",
      durationMs: 1200,
      status: "done",
    },
    {
      modelId: "high-fidelity-4x",
      outputPath: "/out/b.png",
      durationMs: 2100,
      status: "done",
    },
  ]);

  assert.deepEqual(pair, {
    leftId: "upscayl-standard-4x",
    rightId: "high-fidelity-4x",
  });
});

test("resolveDefaultComparePair compares original vs single succeeded model", () => {
  const pair = resolveDefaultComparePair([
    {
      modelId: "upscayl-standard-4x",
      outputPath: "/out/a.png",
      durationMs: 900,
      status: "done",
    },
  ]);

  assert.deepEqual(pair, {
    leftId: ORIGINAL_COMPARE_ID,
    rightId: "upscayl-standard-4x",
  });
});

test("resolveUpscaylMode supports multi-model comparison and enforces 2+ models", () => {
  assert.equal(
    resolveUpscaylMode({
      batchMode: false,
      doubleUpscayl: false,
      imagePath: "D:\\a.png",
      batchFolderPath: "",
      multiModelMode: true,
      multiModelCount: 3,
    }),
    "multi-model",
  );

  assert.equal(
    resolveUpscaylMode({
      batchMode: false,
      doubleUpscayl: true,
      imagePath: "D:\\a.png",
      batchFolderPath: "",
      multiModelMode: true,
      multiModelCount: 2,
    }),
    "multi-model",
  );

  assert.equal(
    resolveUpscaylMode({
      batchMode: false,
      doubleUpscayl: false,
      imagePath: "D:\\a.png",
      batchFolderPath: "",
      multiModelMode: true,
      multiModelCount: 1,
    }),
    "invalid",
  );

  assert.equal(
    resolveUpscaylMode({
      batchMode: true,
      doubleUpscayl: false,
      imagePath: "D:\\a.png",
      batchFolderPath: "D:\\Folder",
      multiModelMode: true,
      multiModelCount: 3,
    }),
    "batch",
  );
});
