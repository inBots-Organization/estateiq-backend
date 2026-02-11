/**
 * Update avatar URLs for default teachers with big-ears style avatars
 * Clean, friendly, professional-looking cartoon avatars
 * Usage: node scripts/update-avatars.js
 */

const { Client } = require('pg');

// Big-ears style avatars - clean, friendly, professional cartoon style
const DEFAULT_AVATARS = [
  {
    name: 'ahmed',
    // Ahmed: Friendly fundamentals teacher - blue theme
    avatarUrl: 'https://api.dicebear.com/9.x/big-ears/svg?seed=AhmedTeacher&backgroundColor=3b82f6',
  },
  {
    name: 'noura',
    // Noura: Sales strategy teacher - purple theme
    avatarUrl: 'https://api.dicebear.com/9.x/big-ears/svg?seed=NouraTeacher&backgroundColor=8b5cf6',
  },
  {
    name: 'anas',
    // Anas: Senior closing coach - emerald theme
    avatarUrl: 'https://api.dicebear.com/9.x/big-ears/svg?seed=AnasCoach&backgroundColor=10b981',
  },
  {
    name: 'abdullah',
    // Abdullah: Growth mentor - amber theme
    avatarUrl: 'https://api.dicebear.com/9.x/big-ears/svg?seed=AbdullahMentor&backgroundColor=f59e0b',
  },
];

async function updateAvatars() {
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

    for (const teacher of DEFAULT_AVATARS) {
      console.log(`Updating avatar for ${teacher.name}...`);
      const result = await client.query(
        `UPDATE ai_teachers SET avatar_url = $1 WHERE name = $2`,
        [teacher.avatarUrl, teacher.name]
      );
      console.log(`  Updated ${result.rowCount} row(s)`);
    }

    // Verify
    console.log('\nVerifying updates...');
    const verify = await client.query(`
      SELECT name, display_name_en,
             CASE WHEN avatar_url IS NOT NULL THEN 'HAS_AVATAR' ELSE 'NO_AVATAR' END as avatar_status,
             avatar_url
      FROM ai_teachers
      WHERE name IN ('ahmed', 'noura', 'anas', 'abdullah')
      ORDER BY sort_order
    `);

    console.log('Results:');
    verify.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.avatar_status}`);
      console.log(`    URL: ${row.avatar_url}`);
    });

    console.log('\n✅ Avatars updated successfully with big-ears style!');
    console.log('   Clean, friendly, professional cartoon avatars');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateAvatars();
