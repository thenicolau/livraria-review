import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookLink, loadBookLink } from '../lib/openlibrary.mjs';
import { createApp } from '../server.mjs';

test('aceita links de obras, edições, slugs e edição selecionada', () => {
  for (const link of ['https://openlibrary.org/works/OL1003040W/Dom_Casmurro', 'http://www.openlibrary.org/works/OL1003040W?utm_source=test#editions', 'openlibrary.org/works/OL1003040W.json']) assert.equal(parseBookLink(link), '/works/OL1003040W');
  assert.equal(parseBookLink('https://openlibrary.org/books/OL123M/Title'), '/books/OL123M');
  assert.equal(parseBookLink('https://openlibrary.org/works/OL1W/Title?edition=key%3A%2Fbooks%2FOL123M'), '/books/OL123M');
});
test('rejeita links externos, caminhos incorretos e credenciais antes de acessar a rede', async () => {
  for (const value of ['https://evil.com/books/OL123M','https://openlibrary.org.evil.com/works/OL1W','https://user@openlibrary.org/books/OL123M','https://openlibrary.org:4000/books/OL123M','https://openlibrary.org/authors/OL1A','file:///books/OL123M','https://openlibrary.org/works/OL1W?edition=https://evil.com','https://openlibrary.org/books/OL1W']) {
    await assert.rejects(loadBookLink(value,{fetcher:()=>assert.fail('Não deveria acessar a rede')}));
  }
});
const fixture = values => async (url,options) => {
  assert.equal(options.redirect,'error');
  const resource=new URL(url).pathname.replace(/\.json$/,'');
  const value=values[resource];
  return {ok:!!value,status:value?200:404,json:async()=>value};
};
test('preenche obra e resolve autor sem inventar páginas',async()=>{
  const result=await loadBookLink('https://openlibrary.org/works/OL1W',{fetcher:fixture({'/works/OL1W':{title:'Um livro',authors:[{author:{key:'/authors/OL2A'}}],covers:[-1,123]},'/authors/OL2A':{name:'Uma autora'}})});
  assert.deepEqual(result.book,{key:'/works/OL1W',title:'Um livro',authors:['Uma autora'],coverUrl:'https://covers.openlibrary.org/b/id/123-M.jpg',pages:0});
});
test('respeita páginas e capa da edição e busca autor na obra quando necessário',async()=>{
  const result=await loadBookLink('https://openlibrary.org/books/OL3M',{fetcher:fixture({'/books/OL3M':{title:'Edição específica',number_of_pages:275,covers:[321],works:[{key:'/works/OL1W'}]},'/works/OL1W':{authors:[{author:{key:'/authors/OL2A'}}]},'/authors/OL2A':{name:'Uma autora'}})});
  assert.equal(result.book.pages,275);assert.equal(result.book.title,'Edição específica');assert.equal(result.book.authors[0],'Uma autora');assert.match(result.book.coverUrl,/321-M/);
});
test('dados parciais e falhas de rede têm retorno compreensível',async()=>{
  const partial=await loadBookLink('https://openlibrary.org/works/OL1W',{fetcher:fixture({'/works/OL1W':{title:'Sem metadados',authors:[{author:{key:'https://evil.com'}}]}})});
  assert.equal(partial.book.pages,0);assert.equal(partial.book.coverUrl,'');assert(partial.warnings.length);
  await assert.rejects(loadBookLink('https://openlibrary.org/books/OL3M',{fetcher:fixture({})}),/não foi encontrado/);
  await assert.rejects(loadBookLink('https://openlibrary.org/books/OL3M',{fetcher:async()=>{throw new Error('offline')}}),/conexão/);
});
test('API recebe o link e entrega metadados sem cadastrar um review',async t=>{
 const app=createApp({openLibraryFetch:fixture({'/books/OL3M':{title:'Livro pelo link',number_of_pages:123}})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const response=await fetch(`${base}/api/openlibrary?url=${encodeURIComponent('https://openlibrary.org/books/OL3M/Title')}`);
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.book.title,'Livro pelo link');assert.equal(result.book.pages,123);
 assert.equal((await fetch(`${base}/api/openlibrary?url=${encodeURIComponent('https://example.com/books/OL3M')}`)).status,400);
});
