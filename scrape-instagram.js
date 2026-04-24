const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const HANDLE = 'brujomayordecatemaco';
const OUTPUT_DIR = path.join(__dirname, 'assets', 'instagram');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function downloadFile(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    protocol.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'es-ES',
  });
  const page = await context.newPage();

  console.log(`Navegando a https://www.instagram.com/${HANDLE}/`);
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Dismiss cookie/login dialogs
  const closeSelectors = ['[aria-label="Close"]', 'button:has-text("Allow")', 'button:has-text("Accept All")', 'button:has-text("Only allow essential cookies")'];
  for (const sel of closeSelectors) {
    await page.click(sel, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(2000);

  // Extract meta tags
  const meta = await page.evaluate(() => {
    const getMeta = (name) => {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      return el ? el.getAttribute('content') : null;
    };
    return {
      title: getMeta('og:title'),
      description: getMeta('og:description'),
      image: getMeta('og:image'),
      url: getMeta('og:url'),
    };
  });

  // Parse followers/following/posts from description
  // Format: "X Followers, Y Following, Z Posts - bio"
  let followers = '', following = '', posts = '', bio = '', name = '';
  if (meta.description) {
    const m = meta.description.match(/([\d,.KMk]+)\s*Followers?,\s*([\d,.KMk]+)\s*Following,\s*([\d,.KMk]+)\s*Posts?\s*[-–]\s*(.*)/i);
    if (m) {
      followers = m[1];
      following = m[2];
      posts = m[3];
      bio = m[4].trim();
    } else {
      bio = meta.description;
    }
  }
  if (meta.title) {
    name = meta.title.replace(/\s*\(@[^)]+\)\s*.*/, '').replace(/\s*•\s*Instagram.*/, '').trim();
  }

  // Try to extract from page DOM
  const domData = await page.evaluate(() => {
    const headerSection = document.querySelector('header section');
    const stats = [];
    if (headerSection) {
      headerSection.querySelectorAll('li').forEach(li => stats.push(li.innerText.trim()));
    }

    // Try JSON data
    const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
    let jsonData = null;
    for (const s of scripts) {
      try {
        const d = JSON.parse(s.textContent);
        if (JSON.stringify(d).includes('edge_followed_by')) { jsonData = d; break; }
      } catch(e) {}
    }

    const bioEl = document.querySelector('header section > div:last-child');
    const bioText = bioEl ? bioEl.innerText : '';

    // Get post images from grid
    const imgs = Array.from(document.querySelectorAll('article img, main img, ._aagv img, img[class*="x5yr21d"]'));
    const imageUrls = imgs
      .map(img => img.src)
      .filter(src => src && src.includes('instagram') && !src.includes('s150x150') && src.length > 50)
      .slice(0, 12);

    return { stats, bioText, imageUrls, jsonData: jsonData ? JSON.stringify(jsonData).slice(0, 2000) : null };
  });

  // Scroll to load more images
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(2000);

  const moreImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('article img, main img, ._aagv img, img[srcset]'));
    return imgs
      .map(img => img.src)
      .filter(src => src && src.includes('cdninstagram') && !src.includes('s150x150') && src.length > 50)
      .slice(0, 12);
  });

  const allImages = [...new Set([...domData.imageUrls, ...moreImages])].slice(0, 12);

  // Download profile picture
  let profilePicPath = null;
  if (meta.image) {
    const dest = path.join(OUTPUT_DIR, 'profile.jpg');
    await downloadFile(meta.image, dest).catch(e => console.error('Profile pic error:', e.message));
    if (fs.existsSync(dest)) profilePicPath = dest;
    console.log('Foto de perfil descargada:', dest);
  }

  // Download post images
  const downloadedPosts = [];
  for (let i = 0; i < allImages.length; i++) {
    const imgUrl = allImages[i];
    const dest = path.join(OUTPUT_DIR, `post-${i + 1}.jpg`);
    await downloadFile(imgUrl, dest).catch(e => console.error(`Post ${i+1} error:`, e.message));
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      downloadedPosts.push(dest);
      console.log(`Post ${i+1} descargado`);
    }
  }

  const result = {
    handle: HANDLE,
    name: name || HANDLE,
    bio: bio || domData.bioText,
    followers,
    following,
    posts,
    profilePic: profilePicPath ? 'assets/instagram/profile.jpg' : null,
    downloadedPosts: downloadedPosts.map((_, i) => `assets/instagram/post-${i+1}.jpg`),
    meta,
    domStats: domData.stats,
  };

  fs.writeFileSync(path.join(__dirname, 'instagram-data.json'), JSON.stringify(result, null, 2));
  console.log('\n=== RESULTADO ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
