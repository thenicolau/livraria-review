import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const statuses = ['quero-ler', 'lendo', 'concluido', 'pausado', 'abandonei'];
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const text = (v, max = 100000) => typeof v === 'string' ? v.slice(0, max).trim() : '';
const marker = '\n<!-- entrelinhas:notas -->\n';
const highlightsMarker = '\n<!-- entrelinhas:marcacoes -->\n';
export function validateBook(input, previous) {
  const title = text(input.title, 500);
  if (!title) throw new Error('Informe o título do livro.');
  const authors = (Array.isArray(input.authors) ? input.authors : []).map(a => text(a, 300)).filter(Boolean).slice(0, 30);
  const status = input.status || 'quero-ler';
  if (!statuses.includes(status)) throw new Error('Status inválido.');
  const rawRating = typeof input.rating === 'string' ? input.rating.trim().replace(',', '.') : input.rating;
  const rating = rawRating === '' || rawRating == null ? null : Number(rawRating);
  if (rating !== null && (typeof rawRating === 'boolean' || !Number.isFinite(rating) || rating < 1 || rating > 5 || Math.abs(rating * 100 - Math.round(rating * 100)) > 1e-8)) throw new Error('Use uma nota entre 1 e 5, com até duas casas decimais (ex.: 4,75).');
  const dates = {};
  for (const key of ['started', 'finished', 'paused']) {
    dates[key] = text(input[key], 7);
    if (dates[key] && !monthPattern.test(dates[key])) throw new Error('Use mês e ano nas datas.');
  }
  if ((dates.finished || dates.paused) && !dates.started) throw new Error('Informe quando começou a leitura.');
  if (dates.finished && dates.finished < dates.started) throw new Error('A conclusão não pode vir antes do início.');
  if (dates.paused && dates.paused < dates.started) throw new Error('A pausa não pode vir antes do início.');
  if (status === 'concluido' && !dates.finished) throw new Error('Informe o mês de conclusão.');
  if (status === 'lendo' && !dates.started) throw new Error('Informe o mês de início.');
  if (['pausado', 'abandonei'].includes(status) && !dates.paused) throw new Error('Informe o mês em que parou.');
  let coverUrl = text(input.coverUrl, 2000);
  if (coverUrl && !/^https:\/\//i.test(coverUrl)) throw new Error('A capa deve usar um endereço HTTPS.');
  const progress = (Array.isArray(input.progress) ? input.progress : []).map(p => ({ month: text(p.month, 7), pages: Number(p.pages) }));
  if (progress.some(p => !monthPattern.test(p.month) || !Number.isInteger(p.pages) || p.pages < 0 || p.pages > 100000)) throw new Error('Informe um mês válido e uma quantidade inteira de páginas.');
  if (new Set(progress.map(p => p.month)).size !== progress.length) throw new Error('Use apenas um registro de páginas por mês.');
  const review = text(input.review), notes = text(input.notes);
  if ([review, notes].some(s => s.includes('<!-- entrelinhas:'))) throw new Error('O texto contém um marcador reservado do arquivo.');
  const highlights = (Array.isArray(input.highlights) ? input.highlights : []).filter(h => text(h.text)).map(h => ({ id: /^[a-zA-Z0-9-]{1,50}$/.test(h.id || '') ? h.id : randomUUID(), text: text(h.text), location: text(h.location, 500), source: h.source === 'Kindle' ? 'Kindle' : 'Manual' }));
  const kindleSources = (Array.isArray(input.kindleSources) ? input.kindleSources : previous?.kindleSources || []).map(s => ({ title: text(s.title, 500), author: text(s.author, 500) })).filter(s => s.title);
  return { id: previous?.id || randomUUID(), title, authors, coverUrl, status, rating, ...dates, pages: Math.max(0, Math.min(100000, Math.trunc(Number(input.pages) || 0))), progress: progress.sort((a,b) => a.month.localeCompare(b.month)), review, notes, highlights, kindleSources, createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export function toMarkdown(book) {
  const { review, notes, ...metadata } = book;
  const quotes = book.highlights.map(h => `> ${h.text.replace(/\n/g, '\n> ')}\n\n— ${h.location || 'Sem localização'} · ${h.source}`).join('\n\n');
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n# ${book.title}\n\n<!-- entrelinhas:review -->\n${review}\n${marker}\n${notes}\n${highlightsMarker}\n## Marcações\n\n${quotes}\n`;
}
export function fromMarkdown(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('Metadados Markdown não encontrados.');
  const meta = JSON.parse(match[1]);
  const body = raw.slice(match[0].length).replace(/\r\n/g, '\n');
  const reviewStart = body.indexOf('<!-- entrelinhas:review -->\n');
  const notesStart = body.indexOf(marker), quotesStart = body.indexOf(highlightsMarker);
  if (reviewStart < 0 || notesStart < reviewStart || quotesStart < notesStart) throw new Error('Seções Markdown ausentes.');
  return { ...meta, review: body.slice(reviewStart + '<!-- entrelinhas:review -->\n'.length, notesStart).trim(), notes: body.slice(notesStart + marker.length, quotesStart).trim() };
}
export function createStore(directory) {
  const filename = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Identificador inválido.');
    return path.join(directory, `${id}.md`);
  };
  return {
    async list() {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter(f => f.endsWith('.md'));
      const books = [], warnings = [];
      for (const file of files) {
        try { const book = fromMarkdown(await readFile(path.join(directory, file), 'utf8')); if (path.basename(filename(book.id)) !== file) throw new Error('ID diferente do nome do arquivo.'); if (typeof book.updatedAt !== 'string' || !Number.isFinite(Date.parse(book.updatedAt))) throw new Error('Data de atualização inválida.'); books.push({ ...validateBook(book, book), updatedAt: book.updatedAt }); }
        catch (e) { warnings.push(`${file}: ${e.message}`); }
      }
      return { books: books.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), warnings };
    },
    async get(id) { return fromMarkdown(await readFile(filename(id), 'utf8')); },
    async save(input, id) {
      const previous = id ? await this.get(id) : undefined;
      const book = validateBook(input, previous);
      await mkdir(directory, { recursive: true });
      const dest = filename(book.id), tmp = `${dest}.${randomUUID()}.tmp`;
      await writeFile(tmp, toMarkdown(book), 'utf8');
      await rename(tmp, dest);
      return book;
    },
    async remove(id) { await unlink(filename(id)); },
  };
}
export function parseClippings(raw) {
  const entries = [], seen = new Set();
  for (const block of raw.replace(/^\uFEFF/, '').split(/={10,}/)) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 3) continue;
    const titleLine = lines.shift().trim(), meta = lines.shift().trim();
    if (!/(highlight|destaque|sublinhad|nota|note|marcaç|marcac)/i.test(meta) || /(bookmark|marcador)/i.test(meta)) continue;
    const content = lines.join('\n').trim();
    if (!content || /(clipping limit|limite de recorte|limite de marca)/i.test(content)) continue;
    const match = titleLine.match(/^(.*)\s+\(([^()]*)\)$/);
    const title = (match?.[1] || titleLine).trim(), author = match?.[2] || '';
    const location = meta.split('|').slice(0, -1).join('|').replace(/^-\s*/, '').trim() || meta.replace(/^-\s*/, '');
    const key = `${title}\n${content}\n${location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title, author, text: content, location, source: 'Kindle', id: randomUUID() });
  }
  return entries;
}
