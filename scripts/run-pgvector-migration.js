/**
 * Run pgvector migration on production database
 * Usage: node scripts/run-pgvector-migration.js
 */

const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    host: '35.223.221.237',
    database: 'estateiq',
    user: 'estateiq',
    password: 'EstateIQ2024',
    port: 5432,
    ssl: false,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // Step 1: Enable pgvector extension
    console.log('Step 1: Enabling pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✓ pgvector extension enabled');

    // Step 2: Add embedding column
    console.log('Step 2: Adding embedding column...');
    await client.query(`
      ALTER TABLE brain_chunks
      ADD COLUMN IF NOT EXISTS embedding vector(768);
    `);
    console.log('✓ embedding column added');

    // Step 3: Create HNSW index
    console.log('Step 3: Creating HNSW index...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS brain_chunks_embedding_idx
        ON brain_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);
      console.log('✓ HNSW index created');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✓ HNSW index already exists');
      } else {
        throw err;
      }
    }

    // Verify
    console.log('\nVerifying...');
    const result = await client.query(`
      SELECT
        (SELECT count(*) FROM pg_extension WHERE extname = 'vector') as pgvector_enabled,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'brain_chunks' AND column_name = 'embedding') as embedding_column_exists;
    `);
    console.log('Result:', result.rows[0]);

    if (result.rows[0].pgvector_enabled > 0 && result.rows[0].embedding_column_exists > 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log('\n⚠️ Migration may have issues. Check the results above.');
    }

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
