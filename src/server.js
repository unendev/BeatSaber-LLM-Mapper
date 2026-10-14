import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.dat': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const PORT = process.env.PORT || 3000;

export function createServer() {
  return http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/' || pathname === '') {
      pathname = '/viewer/index.html';
    }

    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(ROOT_DIR, safePath);

    // If file doesn't exist at root (e.g. /viewer.css, /viewer.js), fallback to /viewer/
    if (!fs.existsSync(filePath) && fs.existsSync(path.join(ROOT_DIR, 'viewer', safePath))) {
      filePath = path.join(ROOT_DIR, 'viewer', safePath);
    }

    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${pathname}`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Support Range requests for audio streaming
      const range = req.headers.range;
      if (range && (contentType.startsWith('audio/') || contentType.startsWith('video/'))) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', (e) => {
          console.warn('[Server] Stream error:', e.message);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        req.on('close', () => {
          stream.destroy();
        });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        });
        stream.pipe(res);
      } else {
        const stream = fs.createReadStream(filePath);
        stream.on('error', (e) => {
          console.warn('[Server] Stream error:', e.message);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        req.on('close', () => {
          stream.destroy();
        });

        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache'
        });
        stream.pipe(res);
      }
    });
  });
}

process.on('uncaughtException', (err) => {
  console.warn('[BeatSaber-Viewer] Handled uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[BeatSaber-Viewer] Handled unhandled rejection:', reason);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`[BeatSaber-Viewer] HTTP Server running at: http://localhost:${PORT}/`);
    console.log(`[BeatSaber-Viewer] Root directory: ${ROOT_DIR}`);
  });
}
