/**
 * Recursive Character Text Splitter
 * Splits text into chunks respecting paragraph/sentence boundaries.
 * Used for preparing documents for embedding in the AI Brain RAG pipeline.
 */

export interface ChunkOptions {
  chunkSize?: number;     // Max characters per chunk (default: 1000)
  chunkOverlap?: number;  // Overlap between chunks (default: 200)
  separators?: string[];  // Priority-ordered separators
}

export interface TextChunk {
  content: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    estimatedPage: number;
  };
}

const DEFAULT_SEPARATORS = [
  '\n\n',   // Double newline (paragraph break)
  '\n',     // Single newline
  '. ',     // Sentence end
  '؟ ',     // Arabic question mark
  '، ',     // Arabic comma
  ', ',     // Comma
  ' ',      // Space
  '',        // Character level (last resort)
];

export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const chunkSize = options?.chunkSize || 1000;
  const chunkOverlap = options?.chunkOverlap || 200;
  const separators = options?.separators || DEFAULT_SEPARATORS;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const rawChunks = recursiveSplit(text, separators, chunkSize);

  // Add overlap between chunks
  const overlappedChunks = addOverlap(rawChunks, text, chunkOverlap);

  // Build TextChunk objects with metadata
  let charOffset = 0;
  return overlappedChunks.map((content, index) => {
    const startChar = text.indexOf(content.substring(0, 50), Math.max(0, charOffset - chunkOverlap));
    const actualStart = startChar >= 0 ? startChar : charOffset;
    const endChar = actualStart + content.length;
    charOffset = endChar - chunkOverlap;

    return {
      content: content.trim(),
      index,
      metadata: {
        startChar: actualStart,
        endChar,
        estimatedPage: Math.floor(actualStart / 3000) + 1,
      },
    };
  }).filter(chunk => chunk.content.length > 0);
}

function recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  // Find the best separator (first one that appears in text)
  let bestSeparator = '';
  for (const sep of separators) {
    if (sep === '' || text.includes(sep)) {
      bestSeparator = sep;
      break;
    }
  }

  // Split by the chosen separator
  const parts = bestSeparator === '' ? text.split('') : text.split(bestSeparator);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const part of parts) {
    const candidate = currentChunk
      ? currentChunk + bestSeparator + part
      : part;

    if (candidate.length <= chunkSize) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If a single part exceeds chunkSize, recursively split with next separator
      if (part.length > chunkSize) {
        const remainingSeparators = separators.slice(separators.indexOf(bestSeparator) + 1);
        if (remainingSeparators.length > 0) {
          chunks.push(...recursiveSplit(part, remainingSeparators, chunkSize));
        } else {
          // Last resort: force-split at chunkSize boundaries
          for (let i = 0; i < part.length; i += chunkSize) {
            chunks.push(part.substring(i, i + chunkSize));
          }
        }
        currentChunk = '';
      } else {
        currentChunk = part;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function addOverlap(chunks: string[], _originalText: string, overlap: number): string[] {
  if (chunks.length <= 1 || overlap <= 0) {
    return chunks;
  }

  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;

    // Prepend end of previous chunk as overlap
    const prevChunk = chunks[i - 1];
    const overlapText = prevChunk.substring(Math.max(0, prevChunk.length - overlap));

    return overlapText + chunk;
  });
}
