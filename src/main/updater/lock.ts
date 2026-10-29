import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { exists,safePath } from '../security/files';
const ownerSchema=z.object({pid:z.number().int().positive(),id:z.string().uuid()}).strict();
export async function packLock(root:string,create:boolean):Promise<()=>Promise<void>>{
  const directory=await safePath(root,'.celestia');
  if(!create&&!await exists(directory))return async()=>{};
  await fs.mkdir(directory,{recursive:true});const file=await safePath(root,'.celestia/update.lock');
  const owner={pid:process.pid,id:randomUUID()};
  for(let attempt=0;attempt<2;attempt++){
    let handle;
    try{handle=await fs.open(file,'wx',0o600);}catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      const content=await fs.readFile(file,'utf8');let previous;
      try{previous=ownerSchema.parse(JSON.parse(content));}catch{throw new Error('Modpack lock is incomplete. Close other launcher processes and retain update metadata for recovery.');}
      try{process.kill(previous.pid,0);}catch(probe){if((probe as NodeJS.ErrnoException).code==='ESRCH'){
        if(await fs.readFile(file,'utf8')!==content)throw new Error('Modpack operation lock changed. Retry later.');await fs.unlink(file);continue;
      }}
      throw new Error('A modpack operation is already running in another launcher process.');
    }
    try{await handle.writeFile(JSON.stringify(owner));await handle.sync();}catch(error){await handle.close();await fs.rm(file,{force:true});throw error;}await handle.close();
    return async()=>{const current=ownerSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));if(current.id!==owner.id)throw new Error('Modpack lock ownership changed. Retain metadata for recovery.');await fs.unlink(file);};
  }
  throw new Error('Could not acquire the modpack operation lock.');
}
