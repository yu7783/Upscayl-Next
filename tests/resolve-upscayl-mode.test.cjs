const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  resolveUpscaylMode,
} = require("../export/common/resolve-upscayl-mode.js");
const decodePath = require("../export/common/decode-path.js").default;
const getDirectoryFromPath =
  require("../export/common/get-directory-from-path.js").default;
const getFilenameFromPath =
  require("../export/common/get-file-name.js").default;

// ---------------------------------------------------------------------------
// GitHub issue #1405: a persisted `doubleUpscayl` flag used to win over
// `batchMode`, sending an empty imagePath to the double pipeline and producing
// the binary error "Input path and Output path both must be either a file or a
// directory!". These cases lock in the new precedence.
// ---------------------------------------------------------------------------
test("batch mode wins over double upscale when a folder is selected (#1405)", () => {
  const mode = resolveUpscaylMode({
    batchMode: true,
    doubleUpscayl: true,
    imagePath: "",
    batchFolderPath: "D:\\Pictures",
  });
  assert.equal(mode, "batch");
});

test("batch mode without a folder is invalid, even with double enabled", () => {
  const mode = resolveUpscaylMode({
    batchMode: true,
    doubleUpscayl: true,
    imagePath: "D:\\a.png",
    batchFolderPath: "",
  });
  assert.equal(mode, "invalid");
});

test("single image with double upscale resolves to double", () => {
  const mode = resolveUpscaylMode({
    batchMode: false,
    doubleUpscayl: true,
    imagePath: "D:\\a.png",
    batchFolderPath: "",
  });
  assert.equal(mode, "double");
});

test("single image without double upscale resolves to single", () => {
  const mode = resolveUpscaylMode({
    batchMode: false,
    doubleUpscayl: false,
    imagePath: "D:\\a.png",
    batchFolderPath: "",
  });
  assert.equal(mode, "single");
});

test("double upscale with an empty image path is invalid", () => {
  const mode = resolveUpscaylMode({
    batchMode: false,
    doubleUpscayl: true,
    imagePath: "",
    batchFolderPath: "D:\\Pictures",
  });
  assert.equal(mode, "invalid");
});

// ---------------------------------------------------------------------------
// Path helpers: document the behaviour that produced the "\.", "..", "._..."
// payloads in #1405 so a future change cannot silently regress it.
// ---------------------------------------------------------------------------
test("decodePath turns an empty string into the current directory", () => {
  assert.equal(decodePath(""), ".");
});

test("an empty decoded path yields an empty directory and a '.' filename", () => {
  const empty = decodePath("");
  assert.equal(getDirectoryFromPath(empty), "");
  assert.equal(getFilenameFromPath(empty), ".");
});

test("windows paths keep their separators after decodePath", () => {
  const decoded = decodePath("D:\\Pictures\\a.png");
  assert.equal(getDirectoryFromPath(decoded), "D:\\Pictures");
  assert.equal(getFilenameFromPath(decoded), "a.png");
});

test("a trailing separator still resolves to the parent directory", () => {
  const decoded = decodePath("D:\\Pictures\\");
  assert.equal(getDirectoryFromPath(decoded), "D:\\Pictures");
});

// ---------------------------------------------------------------------------
// Windows allows a literal "%" in folder names. decodeURIComponent throws on
// those raw paths, so decodePath must fall back instead of crashing the whole
// upscale command.
// ---------------------------------------------------------------------------
test("a literal percent in a raw Windows path does not throw", () => {
  const raw = "D:\\50% off\\a.png";
  assert.equal(decodePath(raw), path.normalize(raw));
});

test("an encoded percent sign is still decoded", () => {
  assert.equal(decodePath("D:\\50%25 off\\a.png"), "D:\\50% off\\a.png");
});
