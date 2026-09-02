#!/usr/bin/env node
/**
 * Descarga las 12 publicaciones más recientes de @brujomayordecatemaco
 * y actualiza assets/instagram/post-1.jpg … post-12.jpg + instagram-posts.json.
 *
 * Uso:
 *   npm run update-instagram           → actualización completa
 *   node update-instagram.js --dry-run → solo verifica, no reemplaza archivos
 *
 * Protección ante fallos:
 *   - Si Instagram bloquea o el scraping es incompleto → exit 0, sin cambios
 *   - Descarga a carpeta temporal primero; reemplaza solo si las 12 imágenes
 *     son válidas (>5 KB cada una)
 *   - Compara shortcodes con instagram-posts.json para detectar publicaciones
 *     nuevas; si no hay cambios → exit 0 inmediatamente
 */

const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HANDLE = 'brujomayordecatemaco';
const COUNT = 9; // se necesitan exactamente 9; si hay menos → abort sin cambios
const ASSETS_DIR = path.join(__dirname, 'assets', 'instagram');
const POSTS_JSON = path.join(__dirname, 'instagram-posts.json');
const MIN_SIZE = 5000; // bytes mínimos para una imagen válida
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) { console.log(`[instagram] ${msg}`); }

function downloadFile(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    if (!fileUrl || typeof fileUrl !== 'string') return reject(new Error('URL inválida'));
    const proto = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = proto.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      },
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    });
    req.on('error', err => { try { fs.unlinkSync(dest); } catch (e) {} reject(err); });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout de descarga')); });
  });
}

function loadExistingShortcodes() {
  try {
    const data = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));
    if (Array.isArray(data)) {
      return data
        .filter(p => p.position >= 1 && p.position <= COUNT)
        .sort((a, b) => a.position - b.position)
        .map(p => p.shortcode)
        .filter(Boolean);
    }
  } catch (e) {}
  return [];
}

function cleanup(tmpDir) {
  try {
    if (fs.existsSync(tmpDir)) {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (e) {}
      }
      fs.rmdirSync(tmpDir);
    }
  } catch (e) {}
}

(async () => {
  const tmpDir = path.join(os.tmpdir(), `ig-update-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser = null;

  try {
    log(`Iniciando actualización${DRY_RUN ? ' (dry-run)' : ''}...`);

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'es-MX',
    });

    // Captura rápida de imágenes desde respuestas GraphQL / API
    const captured = new Map(); // shortcode → imageUrl

    context.on('response', async response => {
      if (response.status() !== 200) return;
      const url = response.url();
      if (!url.includes('/graphql/') && !url.includes('api/v1/feed') && !url.includes('timeline_feed')) return;
      try {
        const text = await response.text();
        const matches = [
          ...text.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"[^}]{0,600}?"display_url":"([^"]+)"/g),
        ];
        for (const m of matches) {
          const code = m[1];
          const img = m[2].replace(/\\u0026/g, '&').replace(/\\/g, '');
          if (!captured.has(code) && img.includes('cdninstagram')) {
            captured.set(code, img);
          }
        }
      } catch (e) {}
    });

    const page = await context.newPage();
    log(`Navegando al perfil @${HANDLE}...`);

    await page.goto(`https://www.instagram.com/${HANDLE}/`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    }).catch(() => {});

    await page.waitForTimeout(4000);

    // Cerrar diálogos
    for (const sel of [
      '[aria-label="Close"]',
      'button:has-text("Allow all cookies")',
      'button:has-text("Accept All")',
      'button:has-text("Rechazar todo")',
      'button:has-text("Only allow essential")',
    ]) {
      await page.click(sel, { timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(2000);

    // Recopilar links de los primeros 12 posts del grid (scroll para forzar carga)
    function collectLinks(page) {
      return page.evaluate(() => {
        const seen = new Set();
        const links = [];
        for (const a of document.querySelectorAll('a[href*="/p/"]')) {
          const href = a.href;
          if (href && /\/p\/[A-Za-z0-9_-]+/.test(href) && !seen.has(href)) {
            seen.add(href);
            links.push(href);
          }
        }
        return links.slice(0, 12);
      });
    }

    let postLinks = await collectLinks(page);

    if (postLinks.length < COUNT) {
      // Scroll para forzar carga de la 4a fila del grid
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(2500);
      postLinks = await collectLinks(page);
    }

    log(`Publicaciones encontradas en perfil: ${postLinks.length}`);

    if (postLinks.length < COUNT) {
      log(`Cancelado: se obtuvieron ${postLinks.length}/${COUNT} publicaciones. Se necesitan exactamente ${COUNT}. Imágenes anteriores conservadas sin cambios.`);
      await browser.close();
      cleanup(tmpDir);
      return;
    }

    const shortcodes = postLinks
      .map(u => u.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1])
      .filter(Boolean);

    // Comparar con publicaciones existentes
    const existing = loadExistingShortcodes();
    let changed = existing.length !== COUNT;
    if (!changed) {
      for (let i = 0; i < COUNT; i++) {
        if (shortcodes[i] !== existing[i]) { changed = true; break; }
      }
    }

    if (!changed) {
      log('Sin publicaciones nuevas. La galería ya está actualizada.');
      await browser.close();
      cleanup(tmpDir);
      return;
    }

    log(`Publicaciones nuevas detectadas. Obteniendo ${COUNT} imágenes...`);

    const posts = [];

    for (let i = 0; i < COUNT; i++) {
      const postUrl = postLinks[i];
      const shortcode = shortcodes[i];
      let imgUrl = captured.get(shortcode) || null;
      let caption = '';

      if (imgUrl) {
        log(`  ${i + 1}/${COUNT} capturado desde red: ${shortcode}`);
      } else {
        // Visitar la página del post para obtener og:image (con un reintento)
        for (let attempt = 1; attempt <= 2 && !imgUrl; attempt++) {
          try {
            if (attempt === 2) {
              log(`  ${i + 1}/${COUNT} reintentando ${shortcode}...`);
              await page.waitForTimeout(3000);
            }
            await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1200);

            const data = await page.evaluate(() => {
              const ogImg = document.querySelector('meta[property="og:image"]');
              const metaDesc = document.querySelector('meta[name="description"]');
              return {
                imgUrl: ogImg ? ogImg.getAttribute('content') : null,
                caption: metaDesc ? metaDesc.getAttribute('content') : '',
              };
            });

            imgUrl = data.imgUrl;
            caption = (data.caption || '')
              .replace(/^\d[\d,.KMk]* likes?,\s*\d[\d,.K]* comments?\s*[-–]\s*/i, '')
              .trim()
              .slice(0, 300);

            if (imgUrl) log(`  ${i + 1}/${COUNT} obtenido desde post: ${shortcode}`);
          } catch (e) {
            log(`  ${i + 1}/${COUNT} intento ${attempt} fallido (${shortcode}): ${e.message.slice(0, 60)}`);
          }
        }
      }

      if (!imgUrl) {
        log(`Cancelado: sin imagen para post ${i + 1} (${shortcode}). Imágenes anteriores conservadas.`);
        await browser.close();
        cleanup(tmpDir);
        return;
      }

      posts.push({ shortcode, url: postUrl, imgUrl, caption });
      await page.waitForTimeout(400);
    }

    await browser.close();
    browser = null;

    if (DRY_RUN) {
      log(`--- Dry-run: ${posts.length} publicaciones detectadas ---`);
      posts.forEach((p, i) => log(`  ${i + 1}. ${p.shortcode} — ${p.imgUrl.slice(0, 70)}...`));
      log('Dry-run completado. No se modificaron archivos.');
      cleanup(tmpDir);
      return;
    }

    // Descargar las 12 imágenes a carpeta temporal primero
    log(`Descargando ${COUNT} imágenes a carpeta temporal...`);

    for (let i = 0; i < posts.length; i++) {
      const filename = `post-${i + 1}.jpg`;
      const tmpPath = path.join(tmpDir, filename);

      try {
        await downloadFile(posts[i].imgUrl, tmpPath);
        const { size } = fs.statSync(tmpPath);
        if (size < MIN_SIZE) {
          log(`Cancelado: ${filename} inválida (${size} bytes). Imágenes anteriores conservadas sin cambios.`);
          cleanup(tmpDir);
          return;
        }
        log(`  ✓ ${filename} — ${Math.round(size / 1024)} KB`);
      } catch (e) {
        log(`Cancelado: error descargando post ${i + 1}: ${e.message}. Imágenes anteriores conservadas sin cambios.`);
        cleanup(tmpDir);
        return;
      }
    }

    // Verificar que las 12 se descargaron correctamente
    const downloaded = fs.readdirSync(tmpDir).filter(f => f.startsWith('post-'));
    if (downloaded.length < COUNT) {
      log(`Cancelado: ${downloaded.length}/${COUNT} imágenes descargadas. Imágenes anteriores conservadas sin cambios.`);
      cleanup(tmpDir);
      return;
    }

    log(`Verificación completa: ${downloaded.length}/${COUNT} imágenes válidas.`);

    // Reemplazar las 12 imágenes actuales (copiar desde tmp → final)
    log('Actualizando galería...');
    for (let i = 1; i <= COUNT; i++) {
      const filename = `post-${i}.jpg`;
      fs.copyFileSync(path.join(tmpDir, filename), path.join(ASSETS_DIR, filename));
    }

    // Actualizar instagram-posts.json con las 12 posiciones
    const postsData = posts.map((p, i) => ({
      position: i + 1,
      filename: `post-${i + 1}.jpg`,
      path: `assets/instagram/post-${i + 1}.jpg`,
      shortcode: p.shortcode,
      url: p.url,
      caption: p.caption || '',
    }));
    fs.writeFileSync(POSTS_JSON, JSON.stringify(postsData, null, 2));

    log(`Actualización exitosa. Galería actualizada con las ${COUNT} publicaciones más recientes.`);

  } catch (e) {
    log(`Error inesperado: ${e.message}`);
    log('Actualización cancelada. Imágenes anteriores conservadas.');
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    cleanup(tmpDir);
  }
})();
