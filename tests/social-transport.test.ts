import { describe,it,expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID,randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { createSocialServer } from '../services/social/server';
import { SocialClient } from '../src/main/social/client';
import type { SocialAction } from '../src/shared/social';

async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'Usagi protocol ')),secret=randomBytes(32).toString('base64url');
  const identities:Record<string,{uuid:string;name:string}>={['a'.repeat(32)]:{uuid:'1'.repeat(32),name:'Alpha'},['b'.repeat(32)]:{uuid:'2'.repeat(32),name:'Beta'},['c'.repeat(32)]:{uuid:'3'.repeat(32),name:'Gamma'}};
  const app=createSocialServer({file:path.join(root,'social.sqlite'),bridgeSecret:secret,verifyIdentity:async token=>{if(!identities[token])throw new Error('Invalid test identity.');return identities[token];}});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+(app.server.address() as any).port;
  const token=async(key:string)=>{const r=await fetch(origin+'/v1/session',{method:'POST',body:JSON.stringify({minecraftToken:key.repeat(32)}),headers:{'Content-Type':'application/json'}});return (await r.json()).token as string;};
  return {root,secret,app,origin,token,async close(){await app.close();await fs.rm(root,{recursive:true,force:true});}};
}
async function peer(origin:string,role:'server'|'launcher',token:string){
  const ws=new WebSocket(origin.replace('http:','ws:')+'/v1/realtime'),events:any[]=[];const pending=new Map<string,(v:any)=>void>();
  ws.on('message',raw=>{const data=JSON.parse(raw.toString());events.push(data);if(data.id&&pending.has(data.id)){pending.get(data.id)!(data);pending.delete(data.id);}});
  await new Promise<void>((resolve,reject)=>{ws.once('open',()=>{ws.send(JSON.stringify({type:'authenticate',role,token}));});const timer=setTimeout(()=>reject(new Error('Peer auth timeout')),3000);ws.on('message',raw=>{if(JSON.parse(raw.toString()).event==='ready'){clearTimeout(timer);resolve();}});});
  return {ws,events,rpc(action:unknown){return new Promise<any>((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>reject(new Error('RPC timeout')),3000);pending.set(id,result=>{clearTimeout(timer);resolve(result);});ws.send(JSON.stringify({id,action}));});}};
}
describe('real local HTTP/WebSocket/SQLite integration with a test-only identity verifier',()=>{
  it('routes private messages bidirectionally between a launcher and an authenticated server peer',async()=>{
    const t=await setup();try{
      const alpha=await peer(t.origin,'launcher',await t.token('a')),gamma=await peer(t.origin,'launcher',await t.token('c')),forge=await peer(t.origin,'server',t.secret);
      await forge.rpc({op:'players',players:[{uuid:'2'.repeat(32),name:'Beta'}]});
      const a=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Alpha')!.id,b=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Beta')!.id;
      expect((await alpha.rpc({op:'request',target:b})).ok).toBe(true);
      expect((await forge.rpc({op:'command',uuid:'2'.repeat(32),action:{op:'accept',target:a}})).ok).toBe(true);
      const request={op:'message',target:b,text:'Launcher to Minecraft',clientId:randomUUID()};await alpha.rpc(request);await alpha.rpc(request);
      await expect.poll(()=>forge.events.filter(e=>e.event==='minecraft.message').length).toBeGreaterThan(0);
      const delivered=forge.events.find(e=>e.event==='minecraft.message');expect(delivered.message.text).toBe('Launcher to Minecraft');
      expect(t.app.store.rows('SELECT * FROM messages')).toHaveLength(1);
      await forge.rpc({op:'ack',uuid:'2'.repeat(32),messageId:delivered.message.id});
      await forge.rpc({op:'command',uuid:'2'.repeat(32),action:{op:'message',target:a,text:'Minecraft reply',clientId:randomUUID()}});
      await expect.poll(()=>alpha.events.some(e=>e.event==='message'&&e.message.text==='Minecraft reply')).toBe(true);
      expect(gamma.events.some(e=>e.event==='message'||e.event==='minecraft.message')).toBe(false);
      expect((await gamma.rpc({op:'history',target:b})).ok).toBe(false);
      expect((await alpha.rpc({op:'message',target:b,text:'forged',clientId:randomUUID(),sender:b})).ok).toBe(false);
      expect((await forge.rpc({op:'command',uuid:'3'.repeat(32),action:{op:'snapshot'}})).ok).toBe(false);
    }finally{await t.close();}
  });
  it('replays an offline Minecraft inbox on reconnect and stops replay after recipient acknowledgment',async()=>{
    const t=await setup();try{
      const alpha=await peer(t.origin,'launcher',await t.token('a'));await t.token('b');
      const a=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Alpha')!.id,b=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Beta')!.id;
      t.app.store.action(a,{op:'request',target:b});t.app.store.action(b,{op:'accept',target:a});
      await alpha.rpc({op:'message',target:b,text:'Waiting while offline',clientId:randomUUID()});
      const forge=await peer(t.origin,'server',t.secret);await forge.rpc({op:'players',players:[{uuid:'2'.repeat(32),name:'Beta'}]});
      await expect.poll(()=>forge.events.some(e=>e.event==='minecraft.message')).toBe(true);
      const m=forge.events.find(e=>e.event==='minecraft.message');await forge.rpc({op:'ack',uuid:'2'.repeat(32),messageId:m.message.id});
      const count=forge.events.filter(e=>e.event==='minecraft.message').length;await forge.rpc({op:'players',players:[{uuid:'2'.repeat(32),name:'Beta'}]});
      expect(forge.events.filter(e=>e.event==='minecraft.message')).toHaveLength(count);
    }finally{await t.close();}
  });
  it('reconnects the real launcher client and keeps message rendering idempotent',async()=>{
    const t=await setup();let client:SocialClient|undefined;try{
      client=new SocialClient(t.origin,async()=>({token:'a'.repeat(32)}),()=>{},()=>{},true);await client.connect();
      await expect.poll(()=>client!.state.data?.me.username).toBe('Alpha');
      const a=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Alpha')!.id;await t.token('b');const b=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Beta')!.id;
      await client.action({op:'request',target:b});t.app.store.action(b,{op:'accept',target:a});
      const action:SocialAction={op:'message',target:b,text:'only once',clientId:randomUUID()};await client.action(action);await client.action(action);expect(client.state.conversations[b]).toHaveLength(1);
      const transport=(client as any).socket as globalThis.WebSocket;const dropped=new Promise<void>(resolve=>transport.addEventListener('close',()=>resolve(),{once:true}));transport.close();await dropped;
      await expect.poll(()=>client!.state.status,{timeout:8000}).toBe('connected');await client.action({op:'history',target:b});expect(client.state.conversations[b]).toHaveLength(1);
    }finally{await client?.disconnect();await t.close();}
  });
  it('rejects forged identity fields, wrong server credentials and message spam',async()=>{
    const t=await setup();try{
      const response=await fetch(t.origin+'/v1/session',{method:'POST',body:JSON.stringify({minecraftToken:'a'.repeat(32),uuid:'2'.repeat(32)}),headers:{'Content-Type':'application/json'}});expect(response.status).toBe(400);
      const alpha=await peer(t.origin,'launcher',await t.token('a'));const a=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Alpha')!.id;await t.token('b');const b=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Beta')!.id;
      t.app.store.action(a,{op:'request',target:b});t.app.store.action(b,{op:'accept',target:a});
      let last:any;for(let i=0;i<31;i++)last=await alpha.rpc({op:'message',target:b,text:'rate '+i,clientId:randomUUID()});expect(last.code).toBe('rate_limit');
      const ws=new WebSocket(t.origin.replace('http:','ws:')+'/v1/realtime');await new Promise<void>(resolve=>ws.once('open',resolve));const closed=new Promise<number>(resolve=>ws.once('close',resolve));ws.send(JSON.stringify({type:'authenticate',role:'server',token:'invalid'.repeat(8)}));expect(await closed).toBe(1008);
    }finally{await t.close();}
  });
  it('cancels a pending account connection without publishing a stale Social identity',async()=>{
    const t=await setup();let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});const client=new SocialClient(t.origin,async()=>{await gate;return {token:'a'.repeat(32)};},()=>{},()=>{},true);
    try{const connecting=client.connect();const disconnecting=client.disconnect();release();await Promise.all([connecting,disconnecting]);expect(client.state.status).toBe('disconnected');expect(client.state.data).toBeUndefined();expect(t.app.store.rows('SELECT * FROM sessions')).toHaveLength(0);}finally{await client.disconnect();await t.close();}
  });
  it('restores sessions, friendship and queued messages when the backend restarts',async()=>{
    const t=await setup();let replacement:ReturnType<typeof createSocialServer>|undefined;let originalClosed=false;const client=new SocialClient(t.origin,async()=>({token:'a'.repeat(32)}),()=>{},()=>{},true);
    try{
      await client.connect();await t.token('b');const a=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Alpha')!.id,b=t.app.store.row('SELECT id FROM users WHERE minecraft_name=?','Beta')!.id;
      await client.action({op:'request',target:b});t.app.store.action(b,{op:'accept',target:a});await client.action({op:'message',target:b,text:'Durable across a service restart',clientId:randomUUID()});
      await t.app.close();originalClosed=true;replacement=createSocialServer({file:path.join(t.root,'social.sqlite'),bridgeSecret:t.secret});await new Promise<void>(resolve=>replacement!.server.listen(Number(new URL(t.origin).port),'127.0.0.1',resolve));
      await expect.poll(()=>client.state.status,{timeout:8000}).toBe('connected');await client.action({op:'history',target:b});expect(client.state.conversations[b][0].text).toBe('Durable across a service restart');expect(replacement.store.pending(b,'minecraft')).toHaveLength(1);
    }finally{await client.disconnect();if(replacement)await replacement.close();if(!originalClosed)await t.app.close();await fs.rm(t.root,{recursive:true,force:true});}
  });
});
