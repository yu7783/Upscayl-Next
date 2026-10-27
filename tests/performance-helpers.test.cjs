const test = require("node:test");
const assert = require("node:assert/strict");

const getThreadCount = require("../export/common/thread-count.js").default;
const countOccurrences =
  require("../export/common/count-occurrences.js").default;

// ---------------------------------------------------------------------------
// -j "load:proc:save" tuning. Threads must scale with real cores so weak
// machines are not oversubscribed and large machines are not left idle.
// ---------------------------------------------------------------------------
test("tiny batches keep the binary default", () => {
  assert.equal(getThreadCount({ totalImages: 1, cpuCount: 16 }), "1:2:2");
  assert.equal(getThreadCount({ totalImages: 3, cpuCount: 8 }), "1:2:2");
});

test("medium batches use at most two load/save threads", () => {
  assert.equal(getThreadCount({ totalImages: 4, cpuCount: 16 }), "2:2:2");
  assert.equal(getThreadCount({ totalImages: 15, cpuCount: 2 }), "1:2:1");
});

test("large batches scale with the CPU core count", () => {
  assert.equal(getThreadCount({ totalImages: 32, cpuCount: 16 }), "4:8:4");
  assert.equal(getThreadCount({ totalImages: 32, cpuCount: 4 }), "2:4:2");
  // A single-core machine must never request zero threads.
  assert.equal(getThreadCount({ totalImages: 64, cpuCount: 1 }), "1:1:1");
});

test("a missing or invalid core count still yields valid threads", () => {
  assert.equal(getThreadCount({ totalImages: 40, cpuCount: 0 }), "1:1:1");
  assert.equal(getThreadCount({ totalImages: 40, cpuCount: NaN }), "1:1:1");
});

// ---------------------------------------------------------------------------
// Progress parsing. Batch logs emit "Successful" once per image; counting
// without allocating a match array keeps long runs cheap.
// ---------------------------------------------------------------------------
test("countOccurrences counts every occurrence", () => {
  assert.equal(
    countOccurrences("Successful Successful Successful", "Successful"),
    3,
  );
  assert.equal(countOccurrences("Successful\nSuccessful\n", "Successful"), 2);
});

test("countOccurrences returns zero when the needle is absent", () => {
  assert.equal(countOccurrences("nothing here", "Successful"), 0);
  assert.equal(countOccurrences("", "Successful"), 0);
});

test("countOccurrences does not count overlapping matches twice", () => {
  assert.equal(countOccurrences("aaaa", "aa"), 2);
});

test("countOccurrences ignores an empty needle", () => {
  assert.equal(countOccurrences("anything", ""), 0);
});
