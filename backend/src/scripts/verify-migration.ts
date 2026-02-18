
import { supabaseAdmin } from '../lib/supabase';

async function verifyMigration() {
  console.log('Verifying migration...');
  try {
    // Try to select the 'server' column specifically
    const { data, error } = await supabaseAdmin
      .from('ContinueWatching')
      .select('server')
      .limit(1);

    if (error) {
      if (error.message.includes('dtuhp')) { // 'dtuhp' often appears in PostgREST errors for missing columns, but let's check exact message
         console.error('Migration verification failed:', error.message);
         console.log('STATUS: FAILED');
      } else {
         console.error('Migration verification failed with error:', error);
         console.log('STATUS: FAILED');
      }
    } else {
      console.log('Migration verification successful! Column "server" exists.');
      console.log('STATUS: SUCCESS');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    console.log('STATUS: FAILED');
  }
}

verifyMigration();
