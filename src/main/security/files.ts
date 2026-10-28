import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
export async function hashFile(file:string, algorithm='sha256'):Promise<string> {
  const hash=createHash(algorithm); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}
export async function exists(file:string) { try { await fs.lstat(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return false; throw e; } }
export function inside(root:string, target:string) { const rel=path.relative(path.resolve(root),path.resolve(target)); return rel==='' || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)); }
export async function safePath(root:string, relative:string):Promise<string> {
  if (!relative || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.startsWith('/') || relative.split('/').some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p) || /[<>"|?*\x00-\x1f]/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('Unsafe installation path.');
  const target=path.resolve(root,...relative.split('/')); if (!inside(root,target)) throw new Error('Path escapes installation directory.');
  let current=path.resolve(root); const parsed=path.parse(current); let scan=parsed.root;
  for (const part of current.slice(parsed.root.length).split(path.sep).filter(Boolean)) { scan=path.join(scan,part); if(await exists(scan)) { const s=await fs.lstat(scan); if(s.isSymbolicLink() || !s.isDirectory()) throw new Error('Installation directory contains a link or non-directory.'); } }
  for (const part of relative.split('/')) { current=path.join(current,part); if(await exists(current)) { const s=await fs.lstat(current); if(s.isSymbolicLink()) throw new Error('Symbolic links and junctions are not managed.'); if(current!==target && !s.isDirectory()) throw new Error('Non-directory in managed path.'); } }
  return target;
}
export async function atomicWrite(file:string, content:string|Buffer) {
  await fs.mkdir(path.dirname(file),{recursive:true}); const temp=file+'.'+randomUUID()+'.tmp';
  const handle=await fs.open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  try { await fs.rename(temp,file); } catch(e) { await fs.rm(temp,{force:true}); throw e; }
}
export async function readJson(file:string):Promise<unknown> { return JSON.parse(await fs.readFile(file,'utf8')); }
