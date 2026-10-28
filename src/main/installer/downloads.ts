import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { InstallFile } from '@xmcl/installer';
import type { Progress } from '../../shared/types';
import { exists, hashFile } from '../security/files';
import { secureFetch } from '../security/network';
export type Fetcher = (url:string,options?:RequestInit)=>Promise<Response>;
export class Downloads {
  constructor(private report:(progress:Progress)=>void, private guard:(file:string)=>Promise<void>, private fetcher:Fetcher=secureFetch) {}
  async run(files:InstallFile[], signal:AbortSignal, concurrency=4, phase='Downloading') {
    const controller=new AbortController(); signal=AbortSignal.any([signal,controller.signal]);
    const pending:InstallFile[]=[];
    for(const file of files) { signal.throwIfAborted(); await this.guard(file.path); if(await exists(file.path) && await this.valid(file)) continue; pending.push(file); }
    const current=new Map<string,number>(); let done=0, completed=0, index=0; const started=Date.now();
    const total=pending.every(f=>typeof f.size==='number') ? pending.reduce((n,f)=>n+f.size!,0) : 0;
    const emit=(file:string)=> { const downloaded=completed+[...current.values()].reduce((a,b)=>a+b,0); this.report({phase,file,downloaded,total,speed:downloaded/Math.max((Date.now()-started)/1000,0.1),filesDone:done,filesTotal:pending.length}); };
    let firstError:unknown;
    const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,pending.length)},async()=>{try{
      while(index<pending.length) {
        const file=pending[index++]; let last:unknown;
        for(let attempt=0;attempt<3;attempt++) {
          signal.throwIfAborted(); current.set(file.path,0); emit(path.basename(file.path));
          try { await this.one(file,signal,n=>{current.set(file.path,n);emit(path.basename(file.path));}); last=undefined; break; }
          catch(error) { last=error; if(signal.aborted) throw error; if(attempt<2) await new Promise<void>((resolve,reject)=>{ const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},300*2**attempt); const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true}); }); }
        }
        if(last) throw last; completed+=current.get(file.path) ?? 0; current.delete(file.path); done++; emit(path.basename(file.path));
      }
    }catch(error){if(!firstError)firstError=error;controller.abort(error);throw error;}}));
    if(firstError)throw firstError;
  }
  private async valid(file:InstallFile) { const s=await fs.stat(file.path); return s.isFile() && (file.size===undefined || s.size===file.size) && (!file.checksum || await hashFile(file.path,file.checksum.algorithm)===file.checksum.value.toLowerCase()); }
  private async one(file:InstallFile,signal:AbortSignal,onBytes:(n:number)=>void) {
    if(!file.urls.length) throw new Error('No download source for '+path.basename(file.path));
    await this.guard(file.path); await fs.mkdir(path.dirname(file.path),{recursive:true});
    const temp=file.path+'.'+randomUUID()+'.part'; let failure:unknown;
    for(const url of file.urls) {
      try {
        const response=await this.fetcher(url,{signal}); if(!response.body) throw new Error('Download response has no body.');
        const handle=await fs.open(temp,'wx',0o600); const hash=createHash(file.checksum?.algorithm ?? 'sha256'); let count=0;
        try { for await(const part of response.body) { signal.throwIfAborted(); count+=part.length; if(count>(file.size ?? 1024*1024*1024)) throw new Error('Downloaded file exceeds expected size.'); hash.update(part); await handle.writeFile(part); onBytes(count); } await handle.sync(); } finally { await handle.close(); }
        if(file.size!==undefined && count!==file.size) throw new Error('Downloaded file size does not match.');
        const digest=hash.digest('hex'); if(file.checksum && digest!==file.checksum.value.toLowerCase()) throw new Error('Downloaded checksum does not match: '+path.basename(file.path));
        await this.guard(file.path); await fs.rename(temp,file.path); return;
      } catch(e) { await fs.rm(temp,{force:true}); failure=e; if(signal.aborted) throw e; }
    }
    throw failure;
  }
}
