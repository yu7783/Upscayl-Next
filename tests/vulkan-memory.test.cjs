const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isVulkanMemoryError,
  getFallbackTileSize,
  MIN_TILE_SIZE,
  DEFAULT_RETRY_TILE_SIZE,
  VULKAN_MEMORY_ERROR_MESSAGE,
} = require("../export/common/vulkan-memory.js");

// ---------------------------------------------------------------------------
// Vulkan/VRAM allocation failures. upscayl-bin prints "vk Allocated memory
// failed -2" and aborts; we retry with a smaller tile size instead of failing.
// ---------------------------------------------------------------------------
test("detects the reported vk Allocated memory failed message", () => {
  assert.equal(isVulkanMemoryError("vk Allocated memory failed -2"), true);
  assert.equal(isVulkanMemoryError("vkAllocatedMemory failed -2"), true);
  assert.equal(isVulkanMemoryError("vkAllocateMemory failed -2"), true);
  assert.equal(isVulkanMemoryError("vk AllocateMemory failed -2"), true);
  assert.equal(isVulkanMemoryError("VK Allocated Memory Failed"), true);
  assert.equal(
    isVulkanMemoryError("vk::OutOfDeviceMemoryError: vkAllocateMemory failed"),
    true,
  );
  assert.equal(isVulkanMemoryError("VK_ERROR_OUT_OF_DEVICE_MEMORY"), true);
});

test("detects the message inside the video error wrapper", () => {
  assert.equal(
    isVulkanMemoryError(
      "Error upscaling video frames! vkAllocateMemory failed -2",
    ),
    true,
  );
});

test("ignores unrelated failures and empty output", () => {
  assert.equal(isVulkanMemoryError(""), false);
  assert.equal(isVulkanMemoryError("Error: invalid tile size"), false);
  assert.equal(isVulkanMemoryError("Input path and Output path both must be either a file or a directory!"), false);
  assert.equal(isVulkanMemoryError("failed to open image"), false);
});

test("a tile size of zero starts the fallback at 512", () => {
  assert.equal(getFallbackTileSize(0), DEFAULT_RETRY_TILE_SIZE);
  assert.equal(getFallbackTileSize(-1), DEFAULT_RETRY_TILE_SIZE);
  assert.equal(getFallbackTileSize(NaN), DEFAULT_RETRY_TILE_SIZE);
});

test("tile sizes step down the ladder until the minimum", () => {
  assert.equal(getFallbackTileSize(512), 256);
  assert.equal(getFallbackTileSize(256), 128);
  assert.equal(getFallbackTileSize(128), 64);
  assert.equal(getFallbackTileSize(64), 32);
  assert.equal(getFallbackTileSize(32), null);
});

test("values above the ladder and in-between values fall back safely", () => {
  assert.equal(getFallbackTileSize(4096), 512);
  assert.equal(getFallbackTileSize(300), 256);
  assert.equal(getFallbackTileSize(33), MIN_TILE_SIZE);
  assert.equal(getFallbackTileSize(MIN_TILE_SIZE), null);
});

test("the user-facing message mentions memory and a smaller tile size", () => {
  assert.match(VULKAN_MEMORY_ERROR_MESSAGE, /memory/i);
  assert.match(VULKAN_MEMORY_ERROR_MESSAGE, /tile size/i);
});
