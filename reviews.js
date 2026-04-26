// Vercel Serverless Function — Google Places Reviews proxy
// Deployed at: /api/reviews

const PLACE_ID = 'ChIJM6BkYoidfBgRwuF4o7BkhmU'; // ARAMIS Billiard Club

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const url =
      'https://maps.googleapis.com/maps/api/place/details/json' +
      '?place_id=' + PLACE_ID +
      '&fields=name,rating,user_ratings_total,reviews' +
      '&reviews_sort=newest&language=en' +
      '&key=' + apiKey;

    const response = await fetch(url);
    const data     = await response.json();

    if (data.status !== 'OK') {
      return res.status(502).json({ error: 'Google API error', status: data.status });
    }

    const reviews = (data.result.reviews || [])
      .filter(function(r) { return r.rating >= 4; })
      .map(function(r) {
        return {
          author_name:       r.author_name,
          rating:            r.rating,
          text:              r.text,
          time:              r.time,
          profile_photo_url: r.profile_photo_url
        };
      });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

    return res.status(200).json({
      rating:  data.result.rating,
      total:   data.result.user_ratings_total,
      reviews: reviews
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
};
