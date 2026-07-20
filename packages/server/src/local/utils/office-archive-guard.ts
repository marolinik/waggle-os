import AdmZip from 'adm-zip';

export const OFFICE_ARCHIVE_LIMITS = Object.freeze({
  filesPerRequest: 20,
  entriesPerArchive: 2048,
  uncompressedBytesPerEntry: 32 * 1024 * 1024,
  uncompressedBytesPerArchive: 64 * 1024 * 1024,
  uncompressedBytesPerRequest: 128 * 1024 * 1024,
  compressionRatio: 100,
  compressionRatioThresholdBytes: 1024 * 1024,
  extractedTextBytes: 512 * 1024,
  waitQueue: 4,
});

export type OfficeArchiveErrorCode =
  | 'office_archive_limit_exceeded'
  | 'invalid_office_archive'
  | 'ingest_busy';

export class OfficeArchiveError extends Error {
  readonly statusCode: 413 | 422 | 503;
  readonly code: OfficeArchiveErrorCode;
  readonly file: string;
  readonly metric?: string;
  readonly limit?: number;
  readonly actual?: number;

  constructor(options: {
    statusCode: 413 | 422 | 503;
    code: OfficeArchiveErrorCode;
    file: string;
    metric?: string;
    limit?: number;
    actual?: number;
  }) {
    const message = options.code === 'office_archive_limit_exceeded'
      ? 'Office archive safety limit exceeded'
      : options.code === 'ingest_busy'
        ? 'File ingestion is busy'
        : 'Invalid Office archive';
    super(message);
    this.name = 'OfficeArchiveError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.file = options.file;
    this.metric = options.metric;
    this.limit = options.limit;
    this.actual = options.actual;
  }
}

export interface VerifiedOfficeArchive {
  readonly buffer: Buffer;
  readonly entries: ReadonlyMap<string, Buffer>;
  readonly entryCount: number;
  readonly uncompressedBytes: number;
}

interface ParsedZipEntry {
  readonly name: string;
  readonly normalizedName: string;
  readonly rawName: Buffer;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
  readonly isDirectory: boolean;
}

interface ParsedZipDirectory {
  readonly entries: ParsedZipEntry[];
  readonly centralOffset: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UTF8_FLAG = 0x0800;
const SUPPORTED_METHODS = new Set([0, 8]);
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

let officeArchiveActive = false;
const officeArchiveWaiters: Array<() => void> = [];

function invalidArchive(file: string): OfficeArchiveError {
  return new OfficeArchiveError({
    statusCode: 422,
    code: 'invalid_office_archive',
    file,
  });
}

export function officeArchiveLimit(
  file: string,
  metric: string,
  limit: number,
  actual: number,
): OfficeArchiveError {
  return new OfficeArchiveError({
    statusCode: 413,
    code: 'office_archive_limit_exceeded',
    file,
    metric,
    limit,
    actual,
  });
}

function safeNumber(value: bigint, file: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidArchive(file);
  return Number(value);
}

function readUInt64(buffer: Buffer, offset: number, file: string): number {
  if (offset < 0 || offset + 8 > buffer.length) throw invalidArchive(file);
  return safeNumber(buffer.readBigUInt64LE(offset), file);
}

function findEndRecord(buffer: Buffer, file: string): number {
  if (buffer.length < 22) throw invalidArchive(file);
  const earliest = Math.max(0, buffer.length - 22 - MAX_UINT16);
  for (let offset = buffer.length - 22; offset >= earliest; offset--) {
    if (buffer.readUInt32LE(offset) !== END_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw invalidArchive(file);
}

function parseZip64Extra(
  extra: Buffer,
  raw: { uncompressedSize: number; compressedSize: number; localOffset: number; diskStart: number },
  file: string,
): { uncompressedSize: number; compressedSize: number; localOffset: number; diskStart: number } {
  let zip64: Buffer | undefined;
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) throw invalidArchive(file);
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > extra.length) throw invalidArchive(file);
    if (id === ZIP64_EXTRA_ID) {
      if (zip64) throw invalidArchive(file);
      zip64 = extra.subarray(cursor, cursor + length);
    }
    cursor += length;
  }

  const needsZip64 = raw.uncompressedSize === MAX_UINT32
    || raw.compressedSize === MAX_UINT32
    || raw.localOffset === MAX_UINT32
    || raw.diskStart === MAX_UINT16;
  if (!needsZip64) {
    if (zip64) {
      let offset = 0;
      while (offset + 8 <= zip64.length) {
        readUInt64(zip64, offset, file);
        offset += 8;
      }
      if (zip64.length - offset !== 0 && zip64.length - offset !== 4) throw invalidArchive(file);
    }
    return raw;
  }
  if (!zip64) throw invalidArchive(file);

  let zip64Offset = 0;
  const take64 = (): number => {
    const value = readUInt64(zip64!, zip64Offset, file);
    zip64Offset += 8;
    return value;
  };
  const uncompressedSize = raw.uncompressedSize === MAX_UINT32 ? take64() : raw.uncompressedSize;
  const compressedSize = raw.compressedSize === MAX_UINT32 ? take64() : raw.compressedSize;
  const localOffset = raw.localOffset === MAX_UINT32 ? take64() : raw.localOffset;
  let diskStart = raw.diskStart;
  if (raw.diskStart === MAX_UINT16) {
    if (zip64Offset + 4 > zip64.length) throw invalidArchive(file);
    diskStart = zip64.readUInt32LE(zip64Offset);
    zip64Offset += 4;
  }
  while (zip64Offset + 8 <= zip64.length) {
    readUInt64(zip64, zip64Offset, file);
    zip64Offset += 8;
  }
  if (zip64Offset !== zip64.length) throw invalidArchive(file);
  return { uncompressedSize, compressedSize, localOffset, diskStart };
}

function decodeAndNormalizeName(rawName: Buffer, flags: number, file: string): { name: string; normalized: string } {
  let name: string;
  try {
    if ((flags & UTF8_FLAG) === 0 && rawName.some((byte) => byte >= 0x80)) throw new Error('non-UTF8 name');
    name = new TextDecoder('utf-8', { fatal: true }).decode(rawName);
  } catch {
    throw invalidArchive(file);
  }
  const slashName = name.replace(/\\/g, '/');
  const withoutDirectorySuffix = slashName.endsWith('/') ? slashName.slice(0, -1) : slashName;
  const segments = withoutDirectorySuffix.split('/');
  if (
    !withoutDirectorySuffix
    || slashName.startsWith('/')
    || /^[a-zA-Z]:/.test(slashName)
    || slashName.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw invalidArchive(file);
  }
  return {
    name: slashName,
    normalized: segments.join('/').normalize('NFC').toLowerCase(),
  };
}

function assertRatio(
  file: string,
  metric: string,
  uncompressedBytes: number,
  compressedBytes: number,
): void {
  if (uncompressedBytes <= OFFICE_ARCHIVE_LIMITS.compressionRatioThresholdBytes) return;
  const ratio = Math.ceil(uncompressedBytes / Math.max(1, compressedBytes));
  if (ratio > OFFICE_ARCHIVE_LIMITS.compressionRatio) {
    throw officeArchiveLimit(
      file,
      metric,
      OFFICE_ARCHIVE_LIMITS.compressionRatio,
      ratio,
    );
  }
}

function parseCentralDirectory(buffer: Buffer, file: string, requestBytesBefore: number): ParsedZipDirectory {
  const endOffset = findEndRecord(buffer, file);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const diskEntries32 = buffer.readUInt16LE(endOffset + 8);
  const totalEntries32 = buffer.readUInt16LE(endOffset + 10);
  const centralSize32 = buffer.readUInt32LE(endOffset + 12);
  const centralOffset32 = buffer.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries32 !== totalEntries32) {
    throw invalidArchive(file);
  }

  let entryCount = totalEntries32;
  let centralSize = centralSize32;
  let centralOffset = centralOffset32;
  let directoryBoundary = endOffset;
  const needsZip64 = entryCount === MAX_UINT16
    || centralSize === MAX_UINT32
    || centralOffset === MAX_UINT32;
  if (needsZip64) {
    const locatorOffset = endOffset - 20;
    if (locatorOffset < 0 || buffer.readUInt32LE(locatorOffset) !== ZIP64_LOCATOR_SIGNATURE) {
      throw invalidArchive(file);
    }
    const zip64Disk = buffer.readUInt32LE(locatorOffset + 4);
    const zip64Offset = readUInt64(buffer, locatorOffset + 8, file);
    const totalDisks = buffer.readUInt32LE(locatorOffset + 16);
    if (zip64Disk !== 0 || totalDisks !== 1 || zip64Offset + 56 > locatorOffset) {
      throw invalidArchive(file);
    }
    if (buffer.readUInt32LE(zip64Offset) !== ZIP64_END_SIGNATURE) throw invalidArchive(file);
    const recordSize = readUInt64(buffer, zip64Offset + 4, file);
    if (recordSize < 44 || zip64Offset + 12 + recordSize !== locatorOffset) throw invalidArchive(file);
    if (buffer.readUInt32LE(zip64Offset + 16) !== 0 || buffer.readUInt32LE(zip64Offset + 20) !== 0) {
      throw invalidArchive(file);
    }
    const diskEntries = readUInt64(buffer, zip64Offset + 24, file);
    const totalEntries = readUInt64(buffer, zip64Offset + 32, file);
    if (diskEntries !== totalEntries) throw invalidArchive(file);
    entryCount = totalEntries;
    centralSize = readUInt64(buffer, zip64Offset + 40, file);
    centralOffset = readUInt64(buffer, zip64Offset + 48, file);
    directoryBoundary = zip64Offset;
  }

  if (entryCount > OFFICE_ARCHIVE_LIMITS.entriesPerArchive) {
    throw officeArchiveLimit(
      file,
      'archive_entries',
      OFFICE_ARCHIVE_LIMITS.entriesPerArchive,
      entryCount,
    );
  }
  if (
    centralOffset > directoryBoundary
    || centralSize > directoryBoundary - centralOffset
    || centralOffset + centralSize !== directoryBoundary
  ) {
    throw invalidArchive(file);
  }

  const entries: ParsedZipEntry[] = [];
  const normalizedNames = new Set<string>();
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > directoryBoundary || buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      throw invalidArchive(file);
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const rawCompressedSize = buffer.readUInt32LE(cursor + 20);
    const rawUncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const rawDiskStart = buffer.readUInt16LE(cursor + 34);
    const rawLocalOffset = buffer.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || recordEnd > directoryBoundary) throw invalidArchive(file);

    if ((flags & ENCRYPTION_FLAGS) !== 0 || method === 99) throw invalidArchive(file);
    if (!SUPPORTED_METHODS.has(method)) throw invalidArchive(file);
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const extra = buffer.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    const resolved = parseZip64Extra(extra, {
      uncompressedSize: rawUncompressedSize,
      compressedSize: rawCompressedSize,
      localOffset: rawLocalOffset,
      diskStart: rawDiskStart,
    }, file);
    if (resolved.diskStart !== 0) throw invalidArchive(file);

    const decoded = decodeAndNormalizeName(rawName, flags, file);
    if (normalizedNames.has(decoded.normalized)) throw invalidArchive(file);
    normalizedNames.add(decoded.normalized);
    const isDirectory = decoded.name.endsWith('/');

    if (resolved.uncompressedSize > OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerEntry) {
      throw officeArchiveLimit(
        file,
        'entry_uncompressed_bytes',
        OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerEntry,
        resolved.uncompressedSize,
      );
    }
    assertRatio(file, 'entry_compression_ratio', resolved.uncompressedSize, resolved.compressedSize);
    compressedBytes += resolved.compressedSize;
    uncompressedBytes += resolved.uncompressedSize;
    if (uncompressedBytes > OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerArchive) {
      throw officeArchiveLimit(
        file,
        'archive_uncompressed_bytes',
        OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerArchive,
        uncompressedBytes,
      );
    }
    if (requestBytesBefore + uncompressedBytes > OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerRequest) {
      throw officeArchiveLimit(
        file,
        'request_office_uncompressed_bytes',
        OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerRequest,
        requestBytesBefore + uncompressedBytes,
      );
    }
    entries.push({
      name: decoded.name,
      normalizedName: decoded.normalized,
      rawName: Buffer.from(rawName),
      flags,
      method,
      crc,
      compressedSize: resolved.compressedSize,
      uncompressedSize: resolved.uncompressedSize,
      localOffset: resolved.localOffset,
      isDirectory,
    });
    cursor = recordEnd;
  }
  if (cursor !== directoryBoundary) throw invalidArchive(file);
  assertRatio(file, 'archive_compression_ratio', uncompressedBytes, compressedBytes);
  return { entries, centralOffset, compressedBytes, uncompressedBytes };
}

function assertLocalHeader(buffer: Buffer, entry: ParsedZipEntry, centralOffset: number, file: string): void {
  const offset = entry.localOffset;
  if (offset < 0 || offset + 30 > centralOffset || buffer.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
    throw invalidArchive(file);
  }
  const flags = buffer.readUInt16LE(offset + 6);
  const method = buffer.readUInt16LE(offset + 8);
  const crc = buffer.readUInt32LE(offset + 14);
  const compressedSize = buffer.readUInt32LE(offset + 18);
  const uncompressedSize = buffer.readUInt32LE(offset + 22);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  if (dataOffset > centralOffset || entry.compressedSize > centralOffset - dataOffset) {
    throw invalidArchive(file);
  }
  const rawName = buffer.subarray(offset + 30, offset + 30 + nameLength);
  const localExtra = buffer.subarray(offset + 30 + nameLength, dataOffset);
  const localSizes = parseZip64Extra(localExtra, {
    uncompressedSize,
    compressedSize,
    localOffset: 0,
    diskStart: 0,
  }, file);
  if (!rawName.equals(entry.rawName) || flags !== entry.flags || method !== entry.method) {
    throw invalidArchive(file);
  }
  if ((flags & DATA_DESCRIPTOR_FLAG) === 0) {
    if (
      crc !== entry.crc
      || localSizes.compressedSize !== entry.compressedSize
      || localSizes.uncompressedSize !== entry.uncompressedSize
    ) {
      throw invalidArchive(file);
    }
  } else if (
    (crc !== 0 && crc !== entry.crc)
    || (compressedSize !== 0 && localSizes.compressedSize !== entry.compressedSize)
    || (uncompressedSize !== 0 && localSizes.uncompressedSize !== entry.uncompressedSize)
  ) {
    throw invalidArchive(file);
  }
}

function assertOfficePackageStructure(file: string, entries: ReadonlyMap<string, Buffer>): void {
  const lowerFile = file.toLowerCase();
  const requiredPart = lowerFile.endsWith('.docx')
    ? { path: 'word/document.xml', root: 'document' }
    : lowerFile.endsWith('.pptx')
      ? { path: 'ppt/presentation.xml', root: 'presentation' }
      : lowerFile.endsWith('.xlsx')
        ? { path: 'xl/workbook.xml', root: 'workbook' }
        : undefined;
  const contentTypes = entries.get('[content_types].xml');
  const document = requiredPart ? entries.get(requiredPart.path) : undefined;
  if (
    !requiredPart
    || !contentTypes?.length
    || !document?.length
    || !hasXmlRoot(contentTypes, 'Types')
    || !hasXmlRoot(document, requiredPart.root)
  ) {
    throw invalidArchive(file);
  }
}

function hasXmlRoot(data: Buffer, root: string): boolean {
  const head = data.subarray(0, 64 * 1024).toString('utf8');
  const withoutPreamble = head.replace(
    /^\uFEFF?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/,
    '',
  );
  return new RegExp(`^<(?:[A-Za-z_][\\w.-]*:)?${root}(?:\\s|>)`).test(withoutPreamble);
}

export function verifyOfficeArchive(
  file: string,
  buffer: Buffer,
  requestBytesBefore = 0,
): VerifiedOfficeArchive {
  const parsed = parseCentralDirectory(buffer, file, requestBytesBefore);
  for (const entry of parsed.entries) assertLocalHeader(buffer, entry, parsed.centralOffset, file);

  let zipEntries: AdmZip.IZipEntry[];
  try {
    zipEntries = new AdmZip(buffer, { noSort: true, readEntries: true }).getEntries();
  } catch {
    throw invalidArchive(file);
  }
  if (zipEntries.length !== parsed.entries.length) throw invalidArchive(file);

  const materialized = new Map<string, Buffer>();
  let actualArchiveBytes = 0;
  for (let index = 0; index < parsed.entries.length; index++) {
    const expected = parsed.entries[index];
    const actual = zipEntries[index];
    let normalizedName: string;
    try {
      normalizedName = decodeAndNormalizeName(actual.rawEntryName, actual.header.flags, file).normalized;
    } catch {
      throw invalidArchive(file);
    }
    if (
      normalizedName !== expected.normalizedName
      || actual.header.method !== expected.method
      || actual.header.crc !== expected.crc
      || actual.header.compressedSize !== expected.compressedSize
      || actual.header.size !== expected.uncompressedSize
      || actual.isDirectory !== expected.isDirectory
    ) {
      throw invalidArchive(file);
    }
    if (expected.isDirectory) continue;

    let compressed: Buffer;
    let data: Buffer;
    try {
      compressed = actual.getCompressedData();
      if (compressed.length !== expected.compressedSize) throw invalidArchive(file);
      data = actual.getData();
    } catch {
      throw invalidArchive(file);
    }
    if (data.length !== expected.uncompressedSize || (data.length === 0 && expected.crc !== 0)) {
      throw invalidArchive(file);
    }
    actualArchiveBytes += data.length;
    if (actualArchiveBytes > OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerArchive) {
      throw officeArchiveLimit(
        file,
        'archive_uncompressed_bytes',
        OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerArchive,
        actualArchiveBytes,
      );
    }
    if (requestBytesBefore + actualArchiveBytes > OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerRequest) {
      throw officeArchiveLimit(
        file,
        'request_office_uncompressed_bytes',
        OFFICE_ARCHIVE_LIMITS.uncompressedBytesPerRequest,
        requestBytesBefore + actualArchiveBytes,
      );
    }
    assertRatio(file, 'entry_compression_ratio', data.length, compressed.length);
    materialized.set(expected.normalizedName, data);
  }
  if (actualArchiveBytes !== parsed.uncompressedBytes) throw invalidArchive(file);
  assertOfficePackageStructure(file, materialized);
  return {
    buffer,
    entries: materialized,
    entryCount: parsed.entries.length,
    uncompressedBytes: actualArchiveBytes,
  };
}

async function acquireOfficeArchiveSlot(file: string): Promise<() => void> {
  if (officeArchiveActive) {
    if (officeArchiveWaiters.length >= OFFICE_ARCHIVE_LIMITS.waitQueue) {
      throw new OfficeArchiveError({ statusCode: 503, code: 'ingest_busy', file });
    }
    await new Promise<void>((resolve) => officeArchiveWaiters.push(resolve));
  } else {
    officeArchiveActive = true;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = officeArchiveWaiters.shift();
    if (next) next();
    else officeArchiveActive = false;
  };
}

export async function withOfficeArchiveSlot<T>(file: string, work: () => Promise<T>): Promise<T> {
  const release = await acquireOfficeArchiveSlot(file);
  try {
    return await work();
  } finally {
    release();
  }
}

export function capExtractedOfficeText(text: string): { text: string; truncated: boolean } {
  const encoded = Buffer.from(text, 'utf8');
  if (encoded.length <= OFFICE_ARCHIVE_LIMITS.extractedTextBytes) {
    return { text, truncated: false };
  }
  let end = OFFICE_ARCHIVE_LIMITS.extractedTextBytes;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (end > 0) {
    try {
      return { text: decoder.decode(encoded.subarray(0, end)), truncated: true };
    } catch {
      end--;
    }
  }
  return { text: '', truncated: true };
}
