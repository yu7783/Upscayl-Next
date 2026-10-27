import path from "path";

export default function decodePath(filePath: string): string {
  try {
    return path.normalize(decodeURIComponent(filePath));
  } catch {
    // Windows allows a literal "%" in file and folder names. Calling
    // decodeURIComponent on a raw path such as "C:\\50% off\\a.png" throws
    // URIError, which used to crash the whole upscale command. Fall back to
    // the path as provided instead of failing.
    return path.normalize(filePath);
  }
}
