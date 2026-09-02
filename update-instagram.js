#!/usr/bin/env node
/**
 * Descarga las 9 publicaciones más recientes de @brujomayordecatemaco
 * y actualiza assets/instagram/post-1.jpg … post-9.jpg + instagram-posts.json.
 *
 * Uso:
 *   npm run update-instagram           → actualización completa
 *   node update-instagram.js --dry-run → solo verifica, no reemplaza archivos
 *
 * Códigos de salida:
 *   0 → éxito (actualización completa) o sin publicaciones nuevas
 *   1 → Instagram no pudo ser leído (aparece rojo en GitHub Actions)
 *
 * Protección ante fallos:
 *   - Se necesitan exactamente 9; si hay menos → exit 1, sin tocar archivos
 *   - Descarga a carpeta temporal primero; reemplaza solo con las 9 válidas
 *   - ≥5 KB por imagen para ser considerada válida
 *   - Si falla cualquier parte → exit 1, imágenes anteriores intactas
 */

const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HANDLE = 'brujomayordecatemaco';
const COUNT = 9;
const ASSETS_DIR = path.join(__dirname, 'assets', 'instagram');
const POSTS_JSON = path.join(__dirname, 'instagram-posts.json');
const MIN_SIZE = 5000;
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) { console.log(`[instagram] ${msg}`); }

// --- Descargar archivo ---
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

// --- Leer shortcodes guardados ---
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

// --- Limpiar carpeta temporal ---
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

// --- Extraer links de posts del DOM ---
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

// --- Diagnóstico seguro de la página ---
async function diagnose(page, label) {
  try {
    const info = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      return {
        url:          location.href,
        title:        document.title.slice(0, 90),
        postLinks:    document.querySelectorAll('a[href*="/p/"]').length,
        htmlKB:       Math.round(document.documentElement.outerHTML.length / 1024),
        loginWall:    /log.?in|iniciar.?sesi/i.test(body),
        challenge:    /challenge|checkpoint/i.test(body + location.href),
        emptyBody:    body.trim().length < 100,
      };
    });
    log(`[diagnóstico ${label}]`);
    log(`  URL final:    ${info.url}`);
    log(`  Título:       ${info.title}`);
    log(`  Links /p/:    ${info.postLinks}`);
    log(`  HTML:         ~${info.htmlKB} KB`);
    log(`  Login wall:   ${info.loginWall}`);
    log(`  Challenge:    ${info.challenge}`);
    log(`  Body vacío:   ${info.emptyBody}`);
    return info;
  } catch (e) {
    log(`[diagnóstico ${label}] error: ${e.message.slice(0, 80)}`);
    return null;
  }
}

// --- Navegar al perfil y obtener links ---
async function fetchProfileLinks(browser, userAgent, viewport, label) {
  log(`Intentando ${label}...`);
  const context = await browser.newContext({ userAgent, viewport, locale: 'es-MX' });

  // Captura de imágenes desde respuestas GraphQL
  const captured = new Map();
  context.on('response', async response => {
    if (response.status() !== 200) return;
    const url = response.url();
    if (!url.includes('/graphql/') && !url.includes('api/v1/feed') && !url.includes('timeline_feed')) return;
    try {
      const text = await response.text();
      const matches = [...text.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"[^}]{0,600}?"display_url":"([^"]+)"/g)];
      for (const m of matches) {
        const code = m[1];
        const img = m[2].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (!captured.has(code) && img.includes('cdninstagram')) captured.set(code, img);
      }
    } catch (e) {}
  });

  const page = await context.newPage();
  const profileUrl = `https://www.instagram.com/${HANDLE}/`;

  // domcontentloaded es más fiable en CI que networkidle
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

  // Esperar explícitamente a que aparezcan links de posts (hasta 20 s)
  await page.waitForSelector('a[href*="/p/"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Cerrar diálogos de cookies / login
  for (const sel of [
    '[aria-label="Close"]',
    'button:has-text("Allow all cookies")',
    'button:has-text("Accept All")',
    'button:has-text("Rechazar todo")',
    'button:has-text("Only allow essential")',
    'button:has-text("Decline optional")',
  ]) {
    await page.click(sel, { timeout: 1500 }).catch(() => {});
  }
  await page.waitForTimeout(1500);

  let links = await collectLinks(page);

  // Si la primera carga no dio posts, intentar un scroll suave
  if (links.length < COUNT) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(2500);
    links = await collectLinks(page);
  }

  await diagnose(page, label);
  await context.close();
  return { links, captured };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), `ig-update-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

let exitCode = 0;
let browser = null;

(async () => {
  log(`Iniciando actualización${DRY_RUN ? ' (dry-run)' : ''}...`);

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--no-first-run',
    ],
  });

  // --- Intento 1: user agent desktop ---
  let { links: postLinks, captured } = await fetchProfileLinks(
    browser,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    { width: 1280, height: 900 },
    'UA desktop'
  );

  // --- Intento 2: user agent móvil Android (si desktop falló) ---
  if (postLinks.length < COUNT) {
    log(`Desktop obtuvo ${postLinks.length}/${COUNT}. Reintentando con UA móvil...`);
    await new Promise(r => setTimeout(r, 3000));

    const mobile = await fetchProfileLinks(
      browser,
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
      { width: 390, height: 844 },
      'UA móvil Android'
    );

    if (mobile.links.length > postLinks.length) {
      postLinks = mobile.links;
      mobile.captured.forEach((v, k) => captured.set(k, v));
    }
  }

  log(`Publicaciones encontradas: ${postLinks.length}/${COUNT}`);

  if (postLinks.length < COUNT) {
    log(`[ERROR] Se obtuvieron ${postLinks.length}/${COUNT} publicaciones. Instagram no pudo ser leído desde este entorno. Imágenes anteriores conservadas sin cambios.`);
    exitCode = 1;
    return;
  }

  // --- Comparar shortcodes con los guardados ---
  const shortcodes = postLinks
    .map(u => u.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1])
    .filter(Boolean);

  const existing = loadExistingShortcodes();
  let changed = existing.length !== COUNT;
  if (!changed) {
    for (let i = 0; i < COUNT; i++) {
      if (shortcodes[i] !== existing[i]) { changed = true; break; }
    }
  }

  if (!changed) {
    log('Sin publicaciones nuevas. La galería ya está actualizada.');
    return; // exit 0
  }

  log(`Publicaciones nuevas detectadas. Obteniendo ${COUNT} imágenes...`);

  // --- Obtener imagen de cada post (con un reintento) ---
  const postContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'es-MX',
  });
  const postPage = await postContext.newPage();

  const posts = [];

  for (let i = 0; i < COUNT; i++) {
    const postUrl = postLinks[i];
    const shortcode = shortcodes[i];
    let imgUrl = captured.get(shortcode) || null;
    let caption = '';

    if (imgUrl) {
      log(`  ${i + 1}/${COUNT} capturado desde red: ${shortcode}`);
    } else {
      for (let attempt = 1; attempt <= 2 && !imgUrl; attempt++) {
        try {
          if (attempt === 2) {
            log(`  ${i + 1}/${COUNT} reintentando ${shortcode}...`);
            await postPage.waitForTimeout(3000);
          }
          await postPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await postPage.waitForTimeout(1200);

          const data = await postPage.evaluate(() => {
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
      log(`[ERROR] Sin imagen para post ${i + 1} (${shortcode}). Imágenes anteriores conservadas.`);
      exitCode = 1;
      await postContext.close();
      return;
    }

    posts.push({ shortcode, url: postUrl, imgUrl, caption });
    await postPage.waitForTimeout(400);
  }

  await postContext.close();
  await browser.close();
  browser = null;

  // --- Dry-run: mostrar y salir ---
  if (DRY_RUN) {
    log(`--- Dry-run: ${posts.length} publicaciones detectadas ---`);
    posts.forEach((p, idx) => log(`  ${idx + 1}. ${p.shortcode} — ${p.imgUrl.slice(0, 70)}...`));
    log('Dry-run completado. No se modificaron archivos.');
    return; // exit 0
  }

  // --- Descargar las 9 a carpeta temporal ---
  log(`Descargando ${COUNT} imágenes a carpeta temporal...`);

  for (let i = 0; i < posts.length; i++) {
    const filename = `post-${i + 1}.jpg`;
    const tmpPath = path.join(tmpDir, filename);
    try {
      await downloadFile(posts[i].imgUrl, tmpPath);
      const { size } = fs.statSync(tmpPath);
      if (size < MIN_SIZE) {
        log(`[ERROR] ${filename} inválida (${size} bytes). Imágenes anteriores conservadas sin cambios.`);
        exitCode = 1;
        return;
      }
      log(`  ✓ ${filename} — ${Math.round(size / 1024)} KB`);
    } catch (e) {
      log(`[ERROR] Error descargando post ${i + 1}: ${e.message}. Imágenes anteriores conservadas sin cambios.`);
      exitCode = 1;
      return;
    }
  }

  // --- Verificar que las 9 están en tmp ---
  const downloaded = fs.readdirSync(tmpDir).filter(f => f.startsWith('post-'));
  if (downloaded.length < COUNT) {
    log(`[ERROR] ${downloaded.length}/${COUNT} imágenes en tmp. Imágenes anteriores conservadas sin cambios.`);
    exitCode = 1;
    return;
  }

  log(`Verificación completa: ${downloaded.length}/${COUNT} imágenes válidas.`);

  // --- Reemplazar solo cuando todo está verificado ---
  log('Actualizando galería...');
  for (let i = 1; i <= COUNT; i++) {
    const filename = `post-${i}.jpg`;
    fs.copyFileSync(path.join(tmpDir, filename), path.join(ASSETS_DIR, filename));
  }

  // --- Actualizar instagram-posts.json ---
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

})().catch(e => {
  log(`[ERROR] Error inesperado: ${e.message}`);
  exitCode = 1;
}).finally(() => {
  if (browser) try { browser.close(); } catch (e) {}
  cleanup(tmpDir);
  process.exit(exitCode);
});
