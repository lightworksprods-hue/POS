import axios from 'axios';

export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  try {
    // Fetch store info from the Render Backend
    const response = await axios.get(`https://marketing-pqi1.onrender.com/api/public/tenant/${slug}`);
    const tenant = response.data.data;
    
    if (!tenant) return res.status(404).send('Store not found');

    const title = tenant.name;
    const description = tenant.landing_description || tenant.tagline || 'Explore our premium store.';
    const redirectUrl = `https://hometownbrew.vercel.app/menu`;

    // Resolve Logo
    let ogImage = tenant.ogImage || tenant.logo;
    if (!ogImage || ogImage === '/logo.png') {
      ogImage = 'https://cdn-icons-png.flaticon.com/512/5787/5787016.png';
    }
    
    // Force absolute URL to Vercel
    if (ogImage && ogImage.startsWith('/')) {
      ogImage = `https://hometownbrew.vercel.app${ogImage}`;
    }

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Robots-Tag', 'all');
    
    // Serve the meta tags to Facebook
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:url" content="${redirectUrl}">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="summary_large_image">
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
      </head>
      <body style="background: #000; color: #fff; font-family: sans-serif; text-align: center; padding-top: 20%;">
        <h2>Redirecting to ${title}...</h2>
        <script>window.location.href = "${redirectUrl}";</script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Vercel Share Error:', err.message);
    res.redirect(`https://hometownbrew.vercel.app/menu`);
  }
}
