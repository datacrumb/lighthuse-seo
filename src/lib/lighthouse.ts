export async function runPageSpeedInsights(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
) {
  const apiKey = process.env.PSI_API_KEY;
  if (!apiKey) throw new Error('PSI_API_KEY is not set in environment variables.');

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&strategy=${strategy}&key=${apiKey}`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PageSpeed API error: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2)); // Log the full response
  return data;
}