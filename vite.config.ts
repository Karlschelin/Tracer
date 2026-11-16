import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

const SAMPLES = resolve(import.meta.dirname, 'samples');
// Dit facit skrivs. E2E-testerna pekar om den till en tillfällig mapp så att samples/ inte rörs.
const FACIT_DIR = process.env.FACIT_DIR ? resolve(process.env.FACIT_DIR) : SAMPLES;

/** Dev-serverns stöd för annoteringsläget: lista klipp samt läsa och skriva facit i samples/. */
function samplesPlugin(): Plugin {
  return {
    name: 'tracer-samples',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__samples', (_req, res) => {
        const clips = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => /\.(mov|mp4|m4v|webm)$/i.test(f)).sort() : [];
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(clips));
      });
      server.middlewares.use('/__facit', (req, res) => {
        const name = decodeURIComponent((req.url || '').split('?')[0].replace(/^\//, ''));
        if (!/^[\w.-]+\.json$/.test(name)) { res.statusCode = 400; res.end('Ogiltigt filnamn'); return; }
        if (req.method === 'GET') {
          const file = [join(FACIT_DIR, name), join(SAMPLES, name)].find((f) => existsSync(f));
          if (!file) { res.statusCode = 404; res.end(); return; }
          res.setHeader('Content-Type', 'application/json');
          res.end(readFileSync(file));
          return;
        }
        if (req.method !== 'PUT') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
        req.on('end', () => {
          try { JSON.parse(body); } catch { res.statusCode = 400; res.end('Ogiltig JSON'); return; }
          mkdirSync(FACIT_DIR, { recursive: true });
          writeFileSync(join(FACIT_DIR, name), body);
          res.statusCode = 204; res.end();
        });
      });
    },
  };
}

/**
 * Skriver dist/artifact.html: samma app utan doctype, html-, head- och body-taggar,
 * i den form som en Claude-artifact ska ha.
 */
function artifactPlugin(): Plugin {
  return {
    name: 'tracer-artifact',
    apply: 'build',
    closeBundle() {
      const file = resolve(import.meta.dirname, 'dist/index.html');
      if (!existsSync(file)) return;
      const html = readFileSync(file, 'utf8');
      const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
      const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
      const keep = head.replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
      writeFileSync(resolve(import.meta.dirname, 'dist/artifact.html'), keep.trim() + '\n' + body.trim() + '\n');
    },
  };
}

export default defineConfig({
  plugins: [samplesPlugin(), viteSingleFile(), artifactPlugin()],
  server: { port: 5173 },
  build: { target: 'es2020' },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
