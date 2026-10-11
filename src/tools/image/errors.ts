export type ImageProblem = {
  code: string;
  message: string;
  hint?: string;
};

const ENCODER_HINTS: Record<string, string> = {
  avif: "AVIF encoding needs macOS on Apple Silicon (M3 or newer) or Windows with the AV1 Video Extension. Try --format webp.",
  heic: "HEIC needs macOS, or Windows with the HEIF Image Extension. Try --format webp.",
  tiff: "TIFF can only be decoded on macOS and Windows.",
};

export function describeImageError(error: unknown, format?: string): ImageProblem {
  const code = (error as { code?: string } | null)?.code ?? "ERR_IMAGE";
  const raw = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "ERR_IMAGE_FORMAT_UNSUPPORTED":
      return {
        code,
        message: `${format?.toUpperCase() ?? "This format"} is not supported on this machine`,
        ...(format && ENCODER_HINTS[format] && { hint: ENCODER_HINTS[format] }),
      };
    case "ERR_IMAGE_UNKNOWN_FORMAT":
      return { code, message: "Not a recognized image (the file contents do not match any image format)" };
    case "ERR_IMAGE_DECODE_FAILED":
      return { code, message: "The image is corrupt or truncated and could not be decoded" };
    case "ERR_IMAGE_ENCODE_FAILED":
      return { code, message: `Encoding to ${format ?? "the target format"} failed`, hint: raw };
    case "ERR_IMAGE_TOO_MANY_PIXELS":
      return { code, message: "The image is too large to process (over 268 megapixels or 256 MiB)" };
    case "ENOENT":
      return { code, message: "File not found" };
    case "EACCES":
    case "EPERM":
      return { code, message: "Permission denied" };
    default:
      return { code, message: raw };
  }
}
