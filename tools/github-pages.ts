import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chooseFeeds,type GithubRelease } from './github-feed';
import { loadProduct } from '../src/main/config/product';
import { secureFetch,limitedBytes } from '../src/main/security/network';
import { atomicWrite,inside,safePath } from '../src/main/security/files';
async function main(){
  const repository=process.env.RELEASE_REPOSITORY||'yacemais/usagi-launcher';if(repository!=='yacemais/usagi-launcher')throw new Error('Unexpected Pages repository.');
  const output=path.resolve(process.argv[2]||'_site'),source=path.resolve('deploy/site/public');if(output===process.cwd()||!inside(process.cwd(),output)||inside(source,output)||inside(output,source))throw new Error('Use a separate output folder within the checkout.');await safePath(output,'index.html');
  const response=await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Usagi-Pages',...(process.env.GH_TOKEN?{Authorization:'Bearer '+process.env.GH_TOKEN}:{})},redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Could not read published GitHub releases.');
  const releases=JSON.parse((await limitedBytes(response,4*1024*1024)).toString('utf8')) as GithubRelease[],product=await loadProduct(process.cwd());
  const feeds=await chooseFeeds(releases,repository,product.launcherUpdates.publicKey,async url=>JSON.parse((await limitedBytes(await secureFetch(url),1024*1024)).toString('utf8')));
  await fs.cp(source,output,{recursive:true,filter:async item=>{if((await fs.lstat(item)).isSymbolicLink())throw new Error('Links are not published to Pages.');return !item.endsWith('.gitkeep');}});
  await fs.mkdir(path.join(output,'assets'),{recursive:true});await fs.copyFile('src/renderer/assets/usagi-wordmark.png',path.join(output,'assets/usagi-wordmark.png'));
  for(const [channel,feed] of feeds)await atomicWrite(path.join(output,`launcher/channels/${channel}.json`),JSON.stringify(feed.envelope));
  console.log(`Prepared GitHub Pages with ${feeds.size} verified channel feeds. No release or site was published by this build command.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Pages preparation failed.');process.exitCode=1;});
