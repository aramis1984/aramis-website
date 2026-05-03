// Vercel Serverless Function — Google Business Profile Reviews
// Uses OAuth 2.0 to access the full review pool (not capped at 5).
// Shuffles server-side on every request — no CDN caching.

const PLACE_ID = 'ChIJM6BkL4h9nBQRwuF447BkhqU'; // ARAMIS Billiard Club

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Exchange refresh token for a fresh access token
async function getAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

// Discover account name (e.g. "accounts/123456789")
async function getAccountName(accessToken) {
  const res  = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!data.accounts || !data.accounts.length) throw new Error('No accounts found');
  return data.accounts[0].name;
}

// Discover location name (e.g. "accounts/123/locations/456")
async function getLocationName(accessToken, accountName) {
  const res  = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!data.locations || !data.locations.length) throw new Error('No locations found');
  return data.locations[0].name;
}

// Fetch all reviews via pagination
async function getAllReviews(accessToken, locationName) {
  const allReviews = [];
  let pageToken    = null;
  let pages        = 0;
  const maxPages   = 10; // safety cap — 10 pages x 50 = up to 500 reviews

  do {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews`
    );
    url.searchParams.set('pageSize', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res  = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();

    if (data.error) throw new Error('Reviews API error: ' + JSON.stringify(data.error));

    (data.reviews || []).forEach(r => allReviews.push(r));
    pageToken = data.nextPageToken || null;
    pages++;
  } while (pageToken && pages < maxPages);

  return allReviews;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  const clientId     = process.env.GBP_CLIENT_ID;
  const clientSecret = process.env.GBP_CLIENT_SECRET;
  const refreshToken = process.env.GBP_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).json({ error: 'OAuth credentials not configured' });
  }

  try {
    const accessToken  = await getAccessToken(clientId, clientSecret, refreshToken);
    const accountName  = await getAccountName(accessToken);
    const locationName = await getLocationName(accessToken, accountName);
    const raw          = await getAllReviews(accessToken, locationName);

    // Filter: 4 or 5 stars, text >= 15 chars
    const filtered = raw.filter(r =>
      r.starRating &&
      ['FOUR', 'FIVE'].includes(r.starRating) &&
      r.comment &&
      r.comment.trim().length >= 15
    );

    // Shuffle full pool — different order every request
    const pool = shuffle(filtered);

    // Map to shape the frontend expects
    const reviews = pool.map(r => ({
      author_name: r.reviewer ? r.reviewer.displayName : 'Google reviewer',
      rating:      r.starRating === 'FIVE' ? 5 : 4,
      text:        r.comment,
      time:        r.createTime ? Math.floor(new Date(r.createTime).getTime() / 1000) : null,
    }));

    // Fetch overall rating from Places API for the summary stat
    let rating = null;
    let total  = null;
    try {
      const placesKey = process.env.GOOGLE_PLACES_API_KEY;
      if (placesKey) {
        const pRes  = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=rating,user_ratings_total&key=${placesKey}`
        );
        const pData = await pRes.json();
        if (pData.result) {
          rating = pData.result.rating;
          total  = pData.result.user_ratings_total;
        }
      }
    } catch (_) { /* non-critical */ }

    return res.status(200).json({ rating, total, reviews });

  } catch (err) {
    console.error('ARAMIS Reviews error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
