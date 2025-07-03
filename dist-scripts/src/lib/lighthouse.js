"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPageSpeedInsights = runPageSpeedInsights;
async function runPageSpeedInsights(url, strategy = 'desktop') {
    const apiKey = process.env.PSI_API_KEY;
    if (!apiKey)
        throw new Error('PSI_API_KEY is not set in environment variables.');
    // Explicitly request both performance and seo categories
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=seo&key=${apiKey}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`PageSpeed API error: ${res.status} - ${errorText}`);
    }
    const data = await res.json();
    return data;
}
