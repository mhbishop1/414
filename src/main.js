import { ApifyClient } from 'apify-client';
import { Actor } from 'apify';

await Actor.init();
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// 1. Start the TikTok Scraper (Example)
console.log("🎥 Starting TikTok Scrape...");
const tiktokRun = await client.actor("clockworks/tiktok-scraper").call({
    searchQueries: ["ChatGPT college argument", "AI cheating university"],
    maxResults: 50
});

// 2. Start the Twitter Scraper
console.log("🐦 Starting X Scrape...");
const twitterRun = await client.actor("apidojo/twitter-scraper").call({
    searchTerms: ["AI student fight", "ChatGPT conflict"],
    maxItems: 50
});

// 3. Fetch and Merge Results
const { items: tiktokData } = await client.dataset(tiktokRun.defaultDatasetId).listItems();
const { items: twitterData } = await client.dataset(twitterRun.defaultDatasetId).listItems();

const combinedData = [...tiktokData, ...twitterData];
await Actor.pushData(combinedData);

await Actor.exit();