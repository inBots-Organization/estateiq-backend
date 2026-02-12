/**
 * Link documents to teachers based on target_persona
 * Usage: node scripts/link-documents.js
 */

const { Client } = require('pg');

async function linkDocuments() {
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

    // Update documents that have target_persona but no teacher_id
    const result = await client.query(`
      UPDATE brain_documents bd
      SET teacher_id = at.id
      FROM ai_teachers at
      WHERE bd.target_persona = at.name
        AND bd.teacher_id IS NULL
        AND bd.organization_id = at.organization_id
    `);

    console.log(`✅ Linked ${result.rowCount} document(s) to their teachers\n`);

    // Verify the update
    const verify = await client.query(`
      SELECT
        bd.title,
        bd.file_name,
        at.name as teacher_name,
        at.display_name_en as teacher_display
      FROM brain_documents bd
      LEFT JOIN ai_teachers at ON bd.teacher_id = at.id
      ORDER BY bd.created_at DESC
    `);

    console.log('=== Updated Documents ===\n');
    verify.rows.forEach(doc => {
      console.log(`📄 ${doc.title || doc.file_name}`);
      console.log(`   Linked to: ${doc.teacher_display || 'Not assigned'} (${doc.teacher_name || 'none'})`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

linkDocuments();
