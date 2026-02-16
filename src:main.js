import { Actor } from 'apify';
import natural from 'natural';
import fetch from 'node-fetch';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';

await Actor.init();

//////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////

const maxPosts = 100;

const keywordsAI = ["AI", "ChatGPT", "artificial intelligence", "LLM", "generative AI"];
const conflictKeywords = ["argument", "fight", "conflict", "disagree", "tension", "drama"];
const relationshipKeywords = ["friend", "boyfriend", "girlfriend", "partner", "roommate", "coworker", "classmate", "team"];
const youthIndicators = ["college", "university", "campus", "freshman", "sophomore", "junior", "senior", "dorm", "19", "20", "21", "22"];

//////////////////////////////////////////////////
// NLP SETUP
//////////////////////////////////////////////////

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

function sentiment(text) {
    return analyzer.getSentiment(tokenizer.tokenize(text));
}

function contains(text, list) {
    const lower = text.toLowerCase();
    return list.some(k => lower.includes(k.toLowerCase()));
}

function classifyRelationship(text) {
    const lower = text.toLowerCase();
    if (lower.includes("boyfriend") || lower.includes("girlfriend") || lower.includes("partner")) return "Romantic";
    if (lower.includes("friend")) return "Friendship";
    if (lower.includes("roommate")) return "Roommate";
    if (lower.includes("coworker")) return "Workplace";
    if (lower.includes("classmate") || lower.includes("team")) return "Academic Team";
    return "Other";
}

function classifyConflict(text) {
    const lower = text.toLowerCase();
    if (lower.includes("cheat") || lower.includes("plagiarism")) return "Academic Integrity";
    if (lower.includes("ethic") || lower.includes("moral")) return "Ethical Debate";
    if (lower.includes("jealous")) return "Jealousy";
    return "General";
}

//////////////////////////////////////////////////
// REDDIT FUNCTIONS
//////////////////////////////////////////////////

async function searchReddit(query) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10`;
    const res = await fetch(url, { headers: { "User-Agent": "research-bot" } });
    return res.json();
}

async function fetchComments(permalink) {
    const res = await fetch(`https://www.reddit.com${permalink}.json`, {
        headers: { "User-Agent": "research-bot" }
    });
    const data = await res.json();
    const comments = [];
    if (data[1]?.data?.children) {
        for (const c of data[1].data.children) {
            if (c.data?.body) comments.push(c.data.body);
        }
    }
    return comments;
}

//////////////////////////////////////////////////
// DATA COLLECTION
//////////////////////////////////////////////////

let dataset = [];
let count = 0;

for (const ai of keywordsAI) {
    for (const rel of relationshipKeywords) {
        for (const conflict of conflictKeywords) {

            if (count >= maxPosts) break;

            const query = `${ai} ${rel} ${conflict} college`;
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
                    const postSent = sentiment(fullText);
                    const commentSentAvg =
                        comments.length > 0
                            ? comments.map(c => sentiment(c)).reduce((a, b) => a + b, 0) / comments.length
                            : 0;

                    const entry = {
                        url: `https://reddit.com${p.permalink}`,
                        relationship_type: classifyRelationship(fullText),
                        conflict_type: classifyConflict(fullText),
                        post_sentiment: postSent,
                        avg_comment_sentiment: commentSentAvg,
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
// STATISTICAL SUMMARY
//////////////////////////////////////////////////

const total = dataset.length;

const avgPostSentiment =
    dataset.reduce((sum, d) => sum + d.post_sentiment, 0) / total;

const avgCommentSentiment =
    dataset.reduce((sum, d) => sum + d.avg_comment_sentiment, 0) / total;

const relationshipDistribution = {};
const conflictDistribution = {};

for (const d of dataset) {
    relationshipDistribution[d.relationship_type] =
        (relationshipDistribution[d.relationship_type] || 0) + 1;

    conflictDistribution[d.conflict_type] =
        (conflictDistribution[d.conflict_type] || 0) + 1;
}

const summary = {
    total_posts: total,
    avg_post_sentiment: avgPostSentiment,
    avg_comment_sentiment: avgCommentSentiment,
    relationship_distribution: relationshipDistribution,
    conflict_distribution: conflictDistribution
};

console.log("STATISTICAL SUMMARY:");
console.log(summary);

//////////////////////////////////////////////////
// CSV EXPORT
//////////////////////////////////////////////////

const csvWriter = createObjectCsvWriter({
    path: './dataset.csv',
    header: Object.keys(dataset[0] || {}).map(key => ({ id: key, title: key }))
});

if (dataset.length > 0) {
    await csvWriter.writeRecords(dataset);
    console.log("CSV Export Complete");
}

// Save summary file
fs.writeFileSync("./summary.json", JSON.stringify(summary, null, 2));

await Actor.exit();