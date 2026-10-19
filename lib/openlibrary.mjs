const origin = 'https://openlibrary.org';

export function parseBookLink(value) {
  let url;
  try { url = new URL(String(value).trim().replace(/^(www\.)?openlibrary\.org\//i, 'https://openlibrary.org/')); }
  catch { throw new Error('Cole um link válido de um livro da Open Library.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['openlibrary.org', 'www.openlibrary.org'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use um link de openlibrary.org, sem credenciais ou portas.');
  const match = url.pathname.match(/^\/(works\/OL\d+W|books\/OL\d+M)(?:\.json|\/[^?]*)?$/);
  if (!match) throw new Error('Use o link de uma obra (/works/…) ou edição (/books/…) da Open Library.');
  const edition = url.searchParams.get('edition');
  if (edition && match[1].startsWith('works/')) {
    const selected = edition.match(/^(?:key:)?(\/books\/OL\d+M)$/);
    if (!selected) throw new Error('A edição indicada no link não é válida. Copie o link direto da edição.');
    return selected[1];
  }
  return `/${match[1]}`;
}

export async function loadBookLink(value, { fetcher = fetch } = {}) {
  const key = parseBookLink(value), warnings = [];
  const signal = AbortSignal.timeout(20000);
  const read = async resource => {
    let response;
    try { response = await fetcher(`${origin}${resource}.json`, { signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'Entrelinhas/1.0 (personal local reading journal)' } }); }
    catch { throw new Error('Não foi possível acessar a Open Library. Confira sua conexão e tente novamente.'); }
    if (response.status === 404) throw new Error('Este livro não foi encontrado na Open Library. Confira o link.');
    if (!response.ok) throw new Error('A Open Library está indisponível agora. Tente novamente em instantes.');
    try { return await response.json(); } catch { throw new Error('A Open Library retornou dados inválidos. Tente novamente.'); }
  };
  const data = await read(key);
  if (!data || typeof data.title !== 'string' || !data.title.trim()) throw new Error('O link não retornou os dados de um livro.');
  let authorReferences = Array.isArray(data.authors) ? data.authors : [];
  // Some editions list their authors only on the parent work.
  if (!authorReferences.length && key.startsWith('/books/')) {
    const parent = data.works?.find(w => /^\/works\/OL\d+W$/.test(w.key || ''));
    if (parent) {
      try { const work = await read(parent.key); authorReferences = Array.isArray(work.authors) ? work.authors : []; }
      catch { warnings.push('Não foi possível consultar o autor da obra.'); }
    }
  }
  const authors = [], seen = new Set();
  for (const ref of authorReferences.slice(0, 10)) {
    const authorKey = ref?.author?.key || ref?.key;
    if (!/^\/authors\/OL\d+A$/.test(authorKey || '') || seen.has(authorKey)) continue;
    seen.add(authorKey);
    try { const author = await read(authorKey); if (typeof author.name === 'string' && author.name.trim()) authors.push(author.name.trim()); }
    catch { warnings.push('Não foi possível carregar um dos autores.'); }
  }
  if (!authors.length) warnings.push('Autor não disponível; você pode preenchê-lo manualmente.');
  const cover = (Array.isArray(data.covers) ? data.covers : []).find(id => Number.isInteger(id) && id > 0);
  const pages = Number.isInteger(data.number_of_pages) && data.number_of_pages > 0 ? data.number_of_pages : 0;
  return { book: { key, title: data.title, authors: [...new Set(authors)], coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : '', pages }, url: `${origin}${key}`, warnings: [...new Set(warnings)] };
}
