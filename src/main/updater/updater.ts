import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Progress } from '../../shared/types';
import { atomicWrite, exists, hashFile, readJson, safePath } from '../security/files';
import { secureFetch, limitedBytes } from '../security/network';
import { Downloads, type Fetcher } from '../installer/downloads';
import { signedManifest, validatePackPath, type PackManifest } from './manifest';
const tracked=z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),policy:z.enum(['managed','seed'])}).strict();
const ledgerSchema=z.object({version:z.string(),sequence:z.number().int().nonnegative(),files:z.record(z.string(),tracked),envelope:z.unknown()}).strict();
type Ledger=z.infer<typeof ledgerSchema>;
const operationSchema=z.object({file:z.string(),oldHash:z.string().optional(),newHash:z.string().optional()}).strict();
const journalSchema=z.object({id:z.string().uuid(),phase:z.enum(['prepared','committed']),oldLedger:ledgerSchema.nullable(),operations:z.array(operationSchema)}).strict();
export class PackUpdater {
  constructor(public root:string,private report:(p:Progress)=>void,private fetcher:Fetcher=secureFetch) {}
  private async meta(name:string) { return safePath(this.root,'.celestia/'+name); }
  async ledger():Promise<Ledger|undefined> { const p=await this.meta('installed.json'); return await exists(p) ? ledgerSchema.parse(await readJson(p)) : undefined; }
  async check(url:string,key:string,signal:AbortSignal) { const old=await this.ledger(); const bytes=await limitedBytes(await this.fetcher(url,{signal}),6*1024*1024); const envelope:unknown=JSON.parse(bytes.toString('utf8')); const manifest=signedManifest(envelope,key,{minimumSequence:old?.sequence}); if(old && manifest.sequence===old.sequence && JSON.stringify(envelope)!==JSON.stringify(old.envelope))throw new Error('A published sequence cannot be reused with different content.'); return {manifest,envelope,updateAvailable:!old || manifest.sequence>old.sequence}; }
  async verify(key:string,optional:string[]):Promise<{ready:boolean;version?:string;reason?:string}> {
    await this.recover(); const old=await this.ledger(); if(!old) return {ready:false,reason:'No signed modpack is installed.'};
    const pack=signedManifest(old.envelope,key,{minimumSequence:old.sequence,checkExpiry:false});
    if(pack.version!==old.version || pack.sequence!==old.sequence) throw new Error('Installed manifest metadata is inconsistent.');
    for(const item of pack.files.filter(f=>!f.optional || optional.includes(f.path))) {
      const file=await safePath(this.root,item.path); if(!await exists(file)) return {ready:false,version:old.version,reason:'Missing '+item.path};
      if(item.policy==='managed' && await hashFile(file)!==item.sha256) return {ready:false,version:old.version,reason:'Changed '+item.path};
    }
    for(const [name,item] of Object.entries(old.files)) if(item.policy==='managed' && !pack.files.some(f=>f.path===name && (!f.optional || optional.includes(f.path)))) return {ready:false,version:old.version,reason:'Optional selection needs an update.'};
    return {ready:true,version:old.version};
  }
  async update(manifest:PackManifest,envelope:unknown,optional:string[],signal:AbortSignal,concurrency:number) {
    await this.recover(); const old=await this.ledger(); if(old && manifest.sequence<old.sequence) throw new Error('Manifest rollback was rejected.');
    if(old && manifest.sequence===old.sequence && JSON.stringify(old.envelope)!==JSON.stringify(envelope)) throw new Error('A published sequence cannot be reused with different content.');
    const id=randomUUID(), prefix=`.celestia/transactions/${id}`; const operations:z.infer<typeof operationSchema>[]=[]; const next:Ledger={version:manifest.version,sequence:manifest.sequence,files:{},envelope}; const downloads=[];
    const selected=manifest.files.filter(f=>!f.optional || optional.includes(f.path));
    for(const item of selected) {
      signal.throwIfAborted(); validatePackPath(item.path); const target=await safePath(this.root,item.path); const has=await exists(target); const actual=has ? await hashFile(target) : undefined;
      if(item.policy==='seed' && has) { if(old?.files[item.path]) next.files[item.path]=old.files[item.path]; continue; }
      if(actual===item.sha256) { next.files[item.path]={sha256:item.sha256,policy:item.policy}; continue; }
      if(has && !old?.files[item.path]) throw new Error('An untracked file would be overwritten: '+item.path);
      next.files[item.path]={sha256:item.sha256,policy:item.policy}; operations.push({file:item.path,oldHash:actual,newHash:item.sha256});
      downloads.push({path:await safePath(this.root,`${prefix}/stage/${item.path}`),urls:[item.url],size:item.size,checksum:{algorithm:'sha256',value:item.sha256}});
    }
    for(const [name,record] of Object.entries(old?.files ?? {})) {
      validatePackPath(name); if(selected.some(f=>f.path===name) || record.policy!=='managed') continue;
      const target=await safePath(this.root,name); if(await exists(target) && await hashFile(target)===record.sha256) operations.push({file:name,oldHash:record.sha256});
    }
    const guard=async(file:string)=>{const rel=path.relative(this.root,file).split(path.sep).join('/'); if(await safePath(this.root,rel)!==file) throw new Error('Invalid staging path.');};
    await new Downloads(this.report,guard,this.fetcher).run(downloads,signal,concurrency,'Downloading modpack'); signal.throwIfAborted();
    for(const operation of operations) {
      const target=await safePath(this.root,operation.file); const actual=await exists(target) ? await hashFile(target) : undefined;
      if(actual!==operation.oldHash) throw new Error('File changed during update: '+operation.file);
      if(operation.oldHash) { const backup=await safePath(this.root,`${prefix}/backup/${operation.file}`); await fs.mkdir(path.dirname(backup),{recursive:true}); await fs.copyFile(target,backup); const h=await fs.open(backup,'r+');try{await h.sync();}finally{await h.close();} if(await hashFile(backup)!==operation.oldHash)throw new Error('File changed while its backup was being prepared.'); }
    }
    const journal={id,phase:'prepared' as const,oldLedger:old ?? null,operations}; await atomicWrite(await this.meta('journal.json'),JSON.stringify(journal));
    try {
      // Cancellation is deferred while the prepared file transaction commits or rolls back.
      for(const operation of operations) {
        const target=await safePath(this.root,operation.file); await fs.mkdir(path.dirname(target),{recursive:true});
        if((await exists(target)?await hashFile(target):undefined)!==operation.oldHash)throw new Error('File changed before replacement: '+operation.file);
        if(operation.newHash) await fs.rename(await safePath(this.root,`${prefix}/stage/${operation.file}`),target); else await fs.unlink(target);
      }
      await atomicWrite(await this.meta('installed.json'),JSON.stringify(next)); await atomicWrite(await this.meta('journal.json'),JSON.stringify({...journal,phase:'committed'}));
      await fs.unlink(await this.meta('journal.json'));
    } catch(error) { await this.recover(); throw error; }
  }
  async recover() {
    const file=await this.meta('journal.json'); if(!await exists(file)) return;
    const journal=journalSchema.parse(await readJson(file));
    if(journal.phase==='prepared') {
      for(const operation of [...journal.operations].reverse()) {
        validatePackPath(operation.file); const target=await safePath(this.root,operation.file); const actual=await exists(target) ? await hashFile(target) : undefined;
        if(actual===operation.oldHash) continue;
        if(actual!==operation.newHash) throw new Error('Recovery conflict; retain files and contact support: '+operation.file);
        if(operation.oldHash) { const backup=await safePath(this.root,`.celestia/transactions/${journal.id}/backup/${operation.file}`); if(!await exists(backup) || await hashFile(backup)!==operation.oldHash) throw new Error('Recovery backup is missing or corrupt.'); await fs.mkdir(path.dirname(target),{recursive:true}); const temp=target+'.'+randomUUID()+'.restore';await fs.copyFile(backup,temp);const handle=await fs.open(temp,'r+');try{await handle.sync();}finally{await handle.close();}await fs.rename(temp,target); }
        else if(await exists(target)) await fs.unlink(target);
      }
      const ledger=await this.meta('installed.json'); if(journal.oldLedger) await atomicWrite(ledger,JSON.stringify(journal.oldLedger)); else await fs.rm(ledger,{force:true});
    }
    await fs.unlink(file);
  }
}
