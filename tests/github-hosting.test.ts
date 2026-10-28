import { describe,it,expect } from 'vitest';
import { generateKeyPairSync,sign,createHash } from 'node:crypto';
import { chooseFeeds,type GithubRelease } from '../tools/github-feed';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();
const repo='yacemais/usagi-launcher';
function fixture(version:string,sequence:number,expired=false){const release:GithubRelease={tag_name:'v'+version,draft:false,assets:[{name:`Usagi-Setup-${version}.exe`,size:10},{name:'usagi-stable.json',size:1}]};const payload=Buffer.from(JSON.stringify({schemaVersion:1,product:'usagi',platform:'win32',arch:'x64',channel:'stable',sequence,version,publishedAt:new Date(Date.now()-86400000).toISOString(),expiresAt:new Date(Date.now()+(expired?-1000:86400000)).toISOString(),notes:'Explicit hosting fixture',installer:{url:`https://github.com/${repo}/releases/download/v${version}/Usagi-Setup-${version}.exe`,size:10,sha512:createHash('sha512').update('fixture').digest('base64')}}));return {release,envelope:{payload:payload.toString('base64'),signature:sign(null,payload,keys.privateKey).toString('base64')}};}
describe('GitHub Pages signed feed preparation',()=>{
  it('publishes no channel for an empty or draft-only repository',async()=>{expect((await chooseFeeds([],repo,publicKey,async()=>{})).size).toBe(0);const a=fixture('0.2.1',1);a.release.draft=true;expect((await chooseFeeds([a.release],repo,publicKey,async()=>a.envelope)).size).toBe(0);});
  it('selects the highest signed sequence while allowing old expired release history',async()=>{const old=fixture('0.2.0',1,true),latest=fixture('0.2.1',2);const feeds=await chooseFeeds([old.release,latest.release],repo,publicKey,async u=>u.includes('/v0.2.0/')?old.envelope:latest.envelope);expect(feeds.get('stable')?.sequence).toBe(2);});
  it('refuses to advertise an installer that is missing from the published release',async()=>{const a=fixture('0.2.1',1);a.release.assets=a.release.assets.filter(a=>a.name.endsWith('.json'));await expect(chooseFeeds([a.release],repo,publicKey,async()=>a.envelope)).rejects.toThrow(/installer/);});
  it('does not deploy expired latest metadata',async()=>{const a=fixture('0.2.1',1,true);expect((await chooseFeeds([a.release],repo,publicKey,async()=>a.envelope)).size).toBe(0);});
  it('rejects a forged signature before any feed is produced',async()=>{const a=fixture('0.2.1',1);await expect(chooseFeeds([a.release],repo,publicKey,async()=>({...a.envelope,signature:Buffer.alloc(64).toString('base64')}))).rejects.toThrow(/signature/);});
});
