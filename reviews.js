// Vercel Serverless Function — Google Places Reviews (dual fetch)
// Calls Places API twice: newest + most_relevant sort orders.
// Merges, deduplicates, shuffles — up to 10 reviews per request.
// No OAuth needed. Swap for Business Profile API when access is approved.

const PLACE_ID = 'ChIJM6BkL4h9nBQRwuF447BkhqU';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchReviews(apiKey, sort) {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${PLACE_ID}` +
    `&fields=name,rating,user_ratings_total,reviews` +
    `&reviews_sort=${sort}` +
    `&language=en` +
    `&key=${apiKey}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Places API error (${sort}): ${data.status}`);
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const [newest, relevant] = await Promise.all([
      fetchReviews(apiKey, 'newest'),
      fetchReviews(apiKey, 'most_relevant'),
    ]);

    // Merge and deduplicate by author + first 40 chars of text
    const seen   = new Set();
    const merged = [];
    for (const r of [...(newest.result.reviews || []), ...(relevant.result.reviews || [])]) {
      const key = (r.author_name + r.text.slice(0, 40)).toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(r); }
    }

    // Filter: 4★+ and text ≥ 15 chars, then shuffle
    const reviews = shuffle(
      merged.filter(r => r.rating >= 4 && r.text && r.text.trim().length >= 15)
    ).map(r => ({
      author_name: r.author_name,
      rating:      r.rating,
      text:        r.text,
      time:        r.time,
    }));

    return res.status(200).json({
      rating:  newest.result.rating,
      total:   newest.result.user_ratings_total,
      reviews,
    });

  } catch (err) {
    console.error('ARAMIS Reviews error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
