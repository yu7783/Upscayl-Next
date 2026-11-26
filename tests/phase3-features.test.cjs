const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");

const {
  MODEL_CATALOG,
  filterModelCatalog,
  getCatalogTags,
} = require("../export/common/model-catalog.js");

const {
  createQueueJob,
  enqueueJob,
  removeQueueJob,
  moveQueueJob,
  pickNextPendingJob,
  updateQueueJob,
  clearFinishedJobs,
  summarizeQueue,
} = require("../export/common/job-queue-helpers.js");

const {
  parseCliArgs,
  formatCliHelp,
} = require("../export/common/cli-parser.js");

test("MODEL_CATALOG provides valid downloadable model entries and tag/query filtering", () => {
  assert.ok(MODEL_CATALOG.length >= 6);
  for (const entry of MODEL_CATALOG) {
    assert.ok(entry.id && entry.name);
    assert.ok(entry.files.length >= 1);
    for (const f of entry.files) {
      assert.ok(f.filename && f.url.startsWith("https://"));
    }
  }
  const tags = getCatalogTags(MODEL_CATALOG);
  assert.ok(tags.includes("anime"));
  assert.ok(tags.includes("photo"));

  const anime = filterModelCatalog(MODEL_CATALOG, { tag: "anime" });
  assert.ok(anime.length >= 2);
  assert.ok(anime.every((e) => e.tags.includes("anime")));

  const ultrasharp = filterModelCatalog(MODEL_CATALOG, { query: "ultrasharp" });
  assert.equal(ultrasharp.length, 1);
  assert.equal(ultrasharp[0].id, "4x-UltraSharp");
});

test("job-queue-helpers handles enqueue, reorder, pick, update, remove, clear, and summary cleanly", () => {
  const j1 = createQueueJob({ id: "j1", type: "image", label: "a.png", payload: {} });
  const j2 = createQueueJob({ id: "j2", type: "video", label: "b.mp4", payload: {} });
  const j3 = createQueueJob({ id: "j3", type: "batch", label: "folder", payload: {} });

  let jobs = [];
  jobs = enqueueJob(jobs, j1);
  jobs = enqueueJob(jobs, j2);
  jobs = enqueueJob(jobs, j3);
  assert.deepEqual(jobs.map((j) => j.id), ["j1", "j2", "j3"]);

  jobs = moveQueueJob(jobs, "j2", "up");
  assert.deepEqual(jobs.map((j) => j.id), ["j2", "j1", "j3"]);

  const next = pickNextPendingJob(jobs);
  assert.equal(next.id, "j2");

  // Running job cannot be removed
  jobs = updateQueueJob(jobs, "j2", { status: "running", progress: 40 });
  jobs = removeQueueJob(jobs, "j2");
  assert.equal(jobs.length, 3);

  // Pending job can be removed
  jobs = removeQueueJob(jobs, "j3");
  assert.equal(jobs.length, 2);

  jobs = updateQueueJob(jobs, "j2", { status: "done", progress: 100 });
  assert.deepEqual(summarizeQueue(jobs), {
    total: 2,
    pending: 1,
    running: 0,
    done: 1,
    error: 0,
  });

  jobs = clearFinishedJobs(jobs);
  assert.deepEqual(jobs.map((j) => j.id), ["j1"]);
});

test("parseCliArgs parses image, compare, video, blend, models, and validates bad flags", () => {
  const img = parseCliArgs([
    "image",
    "-i",
    "photo.jpg",
    "-o",
    "./out",
    "-m",
    "high-fidelity-4x",
    "-s",
    "4",
    "-f",
    "webp",
    "-c",
    "15",
    "--double",
    "--face-restore",
    "--face-strength=80",
  ]);
  assert.equal(img.errors.length, 0);
  assert.equal(img.command, "image");
  assert.equal(img.input, "photo.jpg");
  assert.equal(img.format, "webp");
  assert.equal(img.compression, 15);
  assert.equal(img.doubleUpscale, true);
  assert.equal(img.faceRestore, true);
  assert.equal(img.faceStrength, 80);

  const cmp = parseCliArgs([
    "compare",
    "-i",
    "a.png",
    "-o",
    "./out",
    "--models",
    "upscayl-standard-4x,digital-art-4x",
  ]);
  assert.deepEqual(cmp.models, ["upscayl-standard-4x", "digital-art-4x"]);

  const vid = parseCliArgs([
    "video",
    "-i",
    "clip.mp4",
    "-o",
    "./out",
    "--codec",
    "h265",
    "--fps-mult",
    "2",
    "--start",
    "0:05",
    "--end",
    "0:10",
    "--no-audio",
  ]);
  assert.equal(vid.codec, "h265");
  assert.equal(vid.fpsMult, 2);
  assert.equal(vid.keepAudio, false);
  assert.equal(vid.start, "0:05");
  assert.equal(vid.end, "0:10");

  const bad = parseCliArgs(["image", "-f", "bmp", "--unknown-flag"]);
  assert.equal(bad.errors.length, 2);

  assert.ok(formatCliHelp("1.3.1").includes("Upscayl-Next CLI v1.3.1"));
});

test("compiled CLI executes --help, models --search, and blend end-to-end", async () => {
  const cliEntry = path.join(__dirname, "..", "export", "cli", "upscayl-cli.js");

  const helpRun = spawnSync(process.execPath, [cliEntry, "--help"], {
    encoding: "utf8",
  });
  assert.equal(helpRun.status, 0);
  assert.ok(helpRun.stdout.includes("Upscayl-Next CLI"));

  const modelsRun = spawnSync(
    process.execPath,
    [cliEntry, "models", "--search", "anime"],
    { encoding: "utf8" },
  );
  assert.equal(modelsRun.status, 0);
  assert.ok(modelsRun.stdout.includes("4x-AnimeSharp"));

  // Real Sharp blend via CLI
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-cli-test-"));
  try {
    const imgA = path.join(tmpDir, "a.png");
    const imgB = path.join(tmpDir, "b.png");
    await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
    })
      .png()
      .toFile(imgA);
    await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 220, g: 140, b: 160, alpha: 1 } },
    })
      .png()
      .toFile(imgB);

    const blendRun = spawnSync(
      process.execPath,
      [cliEntry, "blend", "--a", imgA, "--b", imgB, "-o", tmpDir, "--alpha", "50", "-f", "png"],
      { encoding: "utf8" },
    );
    assert.equal(blendRun.status, 0, blendRun.stderr);
    assert.ok(blendRun.stdout.includes("Blended image saved:"));
    const saved = fs.readdirSync(tmpDir).find((f) => f.includes("_blend_"));
    assert.ok(saved, "Expected blended output file to exist");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
