import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';

await Actor.init();

// The platform automatically provides your API token here
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

try {
    console.log("🚀 Starting the Group Research Orchestrator...");

    // 1. DEFINE YOUR SCRAPING TASKS
    // We call public actors by their Store IDs (e.g., 'apify/instagram-scraper')
    const jobs = [
        {
            name: 'TikTok',
            actorId: 'clockworks/tiktok-scraper',
            input: { searchQueries: ["AI student conflict"], resultsPerPage: 20 }
        },
        {
            name: 'Reddit',
            actorId: 'apify/reddit-scraper', // Or your group mate's specific public actor
            input: { searchTerms: ["ChatGPT university argument"], maxPosts: 20 }
        }
    ];

    // 2. RUN ACTORS IN PARALLEL
    console.log("📡 Triggering all public actors...");
    const runPromises = jobs.map(job => 
        client.actor(job.actorId).call(job.input)
    );

    const runs = await Promise.all(runPromises);

    // 3. MERGE THE RESULTS
    console.log("📥 All runs finished. Merging data...");
    const masterDataset = [];

    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const jobName = jobs[i].name;

        // Fetch items from this specific run's dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // NORMALIZE: Ensure TikTok and Reddit data use the same column names
        const normalizedItems = items.map(item => ({
            platform: jobName,
            text_content: item.text || item.body || item.selftext || "No text",
            author: item.authorUsername || item.author || "Anonymous",
            url: item.webVideoUrl || `https://reddit.com${item.permalink}` || item.url,
            scraped_at: new Date().toISOString()
        }));

        masterDataset.push(...normalizedItems);
    }

    // 4. SAVE TO ONE MASTER FILE
    await Actor.pushData(masterDataset);
    console.log(`🏁 Success! Master dataset created with ${masterDataset.length} rows.`);

} catch (error) {
    console.error("❌ Orchestrator failed:", error.message);
    await Actor.fail();
}

await Actor.exit();