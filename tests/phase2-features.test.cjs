const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");

const {
  clampRoiRect,
  percentRectToPixel,
  pixelRectToPercent,
  isValidRoiRect,
} = require("../export/common/roi-helpers.js");

const {
  clampBlendAlpha,
  buildBlendOutputPath,
  blendRgbaBuffers,
} = require("../export/common/blend-helpers.js");

const {
  BUILTIN_RECIPES,
  sanitizeRecipe,
  serializeRecipes,
  parseRecipesJson,
} = require("../export/common/recipe-helpers.js");

test("clampRoiRect bounds coordinates safely and rejects tiny regions", () => {
  assert.deepEqual(
    clampRoiRect({ x: -10, y: 20, width: 200, height: 150 }, 100, 100),
    { x: 0, y: 20, width: 100, height: 80 },
  );
  assert.equal(
    clampRoiRect({ x: 10, y: 10, width: 8, height: 8 }, 100, 100),
    null,
  );
  assert.equal(isValidRoiRect({ x: 0, y: 0, width: 32, height: 32 }), true);
  assert.equal(isValidRoiRect(null), false);
});

test("percentRectToPixel and pixelRectToPercent round-trip cleanly", () => {
  const px = percentRectToPixel(
    { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
    400,
    200,
  );
  assert.deepEqual(px, { x: 100, y: 100, width: 200, height: 50 });
  const pct = pixelRectToPercent(px, 400, 200);
  assert.deepEqual(pct, { x: 0.25, y: 0.5, width: 0.5, height: 0.25 });
});

test("clampBlendAlpha and buildBlendOutputPath sanitize tags and bounds", () => {
  assert.deepEqual(clampBlendAlpha(-20), { percent: 0, alpha: 0 });
  assert.deepEqual(clampBlendAlpha(150), { percent: 100, alpha: 1 });
  assert.deepEqual(clampBlendAlpha(35.4), { percent: 35, alpha: 0.35 });

  const out = buildBlendOutputPath({
    outputDir: "/out",
    separator: "/",
    baseName: "portrait",
    labelA: "Original Image",
    labelB: "high-fidelity-4x",
    alphaPercent: 70,
    saveImageAs: "webp",
  });
  assert.equal(
    out,
    "/out/portrait_blend_Original-Image_30_high-fidelity-4x_70.webp",
  );
});

test("blendRgbaBuffers blends RGBA channels accurately and works with Sharp end-to-end", async () => {
  const bufA = new Uint8Array([0, 0, 0, 255, 100, 200, 50, 255]);
  const bufB = new Uint8Array([200, 100, 50, 255, 200, 100, 150, 255]);
  const mid = blendRgbaBuffers(bufA, bufB, 0.5);
  assert.deepEqual(Array.from(mid), [100, 50, 25, 255, 150, 150, 100, 255]);

  // Verify real Sharp crop + blend roundtrip on temp images
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-p2-test-"));
  try {
    const imgA = path.join(tmpDir, "a.png");
    const imgB = path.join(tmpDir, "b.png");
    await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toFile(imgA);
    await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
    })
      .png()
      .toFile(imgB);

    const rawA = await sharp(imgA).resize(64, 64, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const rawB = await sharp(imgB).ensureAlpha().raw().toBuffer();
    const outBuf = blendRgbaBuffers(rawA, rawB, 0.5);
    assert.equal(outBuf[0], 100);
    assert.equal(outBuf[1], 50);
    assert.equal(outBuf[2], 25);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("recipe serialization, parsing, and sanitization preserve all Phase 2 settings", () => {
  assert.ok(BUILTIN_RECIPES.length >= 3);
  const json = serializeRecipes(BUILTIN_RECIPES);
  const parsed = parseRecipesJson(json);
  assert.equal(parsed.length, BUILTIN_RECIPES.length);
  assert.equal(parsed[0].builtin, false);
  assert.equal(parsed[0].settings.model, BUILTIN_RECIPES[0].settings.model);
  assert.equal(parsed[0].settings.faceRestore, BUILTIN_RECIPES[0].settings.faceRestore);
  assert.equal(parsed[1].settings.videoInterpolation, 2);

  assert.equal(sanitizeRecipe({ name: "", settings: {} }), null);
  const sanitized = sanitizeRecipe({
    name: "My Custom",
    settings: {
      model: "ultrasharp-4x",
      compression: 999,
      saveImageAs: "invalid",
      videoInterpolation: 4,
      blendAlpha: -10,
      faceRestore: true,
      faceRestoreStrength: 85,
    },
  });
  assert.equal(sanitized.settings.compression, 100);
  assert.equal(sanitized.settings.saveImageAs, "png");
  assert.equal(sanitized.settings.videoInterpolation, 4);
  assert.equal(sanitized.settings.blendAlpha, 0);
  assert.equal(sanitized.settings.faceRestoreStrength, 85);
});

test("native face_restore.py --check returns valid readiness JSON", () => {
  const scriptPath = path.join(
    __dirname,
    "..",
    "native",
    "upscayl_native",
    "face_restore.py",
  );
  const probe = spawnSync("python3", [scriptPath, "--check"], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(probe.status, 0);
  const parsed = JSON.parse(probe.stdout.trim());
  assert.equal(typeof parsed.available, "boolean");
  assert.ok(Array.isArray(parsed.engines));
});
