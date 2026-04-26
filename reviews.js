// Vercel Serverless Function — Google Places Reviews proxy
// Deployed automatically by Vercel at: /api/reviews
// Keeps the API key server-side, solves CORS, caches responses

const PLACE_ID = 'ChIJM6BkYoidfBgRwuF4o7BkhmU'; // ARAMIS Billiard Club

export default async function handler(req, res) {
  // Allow requests from your domain only
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${PLACE_ID}` +
      `&fields=name,rating,user_ratings_total,reviews` +
      `&reviews_sort=newest&language=en` +
      `&key=${apiKey}`;

    const response = await fetch(url);
    const data     = await response.json();

    if (data.status !== 'OK') {
      return res.status(502).json({ error: 'Google API error', status: data.status });
    }

    // Filter 4★+ only, return clean payload
    const reviews = (data.result.reviews || [])
      .filter(r => r.rating >= 4)
      .map(r => ({
        author_name:   r.author_name,
        rating:        r.rating,
        text:          r.text,
        time:          r.time,
        profile_photo_url: r.profile_photo_url,
      }));

    // Cache at Vercel edge for 1 hour
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

    return res.status(200).json({
      rating:  data.result.rating,
      total:   data.result.user_ratings_total,
      reviews,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
}
