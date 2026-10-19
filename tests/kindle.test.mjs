import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/books.mjs';
import { matchBook, previewClippings, importClippings } from '../lib/kindle.mjs';

const book = (id,title,authors=[]) => ({id,title,authors});
const clipping = (title,author='Machado de Assis',quote='Um trecho.') => `${title} (${author})\n- Seu destaque na página 12 | posição 15-20 | Adicionado em outubro\n\n${quote}\n==========\n`;
test('identificação por título normalizado, autor reordenado e subtítulo',()=>{
 const books=[book('1','Memórias Póstumas de Brás Cubas',['Machado de Assis'])];
 assert.equal(matchBook({title:'MEMORIAS POSTUMAS DE BRAS CUBAS!',author:'Assis, Machado de'},books).target,'1');
 assert.equal(matchBook({title:'Memórias Póstumas de Brás Cubas: edição comentada',author:'Machado de Assis'},books).target,'1');
 assert.equal(matchBook({title:books[0].title,author:''},books).target,'1');
});
test('ambiguidade, autores divergentes e livros semelhantes exigem escolha',()=>{
 assert.equal(matchBook({title:'Dom Casmurro',author:'Machado de Assis'},[book('1','Dom Casmurro',['Machado de Assis']),book('2','Dom Casmurro',['Machado de Assis'])]).target,'');
 assert.equal(matchBook({title:'O caminho',author:'Outro Autor'},[book('1','O caminho',['Primeiro Autor'])]).target,'');
 assert.equal(matchBook({title:'Volume 2',author:'Autor'},[book('1','Volume 1',['Autor'])]).target,'');
 assert.equal(matchBook({title:'Série: A segunda história',author:'Autor'},[book('1','Série: A primeira história',['Autor'])]).target,'');
 assert.equal(matchBook({title:'Unknown',author:''},[book('1','Dom Casmurro')]).target,'');
 assert.equal(matchBook({title:'O caminho',author:'Autor B'},[book('1','O caminho',['Autor A']),book('2','O caminho',['Autor B'])]).target,'2');
});
test('importação preserva review, aprende escolha, evita duplicação e valida tudo antes de salvar',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'entrelinhas-kindle-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createStore(dir);
 const saved=await store.save({title:'Meu título traduzido',authors:['Machado de Assis'],review:'**Meu review**',notes:'Notas próprias',rating:4.75});
 const raw=clipping('Título original');const [group]=previewClippings(raw,(await store.list()).books);assert.equal(group.target,'');
 await assert.rejects(importClippings(store,raw,[{key:group.key,target:''}]),/Escolha/);assert.equal((await store.get(saved.id)).highlights.length,0);
 const result=await importClippings(store,raw,[{key:group.key,target:saved.id}]);assert.equal(result.added,1);assert.equal(result.created,0);
 const updated=await store.get(saved.id);assert.equal(updated.review,'**Meu review**');assert.equal(updated.notes,'Notas próprias');assert.equal(updated.rating,4.75);assert.equal(updated.kindleSources.length,1);
 assert.equal(previewClippings(raw,(await store.list()).books)[0].target,saved.id);
 assert.equal((await importClippings(store,raw,[{key:group.key,target:saved.id}])).added,0);
 await store.save({...updated,review:'Review atualizado',kindleSources:undefined},saved.id);assert.equal((await store.get(saved.id)).kindleSources.length,1);
 const multi=raw+clipping('Outro livro','Autor','Outra nota');const groups=previewClippings(multi,(await store.list()).books);
 await assert.rejects(importClippings(store,multi,groups.map((g,i)=>({key:g.key,target:i===0?saved.id:''}))),/Escolha/);
 assert.equal((await store.list()).books.length,1);
 const imported=await importClippings(store,multi,groups.map((g,i)=>({key:g.key,target:i===0?saved.id:'new'})));assert.equal(imported.created,1);
 assert.equal((await store.list()).books.length,2);
 const second=(await store.list()).books.find(b=>b.id!==saved.id);
 await importClippings(store,raw,[{key:group.key,target:second.id}]);
 assert.equal(previewClippings(raw,(await store.list()).books)[0].target,second.id);
 assert.equal((await store.get(saved.id)).kindleSources.length,0);
});
test('múltiplos grupos anexados ao mesmo livro mantêm todas as notas',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'entrelinhas-kindle-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createStore(dir);
 const b=await store.save({title:'Um livro'}),raw=clipping('Título A','Autor','Nota A')+clipping('Título B','Autor','Nota B');
 const groups=previewClippings(raw,[b]);await importClippings(store,raw,groups.map(g=>({key:g.key,target:b.id})));
 assert.deepEqual((await store.get(b.id)).highlights.map(h=>h.text),['Nota A','Nota B']);
});
