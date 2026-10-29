import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chooseFeeds,type GithubRelease } from './github-feed';
import { loadProduct } from '../src/main/config/product';
import { secureFetch,limitedBytes } from '../src/main/security/network';
import { atomicWrite,inside,safePath } from '../src/main/security/files';
import { githubReleases,choosePackFeed } from './modpack-feed';
async function main(){
  const repository=process.env.RELEASE_REPOSITORY||'yacemais/usagi-launcher';if(repository!=='yacemais/usagi-launcher')throw new Error('Unexpected Pages repository.');
  const output=path.resolve(process.argv[2]||'_site'),source=path.resolve('deploy/site/public');if(output===process.cwd()||!inside(process.cwd(),output)||inside(source,output)||inside(output,source))throw new Error('Use a separate output folder within the checkout.');await safePath(output,'index.html');
  const releases=await githubReleases(),product=await loadProduct(process.cwd());
  const feeds=await chooseFeeds(releases,repository,product.launcherUpdates.publicKey,async url=>JSON.parse((await limitedBytes(await secureFetch(url),1024*1024)).toString('utf8')));
  await fs.cp(source,output,{recursive:true,filter:async item=>{if((await fs.lstat(item)).isSymbolicLink())throw new Error('Links are not published to Pages.');return !item.endsWith('.gitkeep');}});
  await fs.mkdir(path.join(output,'assets'),{recursive:true});await fs.copyFile('src/renderer/assets/usagi-wordmark.png',path.join(output,'assets/usagi-wordmark.png'));
  for(const [channel,feed] of feeds)await atomicWrite(path.join(output,`launcher/channels/${channel}.json`),JSON.stringify(feed.envelope));
  const pack=product.modpack.publicKey?await choosePackFeed(releases,product.modpack.publicKey,async url=>JSON.parse((await limitedBytes(await secureFetch(url),8*1024*1024)).toString('utf8'))):undefined;
  if(pack&&Date.parse(pack.manifest.expiresAt)>Date.now())await atomicWrite(path.join(output,'modpacks/usagi/stable.json'),JSON.stringify(pack.envelope));
  console.log(`Prepared GitHub Pages with ${feeds.size} verified channel feeds. No release or site was published by this build command.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Pages preparation failed.');process.exitCode=1;});
