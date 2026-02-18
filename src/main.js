import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';
import { createObjectCsvStringifier } from 'csv-writer';

await Actor.init();

// Use the token from the environment (automatic on Apify)
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

const input = await Actor.getInput() || {};
const maxVideos = input.maxVideos || 3; 

console.log("🚀 Researcher Orchestrator Started...");

try {
    // --- STAGE 1: FIND VIDEOS ---
    const searchInput = {
        "searchQueries": ["ChatGPT college argument", "AI university conflict"],
        "resultsPerPage": maxVideos
    };

    console.log("🔍 Stage 1: Searching TikTok for videos...");
    const videoRun = await client.actor("clockworks/tiktok-scraper").call(searchInput);
    
    // SAFETY GATE: Check if the run produced results
    const { items: videos } = await client.dataset(videoRun.defaultDatasetId).listItems();

    if (!videos || videos.length === 0) {
        throw new Error("Stage 1 failed: No videos were found for these keywords. Try broader terms.");
    }

    const videoUrls = videos.map(v => v.webVideoUrl).filter(url => !!url);
    console.log(`✅ Found ${videoUrls.length} videos. URLs:`, videoUrls);

    // --- STAGE 2: SCRAPE COMMENTS ---
    console.log("💬 Stage 2: Starting comment extraction...");
    const commentInput = {
        "postURLs": videoUrls,
        "commentsPerPost": 20,
        "maxRepliesPerComment": 0 
    };

    const commentRun = await client.actor("clockworks/tiktok-comments-scraper").call(commentInput);
    const { items: comments } = await client.dataset(commentRun.defaultDatasetId).listItems();

    // SAFETY GATE: Handle empty comment sections
    if (!comments || comments.length === 0) {
        console.log("⚠️ No comments found for these videos. Finishing run with empty dataset.");
        await Actor.exit();
        return;
    }

    // --- STAGE 3: DATA EXPORT ---
    const finalResults = comments.map(c => ({
        video_url: c.videoUrl,
        text: c.text,
        date: c.createTimeISO
    }));

    await Actor.pushData(finalResults);
    console.log(`🏁 Success! Gathered ${finalResults.length} comments.`);

} catch (error) {
    // This catches the "Uncaught Exception" and prints a helpful message instead of crashing
    console.error("❌ CRITICAL ERROR:", error.message);
    await Actor.fail(error.message);
}

await Actor.exit();