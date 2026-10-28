import { describe,it,expect,vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
vi.mock('../src/main/minecraft/runtime',()=>({MinecraftRuntime:class {
  async launch(){throw new Error('Configure the explicit process fixture.');}
}}));
import { Controller } from '../src/main/controller';
describe('real child-process exit handling with mocked game prerequisites',()=>{
  it('blocks launching a known outdated pack before requesting account tokens',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'Celestia update gate '));
    try{const c=new Controller(root,{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()},()=>{},async()=>undefined);c.state.phase='idle';c.state.installedVersion='one';c.state.availableVersion='two';vi.spyOn(c as unknown as {verifyInternal():Promise<void>},'verifyInternal').mockImplementation(async()=>{c.state.installation='ready';});const auth=vi.spyOn(c.accounts,'session');await c.launch(()=>{});expect(c.state.error).toContain('update');expect(auth).not.toHaveBeenCalled();}
    finally{vi.restoreAllMocks();await fs.rm(root,{recursive:true,force:true});}
  });
  it('records a failed child exit, returns to idle, and logs output',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'Celestia process fixture '));
    try{
      let complete:()=>void=()=>{};const ended=new Promise<void>(resolve=>{complete=resolve;});
      const c=new Controller(root,{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()},s=>{if(s.gameExit)complete();},async()=>undefined);
      c.state.phase='idle';
      vi.spyOn(c as unknown as {verifyInternal():Promise<void>},'verifyInternal').mockImplementation(async()=>{c.state.installation='ready';});
      vi.spyOn(c.accounts,'session').mockResolvedValue({token:'test-only-token',profile:{id:'00112233445566778899aabbccddeeff',name:'Fixture',accountId:'fixture-account'}});
      vi.spyOn(c.runtime,'launch').mockImplementation(async()=>spawn(process.execPath,['-e','process.stderr.write("fixture child error"); setTimeout(()=>process.exit(7),100)'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']}));
      await c.launch(()=>{});expect(c.state.phase).toBe('playing');await expect(c.launch(()=>{})).rejects.toThrow(/operation/);
      await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Child exit not observed.')),5000))]);
      expect(c.state.phase).toBe('idle');expect(c.state.gameExit?.code).toBe(7);expect(c.state.gameExit?.crashed).toBe(true);expect(await fs.readFile(path.join(root,'logs/game.log'),'utf8')).toContain('fixture child error');
    }finally{vi.restoreAllMocks();await fs.rm(root,{recursive:true,force:true});}
  });
});
