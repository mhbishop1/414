import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';

await Actor.init();

const input = await Actor.getInput() || {};
const apiToken = input.apiToken || process.env.APIFY_TOKEN;

if (!apiToken) {
    await Actor.fail('❌ Missing API Token! Please provide it in the Actor input tab.');
}

const client = new ApifyClient({ token: apiToken });

try {
    console.log("🚀 Starting the High-Volume Research Orchestrator...");

    const jobs = [
        {
            name: 'TikTok',
            actorId: 'clockworks/tiktok-scraper',
            input: { 
                searchQueries: ["AI student conflict", "ChatGPT college fight"], 
                resultsPerPage: 500 
            }
        },
        {
            name: 'Reddit',
            actorId: 'comchat/reddit-api-scraper',
            input: { 
                searchList: ["AI university argument"], 
                resultsLimit: 500,
                sortBy: "relevance"
            }
        },
        {
            name: 'X (Twitter)',
            actorId: 'apidojo/twitter-scraper-lite',
            input: { 
                searchTerms: ["ChatGPT cheating university"], 
                maxItems: 500 
            }
        }
    ];

    console.log("📡 Launching scrapers (Waiting up to 15 mins for 500+ results)...");
    
    // Using waitSecs to ensure the Orchestrator stays alive while scrapers work
    const runPromises = jobs.map(job => 
        client.actor(job.actorId).call(job.input, { waitSecs: 900 })
    );
    
    const runs = await Promise.all(runPromises);

    const masterDataset = [];

    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const platformName = jobs[i].name;

        console.log(`📥 Merging data from ${platformName}...`);
        
        const listItemsResult = await client.dataset(run.defaultDatasetId).listItems();
        const items = listItemsResult.items;

        if (!items || items.length === 0) {
            console.log(`⚠️ No items found for ${platformName}.`);
            continue;
        }

        const normalized = items.map(item => ({
            platform: platformName,
            content: (item.text || item.body || item.selftext || item.full_text || "").replace(/\n/g, ' ').trim(),
            user: item.author || item.authorUsername || item.username || item.user?.screen_name || "Anonymous",
            url: item.url || item.webVideoUrl || (item.id ? `https://x.com/i/web/status/${item.id}` : ""),
            engagement: item.diggCount || item.upVotes || item.ups || item.favorite_count || 0,
            collected_at: new Date().toISOString()
        }));

        masterDataset.push(...normalized);
    }

    await Actor.pushData(masterDataset);
    console.log(`🏁 Done! Combined ${masterDataset.length} rows into the master file.`);

} catch (error) {
    console.error("❌ Orchestrator Error:", error.message);
    await Actor.fail(error.message);
}

await Actor.exit();