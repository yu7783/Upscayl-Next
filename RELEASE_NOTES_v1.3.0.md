# Upscayl-Next v1.3.0

Feature release introducing **Multi-Model Sequential Comparison** and promoting **Video Upscaling** from Beta to an official, production-ready feature.

## Highlights

### Multi-Model Sequential Comparison
Built directly from user feedback (*"allowing me to generate a picture with multiple models in succession and then letting me compare the different generations"*):

- **Compare Multiple Models toggle** in the Image sidebar (works with all bundled NCNN models and imported custom NCNN / ONNX / HAT / DAT / SUPIR models).
- **Multi-select model picker** with sequence badges (`#1`, `#2`, ...), **Select All Bundled** / **Clear** actions, and removable model pills in the sidebar.
- **Sequential GPU-safe execution** (`electron/commands/multi-model-upscayl.ts`) with per-model Vulkan VRAM tile fallback (`512 → 256 → 128 → 64 → 32`), Double Upscayl support, EXIF metadata copying, cached output reuse, and per-model error isolation so one failing model does not abort the rest.
- **Interactive Comparison Viewer** (`MultiModelCompareView`):
  - **Slider (A/B)**: Compare Original or any generated model against any other model with quick **Swap A ↔ B** and keyboard shortcuts (`1–9` to switch B, `←`/`→` to cycle models).
  - **Grid (All)**: View Original and every generated model side-by-side with **synchronized zoom (`100%–400%`) and mouse pan**, per-model generation time badges, and one-click **Set A / Set B / Show File**.
  - **Lens (A/B)**: 4x magnifying loupe comparing any two selected generations.
- **Partial results on stop**: Stopping partway through still lets you immediately compare every model that already finished.

### Video Upscaling — Promoted from Beta to Official Feature
The video upscaling pipeline was thoroughly audited and rebuilt for production reliability:

- **Fixed VFR audio/video desync & bogus FPS detection**: `ffprobe` now reads a single JSON probe, prefers `avg_frame_rate` over container timebase `r_frame_rate` values (such as `90000/1` or `1000/1`), handles smartphone 90°/270° rotation metadata, and extracts strict CFR frames via `-vf fps=<rational>`.
- **Eliminated disk exhaustion on long videos**: Replaced full-video upscaled PNG storage with **chunked upscaling (60 frames/chunk)** piped directly into a single streaming FFmpeg encoder (`image2pipe`), deleting both input and upscaled PNGs progressively as each chunk completes.
- **Fixed odd-dimension encoding failures**: Added `-vf pad=ceil(iw/2)*2:ceil(ih/2)*2` so `yuv420p` encoding never crashes on odd widths/heights or custom output widths.
- **Fixed premature video truncation & playback compatibility**: Removed forced `-shortest` truncation and added `-movflags +faststart` for MP4 and `-tag:v hvc1` for H.265/HEVC.
- **Configurable encoding options**: Choose **MP4 (H.264)**, **MP4 (H.265 / HEVC)**, **MKV (H.264 / H.265)**, or **WebM (VP9)**; select **High / Balanced / Compact** quality presets; and toggle **Keep original audio**.
- **Dedicated Video Workspace**:
  - Drag and drop video files directly into the app (automatically switches to the Video tab).
  - Built-in FFmpeg & FFprobe readiness indicator with version detection and support for `UPSCAYL_FFMPEG_PATH` / `UPSCAYL_FFPROBE_PATH`.
  - Source video preview with resolution, estimated output resolution, FPS, duration, estimated frames, and audio codec metadata.
  - Flicker-free structured 3-stage progress overlay (Extract → Upscale → Finalize) with frame/chunk counts, ETA, and exit-code verification.
  - **Before/After Video Comparison Player** with synchronized Play/Pause/Seek, output file summary, and **Show in Folder**.
- **Reliable cancellation & cleanup**: Stopping any operation now cleanly terminates active child processes, deletes incomplete output files, removes temporary directories (including on app quit), and resets the UI progress state immediately.

## Other fixes

- Fixed false-positive "Read/Write Error" alerts triggered when log output contained substrings like `thread`.
- Restored clean `package-lock.json` integrity so `npm ci` works out of the box.
- Updated `npm test` glob pattern for compatibility across Node 18, 20, and 22 (72 unit tests passing).
