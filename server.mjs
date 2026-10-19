import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createStore, parseClippings, toMarkdown } from './lib/books.mjs';
import { createGit } from './lib/git.mjs';
import { statistics } from './lib/stats.mjs';
import { previewClippings, importClippings } from './lib/kindle.mjs';
import { loadBookLink } from './lib/openlibrary.mjs';

export const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp({ dataDirectory = path.join(root, 'reviews'), gitRoot = root, openLibraryFetch = fetch } = {}) {
  const store = createStore(dataDirectory), git = createGit(gitRoot), token = randomBytes(32).toString('hex');
  let queue = Promise.resolve();
  const serialize = job => { const next = queue.then(job); queue = next.catch(() => {}); return next; };
  const cache = new Map();
  return http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(403, { error: 'Acesso permitido apenas nesta máquina.' });
      if (req.headers.origin && ![`http://${host}`].includes(req.headers.origin)) return json(403, { error: 'Origem não autorizada.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Origem não autorizada.' });
      const url = new URL(req.url, `http://${host}`), route = url.pathname;
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      let body = {};
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        if (req.headers['x-entrelinhas-token'] !== token) return json(403, { error: 'Recarregue a página antes de continuar.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Envie JSON.' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 10 * 1024 * 1024) return json(413, { error: 'Arquivo muito grande. Limite: 10 MB.' }); chunks.push(chunk); }
        const raw = Buffer.concat(chunks).toString('utf8');
        try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
      }
      if (route === '/api/session' && req.method === 'GET') return json(200, { token });
      if (route === '/api/books' && req.method === 'GET') return json(200, await store.list());
      if (route === '/api/books' && req.method === 'POST') return json(201, await serialize(() => store.save(body)));
      const bookMatch = route.match(/^\/api\/books\/([a-f0-9-]{36})(\/markdown)?$/);
      if (bookMatch) {
        if (req.method === 'PUT' && !bookMatch[2]) return json(200, await serialize(() => store.save(body, bookMatch[1])));
        if (req.method === 'DELETE' && !bookMatch[2]) { await serialize(() => store.remove(bookMatch[1])); return json(200, { ok: true }); }
        if (req.method === 'GET' && bookMatch[2]) {
          const book = await store.get(bookMatch[1]);
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${book.id}.md"` }); return res.end(toMarkdown(book));
        }
      }
      if (route === '/api/stats' && req.method === 'GET') return json(200, statistics((await store.list()).books, Number(url.searchParams.get('year')) || new Date().getFullYear()));
      if (route === '/api/openlibrary' && req.method === 'GET') {
        const link = (url.searchParams.get('url') || '').trim();
        if (link.length > 2000) return json(400, { error: 'O link é muito longo.' });
        return json(200, await loadBookLink(link, { fetcher: openLibraryFetch }));
      }
      if (route === '/api/search' && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().slice(0,200);
        if (q.length < 2) return json(200, { books: [] });
        const cached = cache.get(q);
        if (cached && Date.now() - cached.time < 600000) return json(200, cached.data);
        try {
          const endpoint = new URL('https://openlibrary.org/search.json');
          endpoint.search = new URLSearchParams({ q, limit: '12', fields: 'key,title,author_name,cover_i,number_of_pages_median,first_publish_year', lang: 'pt' });
          const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Entrelinhas/1.0 (personal local reading journal)', Accept: 'application/json' } });
          if (!response.ok) throw new Error();
          const result = await response.json();
          const data = { books: result.docs.map(b => ({ key: b.key, title: b.title, authors: b.author_name || [], coverUrl: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : '', pages: b.number_of_pages_median || 0, year: b.first_publish_year || '' })) };
          if (cache.size > 100) cache.clear();
          cache.set(q, { time: Date.now(), data });
          return json(200, data);
        } catch { return json(502, { error: 'A busca de livros está indisponível agora. Tente novamente ou adicione manualmente.' }); }
      }
      if (route === '/api/kindle/preview' && req.method === 'POST') {
        const raw = String(body.text || '');
        const { books } = await store.list();
        return json(200, { entries: parseClippings(raw), groups: previewClippings(raw, books), books });
      }
      if (route === '/api/kindle/import' && req.method === 'POST') return json(200, await serialize(() => importClippings(store, String(body.text || ''), body.choices)));
      if (route === '/api/git' && req.method === 'GET') return json(200, await git.status());
      if (route === '/api/git/config' && req.method === 'POST') return json(200, await serialize(() => git.configure(body.remote)));
      if (route === '/api/git/sync' && req.method === 'POST') return json(200, await serialize(() => git.sync()));
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/stats.mjs': ['../lib/stats.mjs', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (req.method === 'GET' && assets[route]) {
        const [file, mime] = assets[route];
        const data = await readFile(path.join(root, 'public', file));
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' }); return res.end(data);
      }
      json(404, { error: 'Não encontrado.' });
    } catch (e) { json(e.code === 'ENOENT' ? 404 : 400, { error: e.code === 'ENOENT' ? 'Livro não encontrado.' : e.message || 'Não foi possível concluir.' }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3210;
  createApp().listen(port, '127.0.0.1', () => console.log(`Entrelinhas disponível em http://127.0.0.1:${port}`));
}
