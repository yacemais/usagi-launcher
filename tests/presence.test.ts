import {describe,it,expect} from 'vitest';
import {createServer,type Socket} from 'node:net';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promises as fs} from 'node:fs';
import {buildActivity,dimensionLabel} from '../src/main/presence/model';
import {DiscordPresence,ipcPaths} from '../src/main/presence/rpc';
import {PresenceSettings} from '../src/main/presence/settings';
import {defaultPresencePreferences,type GameObservation} from '../src/shared/presence';
import {commandSchema} from '../src/shared/validation';
import {LauncherPresence} from '../src/main/presence/launcher';
import type {Snapshot} from '../src/shared/types';
import type {SocialClient} from '../src/main/social/client';

async function pipeFixture() {
  const endpoint=process.platform==='win32' ? '\\\\?\\pipe\\usagi-presence-test-'+randomUUID() : join(tmpdir(),'usagi-presence-test-'+randomUUID());
  const packets:any[]=[];const sockets=new Set<Socket>();let fragmented=true;
  const frame=(opcode:number,value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(8);header.writeUInt32LE(opcode,0);header.writeUInt32LE(bytes.length,4);return Buffer.concat([header,bytes]);};
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let buffer=Buffer.alloc(0);socket.on('data',bytes=>{buffer=Buffer.concat([buffer,Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)]);while(buffer.length>=8){const opcode=buffer.readUInt32LE(0),length=buffer.readUInt32LE(4);if(buffer.length<8+length)return;const packet=JSON.parse(buffer.subarray(8,8+length).toString());buffer=buffer.subarray(8+length);packets.push({opcode,...packet});if(opcode===0){const ready=frame(1,{cmd:'DISPATCH',evt:'READY',data:{v:1}});if(fragmented){socket.write(ready.subarray(0,3));setImmediate(()=>{if(!socket.destroyed)socket.write(ready.subarray(3));});}else socket.write(ready);}else if(opcode===1 && socket.writable)socket.write(frame(1,{cmd:packet.cmd,nonce:packet.nonce,evt:null,data:{}}));}});});
  await new Promise<void>(done=>server.listen(endpoint,done));
  return {endpoint,packets,sockets,frame,unfragment:()=>{fragmented=false;},async close(){for(const socket of sockets)socket.destroy();await new Promise<void>(done=>server.close(()=>done()));}};
}
const now=Date.now();const owner='1'.repeat(32);
const source:GameObservation={uuid:owner,serverSession:randomUUID(),observedAt:now,expiresAt:now+45000,joinedAt:now-120000,dimension:'minecraft:overworld',playerCount:12,playerNames:['Alpha','Beta','Gamma'],afk:false,event:null};
const all={enabled:true,showMinecraftActivity:true,showDimension:true,showPlayerCount:true,showPlayerNames:true,showEvent:true};
const input={preferences:all,accountUuid:owner,gameRunning:true,gameStartedAt:now-60000,launcherStartedAt:now-180000,observation:source,now};

describe('privacy-aware activity model',()=>{
  it('defaults off and supports launcher, vanilla/modded dimensions and exact session start',()=>{
    expect(buildActivity({...input,preferences:defaultPresencePreferences()})).toBeNull();
    expect(buildActivity({...input,preferences:{...all,showMinecraftActivity:false}})?.details).toBe('In the Launcher');
    expect(buildActivity(input)?.details).toBe('Exploring the Overworld');expect(buildActivity(input)?.timestamps.start).toBe(Math.floor(source.joinedAt/1000));
    expect(dimensionLabel('minecraft:the_nether')).toBe('the Nether');expect(dimensionLabel('minecraft:the_end')).toBe('The End');expect(dimensionLabel('aether:moon_garden')).toBe('Moon Garden');
    expect(buildActivity({...input,observation:{...source,dimension:'aether:moon_garden'}})?.details).toBe('Exploring Moon Garden');
  });
  it('omits private fields when not consented and rejects stale/cross-account observations',()=>{
    expect(buildActivity({...input,visible:false})).toBeNull();expect(buildActivity({...input,permitted:false})).toBeNull();
    const hidden=buildActivity({...input,preferences:{...all,showDimension:false,showPlayerNames:false,showPlayerCount:false}});expect(hidden?.details).toBe('Playing Usagi SMP');expect(hidden?.state).toBeUndefined();
    const count=buildActivity({...input,preferences:{...all,showPlayerNames:false}});expect(count?.state).toBe('12 players online');
    const stale=buildActivity({...input,now:now+45000});expect(stale?.details).toBe('Playing Minecraft');expect(stale?.state).toBeUndefined();
    expect(buildActivity({...input,accountUuid:'2'.repeat(32)})?.details).toBe('Playing Minecraft');
    expect(buildActivity({...input,observation:{...source,expiresAt:now+999999}})?.state).toBeUndefined();
  });
  it('events override dimensions only within their window and official asset allowlist',()=>{
    const event={id:'moon',name:'Moon Festival',text:'Moon Festival',startsAt:now-1000,endsAt:now+1000,assetKey:'official_moon'};
    const active=buildActivity({...input,observation:{...source,event},largeImage:'official_usagi',eventAssets:['official_moon']});expect(active?.details).toBe('Moon Festival');expect(active?.assets?.large_image).toBe('official_moon');
    expect(buildActivity({...input,observation:{...source,event},now:now+1000})?.details).toBe('Exploring the Overworld');
    expect(buildActivity({...input,observation:{...source,event},preferences:{...all,showEvent:false}})?.details).toBe('Exploring the Overworld');
    expect(buildActivity({...input,observation:{...source,event},largeImage:'official_usagi',eventAssets:[]})?.assets?.large_image).toBe('official_usagi');
  });
});
describe('real isolated Discord IPC transport',()=>{
  it('handshakes with the official application, parses fragmented frames, deduplicates and clears',async()=>{
    const fixture=await pipeFixture();const rpc=new DiscordPresence(()=>{},{paths:()=>[fixture.endpoint],minimumInterval:0,retryDelay:20});
    try {
      const activity=buildActivity(input)!;for(let i=0;i<5;i++)rpc.update(activity);
      await expect.poll(()=>fixture.packets.filter(packet=>packet.cmd==='SET_ACTIVITY').length).toBe(1);
      expect(fixture.packets[0]).toMatchObject({opcode:0,v:1,client_id:'1565378499731263570'});expect(fixture.packets[1].args.activity).toEqual(activity);expect(JSON.stringify(fixture.packets)).not.toContain('token');
      await expect.poll(()=>rpc.state.status).toBe('connected');rpc.update(null);
      await expect.poll(()=>fixture.packets.at(-1)?.args?.activity).toBeNull();
      expect(rpc.state.status).toBe('disabled');
    } finally {rpc.close();await fixture.close();}
  });
  it('reconnects after Discord restart and answers ping without leaking credentials',async()=>{
    const fixture=await pipeFixture();const rpc=new DiscordPresence(()=>{},{paths:()=>[fixture.endpoint],minimumInterval:0,retryDelay:20});
    try {
      rpc.update(buildActivity(input));await expect.poll(()=>rpc.state.status).toBe('connected');
      const socket=[...fixture.sockets][0];socket.write(fixture.frame(3,{ping:'bounded'}));await expect.poll(()=>fixture.packets.some(packet=>packet.opcode===4 && packet.ping==='bounded')).toBe(true);
      socket.destroy();await expect.poll(()=>fixture.packets.filter(packet=>packet.opcode===0).length).toBe(2);await expect.poll(()=>rpc.state.status).toBe('connected');
    } finally {rpc.close();await fixture.close();}
  });
  it('never opens a connection while disabled and bounds invalid server frame lengths',async()=>{
    const fixture=await pipeFixture();const rpc=new DiscordPresence(()=>{},{paths:()=>[fixture.endpoint],minimumInterval:0,retryDelay:1000});
    try {
      rpc.update(null);expect(fixture.packets).toHaveLength(0);rpc.update(buildActivity(input));await expect.poll(()=>rpc.state.status).toBe('connected');
      const header=Buffer.alloc(8);header.writeUInt32LE(1,0);header.writeUInt32LE(1000000,4);[...fixture.sockets][0].write(header);await expect.poll(()=>rpc.state.status).toBe('unavailable');rpc.close();
    } finally {rpc.close();await fixture.close();}
  });
});
it('privacy storage isolates Minecraft accounts and rejects arbitrary activity or identity IPC fields',async()=>{
  const root=await fs.mkdtemp(join(tmpdir(),'usagi-presence-settings-'));
  try {
    const first=new PresenceSettings(root);await first.load();await first.save(owner,all);const second=new PresenceSettings(root);await second.load();expect(second.get(owner).enabled).toBe(true);expect(second.get('2'.repeat(32)).enabled).toBe(false);expect(second.get('launcher').enabled).toBe(false);
    expect(commandSchema.safeParse({type:'presence.preferences',preferences:{...all,uuid:owner}}).success).toBe(false);expect(commandSchema.safeParse({type:'presence.activity',dimension:'forged'}).success).toBe(false);
    expect(ipcPaths('win32')).toHaveLength(10);expect(ipcPaths('win32')[0]).toBe('\\\\?\\pipe\\discord-ipc-0');expect(ipcPaths('linux',{XDG_RUNTIME_DIR:'/run/test'} as NodeJS.ProcessEnv)[0]).toBe('/run/test/discord-ipc-0');
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

it('Launcher lifecycle clears presence on profile revocation/account switch without reentrant reconnections',async()=>{
  const fixture=await pipeFixture(),root=await fs.mkdtemp(join(tmpdir(),'usagi-presence-lifecycle-'));
  let snapshot={profiles:[{id:owner,accountId:'account-a',name:'Alpha'},{id:'2'.repeat(32),accountId:'account-b',name:'Beta'}],selectedAccount:'account-a',phase:'idle',social:{status:'unconfigured'}} as Snapshot;
  const launcher=new LauncherPresence(root,()=>launcher.observe(snapshot),()=>undefined,{}, {paths:()=>[fixture.endpoint],minimumInterval:15000,retryDelay:20});
  try {
    launcher.observe(snapshot);await launcher.initialise();await launcher.configure(all);await expect.poll(()=>fixture.packets.at(-1)?.args?.activity?.details).toBe('In the Launcher');
    snapshot={...snapshot,social:{status:'connected',presencePermitted:true,presencePolicyExpiresAt:null,activity:{...source,observedAt:Date.now(),expiresAt:Date.now()+45000},data:{preferences:{visibility:'visible',presence:all}}} as any};launcher.observe(snapshot);
    await expect.poll(()=>fixture.packets.at(-1)?.args?.activity?.details).toBe('Exploring the Overworld');
    snapshot.social!.activity!.playerNames=[];launcher.observe(snapshot);await expect.poll(()=>fixture.packets.at(-1)?.args?.activity?.state).toBe('12 players online');
    snapshot.social!.data!.preferences.presence={...all,enabled:false};launcher.observe(snapshot);await expect.poll(()=>fixture.packets.at(-1)?.args?.activity).toBeNull();expect(launcher.state.status.status).toBe('disabled');
    snapshot={...snapshot,selectedAccount:'account-b'};launcher.observe(snapshot);expect(launcher.state.preferences.enabled).toBe(false);expect(launcher.state.status.status).toBe('disabled');
  } finally {launcher.close();await fixture.close();await fs.rm(root,{recursive:true,force:true});}
});

it('account switches during a preference save never apply consent to the new Social account',async()=>{
  const fixture=await pipeFixture(),root=await fs.mkdtemp(join(tmpdir(),'usagi-presence-save-race-'));let calls=0;
  const source={state:{status:'connected',data:{preferences:{presence:all,visibility:'visible'}}},action:async()=>{calls++;}} as unknown as SocialClient;
  const first={profiles:[{id:owner,accountId:'account-a',name:'Alpha'},{id:'2'.repeat(32),accountId:'account-b',name:'Beta'}],selectedAccount:'account-a',phase:'idle',social:source.state} as Snapshot;
  const launcher=new LauncherPresence(root,()=>{},()=>source,{}, {paths:()=>[fixture.endpoint],minimumInterval:0});
  try {
    await launcher.initialise();launcher.observe(first);const saving=launcher.configure(all);launcher.observe({...first,selectedAccount:'account-b'});await expect(saving).rejects.toThrow('account changed');expect(calls).toBe(0);expect(launcher.state.preferences.enabled).toBe(false);
  } finally {launcher.close();await fixture.close();await fs.rm(root,{recursive:true,force:true});}
});

it('a failed Social preference update cannot re-enable a locally disabled presence',async()=>{
  const fixture=await pipeFixture(),root=await fs.mkdtemp(join(tmpdir(),'usagi-presence-disable-'));const store=new PresenceSettings(root);await store.save(owner,all);
  const snapshot={profiles:[{id:owner,accountId:'account-a',name:'Alpha'}],selectedAccount:'account-a',phase:'idle',social:{status:'connected',presencePermitted:true,presencePolicyExpiresAt:null,activity:null,data:{preferences:{visibility:'visible',presence:all}}}} as Snapshot;
  const social={state:snapshot.social,action:async()=>{throw new Error('Simulated source outage');}} as unknown as SocialClient;
  const launcher=new LauncherPresence(root,()=>launcher.observe(snapshot),()=>social,{}, {paths:()=>[fixture.endpoint],minimumInterval:0,retryDelay:20});
  try {
    launcher.observe(snapshot);await launcher.initialise();await expect.poll(()=>fixture.packets.at(-1)?.args?.activity?.details).toBe('In the Launcher');
    await expect(launcher.configure({...all,enabled:false})).rejects.toThrow('Saved on this device');await expect.poll(()=>fixture.packets.at(-1)?.args?.activity).toBeNull();expect(launcher.state.status.status).toBe('disabled');
    const reopened=new PresenceSettings(root);await reopened.load();expect(reopened.get(owner).enabled).toBe(false);
  } finally {launcher.close();await fixture.close();await fs.rm(root,{recursive:true,force:true});}
});
