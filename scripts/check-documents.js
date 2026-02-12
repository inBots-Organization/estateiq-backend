/**
 * Check brain documents and their teacher assignments
 * Usage: node scripts/check-documents.js
 */

const { Client } = require('pg');

async function checkDocuments() {
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
    console.log('Connected!\n');

    // Get all documents with their teacher info
    const docs = await client.query(`
      SELECT
        bd.id,
        bd.title,
        bd.file_name,
        bd.status,
        bd.chunk_count,
        bd.teacher_id,
        bd.target_persona,
        at.name as teacher_name,
        at.display_name_en as teacher_display_name
      FROM brain_documents bd
      LEFT JOIN ai_teachers at ON bd.teacher_id = at.id
      ORDER BY bd.created_at DESC
    `);

    console.log('=== Brain Documents ===\n');
    docs.rows.forEach(doc => {
      console.log(`📄 ${doc.title || doc.file_name}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Status: ${doc.status}, Chunks: ${doc.chunk_count}`);
      console.log(`   Teacher ID: ${doc.teacher_id || 'NULL'}`);
      console.log(`   Teacher Name: ${doc.teacher_name || 'Not assigned'}`);
      console.log(`   Legacy Persona: ${doc.target_persona || 'NULL'}`);
      console.log('');
    });

    // Get all teachers
    console.log('\n=== AI Teachers ===\n');
    const teachers = await client.query(`
      SELECT id, name, display_name_en
      FROM ai_teachers
      ORDER BY sort_order
    `);

    teachers.rows.forEach(t => {
      console.log(`👤 ${t.display_name_en} (${t.name})`);
      console.log(`   ID: ${t.id}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkDocuments();
