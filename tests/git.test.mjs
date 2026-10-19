import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGit, isGithubRemote } from '../lib/git.mjs';
test('somente URLs GitHub sem credenciais ou comandos são aceitas',()=>{for(const r of ['https://github.com/user/repo.git','git@github.com:user/repo'])assert.equal(isGithubRemote(r),true);for(const r of ['file:///a','https://token@github.com/user/repo','git@evil.com:user/repo','https://github.com/user/repo;calc','-u origin'])assert.equal(isGithubRemote(r),false);});
for (const scenario of ['success','behind','staged-secret','push-fail']) test(`sincronização Git: ${scenario}`,async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'entrelinhas-git-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(path.join(dir,'README.md'),'Test');const calls=[];const remote='https://github.com/test/test.git';
 const execute=async(command,args)=>{assert.equal(command,'git');calls.push(args);const s=args.join(' ');let stdout='';
 if(s==='--version')stdout='git version test';else if(s==='rev-parse --show-toplevel')stdout=dir;else if(s==='remote get-url origin')stdout=remote;else if(s==='symbolic-ref --short HEAD')stdout='main';else if(s==='diff --cached --name-only')stdout=scenario==='staged-secret'?'.env':'README.md';else if(s.startsWith('for-each-ref'))stdout='refs/remotes/origin/main';else if(s==='rev-parse --verify HEAD')stdout='abcdef';else if(s.startsWith('merge-base')&&scenario==='behind')throw Object.assign(new Error('behind'),{code:1});else if(s.startsWith('push')&&scenario==='push-fail')throw Object.assign(new Error('failed'),{code:1});return{stdout};};
 const git=createGit(dir,{execute});await git.configure(remote);
 if(scenario==='success'){assert.match((await git.sync()).message,/sincronizados/);assert(calls.some(a=>a[0]==='commit'));assert(calls.some(a=>a[0]==='push'));assert((await git.status()).lastSync);}
 else {await assert.rejects(git.sync(),scenario==='behind'?/alterações/:scenario==='staged-secret'?/fora do sistema/:/commit local foi preservado/);if(scenario!=='push-fail')assert(!calls.some(a=>a[0]==='push'||a[0]==='commit'));}
 assert(!calls.flat().includes('--force'));assert(!calls.some(a=>a[0]==='reset'||a[0]==='merge'||a[0]==='rebase'));assert(!calls.flat().includes('.env'));
});
