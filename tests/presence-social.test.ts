import {describe,it,expect,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {createSocialServer} from '../services/social/server';
import {SocialClient} from '../src/main/social/client';
import {buildActivity} from '../src/main/presence/model';
import {defaultPresencePreferences} from '../src/shared/presence';

async function fixture() {
  const root=await fs.mkdtemp(join(tmpdir(),'usagi-presence-social-')),key='b'.repeat(64);let clock=Date.now();
  const app=createSocialServer({file:join(root,'social.sqlite'),bridgeSecret:key,discordGatewaySecret:'c'.repeat(64),now:()=>clock,verifyIdentity:async token=>{if(token!=='synthetic-verified-minecraft-token')throw new Error('Invalid fixture token');return {uuid:'1'.repeat(32),name:'Alpha'};}});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
  const client=new SocialClient(origin,async()=>({token:'synthetic-verified-minecraft-token'}),()=>{},()=>{},true);await client.connect();
  const bridge=new WebSocket(origin.replace('http:','ws:')+'/v1/realtime');const pending=new Map<string,(value:any)=>void>();
  const ready=new Promise<void>((resolve,reject)=>{bridge.once('error',reject);bridge.on('message',raw=>{const value=JSON.parse(raw.toString());if(value.event==='ready')resolve();if(value.id)pending.get(value.id)?.(value);});});
  bridge.once('open',()=>bridge.send(JSON.stringify({type:'authenticate',role:'server',token:key})));await ready;
  const rpc=(action:unknown)=>new Promise<any>((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>reject(new Error('Fixture bridge timed out')),3000);pending.set(id,value=>{clearTimeout(timer);pending.delete(id);resolve(value);});bridge.send(JSON.stringify({id,action}));});
  return {app,client,bridge,rpc,origin,advance:(value:number)=>{clock+=value;},now:()=>clock,async close(){await client.disconnect();bridge.terminate();await app.close();await fs.rm(root,{recursive:true,force:true});}};
}
const consent={...defaultPresencePreferences(),enabled:true,showMinecraftActivity:true,showDimension:true,showPlayerCount:true,showPlayerNames:true,showEvent:true};
describe('verified Minecraft bridge to private Launcher activity',()=>{
  it('preserves the exact old snapshot contract until the connection advertises Rich Presence support',async()=>{
    const f=await fixture();let legacy:WebSocket|undefined;
    try {
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});
      const response=await fetch(f.origin+'/v1/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({minecraftToken:'synthetic-verified-minecraft-token'})});const session=await response.json() as {token:string};
      legacy=new WebSocket(f.origin.replace('http:','ws:')+'/v1/realtime');const events:any[]=[];const requests=new Map<string,(value:any)=>void>();
      const ready=new Promise<void>((resolve,reject)=>{legacy!.once('error',reject);legacy!.on('message',raw=>{const value=JSON.parse(raw.toString());events.push(value);if(value.event==='ready')resolve();if(value.id)requests.get(value.id)?.(value);});});legacy.once('open',()=>legacy!.send(JSON.stringify({type:'authenticate',role:'launcher',token:session.token})));await ready;
      const snapshot=await new Promise<any>((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>reject(new Error('Legacy snapshot timed out')),3000);requests.set(id,value=>{clearTimeout(timer);resolve(value.data);});legacy!.send(JSON.stringify({id,action:{op:'snapshot'}}));});
      expect(Object.keys(snapshot.preferences).sort()).toEqual(['discoverable','notifications','requestsOpen','visibility']);expect(events.some(value=>value.event==='activity')).toBe(false);expect(f.app.store.presencePreferences(f.client.state.data!.me.id).enabled).toBe(true);
    } finally {legacy?.terminate();await f.close();}
  });
  it('forwards real resource keys/session time, filters names by mutual consent and clears on bridge loss',async()=>{
    const f=await fixture();try {
      const actor=f.client.state.data!.me.id;const beta=f.app.store.identity('2'.repeat(32),'Beta');const gamma=f.app.store.identity('3'.repeat(32),'Gamma');
      f.app.store.action(actor,{op:'request',target:beta});f.app.store.action(beta,{op:'accept',target:actor});
      f.app.store.action(beta,{op:'preferences',visibility:'visible',discoverable:true,requestsOpen:true,notifications:true,presence:consent});
      f.app.store.action(gamma,{op:'preferences',visibility:'visible',discoverable:true,requestsOpen:true,notifications:true,presence:consent});
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});
      const joinedAt=f.now()-60000;
      const result=await f.rpc({op:'players',players:[{uuid:'1'.repeat(32),name:'Alpha',dimension:'aether:moon_garden',joinedAt},{uuid:'2'.repeat(32),name:'Beta',dimension:'minecraft:the_nether',joinedAt},{uuid:'3'.repeat(32),name:'Gamma',dimension:'minecraft:the_end',joinedAt}]});expect(result.ok).toBe(true);
      await expect.poll(()=>f.client.state.activity?.dimension).toBe('aether:moon_garden');expect(f.client.state.activity?.uuid).toBe('1'.repeat(32));expect(f.client.state.activity?.playerCount).toBe(3);expect(f.client.state.activity?.playerNames).toEqual(['Beta']);
      const activity=buildActivity({preferences:consent,accountUuid:'1'.repeat(32),gameRunning:true,launcherStartedAt:joinedAt,observation:f.client.state.activity,now:f.now()});expect(activity?.details).toBe('Exploring Moon Garden');expect(activity?.timestamps.start).toBe(Math.floor(joinedAt/1000));
      f.app.store.action(beta,{op:'preferences',visibility:'visible',discoverable:true,requestsOpen:true,notifications:true,presence:{...consent,showPlayerNames:false}});await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});await expect.poll(()=>f.client.state.activity?.playerNames.length).toBe(0);
      f.bridge.terminate();await expect.poll(()=>f.client.state.activity).toBeNull();
    } finally {await f.close();}
  });
  it('rejects Launcher-supplied observations, applies invisible state and enforces snapshot expiry',async()=>{
    const f=await fixture();try {
      await expect(f.client.action({op:'players',players:[]} as any)).rejects.toThrow();
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});await f.rpc({op:'players',players:[{uuid:'1'.repeat(32),name:'Alpha',dimension:'minecraft:overworld',joinedAt:f.now()}]});await expect.poll(()=>Boolean(f.client.state.activity)).toBe(true);
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,visibility:'invisible',presence:consent});await expect.poll(()=>f.client.state.activity).toBeNull();
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,visibility:'visible',presence:consent});await expect.poll(()=>Boolean(f.client.state.activity)).toBe(true);
      f.advance(45001);await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});await expect.poll(()=>f.client.state.activity).toBeNull();
    } finally {await f.close();}
  });
  it('persists central consent and older preference clients cannot silently reset it',async()=>{
    const f=await fixture();try {
      await f.client.action({op:'preferences',...f.client.state.data!.preferences,presence:consent});await expect.poll(()=>f.client.state.data?.preferences.presence?.enabled).toBe(true);
      const {presence:ignored,...legacy}=f.client.state.data!.preferences;expect(ignored?.enabled).toBe(true);await f.client.action({op:'preferences',...legacy,notifications:false});await expect.poll(()=>f.client.state.data?.preferences.notifications).toBe(false);expect(f.app.store.presencePreferences(f.client.state.data!.me.id)).toEqual(consent);
    } finally {await f.close();}
  });
  it('periodic session expiry preserves a dedicated Discord gateway session',async()=>{
    vi.useFakeTimers({toFake:['setInterval','clearInterval']});const f=await fixture();let discord:WebSocket|undefined;
    try {
      discord=new WebSocket(f.origin.replace('http:','ws:')+'/v1/realtime');const ready=new Promise<void>((resolve,reject)=>{discord!.once('error',reject);discord!.on('message',raw=>{if(JSON.parse(raw.toString()).event==='ready')resolve();});});discord.once('open',()=>discord!.send(JSON.stringify({type:'authenticate',role:'discord',uuid:'1'.repeat(32),token:'c'.repeat(64)})));await ready;
      await vi.advanceTimersByTimeAsync(30001);expect(discord.readyState).toBe(WebSocket.OPEN);
    } finally {discord?.terminate();await f.close();vi.useRealTimers();}
  });
});
