import { getUserProfile } from './backend/src/cinematch/features/userProfile';
import { supabaseAdmin } from './backend/src/lib/supabase';

async function run() {
  const userId = 'test_user_' + Date.now();

  // Create some interactions
  const interactions = [];
  for(let i=0; i<500; i++) {
    interactions.push({
      userId,
      tmdbId: 1000 + i,
      mediaType: 'movie',
      eventType: i % 10 === 0 ? 'dislike' : (i % 5 === 0 ? 'favorite' : 'watch'),
      weight: 1.0,
      createdAt: new Date(Date.now() - i * 86400000).toISOString()
    });
  }

  await supabaseAdmin.from('UserInteractions').insert(interactions);

  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    // invalidate cache if we want to measure db speed
    require('./backend/src/cinematch/features/userProfile').invalidateUserProfile(userId);
    await getUserProfile(userId);
  }
  const end = performance.now();

  console.log(`Average time: ${(end - start) / 10} ms`);
}
run().catch(console.error);
