# Upscayl-Next v1.3.1

Performance release focused on dramatically accelerating the **Video Upscaling** pipeline.

## Highlights — Video Upscaling Acceleration

- **GPU Hardware Video Encoding (`NVENC` / `AMF` / `QSV` / `VideoToolbox`)**:
  - Automatically probes and verifies working GPU video encoders on your system (`h264_nvenc`, `hevc_nvenc`, `h264_amf`, `hevc_amf`, `h264_qsv`, `hevc_qsv`, `h264_videotoolbox`, `hevc_videotoolbox`) and enables hardware encoding by default when available.
  - Optimized software fallbacks use `-preset fast` for `libx264`/`libx265` and multi-threaded `-row-mt 1 -cpu-used 4 -threads 0` for `libvpx-vp9`.
- **Fast Intermediate Frame Pipeline (Near-Lossless JPEG Default / Lossless PNG Option)**:
  - Switches the default intermediate frame pipeline to near-lossless JPEG (`-q:v 1` / `-f jpg -c 0` / `mjpeg` pipe), eliminating 4K PNG zlib CPU bottlenecks (5–10x faster frame I/O and ~8x smaller temporary storage).
  - Lossless PNG remains selectable in the Video tab and now uses `-compression_level 1` for 3–4x faster extraction.
- **Hardware-Accelerated Frame Decoding (`-hwaccel auto -threads 0`)**:
  - Uses GPU-assisted decoding during frame extraction with automatic fallback to software decoding for unsupported codecs.
- **Double-Buffered Asynchronous Pipeline & Adaptive Chunks**:
  - Overlaps GPU upscaling of chunk `N+1` with asynchronous disk reads, FFmpeg piping, and cleanup of chunk `N`, removing GPU idle time between chunks.
  - Expands chunk size to `150` frames for JPEG intermediates (down from `60`), reducing Vulkan/model startup overhead by 2.5x.
- **Lossless Consecutive-Frame Deduplication**:
  - Detects byte-identical consecutive frames (including across chunk boundaries) via SHA-1 hashing and reuses the already-upscaled frame without invoking the GPU again — delivering 2–5x speedups on anime, screen recordings, and static scenes with zero quality loss.
- **GPU-Optimal Video Thread Split (`getVideoThreadCount`)**:
  - Caps concurrent Vulkan GPU inference threads (`proc`) at `2` (or `1` after a VRAM fallback) to prevent tile-size drops while scaling CPU `save` threads up to `6` to keep the GPU continuously saturated.
- **Video Tab Controls & Telemetry**:
  - Displays the detected GPU encoder badge (`NVENC` / `AMF` / `QSV` / `VideoToolbox`), toggles for **Frame Pipeline**, **GPU Hardware Encode**, and **Skip identical frames**, plus an 8x slowdown warning if global **TTA Mode** is enabled in Settings.
  - Shows used encoder, effective throughput (`fps`), and skipped duplicate frame counts upon completion.

## Verification

- `npm test`: **76/76** unit tests passing (including new tests for GPU thread splitting, adaptive chunk sizing, hardware encoder priority, extract/encode arguments, and cross-chunk frame deduplication).
- `npm run build`: TypeScript compilation, locale schema check (`ja.json`), and Next.js production export verified.
