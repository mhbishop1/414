import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';

await Actor.init();

// 1. GET INPUT (including the secret API token)
const input = await Actor.getInput() || {};
const apiToken = input.apiToken || process.env.APIFY_TOKEN;

if (!apiToken) {
    await Actor.fail('❌ Missing API Token! Please provide your token in the Actor input.');
}

const client = new ApifyClient({ token: apiToken });

try {
    console.log("🚀 Starting the Group Research Orchestrator...");

    // 2. DEFINE JOBS (Using Public Store Actors)
    const jobs = [
        {
            name: 'TikTok',
            actorId: 'clockworks/tiktok-scraper',
            input: { searchQueries: ["AI student conflict", "ChatGPT college fight"], resultsPerPage: 10 }
        },
        {
            name: 'Reddit',
            actorId: 'apify/reddit-scraper',
            input: { searchTerms: ["AI university argument"], maxPosts: 10 }
        }
    ];

    // 3. RUN IN PARALLEL
    console.log("📡 Launching scrapers simultaneously...");
    const runPromises = jobs.map(job => client.actor(job.actorId).call(job.input));
    const runs = await Promise.all(runPromises);

    // 4. MERGE & NORMALIZE
    console.log("📥 Merging results into a single dataset...");
    const masterDataset = [];

    for (let i = 0; i < runs.length; i++) {
        const { items } = await client.dataset(runs[i].defaultDatasetId).listItems();
        
        const normalized = items.map(item => ({
            platform: jobs[i].name,
            content: item.text || item.body || item.selftext || "No text found",
            user: item.authorUsername || item.author || "Anonymous",
            url: item.webVideoUrl || `https://reddit.com${item.permalink}` || item.url,
            collected_at: new Date().toISOString()
        }));

        masterDataset.push(...normalized);
    }

    // 5. SAVE FINAL DATA
    await Actor.pushData(masterDataset);
    console.log(`🏁 Success! Collected ${masterDataset.length} rows of research data.`);

} catch (error) {
    console.error("❌ Orchestrator Error:", error.message);
    await Actor.fail(error.message);
}

await Actor.exit();