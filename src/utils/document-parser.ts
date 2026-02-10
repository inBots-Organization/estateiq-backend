// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');

/**
 * Document Parser — Extracts text from PDF, DOCX, and TXT files.
 * Operates on in-memory buffers (from multer memoryStorage).
 */

export interface ParsedDocument {
  text: string;
  pageCount: number;
  metadata: Record<string, unknown>;
}

const SUPPORTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

export function isSupportedFileType(mimeType: string): boolean {
  return mimeType in SUPPORTED_TYPES;
}

export function getSupportedMimeTypes(): string[] {
  return Object.keys(SUPPORTED_TYPES);
}

export async function parseDocument(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
  const type = SUPPORTED_TYPES[mimeType];

  if (!type) {
    throw new Error(`Unsupported file type: ${mimeType}. Supported: ${getSupportedMimeTypes().join(', ')}`);
  }

  switch (type) {
    case 'pdf':
      return parsePDF(buffer);
    case 'docx':
      return parseDOCX(buffer);
    case 'txt':
      return parseTXT(buffer);
    default:
      throw new Error(`Parser not implemented for type: ${type}`);
  }
}

async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  const uint8Array = new Uint8Array(buffer);
  const parser = new PDFParse(uint8Array);
  await parser.load();
  const result = await parser.getText();

  const pageTexts = result.pages
    .map((page: { text: string; num: number }) => page.text)
    .filter((t: string) => t.trim().length > 0);
  const text = pageTexts.join('\n\n').trim();

  parser.destroy();

  return {
    text,
    pageCount: result.pages.length,
    metadata: {},
  };
}

async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  // Dynamic import for mammoth (ESM-compatible)
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });

  // Estimate page count (~3000 chars per page)
  const pageCount = Math.max(1, Math.ceil(result.value.length / 3000));

  return {
    text: result.value.trim(),
    pageCount,
    metadata: {
      warnings: result.messages.filter(m => m.type === 'warning').map(m => m.message),
    },
  };
}

async function parseTXT(buffer: Buffer): Promise<ParsedDocument> {
  const text = buffer.toString('utf-8').trim();
  const pageCount = Math.max(1, Math.ceil(text.length / 3000));

  return {
    text,
    pageCount,
    metadata: {},
  };
}
