import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync,createHash,sign } from 'node:crypto';
import { PackUpdater } from '../src/main/updater/updater';
import { signedManifest } from '../src/main/updater/manifest';
import { prepareRelease,signPreparedRelease,validatePreparedRelease,stagePrism,excludedClientFile,zipMetadata,type Review } from '../tools/modpack-staging';
import { choosePackFeed,githubReleases,REPOSITORY } from '../tools/modpack-feed';
import type { GithubRelease } from '../tools/github-feed';
const keys=generateKeyPairSync('ed25519'),key=keys.publicKey.export({type:'spki',format:'pem'}).toString();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
let root:string;
const signal=()=>new AbortController().signal;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'Usagi distribution '));});
afterEach(async()=>{vi.restoreAllMocks();await fs.rm(root,{recursive:true,force:true});});
function release(version:string,sequence:number,content:Record<string,string>,minLauncherVersion='0.4.0',policies:Record<string,'managed'|'seed'>={}){
  const manifest={schemaVersion:1,sequence,version,minecraft:'1.20.1',forge:'47.4.28',java:17,minLauncherVersion,notes:'Fixture modpack release',publishedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),files:Object.entries(content).map(([name,body])=>({path:name,size:Buffer.byteLength(body),sha256:hash(body),url:`https://github.com/${REPOSITORY}/releases/download/modpack-v${version}/file-${hash(body)}`,policy:policies[name]??'managed',optional:false}))};
  const payload=Buffer.from(JSON.stringify(manifest)),envelope={payload:payload.toString('base64'),signature:sign(null,payload,keys.privateKey).toString('base64')};return {manifest:signedManifest(envelope,key),envelope};
}
async function instance(){const source=path.join(root,'Prism source');await fs.mkdir(path.join(source,'minecraft/config'),{recursive:true});await fs.writeFile(path.join(source,'mmc-pack.json'),JSON.stringify({components:[{uid:'net.minecraft',version:'1.20.1'},{uid:'net.minecraftforge',version:'47.4.28'}]}));await fs.writeFile(path.join(source,'minecraft/config/game.json'),'gameplay config');return source;}
async function approved(source:string){const first=await prepareRelease({instance:source,output:path.join(root,'unreviewed'),publicKey:key,minLauncherVersion:'0.4.0'});const review:Review={schemaVersion:1,files:{}};for(const f of first.inventory)review.files[f.path]={sha256:f.sha256,action:'include',side:'both',license:'Owner fixture',evidence:'Explicit test fixture created for this test.',privacyReviewed:true,policy:f.policy};return review;}
describe('complete modpack distribution',()=>{
  it.skipIf(process.platform!=='win32')('keeps a managed file when a release changes only its Windows path capitalization',async()=>{const a=release('0.1.0',1,{'config/Example.json':'same'}),b=release('0.1.1',2,{'config/example.json':'same'});let hits=0;const updater=new PackUpdater(root,()=>{},async()=>{hits++;return new Response('same');});await updater.update(a.manifest,a.envelope,[],signal(),1);await updater.update(b.manifest,b.envelope,[],signal(),1);expect(hits).toBe(1);expect((await updater.verify(key,[])).ready).toBe(true);expect(await fs.readFile(path.join(root,'config/example.json'),'utf8')).toBe('same');});
  it('installs a full pack then adds, changes, removes and updates config with only changed downloads',async()=>{
    const contents={'mods/a.jar':'a1','mods/remove.jar':'remove','config/game.json':'config1','resourcepacks/official.zip':'art'},bodies=new Map(Object.values(contents).map(b=>[hash(b),b]));let hits=0;
    const updater=new PackUpdater(root,()=>{},async url=>{hits++;return new Response(bodies.get(url.split('file-')[1]));});
    const a=release('0.1.0',1,contents);await updater.update(a.manifest,a.envelope,[],signal(),2);expect(hits).toBe(4);
    for(const [name,body] of Object.entries({'saves/world/level.dat':'world','screenshots/image.png':'photo','options.txt':'preferences','resourcepacks/personal.zip':'personal','mods/personal.jar':'personal mod'})){const target=path.join(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,body);}
    await updater.update(a.manifest,a.envelope,[],signal(),2);expect(hits).toBe(4);expect((await updater.verify(key,[])).ready).toBe(true);
    const changed={'mods/a.jar':'a2','mods/added.jar':'added','config/game.json':'config2','resourcepacks/official.zip':'art'};for(const b of Object.values(changed))bodies.set(hash(b),b);
    const b=release('0.1.1',2,changed);await updater.update(b.manifest,b.envelope,[],signal(),2);expect(hits).toBe(7);
    await expect(fs.stat(path.join(root,'mods/remove.jar'))).rejects.toThrow();expect(await fs.readFile(path.join(root,'config/game.json'),'utf8')).toBe('config2');
    expect(await fs.readFile(path.join(root,'saves/world/level.dat'),'utf8')).toBe('world');expect(await fs.readFile(path.join(root,'options.txt'),'utf8')).toBe('preferences');expect(await fs.readFile(path.join(root,'resourcepacks/personal.zip'),'utf8')).toBe('personal');
  });
  it('blocks incompatible updates before any download or local installation mutation',async()=>{
    let downloads=0;const updater=new PackUpdater(root,()=>{},async()=>{downloads++;return new Response('x');},'0.4.0');const a=release('0.1.0',1,{'mods/a.jar':'x'},'99.0.0');
    await expect(updater.update(a.manifest,a.envelope,[],signal(),1)).rejects.toThrow(/requires Usagi 99/);expect(downloads).toBe(0);expect(await fs.readdir(root)).toEqual([]);
  });
  it('retains a verified install on interrupted streams and can recover by retrying',async()=>{
    const a=release('0.1.0',1,{'mods/a.jar':'old'}),b=release('0.1.1',2,{'mods/a.jar':'new'});const abort=new AbortController();let interrupt=false;
    const updater=new PackUpdater(root,p=>{if(interrupt&&p.downloaded)abort.abort(new Error('fixture interruption'));},async url=>interrupt?new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('n'));abort.signal.addEventListener('abort',()=>c.error(abort.signal.reason),{once:true});}})):new Response(url.includes(hash('old'))?'old':'new'));
    await updater.update(a.manifest,a.envelope,[],signal(),1);interrupt=true;await expect(updater.update(b.manifest,b.envelope,[],abort.signal,1)).rejects.toThrow(/interruption/);expect((await updater.ledger())?.version).toBe('0.1.0');expect((await updater.verify(key,[])).ready).toBe(true);
    interrupt=false;await updater.update(b.manifest,b.envelope,[],signal(),1);expect((await updater.verify(key,[])).version).toBe('0.1.1');
  });
  it('rejects simultaneous operations from distinct updater instances',async()=>{
    let unblock:()=>void=()=>{},entered:()=>void=()=>{};const waiting=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{unblock=r;});const a=release('0.1.0',1,{'mods/a.jar':'x'});
    const first=new PackUpdater(root,()=>{},async()=>{entered();await gate;return new Response('x');});const work=first.update(a.manifest,a.envelope,[],signal(),1);await waiting;
    try{await expect(new PackUpdater(root,()=>{}).update(a.manifest,a.envelope,[],signal(),1)).rejects.toThrow(/already running/);}finally{unblock();await work;}
  });
  it('respects process lock ownership and reclaims a dead process lock before recovery',async()=>{
    const metadata=path.join(root,'.celestia'),lock=path.join(metadata,'update.lock');await fs.mkdir(metadata);const owner={pid:process.pid,id:'b58fd6e5-f218-4167-a244-6341a3853a54'};await fs.writeFile(lock,JSON.stringify(owner));
    await expect(new PackUpdater(root,()=>{}).recover()).rejects.toThrow(/another launcher process/);expect(JSON.parse(await fs.readFile(lock,'utf8'))).toEqual(owner);
    vi.spyOn(process,'kill').mockImplementation(()=>{throw Object.assign(new Error('fixture exited process'),{code:'ESRCH'});});await new PackUpdater(root,()=>{}).recover();await expect(fs.stat(lock)).rejects.toThrow();
  });
  it('reuses completed verified downloads after a cancelled transaction',async()=>{
    const pack=release('0.1.0',1,{'mods/a.jar':'a','mods/b.jar':'b'});const requests:string[]=[];let cancel=true;const abort=new AbortController();
    const updater=new PackUpdater(root,()=>{},async url=>{requests.push(url);if(cancel&&url.endsWith(hash('b'))){abort.abort(new Error('interrupted'));throw abort.signal.reason;}return new Response(url.endsWith(hash('a'))?'a':'b');});
    await expect(updater.update(pack.manifest,pack.envelope,[],abort.signal,1)).rejects.toThrow(/interrupted/);expect(await updater.ledger()).toBeUndefined();cancel=false;await updater.update(pack.manifest,pack.envelope,[],signal(),1);expect(requests.filter(u=>u.endsWith(hash('a')))).toHaveLength(1);expect((await updater.verify(key,[])).ready).toBe(true);
  });
  it('rolls back an actual failed replacement and retains the previous usable ledger',async()=>{
    const a=release('0.1.0',1,{'mods/a.jar':'old a','mods/b.jar':'old b'}),b=release('0.1.1',2,{'mods/a.jar':'new a','mods/b.jar':'new b'});let newer=false;
    const updater=new PackUpdater(root,()=>{},async url=>new Response(url.includes(hash(newer?'new a':'old a'))?(newer?'new a':'old a'):(newer?'new b':'old b')));await updater.update(a.manifest,a.envelope,[],signal(),1);newer=true;
    const rename=fs.rename.bind(fs);vi.spyOn(fs,'rename').mockImplementation(async(from,to)=>{if(String(from).includes(path.join('stage','mods','b.jar')))throw new Error('fixture disk replacement failure');return rename(from,to);});
    await expect(updater.update(b.manifest,b.envelope,[],signal(),1)).rejects.toThrow(/replacement failure/);expect((await updater.ledger())?.version).toBe('0.1.0');expect((await updater.verify(key,[])).ready).toBe(true);expect(await fs.readFile(path.join(root,'mods/a.jar'),'utf8')).toBe('old a');
  });
  it('never converts seeded preferences into managed files without resolving personal changes',async()=>{
    const a=release('0.1.0',1,{'config/client.json':'default'},'0.4.0',{'config/client.json':'seed'});await new PackUpdater(root,()=>{},async()=>new Response('default')).update(a.manifest,a.envelope,[],signal(),1);await fs.writeFile(path.join(root,'config/client.json'),'personal');
    const b=release('0.1.1',2,{'config/client.json':'required'});await expect(new PackUpdater(root,()=>{}).update(b.manifest,b.envelope,[],signal(),1)).rejects.toThrow(/personal seed/);expect(await fs.readFile(path.join(root,'config/client.json'),'utf8')).toBe('personal');
  });
});
describe('Prism staging and publishing safeguards',()=>{
  it('rejects a source that changes a previously copied file later in the staging pass',async()=>{const source=await instance(),first=path.join(source,'minecraft/config/game.json');await fs.writeFile(path.join(source,'minecraft/config/second.json'),'second');const copy=fs.copyFile.bind(fs);vi.spyOn(fs,'copyFile').mockImplementation(async(from,to,mode)=>{await copy(from,to,mode);if(String(from).endsWith('second.json'))await fs.writeFile(first,'changed after copying');});await expect(stagePrism(source,path.join(root,'unstable'))).rejects.toThrow(/Prism changed after/);});
  it('copies to separate staging without altering Prism, excludes private files, and preserves identifiers',async()=>{
    const source=await instance();for(const name of ['saves/world/level.dat','logs/latest.log','options.txt','config/voicechat/username-cache.json','config/voicechat/voicechat-server.properties','config/celestiashop/marketplace.json','config/jei/world/local/history.ini']){const file=path.join(source,'minecraft',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'private');}
    const quest=path.join(source,'minecraft/kubejs/server_scripts/quests.js');await fs.mkdir(path.dirname(quest),{recursive:true});await fs.writeFile(quest,'// celestiashop Celestials');const before=await fs.readFile(quest);
    const files=await stagePrism(source,path.join(root,'stage'));expect(files.map(f=>f.path)).toEqual(['config/game.json','kubejs/server_scripts/quests.js']);expect(await fs.readFile(quest)).toEqual(before);expect(await fs.readFile(path.join(root,'stage/client/kubejs/server_scripts/quests.js'))).toEqual(before);
    await expect(stagePrism(source,path.join(source,'stage'))).rejects.toThrow(/separate/);await expect(stagePrism(source,path.join(root,'stage'))).rejects.toThrow(/never overwritten/);
  });
  it('requires license, client-side and privacy review bound to the exact file hashes',async()=>{
    const source=await instance(),review=await approved(source);await fs.writeFile(path.join(source,'minecraft/config/game.json'),'changed');
    const p=await prepareRelease({instance:source,output:path.join(root,'changed'),publicKey:key,minLauncherVersion:'0.4.0',review});expect(p.plan.ready).toBe(false);expect(p.plan.blockers.join(' ')).toContain('review required');
    const keyFile=path.join(root,'private.pem');await fs.writeFile(keyFile,keys.privateKey.export({type:'pkcs8',format:'pem'}));await expect(signPreparedRelease(path.join(root,'changed'),keyFile,key)).rejects.toThrow(/review/);
  });
  it('prepares, signs and verifies the exact asset set and rejects tampering',async()=>{
    const source=await instance(),review=await approved(source),output=path.join(root,'ready');const p=await prepareRelease({instance:source,output,publicKey:key,minLauncherVersion:'0.4.0',review});expect(p.plan.ready).toBe(true);
    const keyFile=path.join(root,'private.pem');await fs.writeFile(keyFile,keys.privateKey.export({type:'pkcs8',format:'pem'}));await signPreparedRelease(output,keyFile,key);expect((await validatePreparedRelease(output,key)).manifest.version).toBe('0.1.0');
    const asset=p.manifest.files[0].url.split('/').at(-1)!;await fs.writeFile(path.join(output,'assets',asset),'tampered');await expect(validatePreparedRelease(output,key)).rejects.toThrow(/asset changed/);
  });
  it('bumps the independent modpack version, reuses immutable URLs, and records changes',async()=>{
    const source=await instance(),review=await approved(source),output=path.join(root,'ready'),a=await prepareRelease({instance:source,output,publicKey:key,minLauncherVersion:'0.4.0',review});
    const b=await prepareRelease({instance:source,output:path.join(root,'second'),publicKey:key,minLauncherVersion:'0.4.0',review,baseline:a.manifest});expect(b.manifest.version).toBe('0.1.1');expect(b.manifest.files[0].url).toBe(a.manifest.files[0].url);expect(b.changes).toEqual({added:[],modified:[],removed:[]});expect(b.plan.assets.length).toBe(2);
  });
  it('recognizes nested server data, player histories and secrets as excluded',()=>{for(const name of ['config/voicechat/username-cache.json','config/voicechat/voicechat-server.properties','config/jei/world/local/history.ini','kubejs/.cache/secret.json','config/test/.env','config/celestiashop/marketplace.json'])expect(excludedClientFile(name)).toBe(true);expect(excludedClientFile('kubejs/server_scripts/quests.js')).toBe(false);});
});
describe('official release discovery',()=>{
  it('ignores drafts, prereleases, unrelated tags and ordinary launcher releases',async()=>{
    const a=release('0.1.0',1,{});const r:GithubRelease={tag_name:'modpack-v0.1.0',draft:false,assets:[{name:'modpack-manifest.json',size:1}]};const read=async()=>a.envelope;
    expect(await choosePackFeed([{...r,draft:true},{...r,prerelease:true},{...r,tag_name:'dev-build'},{...r,tag_name:'launcher-v0.4.0'}],key,read)).toBeUndefined();expect((await choosePackFeed([r],key,read))?.manifest.version).toBe('0.1.0');
  });
  it('requires referenced GitHub files to exist in a published release',async()=>{const a=release('0.1.0',1,{'mods/a.jar':'x'});await expect(choosePackFeed([{tag_name:'modpack-v0.1.0',draft:false,assets:[{name:'modpack-manifest.json',size:1}]}],key,async()=>a.envelope)).rejects.toThrow(/missing/);});
  it('paginates history and handles GitHub API failures explicitly',async()=>{
    let calls=0;const r:GithubRelease={tag_name:'v0.1.0',draft:false,assets:[]};const releases=await githubReleases(async()=>{calls++;return new Response(JSON.stringify(calls===1?Array.from({length:100},()=>r):[r]));});expect(releases).toHaveLength(101);expect(calls).toBe(2);
    await expect(githubReleases(async()=>new Response('rate limited',{status:403}))).rejects.toThrow(/403/);await expect(githubReleases(async()=>{throw new Error('offline');})).rejects.toThrow(/offline/);
  });
});
