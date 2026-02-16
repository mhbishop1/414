# AI & Youth Partnership Conflict Research Actor

## Overview
This Apify Actor scrapes Reddit for AI-related partnership conflicts among young people (college-age indicators).

It performs:
- AI keyword filtering
- Conflict keyword filtering
- Relationship filtering
- Youth filtering
- Comment scraping
- Sentiment analysis
- Statistical summaries
- CSV export

## Output

1. Dataset (Apify Dataset tab)
2. dataset.csv (KeyValueStore)
3. summary.json (KeyValueStore)

## Input

{
  "maxPosts": 50
}

## Research Use

Designed for graduate-level social research.
Outputs structured data for:
- SPSS
- R
- Python
- Stata

## Notes

- Uses public Reddit JSON endpoints
- Includes request throttling
- Handles rate limits safely
- Runs under LIMITED_PERMISSIONS safely