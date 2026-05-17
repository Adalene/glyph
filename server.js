// Local dev server: serves public/ as static + routes /api/* to api/ handlers
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);

// Load .env file into process.env (no external deps needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
  console.log('Loaded .env');
} else {
  console.warn('No .env file found — Supabase features will be disabled. Create .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── API routes ──
  if (pathname.startsWith('/api/')) {
    const segment = pathname.split('/')[2]; // e.g. 'evals', 'generate', 'icons'
    try {
      const { default: handler } = await import(`./api/${segment}.js`);

      // Parse body for POST
      let body = {};
      if (req.method === 'POST') {
        const raw = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', c => (data += c));
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        try { body = JSON.parse(raw); } catch {}
      }

      // Parse query params for GET
      const query = Object.fromEntries(url.searchParams);

      // Shim req/res to match Vercel handler signature
      const shimReq = { method: req.method, body, query, headers: req.headers, url: req.url };
      let headersSent = false;
      const shimRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        setHeader(k, v) { if (!headersSent) res.setHeader(k, v); return this; },
        flushHeaders() {
          if (!headersSent) {
            res.writeHead(this.statusCode);
            headersSent = true;
          }
        },
        write(chunk) {
          if (!headersSent) { res.writeHead(this.statusCode); headersSent = true; }
          res.write(chunk);
        },
        flush() { res.socket?.write(''); },
        json(data) {
          if (!headersSent) {
            res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
            headersSent = true;
          }
          res.end(JSON.stringify(data));
        },
        end(data) {
          if (!headersSent) { res.writeHead(this.statusCode); headersSent = true; }
          res.end(data);
        },
      };

      await handler(shimReq, shimRes);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // ── Static files from public/ ──
  let filePath = pathname === '/' ? '/index.html'
    : pathname === '/evals' ? '/evals.html'
    : pathname;

  const fullPath = path.join(__dirname, 'public', filePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`GLYPH dev server → http://localhost:${PORT}`);
  console.log(`  / → public/index.html`);
  console.log(`  /evals → public/evals.html`);
  console.log(`  /api/* → api/*.js handlers`);
});
