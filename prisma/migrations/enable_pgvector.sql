-- AI Brain: Enable pgvector extension and add embedding column
-- Run this AFTER prisma db push creates the brain_chunks table
--
-- Usage:
--   psql -h 35.223.221.237 -U estateiq -d estateiq -f prisma/migrations/enable_pgvector.sql
--   OR via Cloud SQL:
--   gcloud sql connect estateiq-db --user=estateiq --database=estateiq < prisma/migrations/enable_pgvector.sql

-- Step 1: Enable pgvector extension (requires superuser on Cloud SQL - enabled by default)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add vector embedding column to brain_chunks
ALTER TABLE brain_chunks
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Step 3: Create HNSW index for fast similarity search
-- HNSW is faster than IVFFlat for most workloads
CREATE INDEX IF NOT EXISTS brain_chunks_embedding_idx
ON brain_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verify
SELECT
  (SELECT count(*) FROM pg_extension WHERE extname = 'vector') as pgvector_enabled,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_name = 'brain_chunks' AND column_name = 'embedding') as embedding_column_exists;
