// Enough bytes to inspect supported file signatures and container brands.
export const mediaInspectionBytes = 64;

const isoBoxSizeBytes = 4;

const fourCharacterCodeBytes = 4;

const isoBoxTypeOffset = isoBoxSizeBytes;

const isoBrandsOffset = isoBoxTypeOffset + fourCharacterCodeBytes;

const gifVersionBytes = 6;

const riffFormatOffset = 8;

const jpegSignature = [0xff, 0xd8, 0xff];

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const webmSignature = [0x1a, 0x45, 0xdf, 0xa3];

function startsWithSignature(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, start: number, end = bytes.length): string {
  return new TextDecoder().decode(bytes.subarray(start, end));
}

export function matchesMediaType(bytes: Uint8Array, mimeType: string): boolean {
  // ISO media boxes begin with a four-byte size, then a four-byte type.
  const boxType = readAscii(bytes, isoBoxTypeOffset, isoBrandsOffset);
  const brands = readAscii(bytes, isoBrandsOffset);
  switch (mimeType) {
    case "image/jpeg":
      return startsWithSignature(bytes, jpegSignature);
    case "image/png":
      return startsWithSignature(bytes, pngSignature);
    case "image/gif": {
      const version = readAscii(bytes, 0, gifVersionBytes);
      return version === "GIF87a" || version === "GIF89a";
    }
    case "image/webp":
      // A RIFF header has the container name, four-byte size, then format name.
      return (
        readAscii(bytes, 0, fourCharacterCodeBytes) === "RIFF" &&
        readAscii(bytes, riffFormatOffset, riffFormatOffset + fourCharacterCodeBytes) === "WEBP"
      );
    case "image/avif":
      return boxType === "ftyp" && /avif|avis/.test(brands);
    case "video/webm":
      return startsWithSignature(bytes, webmSignature);
    case "video/mp4":
      return boxType === "ftyp" && !/avif|avis|heic|heif/.test(brands);
    case "video/quicktime":
      return ["ftyp", "moov", "mdat", "wide"].includes(boxType);
    default:
      return false;
  }
}
