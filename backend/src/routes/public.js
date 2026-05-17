const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Fetch tenant branding for the landing page
router.get('/tenant/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ success: false, message: 'Slug required' });

    const tenant = await prisma.tenant.findUnique({
      where: { slug: slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        favicon: true,
        ogImage: true,
        primaryColor: true,
        secondaryColor: true,
        bannerImage: true,
        bannerAssets: true,
        gcashQr: true,
        active: true
      }
    });

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // Attempt to fetch landing description, but don't fail if it's missing
    try {
      const setting = await prisma.systemSetting.findFirst({
        where: { 
          tenantId: tenant.id, 
          key: 'landing_description' 
        }
      });
      tenant.landing_description = setting ? setting.value : null;
    } catch (settingError) {
      console.warn('Non-critical: Could not fetch landing description:', settingError.message);
      tenant.landing_description = null;
    }

    // Fetch active seasonal effect toggle and points rate
    try {
      const settings = await prisma.systemSetting.findMany({
        where: { 
          tenantId: tenant.id, 
          key: { in: ['seasonal_effect', 'points_rate'] } 
        }
      });
      const effectSetting = settings.find(s => s.key === 'seasonal_effect');
      tenant.seasonal_effect = effectSetting ? effectSetting.value : 'auto';

      const rateSetting = settings.find(s => s.key === 'points_rate');
      tenant.points_rate = rateSetting ? parseFloat(rateSetting.value) : 100;
    } catch (settingError) {
      tenant.seasonal_effect = 'auto';
      tenant.points_rate = 100;
    }

    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('CRITICAL Public Tenant Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message, 
      stack: error.stack,
      hint: "Check if DIRECT_URL and DATABASE_URL are correct in Render" 
    });
  }
});

// GET /api/public/tenant/:slug/og-image
router.get('/tenant/:slug/og-image', async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { ogImage: true, logo: true }
    });

    let ogImage = tenant?.ogImage || tenant?.logo;
    if (!ogImage || ogImage === '/logo.png') {
      ogImage = 'https://cdn-icons-png.flaticon.com/512/5787/5787016.png';
    }

    if (ogImage.startsWith('/')) {
      const host = req.headers.host || 'hometownbrew.vercel.app';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      return res.redirect(`${protocol}://${host}${ogImage}`);
    }

    return res.redirect(ogImage);
  } catch (error) {
    console.error('OG Image Redirect Error:', error);
    return res.redirect('https://cdn-icons-png.flaticon.com/512/5787/5787016.png');
  }
});

// Dynamic PWA Manifest for store-specific installation
router.get('/manifest/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, logo: true, primaryColor: true }
    });

    const manifest = {
      short_name: tenant?.name || "Project Million",
      name: tenant?.name || "Project Million POS",
      description: `Official App for ${tenant?.name || 'Project Million'}`,
      icons: [
        {
          "src": tenant?.logo || "https://cdn-icons-png.flaticon.com/512/5787/5787016.png",
          "type": "image/png",
          "sizes": "192x192",
          "purpose": "any maskable"
        },
        {
          "src": tenant?.logo || "https://cdn-icons-png.flaticon.com/512/5787/5787016.png",
          "type": "image/png",
          "sizes": "512x512",
          "purpose": "any maskable"
        }
      ],
      start_url: "/",
      display: "standalone",
      theme_color: tenant?.primaryColor || "#f97316",
      background_color: "#ffffff"
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    console.error('Manifest Error:', error);
    res.status(500).json({ success: false, message: 'Manifest error' });
  }
});

// Social Share Bridge
router.get('/:slug', async (req, res) => {
  try {
    res.setHeader('X-Robots-Tag', 'all');
    const { slug } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return res.redirect('/');

    const title = tenant.name;
    const description = 'Explore our premium store.';
    const redirectUrl = `https://hometownbrew.vercel.app/menu`;

    let ogImage = tenant.ogImage || tenant.logo;
    if (!ogImage || ogImage === '/logo.png') {
      ogImage = 'https://cdn-icons-png.flaticon.com/512/5787/5787016.png';
    }
    if (ogImage && ogImage.startsWith('/')) {
      ogImage = `https://hometownbrew.vercel.app${ogImage}`;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:url" content="${redirectUrl}">
        <meta property="og:type" content="website">
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
      </head>
      <body style="background: #000; color: #fff; font-family: sans-serif; text-align: center; padding-top: 20%;">
        <h2>Redirecting to ${title}...</h2>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Share Error:', err);
    res.redirect('/');
  }
});

// Beta Registration
router.post('/beta/apply', async (req, res) => {
  try {
    const { name, businessName, email } = req.body;
    if (!name || !businessName || !email) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const application = await prisma.betaApplication.create({
      data: { name, businessName, email }
    });

    res.json({ success: true, data: application });
  } catch (error) {
    console.error('Beta Application Error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit application' });
  }
});

module.exports = router;
