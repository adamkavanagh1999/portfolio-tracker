// netlify/functions/prices.js
// Fetches ETF prices from Yahoo Finance (unofficial, server-side — no CORS issues)
// Refreshes 4x/day = every 6 hours. No API key needed.
// Falls back gracefully if Yahoo is unavailable.
 
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
 
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
 
  const symbols = event.queryStringParameters?.symbols;
  if (!symbols) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No symbols provided' }) };
  }
 
  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
  const priceMap = {};
  const errors = [];
 
  for (const sym of symbolList) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          // Mimic a browser request so Yahoo doesn't reject it
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
 
      if (!res.ok) {
        // Try backup Yahoo endpoint
        const res2 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });
        if (!res2.ok) { errors.push(`${sym}: Yahoo unavailable`); continue; }
        const data2 = await res2.json();
        const price2 = data2?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price2) { priceMap[sym] = price2; continue; }
        errors.push(`${sym}: not found on Yahoo`);
        continue;
      }
 
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice || meta?.previousClose;
 
      if (price && price > 0) {
        priceMap[sym] = price;
      } else {
        errors.push(`${sym}: no price returned — check symbol format`);
      }
 
    } catch (err) {
      errors.push(`${sym}: ${err.message}`);
    }
  }
 
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      prices: priceMap,
      timestamp: new Date().toISOString(),
      errors: errors.length ? errors : undefined,
    }),
  };
};
