import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_NAME = 'Sheet1'; // Change if needed

// ✅ Move everything into a function
async function createGoogleSheetsClient() {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error('Missing required environment variables');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();

  const sheets = google.sheets({
    version: 'v4',
    auth: authClient as any,
  });

  return { sheets, sheetId: GOOGLE_SHEET_ID };
}

// ✅ Only runs when called from your API route
export async function processGoogleSheet(onProgress: (message: string) => void) {
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
  const seoIdx = 16;     // Column Q
  const perfIdx = 17;    // Column R

  let processedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  let batchUpdates: [string, string][] = [];
  let batchRowIndices: number[] = [];

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
      } else if (!seoScore) {
        newSeo = 'No Score';
      }

      if (!performanceScore && lighthouseScores.performance !== null) {
        newPerf = lighthouseScores.performance.toFixed(1);
      } else if (!performanceScore) {
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
    } catch (e: any) {
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
async function analyzeUrlWithRetry(url: string, onProgress: (message: string) => void, retries = 3): Promise<{ seo: number|null, performance: number|null }> {
  for (let i = 0; i < retries; i++) {
    try {
      onProgress(`Analyzing URL: ${url} (Attempt ${i + 1}/${retries})`);
      const { runPageSpeedInsights } = await import('./lighthouse');
      const data = await runPageSpeedInsights(url, 'mobile');
      const seo = data.lighthouseResult?.categories?.seo?.score != null
        ? data.lighthouseResult.categories.seo.score * 100
        : null;
      const performance = data.lighthouseResult?.categories?.performance?.score != null
        ? data.lighthouseResult.categories.performance.score * 100
        : null;
      return { seo, performance };
    } catch (e: any) {
      // Handle 429 Too Many Requests
      if (e.message && e.message.includes('429')) {
        onProgress(`Rate limit hit (429) for ${url}, waiting before retry...`);
        // Wait longer for 429 errors (e.g., 10 seconds)
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
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