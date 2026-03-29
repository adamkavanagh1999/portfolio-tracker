// netlify/functions/prices.js
// Fetches ETF prices from Yahoo Finance server-side (no CORS issues).
//
// SERVER-SIDE CACHE (Fix B):
// Prices are cached in the function's module-level variable for 24 hours.
// This means even if the dashboard calls this function multiple times per day,
// Yahoo Finance is only actually contacted once every 24 hours.
// Netlify still counts each invocation, but Yahoo calls are minimised.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Module-level cache — persists across warm invocations of the same function instance
let priceCache = {
  prices: {},
  fetchedAt: 0,
  symbols: '',
};

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

  const symbolsKey = symbols.toUpperCase().split(',').sort().join(',');
  const now = Date.now();
  const cacheAge = now - priceCache.fetchedAt;
  const cacheValid = priceCache.fetchedAt > 0
    && cacheAge < CACHE_TTL_MS
    && priceCache.symbols === symbolsKey
    && Object.keys(priceCache.prices).length > 0;

  // Return cached prices if still fresh
  if (cacheValid) {
    const fetchedAt = new Date(priceCache.fetchedAt).toISOString();
    const nextFetch = new Date(priceCache.fetchedAt + CACHE_TTL_MS).toISOString();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        prices: priceCache.prices,
        timestamp: fetchedAt,
        nextFetch,
        cached: true,
      }),
    };
  }

  // Cache miss or stale — fetch fresh prices from Yahoo
  const symbolList = symbolsKey.split(',');
  const priceMap = {};
  const errors = [];

  for (const sym of symbolList) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (!res.ok) {
        // Try backup Yahoo endpoint
        const res2 = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
        );
        if (!res2.ok) { errors.push(`${sym}: Yahoo unavailable`); continue; }
        const data2 = await res2.json();
        const price2 = data2?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price2) { priceMap[sym] = price2; continue; }
        errors.push(`${sym}: not found`);
        continue;
      }

      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice || meta?.previousClose;

      if (price && price > 0) {
        priceMap[sym] = price;
      } else {
        errors.push(`${sym}: no price returned — check symbol`);
      }

    } catch (err) {
      errors.push(`${sym}: ${err.message}`);
    }
  }

  // Update cache if we got at least some prices
  if (Object.keys(priceMap).length > 0) {
    priceCache = {
      prices: priceMap,
      fetchedAt: now,
      symbols: symbolsKey,
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      prices: priceMap,
      timestamp: new Date().toISOString(),
      cached: false,
      errors: errors.length ? errors : undefined,
    }),
  };
};
