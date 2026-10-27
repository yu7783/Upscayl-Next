const test = require("node:test");
const assert = require("node:assert/strict");

const { MODEL_PROFILES, resolveModelSettings } = require(
  "../export/common/model-profiles.js",
);
const { MODELS } = require("../export/common/models-list.js");

const currentSettings = {
  scale: "2",
  tileSize: 128,
  ttaMode: false,
  compression: 55,
  doubleUpscayl: true,
  threads: "1:1:1",
};

test("every bundled model has a profile", () => {
  for (const modelId of Object.keys(MODELS)) {
    assert.ok(MODEL_PROFILES[modelId], `${modelId} has no profile`);
  }
});

test("profiles use a valid load:process:save thread split", () => {
  for (const [modelId, profile] of Object.entries(MODEL_PROFILES)) {
    assert.match(profile.threads, /^\d+:\d+:\d+$/, modelId);
  }
});

test("auto-optimization applies the profile of a bundled model", () => {
  const next = resolveModelSettings("remacri-4x", true, currentSettings);
  assert.equal(next.scale, "4");
  assert.equal(next.ttaMode, true);
  assert.equal(next.threads, "1:2:2");
  assert.notEqual(next.compression, currentSettings.compression);
});

test("auto-optimization leaves custom settings untouched when disabled", () => {
  const next = resolveModelSettings("remacri-4x", false, currentSettings);
  assert.deepEqual(next, currentSettings);
});

test("auto-optimization keeps current settings for custom models", () => {
  const next = resolveModelSettings("my-custom-model", true, currentSettings);
  assert.deepEqual(next, currentSettings);
});

test("high fidelity profile requests a fixed tile size", () => {
  const next = resolveModelSettings("high-fidelity-4x", true, currentSettings);
  assert.equal(next.tileSize, 512);
});
