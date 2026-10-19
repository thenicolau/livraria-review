import { parseClippings } from './books.mjs';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const authorKey = value => normalize(value).split(' ').filter(Boolean).sort().join(' ');
const sourceKey = source => JSON.stringify([normalize(source.title), authorKey(source.author)]);
const mainTitle = title => normalize(String(title).split(/\s*[:：]\s*/)[0].replace(/\s*\((?:[^()]*(?:edition|edi[cç][aã]o|portugu[eê]s|portuguese|english|kindle)[^()]*)\)\s*$/i, ''));
const quoteKey = h => `${h.text.trim().replace(/\s+/g, ' ')}\n${h.location.trim().replace(/\s+/g, ' ')}`;
function sameAuthor(source, book) {
  return !!source.author && book.authors.some(a => authorKey(a) === authorKey(source.author));
}
function titleSimilarity(a, b) {
  const first = new Set(normalize(a).split(' ')), second = new Set(normalize(b).split(' '));
  const overlap = [...first].filter(word => second.has(word)).length;
  return overlap / new Set([...first, ...second]).size;
}

export function matchBook(source, books) {
  const learned = books.filter(b => (b.kindleSources || []).some(s => sourceKey(s) === sourceKey(source)));
  if (learned.length === 1) return { target: learned[0].id, reason: 'Associação confirmada anteriormente', candidates: [learned[0].id] };
  if (learned.length > 1) return { target: '', reason: 'Essa origem está associada a mais de um livro. Escolha o registro correto.', candidates: learned.map(b => b.id) };
  const exact = books.filter(b => normalize(b.title) === normalize(source.title));
  const withAuthor = exact.filter(b => sameAuthor(source, b));
  if (withAuthor.length === 1) return { target: withAuthor[0].id, reason: 'Título e autor correspondem', candidates: [withAuthor[0].id] };
  if (exact.length === 1 && (!source.author || !exact[0].authors.length)) return { target: exact[0].id, reason: 'Título corresponde a um único livro', candidates: [exact[0].id] };
  if (!exact.length) {
    const variants = books.filter(b => sameAuthor(source, b) && mainTitle(b.title) === mainTitle(source.title) && (normalize(b.title) === mainTitle(source.title) || normalize(source.title) === mainTitle(b.title)));
    if (variants.length === 1) return { target: variants[0].id, reason: 'Título principal e autor correspondem; subtítulo ou edição diferente', candidates: [variants[0].id] };
  }
  const candidates = books.map(b => ({ id: b.id, score: titleSimilarity(source.title, b.title) + (sameAuthor(source, b) ? .2 : 0) }))
    .filter(b => b.score >= .45).sort((a,b) => b.score - a.score).slice(0, 5).map(b => b.id);
  return { target: '', reason: exact.length > 1 || withAuthor.length > 1 ? 'Há mais de um registro possível. Qual deles recebe as notas?' : exact.length ? 'O título corresponde, mas o autor é diferente. Confirme o livro.' : 'Não encontrei uma correspondência segura. A qual livro pertencem estas notas?', candidates };
}

export function previewClippings(raw, books) {
  const grouped = new Map();
  for (const entry of parseClippings(raw)) {
    const key = sourceKey(entry);
    if (!grouped.has(key)) grouped.set(key, { key, title: entry.title, author: entry.author, entries: [] });
    grouped.get(key).entries.push(entry);
  }
  return [...grouped.values()].map(g => ({ ...g, ...matchBook(g, books) }));
}

export async function importClippings(store, raw, choices) {
  const { books, warnings } = await store.list();
  const groups = previewClippings(raw, books);
  if (!groups.length) throw new Error('Nenhuma marcação reconhecida no arquivo.');
  if (!Array.isArray(choices) || choices.length !== groups.length || new Set(choices.map(c => c.key)).size !== groups.length) throw new Error('Revise a associação de todos os livros antes de importar.');
  const targets = new Map(choices.map(c => [c.key, c.target]));
  // Validate every choice before writing any review.
  for (const group of groups) {
    const target = targets.get(group.key);
    if (!target) throw new Error(`Escolha a qual livro pertencem as notas de “${group.title}”.`);
    if (!['new', 'skip'].includes(target) && !books.some(b => b.id === target)) throw new Error('Um livro selecionado não está mais disponível. Reabra a importação.');
  }
  let added = 0, created = 0, updated = 0, skipped = 0;
  for (const group of groups) {
    const target = targets.get(group.key);
    if (target === 'skip') { skipped++; continue; }
    // Re-read before appending so multiple groups and edits keep all existing text.
    const book = target === 'new' ? { title: group.title, authors: group.author ? [group.author] : [], status: 'quero-ler', highlights: [], kindleSources: [] } : await store.get(target);
    const known = new Set(book.highlights.map(quoteKey));
    const additions = group.entries.filter(h => { const key = quoteKey(h); if (known.has(key)) return false; known.add(key); return true; });
    const sources = book.kindleSources || [];
    const remember = !sources.some(s => sourceKey(s) === sourceKey(group));
    if (!additions.length && !remember) continue;
    book.highlights.push(...additions);
    book.kindleSources = remember ? [...sources, { title: group.title, author: group.author }] : sources;
    await store.save(book, book.id);
    // A corrected association replaces the remembered destination, not the old notes.
    for (const other of books.filter(b => b.id !== book.id && (b.kindleSources || []).some(s => sourceKey(s) === sourceKey(group)))) {
      const fresh = await store.get(other.id);
      await store.save({ ...fresh, kindleSources: (fresh.kindleSources || []).filter(s => sourceKey(s) !== sourceKey(group)) }, other.id);
    }
    added += additions.length;
    if (target === 'new') created++; else updated++;
  }
  return { added, created, updated, skipped, warnings };
}
