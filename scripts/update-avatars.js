/**
 * Update avatar URLs for default teachers with professional Arab-style avatars
 * Using personas style with Arab skin tones and facial hair
 * Usage: node scripts/update-avatars.js
 */

const { Client } = require('pg');

// Professional Arab-style avatar URLs using personas
// Features: Arab skin tones, beards for men, professional clothing
const DEFAULT_AVATARS = [
  {
    name: 'ahmed',
    // Ahmed: Friendly fundamentals teacher - warm skin, goatee, happy smile
    avatarUrl: 'https://api.dicebear.com/9.x/personas/svg?seed=AhmedKSA&skinColor=b16a5b&hair=fade&facialHair=goatee&facialHairProbability=100&eyes=happy&mouth=bigSmile&body=squared&clothing=blazerAndShirt&clothingColor=3b82f6&backgroundColor=3b82f6',
  },
  {
    name: 'noura',
    // Noura: Sharp sales strategist - woman, confident look
    avatarUrl: 'https://api.dicebear.com/9.x/personas/svg?seed=NouraKSA&skinColor=e5a07e&hair=long&facialHairProbability=0&eyes=open&mouth=smile&body=rounded&clothing=blazerAndShirt&clothingColor=8b5cf6&backgroundColor=8b5cf6',
  },
  {
    name: 'anas',
    // Anas: Senior closing coach - darker skin, full beard, serious look
    avatarUrl: 'https://api.dicebear.com/9.x/personas/svg?seed=AnasKSA&skinColor=92594b&hair=bald&facialHair=beardMustache&facialHairProbability=100&eyes=open&mouth=smirk&body=squared&clothing=blazerAndShirt&clothingColor=10b981&backgroundColor=10b981',
  },
  {
    name: 'abdullah',
    // Abdullah: Wise growth mentor - balding, distinguished walrus beard
    avatarUrl: 'https://api.dicebear.com/9.x/personas/svg?seed=AbdullahKSA&skinColor=b16a5b&hair=balding&facialHair=walrus&facialHairProbability=100&eyes=open&mouth=smile&body=rounded&clothing=blazerAndShirt&clothingColor=f59e0b&backgroundColor=f59e0b',
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

    console.log('\n✅ Avatars updated successfully with Arab-style personas!');
    console.log('   - أحمد (Ahmed): Goatee beard, happy look');
    console.log('   - نورة (Noura): Professional woman, confident');
    console.log('   - أنس (Anas): Bald with full beard, serious');
    console.log('   - عبدالله (Abdullah): Balding with walrus beard, wise');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateAvatars();
