// Vercel Serverless Function — Google Places Reviews proxy
// Deployed at: /api/reviews
// Shuffles server-side on every request. No CDN caching — each page load
// gets a fresh shuffle, producing visible variety for the visitor.

const PLACE_ID = 'ChIJM6BkL4h9nBQRwuF447BkhqU'; // ARAMIS Billiard Club — verified

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // No caching — every request triggers a fresh shuffle
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const url =
      'https://maps.googleapis.com/maps/api/place/details/json' +
      '?place_id=' + PLACE_ID +
      '&fields=name,rating,user_ratings_total,reviews' +
      '&reviews_sort=newest' +
      '&language=en' +
      '&key=' + apiKey;

    const response = await fetch(url);
    const data     = await response.json();

    if (data.status !== 'OK') {
      return res.status(502).json({ error: 'Google API error', status: data.status });
    }

    const reviews = shuffle(
      (data.result.reviews || []).filter(r =>
        r.rating >= 4 && r.text && r.text.trim().length >= 15
      )
    ).map(r => ({
      author_name:       r.author_name,
      rating:            r.rating,
      text:              r.text,
      time:              r.time,
      profile_photo_url: r.profile_photo_url
    }));

    return res.status(200).json({
      rating:  data.result.rating,
      total:   data.result.user_ratings_total,
      reviews: reviews
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
};
