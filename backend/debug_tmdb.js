
const API_KEY = '668a0dd95d2a554867a2c610467fb934'; // From tmdb.ts
const BASE_URL = 'https://api.themoviedb.org/3/discover/movie';

async function checkResults(providerId, providerName) {
    const today = new Date().toISOString().split('T')[0];
    const params = new URLSearchParams({
        api_key: API_KEY,
        sort_by: 'primary_release_date.desc',
        page: '1',
        with_watch_providers: providerId,
        watch_region: 'IN',
        with_watch_monetization_types: 'flatrate|buy|rent',
        'vote_count.gte': '50',
        'primary_release_date.lte': today
    });

    const url = `${BASE_URL}?${params.toString()}`;
    console.log(`Fetching ${providerName} (${providerId})...`);
    console.log(`URL: ${url}`);

    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log(`Total Results: ${data.total_results}`);
        if (data.results && data.results.length > 0) {
            console.log('Top 5 results:');
            data.results.slice(0, 5).forEach((m, i) => {
                console.log(`${i+1}. ${m.title} (${m.release_date}) - Votes: ${m.vote_count}`);
            });
        } else {
            console.log('No results found.');
        }
        console.log('-----------------------------------');
    } catch (e) {
        console.error('Error:', e);
    }
}

async function run() {
    await checkResults('8', 'Netflix');
    await checkResults('119', 'Prime Video');
}

run();
