import { promisify } from "node:util";
import zlib from "node:zlib";
import { BtkError } from "../../errors.ts";
import type { Format } from "./formats.ts";

const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

export class CodecError extends BtkError {
  constructor(message: string, hint?: string) {
    super(message, { code: "ERR_CODEC", ...(hint && { hint }) });
    this.name = "CodecError";
  }
}

/** Bun's zlib typings want an ArrayBuffer-backed array; stdin buffers are typed as ArrayBufferLike. */
type Bytes = Uint8Array<ArrayBuffer>;

export async function compressBytes(input: Uint8Array, format: Format, level: number): Promise<Uint8Array> {
  const data = input as Bytes;
  switch (format) {
    case "gzip":
      return Bun.gzipSync(data, { level: level as 9, library: "libdeflate" });
    case "deflate":
      return Bun.deflateSync(data, { level: level as 9, library: "libdeflate" });
    case "zstd":
      return Bun.zstdCompress(data, { level });
    case "brotli":
      return brotliCompress(data, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: level,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
        },
      });
  }
}

export async function decompressBytes(input: Uint8Array, format: Format): Promise<Uint8Array> {
  const data = input as Bytes;
  try {
    switch (format) {
      case "gzip":
        return Bun.gunzipSync(data);
      case "deflate":
        return Bun.inflateSync(data);
      case "zstd":
        return await Bun.zstdDecompress(data);
      case "brotli":
        return await brotliDecompress(data);
    }
  } catch {
    throw new CodecError(
      `Not valid ${format} data, or the file is truncated`,
      "Pass --format if it was compressed with something else",
    );
  }
}
