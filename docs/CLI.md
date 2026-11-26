# Upscayl-Next CLI

Upscayl-Next includes a command-line interface for automation, scripting, and headless batch pipelines.

## Running the CLI

From the repository (after `npm run tsc` or `npm run build`):

```bash
node export/cli/upscayl-cli.js --help
# or via npm script
npm run cli -- --help
```

You can also invoke headless CLI mode through the Electron app binary by passing `--cli`:

```bash
Upscayl-Next --cli image -i photo.jpg -o ./out -m high-fidelity-4x -s 4
```

## Commands

### 1. Single Image (`image`)
```bash
upscayl-next image -i photo.jpg -o ./out -m high-fidelity-4x -s 4 -f webp -c 10
```

### 2. Batch Folder (`batch`)
```bash
upscayl-next batch -i ./photos -o ./upscaled -m upscayl-standard-4x -s 2 -j 2:2:4
```

### 3. Multi-Model Comparison (`compare`)
```bash
upscayl-next compare -i art.png -o ./compare --models upscayl-standard-4x,digital-art-4x,ultrasharp-4x
```

### 4. Video Upscaling (`video`)
Supports trim ranges (`--start`, `--end`) and FPS interpolation (`--fps-mult 2|4`):
```bash
upscayl-next video -i clip.mp4 -o ./out -m digital-art-4x -s 2 --codec h265 --fps-mult 2 --start 0:05 --end 0:15
```

### 5. Image Blending (`blend`)
Blend two images pixel-accurately (e.g. Original + AI output or Model A + Model B):
```bash
upscayl-next blend --a original.jpg --b upscaled.png -o ./out --alpha 75 -f png
```

### 6. Model Catalog (`models`)
```bash
upscayl-next models --search anime
```
