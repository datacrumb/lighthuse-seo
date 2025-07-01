import { JWT } from 'google-auth-library';
import type { LighthouseScores } from './lighthouse';
import { google } from 'googleapis';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
}
if (!process.env.GOOGLE_PRIVATE_KEY) {
  throw new Error('GOOGLE_PRIVATE_KEY is not set');
}
if (!process.env.GOOGLE_SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID is not set');
}

const jwtClient = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({
  version: 'v4',
  auth: jwtClient as any, // 👈 Force-cast if needed (not type-safe, use with caution)
});
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Sheet1'; // Change if your sheet/tab name is different

export async function processGoogleSheet(
  onProgress: (message: string) => void
) {
  // 1. Read all rows
  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:Z100`,
  });
  const values = getRes.data.values || [];
  if (values.length === 0) {
    onProgress('No data found in sheet.');
    return { processedCount: 0, skippedCount: 0, errors: [] };
  }

  // 2. Find column indexes
  const websiteIdx = 15; // Column P
  const seoIdx = 16;     // Column Q
  const perfIdx = 17;    // Column R
  

  let processedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  // 3. Process each row
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowIndex = i + 1; // 1-based for Sheets API
    try {
      const url = row[websiteIdx];
      if (!url || typeof url !== 'string' || !url.trim()) {
        onProgress(`Skipping row ${rowIndex}: Empty URL`);
        skippedCount++;
        continue;
      }
      const seoScore = row[seoIdx];
      const performanceScore = row[perfIdx];
      if (seoScore && performanceScore) {
        onProgress(`Skipping row ${rowIndex}: Both scores already present`);
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
      // 4. Update the row in the sheet
      const updateRange = `${SHEET_NAME}!${String.fromCharCode(65 + seoIdx)}${rowIndex}:${String.fromCharCode(65 + perfIdx)}${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newSeo, newPerf]],
        },
      });
      onProgress(`Updated scores for row ${rowIndex}: ${url}`);
      processedCount++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e: any) {
      const errorMessage = `Error processing row ${rowIndex}: ${e.message}`;
      onProgress(errorMessage);
      errors.push(errorMessage);
      continue;
    }
  }
  onProgress("\nProcessing complete!");
  onProgress(`Processed: ${processedCount} rows`);
  onProgress(`Skipped: ${skippedCount} rows`);
  if (errors.length > 0) {
    onProgress("\nErrors encountered:");
    errors.forEach(error => onProgress(`- ${error}`));
  }
  return {
    processedCount,
    skippedCount,
    errors,
  };
}

async function analyzeUrlWithRetry(url: string, onProgress: (message: string) => void, retries = 3): Promise<LighthouseScores> {
  for (let i = 0; i < retries; i++) {
    try {
      onProgress(`Analyzing URL: ${url} (Attempt ${i + 1}/${retries})`);
      const scores = await (await import('./lighthouse')).analyzeUrl(url);
      return scores;
    } catch (e: any) {
      onProgress(`Attempt ${i + 1} failed for ${url}: ${e.message}`);
      if (i === retries - 1) {
        return { seo: null, performance: null };
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return { seo: null, performance: null };
} 