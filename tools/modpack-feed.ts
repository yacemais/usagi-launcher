import semver from 'semver';
import { signedManifest } from '../src/main/updater/manifest';
import { secureFetch,limitedBytes } from '../src/main/security/network';
import type { Fetcher } from '../src/main/installer/downloads';
import type { GithubRelease } from './github-feed';
export const REPOSITORY='yacemais/usagi-launcher';
export const PACK_FEED='https://yacemais.github.io/usagi-launcher/modpacks/usagi/stable.json';
export async function githubReleases(fetcher:Fetcher=secureFetch){
  const releases:GithubRelease[]=[];
  for(let page=1;page<=100;page++){
    const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Usagi-release-tools'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('GitHub release lookup failed: '+response.status);
    const batch=JSON.parse((await limitedBytes(response,8*1024*1024)).toString('utf8')) as GithubRelease[];
    if(!Array.isArray(batch))throw new Error('Invalid GitHub release list.');releases.push(...batch);if(batch.length<100)return releases;
  }
  throw new Error('Release history exceeds the supported scan. Archive the feed index before continuing.');
}
export async function choosePackFeed(releases:GithubRelease[],key:string,read:(url:string)=>Promise<unknown>){
  const published=releases.filter(r=>!r.draft&&!r.prerelease&&/^modpack-v\d+\.\d+\.\d+$/.test(r.tag_name));
  const assets=new Map<string,number>(published.flatMap(r=>r.assets.map(a=>[`https://github.com/${REPOSITORY}/releases/download/${r.tag_name}/${a.name}`,a.size] as const)));
  let selected:{manifest:ReturnType<typeof signedManifest>;envelope:unknown}|undefined;
  for(const release of published){
    const asset=release.assets.find(a=>a.name==='modpack-manifest.json');if(!asset)continue;
    const envelope=await read(`https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${asset.name}`),manifest=signedManifest(envelope,key,{checkExpiry:false});
    if(!semver.valid(manifest.version)||semver.prerelease(manifest.version)||release.tag_name!=='modpack-v'+manifest.version)throw new Error('Modpack manifest does not match its official release tag.');
    for(const file of manifest.files)if(new URL(file.url).hostname==='github.com'&&assets.get(file.url)!==file.size)throw new Error('Required modpack asset is missing from a published release: '+file.path);
    if(selected&&selected.manifest.sequence===manifest.sequence&&JSON.stringify(selected.envelope)!==JSON.stringify(envelope))throw new Error('Conflicting published modpack sequence.');
    if(!selected||manifest.sequence>selected.manifest.sequence)selected={manifest,envelope};
  }
  return selected;
}
