/**
 * Pick a "load:proc:save" thread split (-j) for upscayl-bin.
 *
 * The binary spends most of its time loading and saving files during a batch,
 * while processing is usually GPU bound. Scaling the load/save stages with the
 * CPU core count keeps large folders from starving the GPU without changing
 * quality. Tiny batches keep the binary default because the extra threads cost
 * more to spawn than they save.
 */
export function getThreadCount({
  totalImages,
  cpuCount,
}: {
  totalImages: number;
  cpuCount: number;
}): string {
  const cores = Math.max(1, Math.floor(cpuCount) || 1);

  if (totalImages < 4) return "1:2:2";

  // Cap load/save at 4 threads: more than that only adds context switching on
  // the single disk or network share that holds the folder.
  const io = Math.max(1, Math.min(4, Math.round(cores / 2)));

  if (totalImages < 16) {
    const smallIo = Math.min(2, io);
    return `${smallIo}:2:${smallIo}`;
  }

  const proc = Math.max(1, Math.min(8, cores));
  return `${io}:${proc}:${io}`;
}

export default getThreadCount;
