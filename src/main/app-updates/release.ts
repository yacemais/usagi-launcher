import { z } from 'zod';
import { createPublicKey,verify } from 'node:crypto';
import semver from 'semver';
import path from 'node:path';
import { httpsUrl,secureFetch,limitedBytes,HttpResponseError } from '../security/network';
import { atomicWrite,exists,readJson,safePath } from '../security/files';
import { envelopeSchema } from '../updater/manifest';
import type { Fetcher } from '../installer/downloads';
export const appReleaseSchema=z.object({schemaVersion:z.literal(1),product:z.literal('usagi'),platform:z.literal('win32'),arch:z.literal('x64'),channel:z.enum(['stable','beta']),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),version:z.string().max(80).refine(v=>semver.valid(v)!==null),publishedAt:z.string().datetime(),expiresAt:z.string().datetime(),notes:z.string().max(16000),installer:z.object({url:z.string().max(2048),size:z.number().int().positive().max(1024*1024*1024),sha512:z.string().refine(v=>Buffer.from(v,'base64').length===64&&Buffer.from(v,'base64').toString('base64')===v)}).strict()}).strict();
export type AppRelease=z.infer<typeof appReleaseSchema>;
export function verifyAppRelease(envelope:unknown,key:string,channel:'stable'|'beta',options:{checkExpiry?:boolean}={}){
  const e=envelopeSchema.parse(envelope),payload=Buffer.from(e.payload,'base64'),signature=Buffer.from(e.signature,'base64'),publicKey=createPublicKey(key);
  if(payload.toString('base64')!==e.payload||signature.length!==64||publicKey.asymmetricKeyType!=='ed25519'||!verify(null,payload,publicKey,signature))throw new Error('Usagi update signature is invalid.');
  const release=appReleaseSchema.parse(JSON.parse(payload.toString('utf8')));
  if(release.channel!==channel)throw new Error('Launcher update channel does not match.');
  if(channel==='stable'&&semver.prerelease(release.version))throw new Error('A stable channel cannot publish a prerelease.');
  if(Date.parse(release.publishedAt)>Date.now()+300000||options.checkExpiry!==false&&Date.parse(release.expiresAt)<=Date.now()||Date.parse(release.expiresAt)<=Date.parse(release.publishedAt))throw new Error('Launcher update dates are invalid or expired.');
  const url=httpsUrl(release.installer.url),file=decodeURIComponent(url.pathname).split('/').at(-1)!;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.exe$/i.test(file)||file.length>180)throw new Error('Use a safe immutable NSIS installer filename.');
  return release;
}
const trustSchema=z.record(z.string(),z.object({sequence:z.number().int().positive(),payload:z.string()}).strict());
export class UnpublishedChannelError extends Error {
  constructor(readonly channel:'stable'|'beta'){super(channel==='stable'?'No stable launcher release has been published yet. Select Beta to check development releases.':'No beta launcher release has been published yet.');this.name='UnpublishedChannelError';}
}
export class ReleaseRepository {
  current?:AppRelease;envelope?:unknown;channel:'stable'|'beta'='stable';signal?:AbortSignal;
  constructor(readonly root:string,private baseUrl:string,readonly key:string,readonly fetcher:Fetcher=secureFetch){}
  async check(){
    const u=httpsUrl(this.baseUrl);u.pathname=u.pathname.replace(/\/?$/,'/')+this.channel+'.json';
    let response:Response;
    try{response=await this.fetcher(u.href,{signal:this.signal});if(!response.ok){await response.body?.cancel();throw new HttpResponseError(response.status,u.hostname);}}
    catch(error){if(error instanceof HttpResponseError&&error.status===404){this.current=undefined;this.envelope=undefined;throw new UnpublishedChannelError(this.channel);}throw error;}
    const envelope:unknown=JSON.parse((await limitedBytes(response,1024*1024)).toString('utf8'));
    const release=verifyAppRelease(envelope,this.key,this.channel),e=envelopeSchema.parse(envelope);
    const file=await safePath(this.root,'accepted-channels.json');const old=await exists(file)?trustSchema.parse(await readJson(file)):{};const previous=old[this.channel];
    if(previous&&(release.sequence<previous.sequence||release.sequence===previous.sequence&&e.payload!==previous.payload))throw new Error('Launcher update rollback or reused sequence rejected.');
    old[this.channel]={sequence:release.sequence,payload:e.payload};await atomicWrite(file,JSON.stringify(old));this.current=release;this.envelope=envelope;return release;
  }
  approved(){if(!this.current||!this.envelope)throw new Error('Check for a signed launcher release first.');return verifyAppRelease(this.envelope,this.key,this.channel);}
  async guard(file:string){await safePath(this.root,path.relative(this.root,file).split(path.sep).join('/'));}
}
