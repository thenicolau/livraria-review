import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateBook, toMarkdown, fromMarkdown, createStore, parseClippings } from '../lib/books.mjs';
import { statistics, duration } from '../lib/stats.mjs';

const input = {title:'A paixão segundo G.H.', authors:['Clarice Lispector'], status:'concluido', started:'2026-01',finished:'2026-03',rating:5,review:'## Uma leitura\n\n**Muito** boa.\n\n> Uma reflexão.',notes:'Ler novamente.\nCom calma.',progress:[{month:'2026-02',pages:70}],highlights:[{text:'Um trecho\ncom mais de uma linha.',location:'Página 23',source:'Kindle'}]};
test('Markdown preserva metadados, texto Unicode e marcações multilinha',()=>{const b=validateBook(input);assert.deepEqual(fromMarkdown(toMarkdown(b)),b);assert.deepEqual(fromMarkdown(toMarkdown(b).replace(/\n/g,'\r\n')),b);});
test('valida notas, intervalos, estados e registros mensais',()=>{
 for(const value of [{rating:6},{rating:4.751},{rating:0.9},{rating:'abc'},{rating:Infinity},{rating:true},{finished:'2025-12'},{started:''},{status:'errado'},{coverUrl:'javascript:alert(1)'},{progress:[{month:'2026-13',pages:1}]},{progress:[{month:'2026-01',pages:2},{month:'2026-01',pages:3}]},{review:'<!-- entrelinhas:notas -->'}]) assert.throws(()=>validateBook({...input,...value}));
 assert.equal(validateBook({...input,rating:null}).rating,null);
});
test('notas decimais preservam precisão no Markdown e na média',()=>{
  for (const rating of [4.75,'4,75','4.75',2.5,1,5]) {
    const book=validateBook({...input,rating});
    assert.equal(book.rating,Number(String(rating).replace(',','.')));
    assert.equal(fromMarkdown(toMarkdown(book)).rating,book.rating);
  }
  assert.equal(statistics([validateBook({...input,rating:4.75}),validateBook({...input,rating:4.25})],2026).average,4.5);
});
test('cria, reabre, atualiza e exclui Markdown, preservando arquivo inválido',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'entrelinhas-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createStore(dir);
 const b=await store.save(input);assert.match(await readFile(path.join(dir,b.id+'.md'),'utf8'),/A paixão/);
 const fresh=createStore(dir);assert.equal((await fresh.list()).books[0].rating,5);
 const edited=await fresh.save({...b,rating:3,notes:'Outra nota'},b.id);assert.equal(edited.id,b.id);assert.equal(edited.createdAt,b.createdAt);assert.equal((await store.get(b.id)).notes,'Outra nota');
 await writeFile(path.join(dir,'invalid.md'),'não é um review válido');const result=await store.list();assert.equal(result.warnings.length,1);assert.equal(result.books.length,1);
 await assert.rejects(store.get('../../etc/passwd'));await store.remove(b.id);assert.equal((await store.list()).books.length,0);assert.equal(await readFile(path.join(dir,'invalid.md'),'utf8'),'não é um review válido');
});
test('importa Kindle em português e inglês, removendo duplicações e marcadores',()=>{
 const one='Dom Casmurro (Machado de Assis)\n- Seu destaque na página 10 | posição 90-92 | Adicionado em 10 de outubro\n\nCapitu tinha olhos de ressaca.\n==========\n';
 const two='A Book (An Author)\n- Your Note on Location 20 | Added on Monday\n\nA thought.\n==========\n';
 const bookmark='A Book (An Author)\n- Your Bookmark on Location 20 | Added on Monday\n\n\n==========\n';
 const entries=parseClippings('\uFEFF'+one+one+two+bookmark);assert.equal(entries.length,2);assert.equal(entries[0].title,'Dom Casmurro');assert.equal(entries[0].author,'Machado de Assis');assert.equal(entries[1].text,'A thought.');assert.equal(parseClippings('arquivo qualquer').length,0);
});
test('estatísticas distinguem páginas, conclusões, pausas e autores únicos',()=>{
 const b=validateBook(input),other=validateBook({...input,title:'Outro',authors:['Clarice Lispector','Clarice Lispector'],finished:'2026-02'}),paused=validateBook({...input,title:'Pausa',status:'pausado',finished:'',paused:'2026-03',rating:null});const s=statistics([b,other,paused],2026);
 assert.equal(s.finished,2);assert.equal(s.months[0].started,3);assert.equal(s.months[1].finished,1);assert.equal(s.months[1].pages,210);assert.equal(s.months[2].paused,1);assert.equal(s.authors[0].count,2);assert.equal(duration(b),2);assert.equal(duration({...b,finished:'2026-01'}),0);assert.equal(duration({...b,finished:'',paused:''}),null);assert.equal(statistics([],2026).average,null);
});
