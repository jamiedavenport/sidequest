export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string, size: number): ByteRange | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) {
    return undefined;
  }
  const [, firstByte, lastByte] = match;
  if (!firstByte && !lastByte) {
    return undefined;
  }

  let start: number;
  let end = size - 1;
  if (!firstByte) {
    // "bytes=-500" requests the last 500 bytes, or the whole file if smaller.
    const suffixLength = Number(lastByte);
    start = Math.max(0, size - suffixLength);
  } else {
    // "bytes=500-" starts at byte 500; "bytes=500-999" also supplies an inclusive end.
    start = Number(firstByte);
    if (lastByte) {
      end = Math.min(Number(lastByte), size - 1);
    }
  }
  if (start > end || start >= size) {
    return undefined;
  }
  return { start, end };
}
