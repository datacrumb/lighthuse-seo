"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGoogleSheet = processGoogleSheet;
const googleapis_1 = require("googleapis");
const SHEET_NAME = 'Sheet1'; // Change if needed
// ✅ Move everything into a function
async function createGoogleSheetsClient() {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
        throw new Error('Missing required environment variables');
    }
    const auth = new googleapis_1.google.auth.GoogleAuth({
        credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = googleapis_1.google.sheets({
        version: 'v4',
        auth: authClient,
    });
    return { sheets, sheetId: GOOGLE_SHEET_ID };
}
// ✅ Only runs when called from your API route
async function processGoogleSheet(onProgress) {
    const { sheets, sheetId } = await createGoogleSheetsClient();
    // 1. Read all rows
    const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A1:Z`
    });
    const values = getRes.data.values || [];
    if (values.length === 0) {
        onProgress('No data found in sheet.');
        return { processedCount: 0, skippedCount: 0, errors: [] };
    }
    const websiteIdx = 15; // Column P
    const seoIdx = 16; // Column Q
    const perfIdx = 17; // Column R
    let processedCount = 0;
    let skippedCount = 0;
    const errors = [];
    let batchUpdates = [];
    let batchRowIndices = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const rowIndex = i + 1;
        try {
            const url = row[websiteIdx];
            if (!url || typeof url !== 'string' || !url.trim()) {
                onProgress(`Skipping row ${rowIndex}: Empty URL`);
                skippedCount++;
                continue;
            }
            const seoScore = row[seoIdx];
            const performanceScore = row[perfIdx];
            // Skip if either SEO or Performance already has a value (number or 'No Score')
            if ((seoScore && seoScore !== '') || (performanceScore && performanceScore !== '')) {
                onProgress(`Skipping row ${rowIndex}: SEO or Performance score already present`);
                skippedCount++;
                continue;
            }
            let fullUrl = url.trim();
            if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                fullUrl = 'https://' + fullUrl;
            }
            const lighthouseScores = await analyzeUrlWithRetry(fullUrl, onProgress);
            let newSeo = seoScore;
            let newPerf = performanceScore;
            if (!seoScore && lighthouseScores.seo !== null) {
                newSeo = lighthouseScores.seo.toFixed(1);
            }
            else if (!seoScore) {
                newSeo = 'No Score';
            }
            if (!performanceScore && lighthouseScores.performance !== null) {
                newPerf = lighthouseScores.performance.toFixed(1);
            }
            else if (!performanceScore) {
                newPerf = 'No Score';
            }
            batchUpdates.push([newSeo, newPerf]);
            batchRowIndices.push(rowIndex);
            processedCount++;
            onProgress(`Queued scores for row ${rowIndex}: ${url}`);
            // If batch is full, send update
            if (batchUpdates.length === 5) {
                const updateRequests = batchRowIndices.map((rowIdx, idx) => ({
                    range: `${SHEET_NAME}!${String.fromCharCode(65 + seoIdx)}${rowIdx}:${String.fromCharCode(65 + perfIdx)}${rowIdx}`,
                    values: [batchUpdates[idx]],
                }));
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: {
                        valueInputOption: 'RAW',
                        data: updateRequests,
                    },
                });
                batchUpdates = [];
                batchRowIndices = [];
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        catch (e) {
            const errorMessage = `Error processing row ${rowIndex}: ${e.message}`;
            onProgress(errorMessage);
            errors.push(errorMessage);
            continue;
        }
    }
    // Write any remaining updates
    if (batchUpdates.length > 0) {
        const updateRequests = batchRowIndices.map((rowIdx, idx) => ({
            range: `${SHEET_NAME}!${String.fromCharCode(65 + seoIdx)}${rowIdx}:${String.fromCharCode(65 + perfIdx)}${rowIdx}`,
            values: [batchUpdates[idx]],
        }));
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: updateRequests,
            },
        });
        batchUpdates = [];
        batchRowIndices = [];
    }
    onProgress("\nProcessing complete!");
    onProgress(`Processed: ${processedCount} rows`);
    onProgress(`Skipped: ${skippedCount} rows`);
    if (errors.length > 0) {
        onProgress("\nErrors encountered:");
        errors.forEach(error => onProgress(`- ${error}`));
    }
    return { processedCount, skippedCount, errors };
}
// ✅ Make sure this is not at top-level
async function analyzeUrlWithRetry(url, onProgress, retries = 3) {
    var _a, _b, _c, _d, _e, _f;
    for (let i = 0; i < retries; i++) {
        try {
            onProgress(`Analyzing URL: ${url} (Attempt ${i + 1}/${retries})`);
            const { runPageSpeedInsights } = await Promise.resolve().then(() => __importStar(require('./lighthouse')));
            const data = await runPageSpeedInsights(url, 'mobile');
            const seo = ((_c = (_b = (_a = data.lighthouseResult) === null || _a === void 0 ? void 0 : _a.categories) === null || _b === void 0 ? void 0 : _b.seo) === null || _c === void 0 ? void 0 : _c.score) != null
                ? data.lighthouseResult.categories.seo.score * 100
                : null;
            const performance = ((_f = (_e = (_d = data.lighthouseResult) === null || _d === void 0 ? void 0 : _d.categories) === null || _e === void 0 ? void 0 : _e.performance) === null || _f === void 0 ? void 0 : _f.score) != null
                ? data.lighthouseResult.categories.performance.score * 100
                : null;
            return { seo, performance };
        }
        catch (e) {
            // Handle 429 Too Many Requests
            if (e.message && e.message.includes('429')) {
                onProgress(`Rate limit hit (429) for ${url}, waiting before retry...`);
                // Wait longer for 429 errors (e.g., 10 seconds)
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
            else {
                onProgress(`Attempt ${i + 1} failed for ${url}: ${e.message}`);
                // Wait 2 seconds for other errors
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            if (i === retries - 1) {
                return { seo: null, performance: null };
            }
        }
    }
    return { seo: null, performance: null };
}
