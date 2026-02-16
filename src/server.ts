import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Load environment variables first - explicitly from the backend root
const envPath = resolve(__dirname, '..', '.env');

// Check if file exists - only load .env in development
if (fs.existsSync(envPath)) {
  // Read and parse .env file manually to ensure proper loading
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');

  for (const line of envLines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Set in process.env if not already set (env vars take precedence)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  // Also run dotenv for compatibility
  config({ path: envPath, override: false });
} else {
  console.log('[Server] No .env file found, using environment variables');
}

// Run pgvector migration if needed (idempotent - safe to run on every startup)
async function ensurePgvectorSetup() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Check if embedding column already exists
    const result: any[] = await prisma.$queryRawUnsafe(`
      SELECT count(*) as cnt FROM information_schema.columns
      WHERE table_name = 'brain_chunks' AND column_name = 'embedding'
    `);

    if (Number(result[0].cnt) === 0) {
      console.log('[Migration] Setting up pgvector for brain_chunks...');

      // Enable pgvector extension
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('[Migration] pgvector extension enabled');

      // Add embedding column
      await prisma.$executeRawUnsafe('ALTER TABLE brain_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);');
      console.log('[Migration] embedding column added');

      // Create HNSW index for fast similarity search
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS brain_chunks_embedding_idx
        ON brain_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);
      console.log('[Migration] HNSW index created');
      console.log('[Migration] pgvector setup complete!');
    } else {
      console.log('[Migration] pgvector already configured');
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('[Migration] pgvector setup failed (non-fatal):', error.message);
    // Non-fatal: server can still start, but brain features won't work
  }
}

// Dynamic imports to ensure env is loaded first
async function startServer() {
  // Initialize DI container first (dynamic import ensures env is loaded)
  await import('./container');

  // Run pgvector migration before starting the server
  await ensurePgvectorSetup();

  // Then import app which resolves controllers
  const { app } = await import('./app');

  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, () => {
    console.log(`🚀 EstateIQ Server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  return server;
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
