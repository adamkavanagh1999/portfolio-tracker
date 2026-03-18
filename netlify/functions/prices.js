// netlify/functions/prices.js
// Serverless function — runs on Netlify's servers, not in the browser.
// Fetches ETF prices from Financial Modeling Prep using a server-side API key.
// This avoids CORS issues entirely since the request comes from a server.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Get symbols from query string e.g. ?symbols=SPYL.DE,MEUD.AS,VJPA.AS
  const symbols = event.queryStringParameters?.symbols;
  if (!symbols) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'No symbols provided' }),
    };
  }

  // API key stored securely as a Netlify environment variable
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'FMP_API_KEY not set — add it in Netlify → Site configuration → Environment variables',
      }),
    };
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symbols)}?apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    // FMP returns an error object if key is invalid or symbols not found
    if (!Array.isArray(data)) {
      const msg = data?.['Error Message'] || data?.message || 'FMP API error';
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error: msg }),
      };
    }

    // Build a clean { "SPYL.DE": 63.41, "MEUD.AS": 42.10 } map
    const priceMap = {};
    data.forEach(q => {
      if (q.symbol && q.price) {
        priceMap[q.symbol.toUpperCase()] = q.price;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ prices: priceMap }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Fetch failed: ' + err.message }),
    };
  }
};
