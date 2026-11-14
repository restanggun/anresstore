import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
try {
  const status = git('status', '--porcelain', '--untracked-files=all');
  if (status) throw new Error('Workspace belum bersih. Tinjau dan commit seluruh perubahan release.');
  const files = git('ls-files').split('\n');
  const forbidden = files.filter(p => /(^|\/)(node_modules|\.next[^/]*|backups|release-artifacts)\//.test(p) || /(^|\/)\.env($|\.)/.test(p) && !p.endsWith('.env.example') || /\.(pem|key)$/.test(p));
  if (forbidden.length) throw new Error(`Berkas terlarang terlacak: ${forbidden.join(', ')}`);
  console.log(JSON.stringify({ releaseCommit: git('rev-parse', 'HEAD'), status: 'clean', note: 'Identitas source saja; kelulusan E2E dan image Linux dicatat terpisah.' }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
