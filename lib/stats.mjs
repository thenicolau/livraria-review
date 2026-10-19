export function statistics(books, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, started: 0, finished: 0, paused: 0, pages: 0 }));
  for (const book of books) for (const m of months) {
    if (book.started === m.month) m.started++;
    if (book.finished === m.month) m.finished++;
    if (book.paused === m.month) m.paused++;
    m.pages += (book.progress || []).filter(p => p.month === m.month).reduce((sum,p) => sum + p.pages, 0);
  }
  const authors = new Map();
  for (const b of books.filter(b => b.status === 'concluido')) for (const author of new Set(b.authors)) authors.set(author, (authors.get(author) || 0) + 1);
  const rated = books.filter(b => b.rating);
  return { months, authors: [...authors].map(([name,count]) => ({ name,count })).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name)), total: books.length, finished: books.filter(b => b.status === 'concluido').length, reading: books.filter(b => b.status === 'lendo').length, average: rated.length ? rated.reduce((sum,b) => sum+b.rating, 0)/rated.length : null };
}
export function duration(book) {
  if (!book.started || !(book.finished || book.paused)) return null;
  const [sy, sm] = book.started.split('-').map(Number), [ey, em] = (book.finished || book.paused).split('-').map(Number);
  return (ey - sy) * 12 + em - sm;
}
