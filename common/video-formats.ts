export const videoFormats = [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "m4v",
  "mpeg",
  "mpg",
  "wmv",
  "flv",
] as const;

export type VideoFormat = (typeof videoFormats)[number];

export const VALID_VIDEO_FORMATS = videoFormats;

export const isVideoPath = (filePath: string): boolean => {
  const extension = filePath.split(".").pop()?.toLowerCase();
  if (!extension) return false;
  return (videoFormats as readonly string[]).includes(extension);
};
