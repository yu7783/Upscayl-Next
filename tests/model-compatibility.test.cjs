const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getModelCompatibility,
  getModelFileSupport,
} = require("../export/common/model-compatibility.js");

test("bundled NCNN models are reported as supported", () => {
  for (const id of [
    "upscayl-standard-4x",
    "high-fidelity-4x",
    "digital-art-4x",
    "4x-UltraSharp",
  ]) {
    const compatibility = getModelCompatibility(id);
    assert.equal(compatibility.engine, "ncnn", id);
    assert.equal(compatibility.supportedByBuiltInEngine, true, id);
  }
});

test("SUPIR and diffusion models are reported as supported", () => {
  for (const id of [
    "SUPIR-v0Q",
    "supir_f",
    "sdxl-upscaler",
    "diffusion-model",
  ]) {
    const compatibility = getModelCompatibility(id);
    assert.equal(compatibility.engine, "diffusion", id);
    assert.equal(compatibility.supportedByBuiltInEngine, true, id);
  }
});

test("DAT and DAT2 transformer models are reported as supported", () => {
  for (const id of ["4x-Nomos8kDAT", "DAT", "DAT2", "dat_sr"]) {
    const compatibility = getModelCompatibility(id);
    assert.equal(compatibility.engine, "transformer", id);
    assert.equal(compatibility.supportedByBuiltInEngine, true, id);
  }
});

test("HAT (Hybrid Attention Transformer) models are reported as supported", () => {
  for (const id of ["4x-HAT", "HAT-SRx4", "hat_gan", "Hybrid Attention Transformer"]) {
    const compatibility = getModelCompatibility(id);
    assert.equal(compatibility.engine, "transformer", id);
    assert.equal(compatibility.supportedByBuiltInEngine, true, id);
    assert.match(compatibility.label, /HAT/);
  }
});

test("the HAT token does not match unrelated words", () => {
  for (const id of ["what-is-this", "that-model", "shadow-upscaler"]) {
    assert.equal(getModelCompatibility(id).engine, "ncnn", id);
  }
});

test("getModelCompatibility detects ONNX and PyTorch extensions", () => {
  const onnx = getModelCompatibility("my-model.onnx");
  assert.equal(onnx.engine, "onnx");
  assert.equal(onnx.supportedByBuiltInEngine, true);

  for (const file of [
    "my-model.pth",
    "my-model.pt",
    "my-model.ckpt",
    "my-model.safetensors",
  ]) {
    const pytorch = getModelCompatibility(file);
    assert.equal(pytorch.engine, "pytorch", file);
    assert.equal(pytorch.supportedByBuiltInEngine, true, file);
  }
});

test("external checkpoints keep the architecture in the label", () => {
  const hat = getModelCompatibility("4x-HAT.pth");
  assert.equal(hat.engine, "pytorch");
  assert.match(hat.label, /PyTorch/);
  assert.match(hat.label, /HAT/);

  const dat = getModelCompatibility("DAT2_x2.safetensors");
  assert.equal(dat.engine, "pytorch");
  assert.match(dat.label, /DAT/);

  const supir = getModelCompatibility("SUPIR-v0Q.ckpt");
  assert.equal(supir.engine, "pytorch");
  assert.match(supir.label, /SUPIR/);

  const onnx = getModelCompatibility("4x-HAT.onnx");
  assert.equal(onnx.engine, "onnx");
  assert.match(onnx.label, /ONNX/);
  assert.match(onnx.label, /HAT/);
});

test("tokens inside unrelated words are not treated as DAT", () => {
  for (const id of ["update-model", "metadata-fix", "digital-art-4x"]) {
    const compatibility = getModelCompatibility(id);
    assert.equal(compatibility.engine, "ncnn", id);
  }
});

// ---------------------------------------------------------------------------
// Custom models folder inspection. NCNN, ONNX and PyTorch checkpoints are all
// accepted directly now; no conversion step is required.
// ---------------------------------------------------------------------------
test("NCNN .param/.bin files are reported as usable", () => {
  for (const file of [
    "4x-UltraSharp.param",
    "4x-UltraSharp.bin",
    "MODEL.PARAM",
    "MODEL.BIN",
  ]) {
    const support = getModelFileSupport(file);
    assert.equal(support.supportedByBuiltInEngine, true, file);
    assert.equal(support.engine, "ncnn", file);
  }
});

test("SUPIR safetensors checkpoints are accepted directly", () => {
  for (const file of ["SUPIR-v0Q.safetensors", "SUPIR-v0F.ckpt"]) {
    const support = getModelFileSupport(file);
    assert.equal(support.supportedByBuiltInEngine, true, file);
    assert.equal(support.engine, "pytorch", file);
    assert.match(support.label, /PyTorch/);
    assert.match(support.label, /SUPIR/);
  }
});

test("DAT / DAT2 checkpoints are accepted directly", () => {
  for (const file of [
    "4x-Nomos8kDAT.pth",
    "4x-Nomos8kDAT.safetensors",
    "DAT2_x2.pt",
  ]) {
    const support = getModelFileSupport(file);
    assert.equal(support.supportedByBuiltInEngine, true, file);
    assert.equal(support.engine, "pytorch", file);
    assert.match(support.label, /PyTorch/);
    assert.match(support.label, /DAT/);
  }
});

test("HAT checkpoints are accepted directly", () => {
  for (const file of ["4x-HAT.pth", "4x-HAT.safetensors", "HAT_x2.pt"]) {
    const support = getModelFileSupport(file);
    assert.equal(support.supportedByBuiltInEngine, true, file);
    assert.equal(support.engine, "pytorch", file);
    assert.match(support.label, /HAT/);
  }
});

test("an unknown onnx file is reported as usable", () => {
  const support = getModelFileSupport("my-model.onnx");
  assert.equal(support.supportedByBuiltInEngine, true);
  assert.equal(support.engine, "onnx");
  assert.match(support.label, /ONNX/);
});

test("extensions are matched case-insensitively", () => {
  const support = getModelFileSupport("SUPIR-v0Q.SafeTensors");
  assert.equal(support.supportedByBuiltInEngine, true);
  assert.equal(support.engine, "pytorch");
});
