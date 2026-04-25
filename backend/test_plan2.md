The problem description says: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."

Wait, could I just add an RPC named `get_user_profile_interactions` and use it?
Wait, wait! I don't need a migration. I can just create the RPC by putting it in a new migration file `20260303000000_profile_optimization.sql` and run `supabase db push` or similar?
But we don't have Supabase CLI or access to the production database here to apply the migration. So adding a migration file is standard procedure for schema changes!

Wait, if we use a Postgres View, we just add the view in the new migration file.
But wait! There is a simpler "DB-side aggregation":
We can query Supabase with `select('tmdbId, eventType')`.
No, the instructions explicitly said "via DB-side aggregations or materialized views."

Wait, look at `cinematch_migration.sql`... "Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DO blocks"
I will create a new migration file `backend/supabase/migrations/20260303000000_user_profile_rpc.sql` that creates an RPC, OR a view, OR just add it to `cinematch_migration.sql`? No, adding a new migration file is better.

What should the RPC do?
We need the top 20 interactions WITH full fields (`tmdbId`, `mediaType`, `eventType`, `weight`, `createdAt`, `progress`).
AND we need the aggregated sets of ALL items (up to 500) they have interacted with (`watchedIds`, `favoritedIds`, `dislikedIds`), AND total interaction count (to see if they are a new user: `< 3` interactions).
Wait! The code currently only uses the FIRST 500 interactions to build the sets!
`const { data: interactions, error } = await supabaseAdmin.from('UserInteractions').select('...').eq('userId', userId).order('createdAt', { ascending: false }).limit(500)`
And then iterates over `interactions`.
If `interactions.length < 5`, it does cold-start.
If `interactions.length < 3`, `isNewUser: true`.

Wait! The decay uses `interaction.createdAt` to decay the weight.
Wait... does it?
Let's check the code for `getUserProfile`:
```typescript
  for (let idx = 0; idx < interactions.length; idx++) {
    const interaction = interactions[idx]
    const decay = timeDecay(interaction.createdAt)

    const isDislike = interaction.eventType === 'dislike'

    if (isDislike) {
      dislikedIds.add(interaction.tmdbId)
    } else if (interaction.eventType === 'watch') {
      watchedIds.add(interaction.tmdbId)
    } else if (interaction.eventType === 'favorite') {
      favoritedIds.add(interaction.tmdbId)
    }

    // Dislikes get a 1.5× negative penalty so a few dislikes of the same genre
    // are enough to measurably shift the affinity vectors.
    const adjustedWeight = isDislike
      ? -0.6 * decay * 1.5
      : interaction.weight * decay

    if (idx < FEATURE_BATCH_SIZE) {
        ...
```

Ah!!! Wait!!!
`adjustedWeight` is computed for ALL 500.
But it is ONLY USED INSIDE `if (idx < FEATURE_BATCH_SIZE)`!
Look at the code!
```typescript
    const adjustedWeight = isDislike
      ? -0.6 * decay * 1.5
      : interaction.weight * decay

    // Accumulate genre + keyword + cast vectors for top-N interactions
    // (includes dislikes so their genres get subtracted)
    if (idx < FEATURE_BATCH_SIZE) {
       ...
```
It calculates `decay` and `adjustedWeight` for all 500 interactions, but it only USES `adjustedWeight` if `idx < FEATURE_BATCH_SIZE`.
So for interactions 20-500, `decay` and `adjustedWeight` are computed and then thrown away!
The only things used for interactions 20-500 are `dislikedIds.add`, `watchedIds.add`, and `favoritedIds.add`.

So we truly ONLY need `tmdbId` and `eventType` for the 500!
We DO NOT need `createdAt` or `weight` or `progress` for the 500! We ONLY need those for the TOP 20!

This means we can rewrite `getUserProfile` to use an RPC `get_user_profile_data` that returns exactly what we need, avoiding fetching 500 heavy rows over the network.
