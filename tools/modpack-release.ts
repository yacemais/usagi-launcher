import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProduct } from '../src/main/config/product';
import { signedManifest } from '../src/main/updater/manifest';
import { secureFetch,limitedBytes } from '../src/main/security/network';
import { githubReleases,choosePackFeed } from './modpack-feed';
import { reviewSchema,prepareRelease,signPreparedRelease,validatePreparedRelease } from './modpack-staging';
import { readJson } from '../src/main/security/files';

async function main(){
  const [command,...args]=process.argv.slice(2),product=await loadProduct(process.cwd());
  if(command==='prepare'){
    const [instance,output,reviewFile='-',version='auto',baselineFile='published']=args;
    if(!instance||!output||args.length>5)throw new Error('Usage: modpack-release prepare <Prism instance> <new staging folder> [review.json|-] [version|auto] [baseline-envelope.json|published|first]');
    const read=async(url:string)=>JSON.parse((await limitedBytes(await secureFetch(url),8*1024*1024)).toString('utf8'));
    const baseline=baselineFile==='published'?(await choosePackFeed(await githubReleases(),product.modpack.publicKey,read))?.manifest:baselineFile==='first'?undefined:signedManifest(await readJson(baselineFile),product.modpack.publicKey,{checkExpiry:false});
    if(baselineFile==='first')console.log('Explicit first-release mode: no published baseline lookup. Publication still checks remote history.');
    const result=await prepareRelease({instance,output,publicKey:product.modpack.publicKey,baseline,review:reviewFile==='-'?undefined:reviewSchema.parse(await readJson(reviewFile)),version:version==='auto'?undefined:version,minLauncherVersion:'0.4.0'});
    console.log(JSON.stringify({tag:result.plan.tag,ready:result.plan.ready,files:result.manifest.files.length,bytes:result.manifest.files.reduce((n,f)=>n+f.size,0),added:result.changes.added.length,modified:result.changes.modified.length,removed:result.changes.removed.length,blockers:result.plan.blockers.length,review:path.join(output,'review.private.json'),plan:path.join(output,'release-plan.json')},null,2));
    console.log('Prepared locally. No upload, tag, commit or release was created.');
  }else if(command==='sign'){
    if(args.length!==2)throw new Error('Usage: modpack-release sign <staging folder> <private key PEM>');
    const plan=await signPreparedRelease(path.resolve(args[0]),args[1],product.modpack.publicKey);console.log(`Signed ${plan.tag}: ${plan.assets.length} assets. Review release-plan.json before approving publication.`);
  }else if(command==='validate'){
    if(args.length!==1)throw new Error('Usage: modpack-release validate <staging folder>');
    const {plan}=await validatePreparedRelease(path.resolve(args[0]),product.modpack.publicKey);
    const latest=await choosePackFeed(await githubReleases(),product.modpack.publicKey,async url=>JSON.parse((await limitedBytes(await secureFetch(url),8*1024*1024)).toString('utf8')));
    if((latest?.manifest.sequence??0)!==plan.baselineSequence)throw new Error('Published modpack changed since staging. Prepare against the latest release.');
    console.log(`Validated ${plan.tag}: staged hashes, signature, download structure and published baseline. No remote changes made.`);
  }else if(command==='verify-public'){
    if(args.length!==1)throw new Error('Usage: modpack-release verify-public <staging folder>');
    const {plan,manifest}=await validatePreparedRelease(path.resolve(args[0]),product.modpack.publicKey);
    const publicRelease=(await githubReleases()).find(r=>r.tag_name===plan.tag&&!r.draft&&!r.prerelease);
    if(!publicRelease)throw new Error('The official release is not publicly visible.');
    for(const asset of plan.assets){const remote=publicRelease.assets.find(a=>a.name===asset.name);if(!remote||remote.size!==asset.size||remote.digest&&remote.digest!=='sha256:'+asset.sha256)throw new Error('Published asset does not match: '+asset.name);}
    for(const file of manifest.files){const response=await secureFetch(file.url,{method:'HEAD',signal:AbortSignal.timeout(30000)});await response.body?.cancel();}
    console.log('All required modpack download URLs are anonymously accessible. Pages refresh is triggered by the published release.');
  }else throw new Error('Commands: prepare, sign, validate, verify-public. Upload and publication require the separate approval-gated PowerShell script.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Modpack release preparation failed.');process.exitCode=1;});
