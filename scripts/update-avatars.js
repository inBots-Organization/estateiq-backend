/**
 * Update avatar URLs for default teachers with professional Saudi avatars
 * Using avataaars style with hijab for women and turban for men
 * Usage: node scripts/update-avatars.js
 */

const { Client } = require('pg');

// Professional Saudi-style avatar URLs using avataaars
// Features: hijab for women, turban for men, Arab skin tones, beards
const DEFAULT_AVATARS = [
  {
    name: 'ahmed',
    // Ahmed: Friendly fundamentals teacher - turban + light beard + happy look
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=AhmedSaudi&top=turban&skinColor=d08b5b&facialHair=beardLight&facialHairProbability=100&eyes=happy&eyebrows=defaultNatural&mouth=smile&clothes=blazerAndShirt&clothesColor=3b82f6&backgroundColor=3b82f6',
  },
  {
    name: 'noura',
    // Noura: Sharp sales strategist - hijab + professional confident look
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=NouraSaudi&top=hijab&skinColor=edb98a&eyes=default&eyebrows=defaultNatural&mouth=serious&clothes=blazerAndSweater&clothesColor=8b5cf6&backgroundColor=8b5cf6',
  },
  {
    name: 'anas',
    // Anas: Senior closing coach - turban + medium beard + serious expert look
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=AnasSaudi&top=turban&skinColor=ae5d29&facialHair=beardMedium&facialHairProbability=100&eyes=default&eyebrows=raisedExcitedNatural&mouth=serious&clothes=blazerAndShirt&clothesColor=10b981&backgroundColor=10b981',
  },
  {
    name: 'abdullah',
    // Abdullah: Wise growth mentor - turban + majestic beard + wise smile
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=AbdullahSaudi&top=turban&skinColor=d08b5b&facialHair=beardMajestic&facialHairProbability=100&eyes=default&eyebrows=defaultNatural&mouth=smile&clothes=blazerAndShirt&clothesColor=f59e0b&backgroundColor=f59e0b',
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

    console.log('\n✅ Avatars updated successfully with Saudi-style avatars!');
    console.log('   - نورة (Noura): Hijab + professional look');
    console.log('   - أحمد (Ahmed): Turban + light beard');
    console.log('   - أنس (Anas): Turban + medium beard');
    console.log('   - عبدالله (Abdullah): Turban + majestic beard');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateAvatars();
