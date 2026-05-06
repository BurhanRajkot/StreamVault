import { getUserProfile, invalidateUserProfile } from './backend/src/cinematch/features/userProfile';
import { supabaseAdmin } from './backend/src/lib/supabase';

async function run() {
  const userId = 'test_user_' + Date.now();

  console.log(`🚀 Starting benchmark for user: ${userId}`);

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

  console.log(`📦 Inserting ${interactions.length} interactions...`);
  const { error: insertError } = await supabaseAdmin.from('UserInteractions').insert(interactions);
  if (insertError) {
    console.error('❌ Failed to insert interactions:', insertError);
    return;
  }

  const iterations = 10;
  let totalTime = 0;

  console.log(`⏱️ Running ${iterations} profile builds...`);

  for (let i = 0; i < iterations; i++) {
    // invalidate cache to measure raw DB + processing speed
    invalidateUserProfile(userId);
    
    const start = performance.now();
    await getUserProfile(userId);
    const end = performance.now();
    
    const duration = end - start;
    totalTime += duration;
    console.log(`   Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
  }

  const avgTime = totalTime / iterations;
  console.log(`\n✅ Benchmark Complete!`);
  console.log(`📊 Average Execution Time: ${avgTime.toFixed(2)}ms`);

  // Cleanup
  console.log(`🧹 Cleaning up test data...`);
  await supabaseAdmin.from('UserInteractions').delete().eq('userId', userId);
}

run().catch(console.error);
