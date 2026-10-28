import { describe,it,expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Downloads } from '../src/main/installer/downloads';
import { safePath } from '../src/main/security/files';
describe('download cancellation and worker lifetime',()=>{
  it('aborts an active stream and removes partial files',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'Celestia cancel '));const abort=new AbortController();
    try {
      let cancelled=false;
      const downloads=new Downloads(p=>{if(p.downloaded>0)abort.abort(new Error('cancel fixture'));},async file=>{await safePath(root,path.basename(file));},async(_url,options)=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));options?.signal?.addEventListener('abort',()=>{cancelled=true;c.error(options.signal?.reason);},{once:true});}})));
      await expect(downloads.run([{path:path.join(root,'a.jar'),urls:['https://fixture.invalid/a'],size:100}],abort.signal,1)).rejects.toThrow();
      expect(cancelled).toBe(true);expect(await fs.readdir(root)).toEqual([]);
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
  it('waits for parallel workers to stop after a fatal checksum failure',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'Celestia workers '));let stopped=false;
    try {
      const downloads=new Downloads(()=>{},async file=>{await safePath(root,path.basename(file));},async(url,options)=>{
        if(url.endsWith('/bad'))return new Response('bad');
        return new Response(new ReadableStream({start(c){options?.signal?.addEventListener('abort',()=>{stopped=true;c.error(options.signal?.reason);},{once:true});}}));
      });
      await expect(downloads.run([{path:path.join(root,'bad.jar'),urls:['https://fixture.invalid/bad'],size:3,checksum:{algorithm:'sha256',value:createHash('sha256').update('yes').digest('hex')}},{path:path.join(root,'slow.jar'),urls:['https://fixture.invalid/slow'],size:100}],new AbortController().signal,2)).rejects.toThrow(/checksum/);
      expect(stopped).toBe(true);expect(await fs.readdir(root)).toEqual([]);
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
});
