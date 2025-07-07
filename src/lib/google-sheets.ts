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

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowIndex = i + 1;

    try {
      const url = row[websiteIdx];
      if (
        !url ||
        typeof url !== 'string' ||
        !url.trim() ||
        url.trim().toLowerCase() === 'NOT FOUND' ||
        url.trim().toLowerCase() === 'N/A' ||
        url.trim().toLowerCase() === 'not found' ||
        url.trim().toLowerCase() === 'na' ||
        url.trim().toLowerCase() === 'none' ||
        url.trim().toLowerCase() === 'null' ||
        url.trim().toLowerCase() === 'undefined' ||
        url.trim().toLowerCase() === '-' ||
        url.trim().toLowerCase() === '--' ||
        url.trim().toLowerCase() === 'no url' ||
        url.trim().toLowerCase() === 'missing' ||
        url.trim().toLowerCase() === 'empty' ||
        url.trim().toLowerCase() === 'n\\a' ||
        url.trim().toLowerCase().endsWith('.pdf')
      ) {
        onProgress(`Skipping row ${rowIndex}: Invalid or unsupported URL (${url})`);
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

      const lighthouseScores = await analyzeUrl(fullUrl, onProgress);
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

      // Immediately update the sheet for this row
      const updateRequest = {
        range: `${SHEET_NAME}!${String.fromCharCode(65 + seoIdx)}${rowIndex}:${String.fromCharCode(65 + perfIdx)}${rowIndex}`,
        values: [[newSeo, newPerf]],
      };
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [updateRequest],
        },
      });
      processedCount++;
      onProgress(`Updated scores for row ${rowIndex}: ${url}`);
      // Wait 1 second between updates to avoid rate limits
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

  return { processedCount, skippedCount, errors };
}

// ✅ Make sure this is not at top-level
async function analyzeUrl(url: string, onProgress: (message: string) => void, retries = 3): Promise<{ seo: number|null, performance: number|null }> {
  try {
    onProgress(`Analyzing URL: ${url}`);
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
    onProgress(`Failed to analyze ${url}: ${e.message}`);
    return { seo: null, performance: null };
  }
}