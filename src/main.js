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
            actorId: 'clockworks/tiktok-scraper', // Verified ID
            input: { 
                "searchQueries": ["AI relationship conflict", "ChatGPT relationship fight"],
                "resultsPerPage": 10 
            }
        },
        {
            name: 'Reddit',
            actorId: 'comchat/reddit-api-scraper', // More reliable in 2026 than 'apify/reddit-scraper'
            input: { 
                "searchList": ["AI argument"], 
                "resultsLimit": 10,
                "sortBy": "new"
            }
        },
        {
            name: 'X (Twitter)',
            actorId: 'apidojo/twitter-scraper-lite', // Verified ID
            input: {
                "searchTerms": ["ChatGPT cheating "],
                "maxItems": 10
            }
        }
    ];

    // 3. RUN IN PARALLEL
    console.log("📡 Launching scrapers simultaneously...");
    const runPromises = jobs.map(job => client.actor(job.actorId).call(job.input));
    const runs = await Promise.all(runPromises);

    // 4. MERGE & NORMALIZE
    const normalized = items.map(item => {
        // Stage 1: Content Extraction (X uses 'full_text', Reddit uses 'selftext', TikTok uses 'text')
        const rawContent = item.full_text || item.text || item.body || item.selftext || "";
        const cleanContent = rawContent.replace(/\n/g, ' ').trim();
    
        // Stage 2: User Extraction
        const username = item.user?.screen_name || item.authorUsername || item.author || "Anonymous";
    
        return {
            platform: jobs[i].name,
            content: cleanContent || "No text found",
            user: username,
            url: item.url || item.webVideoUrl || (item.id ? `https://x.com/i/web/status/${item.id}` : ""),
            engagement: item.favorite_count || item.ups || item.diggCount || 0,
            collected_at: new Date().toISOString()
        };
    });

    // 5. SAVE FINAL DATA
    await Actor.pushData(masterDataset);
    console.log(`🏁 Success! Collected ${masterDataset.length} rows of research data.`);

} catch (error) {
    console.error("❌ Orchestrator Error:", error.message);
    await Actor.fail(error.message);
}

await Actor.exit();