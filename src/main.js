import { Actor } from 'apify';
import natural from 'natural';
import { createObjectCsvStringifier } from 'csv-writer';
// Use fetch from undici or global in Node 18+

await Actor.init();

const input = await Actor.getInput() || {};
const maxPosts = input.maxPosts || 10; // Start small for testing

console.log("🚀 Actor started.");

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

// Helper: Improved Sentiment Logic
function getSentimentScore(text) {
    if (!text || text.trim().length === 0) return 0;
    const tokens = tokenizer.tokenize(text);
    return tokens.length > 0 ? analyzer.getSentiment(tokens) : 0;
}

// Helper: Throttled Fetch
async function safeFetch(url) {
    const headers = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36" 
    };
    
    try {
        const res = await fetch(url, { headers });
        if (res.status === 429) {
            console.warn("⚠️ Rate limited. Cool down for 10s...");
            await new Promise(r => setTimeout(r, 10000));
            return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error(`❌ Fetch failed for ${url}:`, err.message);
        return null;
    }
}

// --- Execution ---

const keywordsAI = ["AI", "ChatGPT"];
const relationshipKeywords = ["partner", "roommate", "coworker"];
let collectedData = [];

// Flattening loops to prevent exponential requests
searchLoop:
for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        if (collectedData.length >= maxPosts) break searchLoop;

        // Using Reddit's OR/AND logic to reduce requests
        const query = `(${ai}) AND (${rel}) AND (conflict OR argument) AND college`;
        console.log(`🔍 Searching: ${query}`);

        const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;
        const searchResults = await safeFetch(searchUrl);

        const posts = searchResults?.data?.children || [];

        for (const post of posts) {
            if (collectedData.length >= maxPosts) break;

            const p = post.data;
            // Skip if it's a promotional post
            if (p.over_18 || p.is_self === false) continue;

            console.log(`📝 Processing post: ${p.title.substring(0, 50)}...`);

            // Fetch comments
            const detailUrl = `https://www.reddit.com${p.permalink}.json`;
            const details = await safeFetch(detailUrl);
            
            let comments = [];
            if (details && details[1]?.data?.children) {
                comments = details[1].data.children
                    .map(c => c.data?.body)
                    .filter(Boolean);
            }

            const entry = {
                url: `https://reddit.com${p.permalink}`,
                post_sentiment: getSentimentScore(`${p.title} ${p.selftext}`),
                avg_comment_sentiment: comments.length 
                    ? comments.reduce((acc, c) => acc + getSentimentScore(c), 0) / comments.length 
                    : 0,
                comment_count: comments.length,
                created: new Date(p.created_utc * 1000).toISOString()
            };

            collectedData.push(entry);
            await Actor.pushData(entry);
            
            // Critical: Wait between posts to avoid IP bans
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// --- Finalization ---

const summary = {
    total_posts: collectedData.length,
    avg_post_sentiment: collectedData.length ? collectedData.reduce((s, d) => s + d.post_sentiment, 0) / collectedData.length : 0
};

// Save CSV
const csvStringifier = createObjectCsvStringifier({
    header: [
        { id: 'url', title: 'URL' },
        { id: 'post_sentiment', title: 'SENTIMENT' },
        { id: 'comment_count', title: 'COMMENTS' }
    ]
});

const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(collectedData);
await Actor.setValue("RESULTS_CSV", csv, { contentType: "text/csv" });
await Actor.setValue("SUMMARY", summary);

console.log("✅ Done!", summary);
await Actor.exit();