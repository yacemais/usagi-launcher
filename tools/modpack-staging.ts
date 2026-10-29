import { promises as fs,constants } from 'node:fs';
import path from 'node:path';
import { createPrivateKey,createPublicKey,sign } from 'node:crypto';
import { fromBuffer } from '@xmcl/yauzl';
import semver from 'semver';
import { z } from 'zod';
import { atomicWrite,exists,hashFile,inside,safePath,readJson } from '../src/main/security/files';
import { signedManifest,manifestSchema,validatePackPath,type PackManifest } from '../src/main/updater/manifest';
import { httpsUrl,secureFetch,limitedBytes } from '../src/main/security/network';
import { REPOSITORY } from './modpack-feed';
import type { Fetcher } from '../src/main/installer/downloads';
import { Downloads } from '../src/main/installer/downloads';

const roots=['mods','config','defaultconfigs','kubejs','resourcepacks','shaderpacks','moonlight-global-datapacks'];
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const reviewEntry=z.object({sha256:digest,action:z.enum(['review','include','upstream','exclude']),side:z.enum(['review','client','both','server']),license:z.string().max(2000),evidence:z.string().max(8000),privacyReviewed:z.boolean(),policy:z.enum(['managed','seed']),url:z.string().optional()}).strict();
export const reviewSchema=z.object({schemaVersion:z.literal(1),files:z.record(z.string(),reviewEntry)}).strict();
export type Review=z.infer<typeof reviewSchema>;
export interface InventoryFile {path:string;size:number;sha256:string;policy:'managed'|'seed';metadata?:Record<string,string>;privacyFlags:string[];provenance?:{url:string;sha512:string;side:string}}
export const planSchema=z.object({schemaVersion:z.literal(1),repository:z.literal(REPOSITORY),tag:z.string().regex(/^modpack-v\d+\.\d+\.\d+$/),version:z.string(),baselineSequence:z.number().int().nonnegative(),ready:z.boolean(),blockers:z.array(z.string()),assets:z.array(z.object({name:z.string().regex(/^(?:file-[a-f0-9]{64}|modpack-manifest\.json|THIRD_PARTY_NOTICES\.json|changelog\.md)$/),size:z.number().int().nonnegative().max(1024*1024*1024),sha256:digest}).strict()).max(1000)}).strict();
export function excludedClientFile(relative:string){
  return /(?:^|\/)\.[^/]+(?:\/|$)/.test(relative) || /(?:^|\/)(?:cache|logs|screenshots|saves|crash-reports|world|local|server_profiles)(?:\/|$)/i.test(relative)
    || /(?:^|\/)(?:.*(?:history|username.?cache|fingerprint|player-volumes|category-volumes|emote_map|marketplace|patreon|etf_warnings).*|voicechat-server\.properties|server\.properties|ops\.json|whitelist\.json|eula\.txt|\.env(?:\..*)?|.*\.(?:log|bak|old|tmp|part))$/i.test(relative)
    || /^config\/(?:jei\/(?:world|server)|spark|chunky)\//i.test(relative);
}
export function defaultPolicy(name:string):'managed'|'seed'{return /(?:^|[\/-])client(?:[\/.\-]|$)/i.test(name)||/^config\/(?:jade|jei|xaero|voicechat)\//i.test(name)||/^config\/(?:.*options|oculus|embeddium|dynamic_fps|MouseTweaks|chat_heads|skinlayers|voxy|emotecraft|xaerohud)/i.test(name)||name.startsWith('shaderpacks/')?'seed':'managed';}
export async function walk(root:string,relative=''):Promise<string[]>{
  const result:string[]=[];
  for(const entry of await fs.readdir(relative?await safePath(root,relative):root,{withFileTypes:true})){
    const name=relative?relative+'/'+entry.name:entry.name,full=await safePath(root,name);
    if(entry.isDirectory())result.push(...await walk(root,name));else if(entry.isFile())result.push(name);else throw new Error('Only regular staged files are accepted: '+name);
  }return result.sort();
}
export async function zipMetadata(file:string):Promise<Record<string,string>>{
  if((await fs.stat(file)).size>256*1024*1024)return {'audit':'Archive exceeds metadata inspection memory limit; inspect manually.'};
  const bytes=await fs.readFile(file);
  return new Promise((resolve,reject)=>fromBuffer(bytes,{lazyEntries:true},(error,zip)=>{
    if(error||!zip)return reject(error);const result:Record<string,string>={};let total=0,entries=0;
    const fail=(e:unknown)=>{zip.close();reject(e);};zip.on('error',fail);zip.on('end',()=>resolve(result));
    zip.on('entry',entry=>{
      if(++entries>200000)return fail(new Error('Archive has too many entries.'));
      if(!/(?:^|\/)(?:mods\.toml|fabric\.mod\.json|license[^/]*|copying[^/]*)$/i.test(entry.fileName)||entry.uncompressedSize===0||entry.uncompressedSize>200000||total+entry.uncompressedSize>2*1024*1024){zip.readEntry();return;}
      total+=entry.uncompressedSize;zip.openReadStream(entry,(err,stream)=>{if(err)return fail(err);void (async()=>{const parts:Buffer[]=[];for await(const part of stream)parts.push(part);result[entry.fileName]=Buffer.concat(parts).toString('utf8');zip.readEntry();})().catch(fail);});
    });zip.readEntry();
  }));
}
function privacyFlags(text:string){const flags:string[]=[];if(/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b|(?:access_token|refresh_token|client_secret|password|api_key|secret)\s*[=:]\s*["']?[^\s"',}]{8,}/i.test(text))flags.push('Possible credential; inspect privately.');if(/[A-Z]:[\\/]Users[\\/]|(?:[0-9]{1,3}\.){3}[0-9]{1,3}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text))flags.push('Possible personal path, network address or email; inspect privately.');return flags;}
export async function stagePrism(instance:string,output:string){
  instance=path.resolve(instance);output=path.resolve(output);
  if(inside(instance.toLowerCase(),output.toLowerCase())||inside(output.toLowerCase(),instance.toLowerCase()))throw new Error('Staging must be separate from the original Prism instance.');
  if(await exists(output))throw new Error('Use a new staging directory. Existing stages are never overwritten.');
  await safePath(instance,'mmc-pack.json');const pack=await readJson(path.join(instance,'mmc-pack.json')) as {components:{uid:string;version:string}[]};
  if(pack.components.find(c=>c.uid==='net.minecraft')?.version!=='1.20.1'||pack.components.find(c=>c.uid==='net.minecraftforge')?.version!=='47.4.28')throw new Error('The Prism instance must target Minecraft 1.20.1 / Forge 47.4.28.');
  const source=await exists(path.join(instance,'minecraft'))?path.join(instance,'minecraft'):path.join(instance,'.minecraft');
  const provenance=new Map<string,{url:string;sha512:string;side:string}>();
  const index=await safePath(source,'mods/.index');if(await exists(index))for(const name of await walk(source,'mods/.index')){
    if(!name.endsWith('.toml'))continue;const text=await fs.readFile(await safePath(source,name),'utf8');
    const filename=text.match(/^filename\s*=\s*['"]([^'"]+)['"]/m)?.[1],url=text.match(/^url\s*=\s*['"]([^'"]+)['"]/m)?.[1],sha512=text.match(/^hash\s*=\s*['"]([a-f0-9]{128})['"]/m)?.[1],side=text.match(/^side\s*=\s*['"]([^'"]*)['"]/m)?.[1]??'';
    if(filename&&url&&sha512)provenance.set('mods/'+filename,{url,sha512,side});
  }
  const client=path.join(output,'client'),inventory:InventoryFile[]=[],excluded:string[]=[];await fs.mkdir(client,{recursive:true});
  for(const folder of roots){if(!await exists(await safePath(source,folder)))continue;
    for(const name of await walk(source,folder)){
      if(excludedClientFile(name)){excluded.push(name);continue;}validatePackPath(name);
      const original=await safePath(source,name),target=await safePath(client,name),stat=await fs.stat(original);
      if(stat.size>1024*1024*1024)throw new Error('A pack file exceeds the supported 1 GiB file limit: '+name);
      const before=await hashFile(original);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(original,target,constants.COPYFILE_EXCL);
      const sha256=await hashFile(target);if(sha256!==before||await hashFile(original)!==before)throw new Error('Prism changed while staging. Close Minecraft and prepare again: '+name);
      const metadata=/\.(jar|zip)$/i.test(name)?await zipMetadata(target):undefined;
      const flags=stat.size<8*1024*1024&&!/\.(jar|zip|png|jpg|ogg|ttf)$/i.test(name)?privacyFlags(await fs.readFile(target,'utf8')):[];
      let origin=provenance.get(name);if(origin&&await hashFile(target,'sha512')!==origin.sha512){flags.push('Prism download index is stale; the installed bytes remain the source of truth.');origin=undefined;}
      inventory.push({path:name,size:stat.size,sha256,policy:defaultPolicy(name),metadata,privacyFlags:flags,provenance:origin});
    }
  }
  const finalPaths:string[]=[];for(const folder of roots)if(await exists(await safePath(source,folder)))finalPaths.push(...(await walk(source,folder)).filter(name=>!excludedClientFile(name)));
  if(JSON.stringify(finalPaths.sort())!==JSON.stringify(inventory.map(f=>f.path).sort()))throw new Error('The Prism file set changed during staging. Close Minecraft and prepare again.');
  for(const item of inventory)if(await hashFile(await safePath(source,item.path))!==item.sha256)throw new Error('Prism changed after a file was staged. Prepare a fresh snapshot: '+item.path);
  await atomicWrite(path.join(output,'inventory.private.json'),JSON.stringify({inventory,excluded},null,2));return inventory;
}
export async function prepareRelease(options:{instance:string;output:string;publicKey:string;baseline?:PackManifest;review?:Review;version?:string;minLauncherVersion:string}){
  const {baseline,publicKey}=options;if(!publicKey)throw new Error('Configure the trusted modpack public key first.');
  const version=options.version??(baseline?semver.inc(baseline.version,'patch'):'0.1.0');
  if(!version||!semver.valid(version)||semver.prerelease(version)||baseline&&!semver.gt(version,baseline.version))throw new Error('Use an increasing stable semantic modpack version.');
  const inventory=await stagePrism(options.instance,options.output),review:Review={schemaVersion:1,files:{}},blockers:string[]=[],files:PackManifest['files']=[],uploads=new Map<string,string>();
  const changes:{added:string[];modified:string[];removed:string[]}={added:[],modified:[],removed:[]};
  const previous=new Map(baseline?.files.map(f=>[f.path,f]));
  for(const item of inventory){
    const embeddedLicense=item.metadata?.['META-INF/mods.toml']?.match(/^\s*license\s*=\s*['"]([^'"\r\n]+)['"]/m)?.[1]??'';
    const supplied=options.review?.files[item.path],entry=supplied?.sha256===item.sha256?supplied:{sha256:item.sha256,action:'review' as const,side:'review' as const,license:embeddedLicense,evidence:'',privacyReviewed:false,policy:item.policy,...(item.provenance?{url:item.provenance.url}:{})};review.files[item.path]=entry;
    if(entry.action==='exclude'){if(!entry.evidence.trim())blockers.push(item.path+': record the reason for exclusion.');continue;}
    if(entry.action==='review'||entry.side==='review'||!entry.license.trim()||!entry.evidence.trim()||!entry.privacyReviewed)blockers.push(item.path+': redistribution, side and privacy review required.');
    if(item.privacyFlags.some(flag=>flag.startsWith('Possible credential')))blockers.push(item.path+': possible credentials must be excluded from the client distribution.');
    if(entry.side==='server')blockers.push(item.path+': server-only files must be explicitly excluded.');
    const old=previous.get(item.path),asset='file-'+item.sha256;
    let url=old?.sha256===item.sha256?old.url:`https://github.com/${REPOSITORY}/releases/download/modpack-v${version}/${asset}`;
    if(entry.action==='upstream'){if(!entry.url)blockers.push(item.path+': approved upstream HTTPS URL required.');else{httpsUrl(entry.url);url=entry.url;}}
    if(entry.action!=='upstream'&&url.endsWith('/'+asset)&&(!old||url!==old.url))uploads.set(asset,item.path);
    files.push({path:item.path,size:item.size,sha256:item.sha256,url,policy:entry.policy,optional:false});
    if(!old)changes.added.push(item.path);else if(old.sha256!==item.sha256||old.policy!==entry.policy||old.url!==url)changes.modified.push(item.path);
  }
  changes.removed=(baseline?.files??[]).filter(f=>!files.some(n=>n.path===f.path)).map(f=>f.path);
  const notes=`Usagi Modpack ${version}\nMinecraft 1.20.1 · Forge 47.4.28 · Java 17\nRequires Usagi ${options.minLauncherVersion}+\n\n`+(['added','modified','removed'] as const).map(kind=>`${kind}: ${changes[kind].length}\n${changes[kind].map(n=>'- '+n).join('\n')}`).join('\n\n');
  const summary=notes.length<=16000?notes:`Usagi Modpack ${version}\nMinecraft 1.20.1 · Forge 47.4.28 · Java 17\nRequires Usagi ${options.minLauncherVersion}+\n\nAdded: ${changes.added.length}; modified: ${changes.modified.length}; removed: ${changes.removed.length}.\nFull file changelog is attached to the GitHub release.`;
  const manifest=manifestSchema.parse({schemaVersion:1,version,sequence:Math.max(Math.floor(Date.now()/1000),(baseline?.sequence??0)+1),minecraft:'1.20.1',forge:'47.4.28',java:17,minLauncherVersion:options.minLauncherVersion,notes:summary,publishedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),files});
  const output=path.resolve(options.output),assets=path.join(output,'assets');await fs.mkdir(assets);
  await atomicWrite(path.join(output,'review.private.json'),JSON.stringify(review,null,2));
  await atomicWrite(path.join(output,'unsigned-manifest.json'),JSON.stringify(manifest,null,2));
  await atomicWrite(path.join(output,'changes.json'),JSON.stringify(changes,null,2));
  await atomicWrite(path.join(assets,'changelog.md'),notes+'\n');
  await atomicWrite(path.join(assets,'THIRD_PARTY_NOTICES.json'),JSON.stringify(files.map(f=>({path:f.path,sha256:f.sha256,license:review.files[f.path].license,evidence:review.files[f.path].evidence})),null,2));
  if(!files.length)blockers.push('An empty official modpack cannot be published.');
  if(uploads.size+4>1000)blockers.push('GitHub supports 1000 assets per release. Move large file sets to an HTTPS object provider.');
  if(!blockers.length)for(const [asset,name] of uploads)await fs.copyFile(await safePath(path.join(output,'client'),name),path.join(assets,asset),constants.COPYFILE_EXCL);
  const plan=planSchema.parse({schemaVersion:1,repository:REPOSITORY,tag:'modpack-v'+version,version,baselineSequence:baseline?.sequence??0,ready:!blockers.length,blockers,assets:await assetInventory(assets)});
  await atomicWrite(path.join(output,'release-plan.json'),JSON.stringify(plan,null,2));
  return {plan,manifest,changes,inventory};
}
async function assetInventory(root:string){const result=[];for(const name of await walk(root))result.push({name,size:(await fs.stat(await safePath(root,name))).size,sha256:await hashFile(await safePath(root,name))});return result;}
export async function signPreparedRelease(output:string,keyFile:string,publicKey:string){
  const plan=planSchema.parse(await readJson(path.join(output,'release-plan.json')));if(!plan.ready||plan.blockers.length)throw new Error('Finish every license, privacy and client compatibility review before signing.');
  const key=createPrivateKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519'||createPublicKey(key).export({type:'spki',format:'pem'}).toString().trim()!==publicKey.trim())throw new Error('The signing key must match the public key bundled with Usagi.');
  const payload=Buffer.from(JSON.stringify(await readJson(path.join(output,'unsigned-manifest.json')))),envelope={payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')},manifest=signedManifest(envelope,publicKey);
  if(manifest.version!==plan.version)throw new Error('Prepared version mismatch.');
  for(const file of manifest.files){const local=await safePath(path.join(output,'client'),file.path);if((await fs.stat(local)).size!==file.size||await hashFile(local)!==file.sha256)throw new Error('Staged client file changed: '+file.path);}
  await atomicWrite(path.join(output,'assets/modpack-manifest.json'),JSON.stringify(envelope));
  plan.assets=await assetInventory(path.join(output,'assets'));planSchema.parse(plan);await atomicWrite(path.join(output,'release-plan.json'),JSON.stringify(plan,null,2));return plan;
}
export async function validatePreparedRelease(output:string,publicKey:string,fetcher:Fetcher=secureFetch){
  const plan=planSchema.parse(await readJson(path.join(output,'release-plan.json')));if(!plan.ready||plan.blockers.length)throw new Error('The release is blocked by its review.');
  const names=await walk(path.join(output,'assets'));if(JSON.stringify(names)!==JSON.stringify(plan.assets.map(a=>a.name).sort()))throw new Error('Release assets differ from the reviewed inventory.');
  for(const asset of plan.assets){const file=await safePath(path.join(output,'assets'),asset.name);if((await fs.stat(file)).size!==asset.size||await hashFile(file)!==asset.sha256)throw new Error('A reviewed asset changed: '+asset.name);}
  const envelope=await readJson(path.join(output,'assets/modpack-manifest.json')),manifest=signedManifest(envelope,publicKey);
  if(manifest.version!==plan.version||plan.tag!=='modpack-v'+manifest.version||manifest.sequence<=plan.baselineSequence)throw new Error('Release manifest and plan disagree.');
  const base=`https://github.com/${REPOSITORY}/releases/download/${plan.tag}/`;
  for(const file of manifest.files){
    if(file.url.startsWith(base)){const asset=plan.assets.find(a=>base+a.name===file.url);if(!asset||asset.size!==file.size||asset.sha256!==file.sha256)throw new Error('A manifest download is missing from the asset plan: '+file.path);}
    else{const response=await fetcher(file.url,{method:'HEAD',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('An existing public download is unavailable: '+file.path);await response.body?.cancel();if(response.headers.has('content-length')&&Number(response.headers.get('content-length'))!==file.size)throw new Error('An existing public download has a different size: '+file.path);
      if(new URL(file.url).hostname!=='github.com'){
        const cache=path.join(output,'validation-cache'),target=await safePath(cache,file.sha256);
        await new Downloads(()=>{},async name=>{await safePath(cache,path.relative(cache,name).split(path.sep).join('/'));},fetcher).run([{path:target,urls:[file.url],size:file.size,checksum:{algorithm:'sha256',value:file.sha256}}],AbortSignal.timeout(10*60*1000),1,'Validating upstream modpack file');
      }
    }
  }return {plan,manifest};
}
