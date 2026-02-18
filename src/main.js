import { Actor } from 'apify';
import natural from 'natural';
import { createObjectCsvStringifier } from 'csv-writer';

await Actor.init();

// 1. PROXY SETUP
// This is essential to prevent Reddit from blocking your IP.
const proxyConfiguration = await Actor.createProxyConfiguration();

const input = await Actor.getInput() || {};
const maxPosts = input.maxPosts || 50;

console.log("🚀 Actor started. Target posts:", maxPosts);

//////////////////////////////////////////////////
// CONFIG & NLP SETUP
//////////////////////////////////////////////////

const keywordsAI = ["AI", "ChatGPT", "artificial intelligence"];
const conflictKeywords = ["argument", "fight", "conflict", "disagree"];
const relationshipKeywords = ["friend", "partner", "roommate", "coworker"];
const youthIndicators = ["college", "university", "campus", "student"];

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

// Helper: Get sentiment with safety check
function getSentimentScore(text) {
    if (!text || text.trim().length === 0) return 0;
    const tokens = tokenizer.tokenize(text);
    try {
        return tokens.length > 0 ? analyzer.getSentiment(tokens) : 0;
    } catch (e) {
        return 0;
    }
}

function contains(text, list) {
    const lower = (text || "").toLowerCase();
    return list.some(k => lower.includes(k.toLowerCase()));
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

//////////////////////////////////////////////////
// REDDIT SAFE FETCH (With Proxy & Modern Headers)
//////////////////////////////////////////////////

async function safeFetch(url) {
    try {
        const proxyUrl = await proxyConfiguration.newUrl();
        
        // Using a real browser User-Agent is crucial
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
        };

        const res = await fetch(url, { headers, proxy: proxyUrl });

        if (res.status === 429) {
            console.warn("⚠️ Rate limited (429). Sleeping 10s and rotating IP...");
            await sleep(10000);
            return null;
        }

        if (!res.ok) {
            console.error(`❌ HTTP Error: ${res.status} for URL: ${url}`);
            return null;
        }

        return await res.json();
    } catch (err) {
        console.error("🔌 Fetch Error:", err.message);
        return null;
    }
}

//////////////////////////////////////////////////
// SCRAPING LOGIC
//////////////////////////////////////////////////

let dataset = [];
let collected = 0;

// Optimization: We use fewer loops to avoid hitting Reddit 1000 times
searchLoop:
for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        if (collected >= maxPosts) break searchLoop;

        // Graduate level query tip: Use Reddit's boolean operators
        const query = `${ai} ${rel} (conflict OR argument OR fight) college`;
        console.log(`🔍 Searching: ${query}`);

        const searchData = await safeFetch(
            `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=25&sort=relevance`
        );

        const posts = searchData?.data?.children || [];

        for (const post of posts) {
            if (collected >= maxPosts) break;

            const p = post.data;
            const fullText = `${p.title} ${p.selftext}`;

            // Double check keywords to ensure data quality
            if (contains(fullText, youthIndicators)) {
                
                console.log(`📑 Processing: ${p.title.substring(0, 40)}...`);

                // Fetch Comments
                const commentsData = await safeFetch(`https://www.reddit.com${p.permalink}.json`);
                
                let comments = [];
                if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                    comments = commentsData[1].data.children
                        .map(c => c.data?.body)
                        .filter(Boolean);
                }

                const entry = {
                    url: `https://reddit.com${p.permalink}`,
                    title: p.title,
                    post_sentiment: getSentimentScore(fullText),
                    avg_comment_sentiment: comments.length
                        ? comments.map(c => getSentimentScore(c)).reduce((a, b) => a + b, 0) / comments.length
                        : 0,
                    comment_count: comments.length,
                    created: new Date(p.created_utc * 1000).toISOString()
                };

                dataset.push(entry);
                await Actor.pushData(entry);
                collected++;

                // Throttle to be polite to Reddit servers
                await sleep(2000); 
            }
        }
    }
}

//////////////////////////////////////////////////
// FINALIZATION & STORAGE
//////////////////////////////////////////////////

const summary = {
    total_posts: dataset.length,
    avg_post_sentiment: dataset.length ? dataset.reduce((s, d) => s + d.post_sentiment, 0) / dataset.length : 0,
    timestamp: new Date().toISOString()
};

console.log("📊 SUMMARY:", summary);

// Create CSV for easy download
const csvStringifier = createObjectCsvStringifier({
    header: [
        { id: 'url', title: 'URL' },
        { id: 'title', title: 'TITLE' },
        { id: 'post_sentiment', title: 'POST_SENTIMENT' },
        { id: 'avg_comment_sentiment', title: 'AVG_COMMENT_SENTIMENT' },
        { id: 'comment_count', title: 'COMMENT_COUNT' },
        { id: 'created', title: 'CREATED' }
    ]
});

const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(dataset);

await Actor.setValue("RESULTS_CSV", csv, { contentType: "text/csv" });
await Actor.setValue("SUMMARY_JSON", summary);

console.log("✅ Run completed successfully.");
await Actor.exit();