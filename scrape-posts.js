const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HANDLE = 'brujomayordecatemaco';
const OUTPUT_DIR = path.join(__dirname, 'assets', 'instagram');
const POSTS_FILE = path.join(__dirname, 'instagram-posts.json');
const TARGET = 60;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function downloadFile(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    if (!fileUrl || typeof fileUrl !== 'string') return reject(new Error('Invalid URL'));
    const proto = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch(e) {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
      file.on('error', reject);
    }).on('error', err => { try { fs.unlinkSync(dest); } catch(e) {} reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'es-MX',
  });

  // Intercept API responses to capture post data
  const capturedPosts = new Map(); // shortcode → { imageUrl, caption }

  context.on('response', async (response) => {
    const url = response.url();
    if (
      (url.includes('/graphql/query') || url.includes('api/v1/feed') || url.includes('timeline_feed')) &&
      response.status() === 200
    ) {
      try {
        const text = await response.text();
        const data = JSON.parse(text);
        const str = JSON.stringify(data);

        // Extract edges from GraphQL
        const edgeMatches = str.matchAll(/"shortcode":"([^"]+)".*?"display_url":"([^"]+)".*?"edge_media_to_caption":\{"edges":\[(\{"node":\{"text":"([^"]*)")/g);
        for (const m of edgeMatches) {
          const shortcode = m[1];
          const imgUrl = m[2].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const caption = m[4] ? m[4].replace(/\\n/g, '\n').replace(/\\u0026/g, '&') : '';
          if (!capturedPosts.has(shortcode)) {
            capturedPosts.set(shortcode, { imageUrl: imgUrl, caption, shortcode });
          }
        }
      } catch(e) {}
    }
  });

  const page = await context.newPage();
  console.log('Navegando al perfil...');
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Dismiss dialogs
  for (const sel of ['[aria-label="Close"]', 'button:has-text("Allow all cookies")', 'button:has-text("Accept All")', 'button:has-text("Only allow essential")']) {
    await page.click(sel, { timeout: 1500 }).catch(() => {});
  }
  await page.waitForTimeout(2000);

  // Collect post links from grid
  let postLinks = new Set();
  let prevCount = 0;
  let scrollAttempts = 0;

  console.log('Recopilando links de posts...');
  while (postLinks.size < TARGET && scrollAttempts < 20) {
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/p/"]')).map(a => a.href);
    });
    links.forEach(l => postLinks.add(l));

    console.log(`  Posts encontrados: ${postLinks.size}`);

    if (postLinks.size === prevCount) {
      scrollAttempts++;
    } else {
      scrollAttempts = 0;
      prevCount = postLinks.size;
    }

    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(1800);
  }

  const postLinksArr = Array.from(postLinks).slice(0, TARGET);
  console.log(`\nTotal links: ${postLinksArr.length}. Abriendo cada post para caption e imagen...`);

  const posts = [];
  let imgCounter = 13; // start after existing post-1..12

  for (let i = 0; i < postLinksArr.length; i++) {
    const postUrl = postLinksArr[i];
    const shortcode = postUrl.match(/\/p\/([^/]+)/)?.[1];

    console.log(`Post ${i + 1}/${postLinksArr.length}: ${shortcode}`);

    try {
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const postData = await page.evaluate(() => {
        // Get main image
        const imgs = Array.from(document.querySelectorAll('img'));
        const mainImg = imgs.find(img =>
          img.src && img.src.includes('cdninstagram') &&
          (img.width > 300 || parseInt(img.getAttribute('width') || '0') > 300 ||
           img.src.includes('1080x') || img.src.includes('e35'))
        );
        const imgUrl = mainImg ? mainImg.src : (imgs.find(img => img.src && img.src.includes('cdninstagram'))?.src || '');

        // Get caption
        const captionEl = document.querySelector('h1, [class*="caption"] span, article span');
        let caption = '';
        if (captionEl) caption = captionEl.innerText || captionEl.textContent || '';

        // Try meta description for caption
        const metaDesc = document.querySelector('meta[name="description"]');
        if (!caption && metaDesc) {
          const desc = metaDesc.getAttribute('content') || '';
          // Remove "X likes, Y comments - " prefix
          caption = desc.replace(/^\d+[\d,.K]*\s+likes?,\s+\d+[\d,.K]*\s+comments?\s*[-–]\s*/i, '');
        }

        // Try og:description
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (!caption && ogDesc) {
          caption = ogDesc.getAttribute('content') || '';
          caption = caption.replace(/^\d+[\d,.K]*\s+likes?,\s+\d+[\d,.K]*\s+comments?\s*[-–]\s*/i, '');
        }

        // Get all candidate images (larger ones)
        const allImgs = Array.from(document.querySelectorAll('img'))
          .filter(img => img.src && img.src.includes('cdninstagram') && !img.src.includes('s150x150'))
          .map(img => img.src);

        return { imgUrl, caption: caption.trim(), allImgs };
      });

      let imgUrl = postData.imgUrl;
      // Pick largest image from candidates
      if (!imgUrl && postData.allImgs.length > 0) imgUrl = postData.allImgs[0];

      if (imgUrl) {
        const destFilename = `post-${imgCounter}.jpg`;
        const dest = path.join(OUTPUT_DIR, destFilename);
        let downloaded = false;
        try {
          await downloadFile(imgUrl, dest);
          if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
            downloaded = true;
            console.log(`  ✓ Descargada: ${destFilename}`);
          } else {
            try { fs.unlinkSync(dest); } catch(e) {}
          }
        } catch(e) {
          console.log(`  ✗ Error descargando: ${e.message}`);
        }

        if (downloaded) {
          posts.push({
            index: imgCounter,
            filename: destFilename,
            path: `assets/instagram/${destFilename}`,
            caption: postData.caption.slice(0, 300),
            shortcode,
            url: postUrl,
          });
          imgCounter++;
        }
      } else {
        console.log(`  ✗ Sin imagen`);
      }
    } catch(e) {
      console.log(`  ✗ Error: ${e.message}`);
    }

    // Small delay to avoid rate limiting
    await page.waitForTimeout(800);
  }

  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  console.log(`\n=== LISTO ===`);
  console.log(`Posts descargados: ${posts.length}`);
  console.log(`Con caption: ${posts.filter(p => p.caption).length}`);
  console.log(`Guardado en: ${POSTS_FILE}`);

  await browser.close();
})();
