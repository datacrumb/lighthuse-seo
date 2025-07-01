import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface LighthouseScores {
  seo: number | null;
  performance: number | null;
}

export async function analyzeUrl(url: string): Promise<LighthouseScores> {
  console.log(`Analyzing: ${url}`);
  
  const lighthouseCommand = 'npx lighthouse';
  const command = [
    lighthouseCommand,
    `"${url}"`,
    '--output=json',
    '--output-path=stdout',
    '--only-categories=seo,performance',
    '--chrome-flags="--headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage" --disable-setuid-sandbox --disable-web-security --disable-extensions --disable-background-networking --disable-default-apps --disable-sync --disable-translate --hide-scrollbars --metrics-recording-only --mute-audio --no-first-run --safebrowsing-disable-auto-update',
    '--max-wait-for-load=15000',
    '--skip-audits=uses-http2,uses-passive-event-listeners,uses-text-compression,uses-responsive-images,uses-rel-preconnect,uses-rel-preload,uses-webp-images,uses-optimized-images',
  ].join(' ');

  console.log(`Running command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });  // 10MB buffer

    if (stderr && stderr.includes('Status code: 404')) {
      console.error(`Error: Page not found (404) for URL: ${url}`);
      return { seo: null, performance: null };
    }

    if (stderr) {
      console.log('Lighthouse stderr output:', stderr);
    }
    
    if (!stdout.trim()) {
        console.error(`Error: No output received from Lighthouse for ${url}`);
        return { seo: null, performance: null };
    }

    const report = JSON.parse(stdout);

    if (!report.categories) {
        console.error(`Error: No categories found in Lighthouse output for ${url}`);
        return { seo: null, performance: null };
    }

    const seoScore = report.categories.seo?.score !== undefined ? report.categories.seo.score * 100 : null;
    const performanceScore = report.categories.performance?.score !== undefined ? report.categories.performance.score * 100 : null;
    
    console.log(`SEO Score: ${seoScore !== null ? `${seoScore.toFixed(1)}/100` : 'No score available'}`);
    console.log(`Performance Score: ${performanceScore !== null ? `${performanceScore.toFixed(1)}/100` : 'No score available'}`);

    return { seo: seoScore, performance: performanceScore };
  } catch (error: any) {
    console.error(`Error running Lighthouse for ${url}:`, error.message);
    if(error.stderr) {
      console.error("Lighthouse stderr:", error.stderr)
    }
    return { seo: null, performance: null };
  }
} 