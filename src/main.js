import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';

await Actor.init();

// 1. GET INPUT
// This pulls the token from the Secret field in the UI
const input = await Actor.getInput() || {};
const apiToken = input.apiToken || process.env.APIFY_TOKEN;

if (!apiToken) {
    await Actor.fail('❌ Missing API Token! Please provide it in the Actor input tab.');
}

const client = new ApifyClient({ token: apiToken });

try {
    console.log("🚀 Starting the Group Research Orchestrator...");

    // 2. DEFINE JOBS (Using Verified 2026 Actor IDs)
    const jobs = [
        {
            name: 'TikTok',
            actorId: 'clockworks/tiktok-scraper',
            input: { 
                searchQueries: ["AI student conflict"], 
                resultsPerPage: 5 
            }
        },
        {
            name: 'Reddit',
            actorId: 'comchat/reddit-api-scraper',
            input: { 
                searchList: ["AI university argument"], 
                resultsLimit: 5 
            }
        },
        {
            name: 'X (Twitter)',
            actorId: 'apidojo/twitter-scraper-lite',
            input: { 
                searchTerms: ["ChatGPT cheating university"], 
                maxItems: 5 
            }
        }
    ];

    // 3. RUN IN PARALLEL
    console.log("📡 Launching scrapers for TikTok, Reddit, and X...");
    const runPromises = jobs.map(job => 
        client.actor(job.actorId).call(job.input)
    );
    const runs = await Promise.all(runPromises);

    // 4. MERGE & NORMALIZE RESULTS
    const masterDataset = [];

    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const platformName = jobs[i].name;

        console.log(`📥 Fetching and cleaning data from ${platformName}...`);
        
        // Securely fetch items from the specific dataset of this run
        const listItemsResult = await client.dataset(run.defaultDatasetId).listItems();
        const items = listItemsResult.items;

        if (!items || items.length === 0) {
            console.log(`⚠️ No items found for ${platformName}. Skipping...`);
            continue;
        }

        const normalized = items.map(item => {
            // Unify text fields across different platform structures
            const rawContent = item.text || item.body || item.selftext || item.full_text || item.description || "";
            const cleanContent = rawContent.replace(/\n/g, ' ').trim();

            return {
                platform: platformName,
                content: cleanContent || "No text content found",
                user: item.author || item.authorUsername || item.username || item.user?.screen_name || "Anonymous",
                url: item.url || item.webVideoUrl || (item.id ? `https://x.com/i/web/status/${item.id}` : ""),
                engagement: item.diggCount || item.upVotes || item.ups || item.favorite_count || 0,
                collected_at: new Date().toISOString()
            };
        });

        masterDataset.push(...normalized);
    }

    // 5. EXPORT FINAL MASTER FILE
    if (masterDataset.length > 0) {
        await Actor.pushData(masterDataset);
        console.log(`🏁 Success! Master dataset created with ${masterDataset.length} rows.`);
    } else {
        console.log("❌ All scrapers returned zero results. Check your search terms.");
    }

} catch (error) {
    console.error("❌ Orchestrator Error:", error.message);
    await Actor.fail(error.message);
}

await Actor.exit();