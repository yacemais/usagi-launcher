import { verifyAppRelease } from '../src/main/app-updates/release';
export interface GithubRelease{tag_name:string;draft:boolean;assets:{name:string;size:number}[]}
export async function chooseFeeds(releases:GithubRelease[],repository:string,key:string,read:(url:string)=>Promise<unknown>){
  if(repository!=='yacemais/usagi-launcher')throw new Error('Unexpected Pages repository.');
  const selected=new Map<'stable'|'beta',{sequence:number;envelope:unknown;expiresAt:string}>();
  for(const release of releases){if(release.draft)continue;for(const channel of ['stable','beta'] as const){const asset=release.assets.find(a=>a.name===`usagi-${channel}.json`);if(!asset)continue;const base=`https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/`;const envelope=await read(base+asset.name),payload=verifyAppRelease(envelope,key,channel,{checkExpiry:false});if(release.tag_name!==`v${payload.version}`)throw new Error('Signed release version does not match its GitHub tag.');const installer=release.assets.find(a=>a.name===`Usagi-Setup-${payload.version}.exe`);if(!installer||installer.size!==payload.installer.size||payload.installer.url!==base+installer.name)throw new Error('A published installer must exist before its update feed is deployed.');const old=selected.get(channel);if(old&&payload.sequence===old.sequence&&JSON.stringify(envelope)!==JSON.stringify(old.envelope))throw new Error('Conflicting signed channel sequence.');if(!old||payload.sequence>old.sequence)selected.set(channel,{sequence:payload.sequence,envelope,expiresAt:payload.expiresAt});}}
  for(const [channel,feed]of selected)if(Date.parse(feed.expiresAt)<=Date.now())selected.delete(channel);
  return selected;
}
