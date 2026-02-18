import { Actor } from 'apify';
import natural from 'natural';
import { createObjectCsvStringifier } from 'csv-writer';

await Actor.init();

// 1. PROXY & INPUT
const proxyConfiguration = await Actor.createProxyConfiguration();
const input = await Actor.getInput() || {};
const maxPosts = input.maxPosts || 100; // Increased default for research

console.log("🚀 Researcher Actor started.");

//////////////////////////////////////////////////
// EXPANDED KEYWORD LISTS (Higher Yield)
//////////////////////////////////////////////////

const keywordsAI = ["AI", "ChatGPT", "Claude", "Gemini", "Artificial Intelligence", "LLM"];
const conflictKeywords = ["argument", "fight", "conflict", "disagree", "annoyed", "cheating", "issue", "problem"];
const relationshipKeywords = ["friend", "partner", "roommate", "coworker", "classmate", "boyfriend", "girlfriend"];
const youthIndicators = ["college", "university", "campus", "student", "dorm", "professor", "semester", "freshman", "senior", "undergrad"];

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

function getSentimentScore(text) {
    if (!text || text.trim().length < 5) return 0;
    const tokens = tokenizer.tokenize(text);
    try { return analyzer.getSentiment(tokens); } catch (e) { return 0; }
}

function contains(text, list) {
    const lower = (text || "").toLowerCase();
    return list.some(k => lower.includes(k.toLowerCase()));
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

//////////////////////////////////////////////////
// ENHANCED FETCH (With Search Filters)
//////////////////////////////////////////////////

async function safeFetch(url) {
    try {
        const proxyUrl = await proxyConfiguration.newUrl();
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/json"
        };
        const res = await fetch(url, { headers, proxy: proxyUrl });
        if (res.status === 429) { await sleep(10000); return null; }
        return res.ok ? await res.json() : null;
    } catch (err) { return null; }
}

//////////////////////////////////////////////////
// THE HARVESTING LOGIC
//////////////////////////////////////////////////

let dataset = [];
let collected = 0;

// Strategy: Search by AI + Relationship (Broadest possible relevant set)
searchLoop:
for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        if (collected >= maxPosts) break searchLoop;

        const query = `"${ai}" ${rel}`; 
        console.log(`🔍 Harvesting: ${query}`);

        // t=all searches history; include_over_18 catches unfiltered conflict stories
        const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&restrict_sr=off&sort=relevance&t=all&limit=100&include_over_18=1`;

        const searchData = await safeFetch(searchUrl);
        const posts = searchData?.data?.children || [];

        for (const post of posts) {
            if (collected >= maxPosts) break;

            const p = post.data;
            const fullText = `${p.title} ${p.selftext}`;

            // CODE-LEVEL FILTERING (The "Sieve")
            const hasConflict = contains(fullText, conflictKeywords);
            const hasYouth = contains(fullText, youthIndicators);

            if (p.is_self && hasConflict && hasYouth) {
                
                console.log(`✅ Match Found: "${p.title.substring(0, 50)}..."`);

                // Fetch Comments for depth
                const commentsData = await safeFetch(`https://www.reddit.com${p.permalink}.json`);
                let comments = [];
                if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                    comments = commentsData[1].data.children.map(c => c.data?.body).filter(Boolean);
                }

                const entry = {
                    url: `https://reddit.com${p.permalink}`,
                    title: p.title,
                    post_sentiment: getSentimentScore(fullText),
                    avg_comment_sentiment: comments.length 
                        ? comments.map(c => getSentimentScore(c)).reduce((a,b)=>a+b,0) / comments.length 
                        : 0,
                    comment_count: comments.length,
                    created: new Date(p.created_utc * 1000).toISOString(),
                    ai_keyword: ai,
                    rel_keyword: rel
                };

                dataset.push(entry);
                await Actor.pushData(entry);
                collected++;
                await sleep(1500); // Polite delay
            }
        }
    }
}

//////////////////////////////////////////////////
// SAVE DATA
//////////////////////////////////////////////////

const csvStringifier = createObjectCsvStringifier({
    header: [
        { id: 'url', title: 'URL' },
        { id: 'title', title: 'TITLE' },
        { id: 'post_sentiment', title: 'POST_SENTIMENT' },
        { id: 'avg_comment_sentiment', title: 'AVG_COMMENT_SENTIMENT' },
        { id: 'comment_count', title: 'COMMENT_COUNT' },
        { id: 'created', title: 'CREATED' },
        { id: 'ai_keyword', title: 'AI_USED' }
    ]
});

const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(dataset);
await Actor.setValue("RESEARCH_DATA.csv", csv, { contentType: "text/csv" });
await Actor.setValue("STATS", { total: dataset.length });

console.log(`🏁 Done! Collected ${dataset.length} research entries.`);
await Actor.exit();