import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile);
const managed = ['reviews', 'public', 'lib', 'tests', 'server.mjs', 'package.json', 'package-lock.json', 'README.md', '.gitignore', 'iniciar.bat'];
export const isGithubRemote = value => /^(https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(value);
export function createGit(root, { execute = exec } = {}) {
  const configFile = path.join(root, '.local', 'settings.json');
  const git = async (...args) => (await execute('git', args, { cwd: root, timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
  const readConfig = async () => { try { return JSON.parse(await readFile(configFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } };
  const repository = async () => {
    try { return path.resolve(await git('rev-parse', '--show-toplevel')).toLowerCase() === path.resolve(root).toLowerCase(); } catch { return false; }
  };
  return {
    async status() {
      const config = await readConfig();
      let available = true;
      try { await git('--version'); } catch { available = false; }
      const initialized = available && await repository();
      let remote = '', branch = '', changed = 0;
      if (initialized) {
        try { remote = await git('remote', 'get-url', 'origin'); } catch {}
        try { branch = await git('symbolic-ref', '--short', 'HEAD'); } catch {}
        changed = (await git('status', '--porcelain')).split('\n').filter(Boolean).length;
      }
      return { available, initialized, remote: isGithubRemote(remote) ? remote : '', configuredRemote: config.remote || '', branch, changed, lastSync: config.lastSync || null };
    },
    async configure(remote) {
      remote = String(remote || '').trim();
      if (!isGithubRemote(remote)) throw new Error('Use https://github.com/usuario/repositorio.git ou git@github.com:usuario/repositorio.git.');
      const config = await readConfig();
      await mkdir(path.dirname(configFile), { recursive: true });
      await writeFile(configFile, JSON.stringify({ ...config, remote }, null, 2));
      return this.status();
    },
    async sync() {
      const config = await readConfig();
      const state = await this.status();
      if (!state.available) throw new Error('Instale o Git para sincronizar.');
      const remote = config.remote || state.remote;
      if (!isGithubRemote(remote)) throw new Error('Configure o endereço do repositório GitHub primeiro.');
      if (!state.initialized) {
        try { await git('rev-parse', '--show-toplevel'); throw new Error('Esta pasta está dentro de outro repositório. Inicialize um repositório próprio aqui antes de sincronizar.'); }
        catch (e) { if (!e.code) throw e; }
        await git('init', '-b', 'main');
      }
      let current = '';
      try { current = await git('remote', 'get-url', 'origin'); } catch {}
      if (current && current !== remote) throw new Error('O origin atual é diferente do endereço configurado. Ajuste-o no terminal antes de sincronizar.');
      if (!current) await git('remote', 'add', 'origin', remote);
      const branch = await git('symbolic-ref', '--short', 'HEAD').catch(() => '');
      if (!branch) throw new Error('Faça checkout de uma branch antes de sincronizar.');
      const staged = (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean);
      if (staged.some(f => !managed.some(p => f === p || f.startsWith(`${p}/`)))) throw new Error('Há arquivos de fora do sistema preparados para commit. Revise-os no terminal primeiro.');
      try {
        await git('fetch', 'origin');
        const remoteRefs = await git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin/');
        if (remoteRefs) {
          let localHead = '';
          try { localHead = await git('rev-parse', '--verify', 'HEAD'); } catch {}
          if (!localHead) throw new Error('O repositório remoto já tem histórico. Conecte os históricos no terminal ou escolha um repositório vazio.');
          const target = `refs/remotes/origin/${branch}`;
          if (remoteRefs.split('\n').includes(target)) {
            try { await git('merge-base', '--is-ancestor', target, 'HEAD'); }
            catch { throw new Error('O GitHub tem alterações que ainda não estão nesta máquina. Integre-as pelo terminal antes de sincronizar.'); }
          }
        }
      } catch (e) { if (!e.code) throw e; throw new Error('Não foi possível acessar o GitHub. Confira o endereço e a autenticação do Git nesta máquina.'); }
      const { existsSync } = await import('node:fs');
      const paths = managed.filter(p => existsSync(path.join(root, p)));
      await git('add', '-A', '--', ...paths);
      const changes = await git('diff', '--cached', '--name-only');
      if (changes) {
        try { await git('commit', '-m', `Atualiza diário de leitura · ${new Date().toISOString().slice(0,10)}`); }
        catch { throw new Error('Não foi possível criar o commit. Verifique git config user.name e user.email no terminal. Seus arquivos continuam salvos.'); }
      }
      try { await git('push', '-u', 'origin', branch); }
      catch { throw new Error('O push falhou. O commit local foi preservado. Verifique a autenticação, a conexão ou alterações no remoto e tente novamente.'); }
      const lastSync = new Date().toISOString();
      await mkdir(path.dirname(configFile), { recursive: true });
      await writeFile(configFile, JSON.stringify({ ...config, remote, lastSync }, null, 2));
      return { message: changes ? 'Reviews e sistema sincronizados com o GitHub.' : 'Tudo atualizado no GitHub.', lastSync };
    },
  };
}
