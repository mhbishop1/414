import { Actor } from 'apify';
import natural from 'natural';
import { createObjectCsvStringifier } from 'csv-writer';

await Actor.init();

const input = await Actor.getInput() || {};
const maxPosts = input.maxPosts || 50;

console.log("Actor started.");

//////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////

const keywordsAI = ["AI", "ChatGPT", "artificial intelligence"];
const conflictKeywords = ["argument", "fight", "conflict", "disagree"];
const relationshipKeywords = ["friend", "partner", "roommate", "coworker", "classmate"];
const youthIndicators = ["college", "university", "campus", "freshman", "sophomore", "junior", "senior"];

//////////////////////////////////////////////////
// NLP SETUP
//////////////////////////////////////////////////

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

function sentiment(text) {
    return analyzer.getSentiment(tokenizer.tokenize(text || ""));
}

function contains(text, list) {
    const lower = (text || "").toLowerCase();
    return list.some(k => lower.includes(k.toLowerCase()));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//////////////////////////////////////////////////
// REDDIT SAFE FETCH
//////////////////////////////////////////////////

async function safeFetch(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "apify-research-bot" }
        });

        if (res.status === 429) {
            console.log("Rate limited. Sleeping 5 seconds...");
            await sleep(5000);
            return null;
        }

        if (!res.ok) {
            console.log("HTTP Error:", res.status);
            return null;
        }

        return await res.json();

    } catch (err) {
        console.log("Fetch error:", err.message);
        return null;
    }
}

//////////////////////////////////////////////////
// SCRAPING
//////////////////////////////////////////////////

let dataset = [];
let collected = 0;

for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        for (const conflict of conflictKeywords) {

            if (collected >= maxPosts) break;

            const query = `${ai} ${rel} ${conflict} college`;
            console.log("Searching:", query);

            const data = await safeFetch(
                `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10`
            );

            if (!data?.data?.children) continue;

            for (const post of data.data.children) {

                if (collected >= maxPosts) break;

                const p = post.data;
                const fullText = `${p.title} ${p.selftext}`;

                if (
                    contains(fullText, keywordsAI) &&
                    contains(fullText, conflictKeywords) &&
                    contains(fullText, relationshipKeywords) &&
                    contains(fullText, youthIndicators)
                ) {

                    const commentsData = await safeFetch(
                        `https://www.reddit.com${p.permalink}.json`
                    );

                    let comments = [];

                    if (commentsData?.[1]?.data?.children) {
                        comments = commentsData[1].data.children
                            .map(c => c.data?.body)
                            .filter(Boolean);
                    }

                    const entry = {
                        url: `https://reddit.com${p.permalink}`,
                        post_sentiment: sentiment(fullText),
                        avg_comment_sentiment: comments.length
                            ? comments.map(c => sentiment(c)).reduce((a,b)=>a+b,0) / comments.length
                            : 0,
                        comment_count: comments.length,
                        created: new Date(p.created_utc * 1000).toISOString()
                    };

                    dataset.push(entry);
                    await Actor.pushData(entry);
                    collected++;

                    await sleep(1000); // throttle
                }
            }
        }
    }
}

//////////////////////////////////////////////////
// STATISTICS
//////////////////////////////////////////////////

let summary = {
    total_posts: dataset.length,
    avg_post_sentiment: 0,
    avg_comment_sentiment: 0
};

if (dataset.length > 0) {
    summary.avg_post_sentiment =
        dataset.reduce((s,d)=>s+d.post_sentiment,0) / dataset.length;

    summary.avg_comment_sentiment =
        dataset.reduce((s,d)=>s+d.avg_comment_sentiment,0) / dataset.length;
}

console.log("SUMMARY:", summary);

//////////////////////////////////////////////////
// SAVE FILES TO APIFY STORAGE
//////////////////////////////////////////////////

const csvStringifier = createObjectCsvStringifier({
    header: [
        { id: 'url', title: 'URL' },
        { id: 'post_sentiment', title: 'POST_SENTIMENT' },
        { id: 'avg_comment_sentiment', title: 'AVG_COMMENT_SENTIMENT' },
        { id: 'comment_count', title: 'COMMENT_COUNT' },
        { id: 'created', title: 'CREATED' }
    ]
});

const csv =
    csvStringifier.getHeaderString() +
    csvStringifier.stringifyRecords(dataset);

await Actor.setValue("dataset.csv", csv, { contentType: "text/csv" });
await Actor.setValue("summary.json", summary);

console.log("Run completed successfully.");
await Actor.exit();