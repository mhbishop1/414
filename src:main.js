import { Actor } from 'apify';
import natural from 'natural';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';

await Actor.init();

console.log("Actor started...");

const maxPosts = 50;

const keywordsAI = ["AI", "ChatGPT", "artificial intelligence"];
const conflictKeywords = ["argument", "fight", "conflict", "disagree"];
const relationshipKeywords = ["friend", "partner", "roommate", "coworker", "classmate"];
const youthIndicators = ["college", "university", "campus", "freshman", "sophomore", "junior", "senior"];

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

function sentiment(text) {
    return analyzer.getSentiment(tokenizer.tokenize(text));
}

function contains(text, list) {
    const lower = text.toLowerCase();
    return list.some(k => lower.includes(k.toLowerCase()));
}

async function searchReddit(query) {
    try {
        const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10`, {
            headers: { "User-Agent": "research-bot" }
        });

        if (!res.ok) {
            console.log("Reddit API error:", res.status);
            return null;
        }

        return await res.json();
    } catch (err) {
        console.log("Search error:", err.message);
        return null;
    }
}

async function fetchComments(permalink) {
    try {
        const res = await fetch(`https://www.reddit.com${permalink}.json`, {
            headers: { "User-Agent": "research-bot" }
        });

        if (!res.ok) return [];

        const data = await res.json();
        const comments = [];

        if (data[1]?.data?.children) {
            for (const c of data[1].data.children) {
                if (c.data?.body) comments.push(c.data.body);
            }
        }

        return comments;
    } catch {
        return [];
    }
}

let dataset = [];
let count = 0;

for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        for (const conflict of conflictKeywords) {

            if (count >= maxPosts) break;

            const query = `${ai} ${rel} ${conflict} college`;
            console.log("Searching:", query);

            const results = await searchReddit(query);
            if (!results?.data?.children) continue;

            for (const post of results.data.children) {

                if (count >= maxPosts) break;

                const p = post.data;
                const fullText = `${p.title} ${p.selftext}`;

                if (
                    contains(fullText, keywordsAI) &&
                    contains(fullText, conflictKeywords) &&
                    contains(fullText, relationshipKeywords) &&
                    contains(fullText, youthIndicators)
                ) {

                    const comments = await fetchComments(p.permalink);

                    const entry = {
                        url: `https://reddit.com${p.permalink}`,
                        post_sentiment: sentiment(fullText),
                        avg_comment_sentiment: comments.length > 0
                            ? comments.map(c => sentiment(c)).reduce((a,b)=>a+b,0) / comments.length
                            : 0,
                        comment_count: comments.length,
                        created: new Date(p.created_utc * 1000).toISOString()
                    };

                    dataset.push(entry);
                    await Actor.pushData(entry);
                    count++;
                }
            }
        }
    }
}

//////////////////////////////////////////////////
// SAFE STATISTICS
//////////////////////////////////////////////////

if (dataset.length === 0) {
    console.log("No data collected.");
    await Actor.exit();
}

const avgPostSent =
    dataset.reduce((s,d)=>s+d.post_sentiment,0) / dataset.length;

const avgCommentSent =
    dataset.reduce((s,d)=>s+d.avg_comment_sentiment,0) / dataset.length;

const summary = {
    total_posts: dataset.length,
    avg_post_sentiment: avgPostSent,
    avg_comment_sentiment: avgCommentSent
};

console.log("SUMMARY:", summary);

//////////////////////////////////////////////////
// SAFE CSV EXPORT
//////////////////////////////////////////////////

const csvWriter = createObjectCsvWriter({
    path: './dataset.csv',
    header: [
        { id: 'url', title: 'URL' },
        { id: 'post_sentiment', title: 'POST_SENTIMENT' },
        { id: 'avg_comment_sentiment', title: 'AVG_COMMENT_SENTIMENT' },
        { id: 'comment_count', title: 'COMMENT_COUNT' },
        { id: 'created', title: 'CREATED' }
    ]
});

await csvWriter.writeRecords(dataset);
fs.writeFileSync("./summary.json", JSON.stringify(summary, null, 2));

console.log("Run completed successfully.");

await Actor.exit();