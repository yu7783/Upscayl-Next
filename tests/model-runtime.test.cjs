const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveModelRuntime,
  isNativeModel,
  getNativeEngineLabel,
  getNativeModelFileNameCandidates,
  hasExternalModelExtension,
} = require("../export/common/model-runtime.js");

// ---------------------------------------------------------------------------
// Runtime routing. NCNN models keep using upscayl-bin; HAT, DAT, SUPIR and any
// other PyTorch/ONNX checkpoint go to the bundled Python worker.
// ---------------------------------------------------------------------------
test("bundled NCNN models keep using upscayl-bin", () => {
  for (const id of ["upscayl-standard-4x", "high-fidelity-4x", "remacri-4x"]) {
    assert.equal(resolveModelRuntime(id), "ncnn", id);
    assert.equal(isNativeModel(id), false, id);
  }
});

test("HAT, DAT and SUPIR model ids use the native backend", () => {
  for (const id of ["4x-HAT", "HAT-SRx4", "DAT", "DAT2", "4x-Nomos8kDAT", "SUPIR-v0Q"]) {
    assert.equal(resolveModelRuntime(id), "python", id);
    assert.equal(isNativeModel(id), true, id);
  }
});

test("native model extensions are routed to the Python worker", () => {
  for (const id of [
    "4x-HAT.safetensors",
    "4x-HAT.pth",
    "DAT2_x2.pt",
    "SUPIR-v0Q.ckpt",
    "4x-HAT.onnx",
  ]) {
    assert.equal(hasExternalModelExtension(id), true, id);
    assert.equal(resolveModelRuntime(id), "python", id);
  }
});

test("ncnn extensions always stay on the ncnn runtime", () => {
  assert.equal(resolveModelRuntime("4x-HAT.param"), "ncnn");
  assert.equal(resolveModelRuntime("4x-HAT.bin"), "ncnn");
});

test("an ncnn file pair wins over a transformer-sounding name", () => {
  assert.equal(resolveModelRuntime("4x-HAT", { hasNcnnFiles: true }), "ncnn");
  assert.equal(resolveModelRuntime("DAT", { hasNcnnFiles: true }), "ncnn");
});

test("unknown model names without files keep the previous ncnn behaviour", () => {
  assert.equal(resolveModelRuntime("custom-model"), "ncnn");
  assert.equal(resolveModelRuntime(""), "ncnn");
});

test("engine labels describe the native family", () => {
  assert.match(getNativeEngineLabel("4x-HAT"), /HAT/);
  assert.match(getNativeEngineLabel("DAT2"), /DAT/);
  assert.match(getNativeEngineLabel("SUPIR-v0Q"), /SUPIR/);
  assert.match(getNativeEngineLabel("4x-HAT.onnx"), /ONNX/);
});

test("extension-less model ids expand to checkpoint candidates", () => {
  const candidates = getNativeModelFileNameCandidates("4x-HAT");
  assert.ok(candidates.includes("4x-HAT.safetensors"));
  assert.ok(candidates.includes("4x-HAT.pth"));
  assert.ok(candidates.includes("4x-HAT.onnx"));
  assert.deepEqual(getNativeModelFileNameCandidates("4x-HAT.pth"), ["4x-HAT.pth"]);
});
