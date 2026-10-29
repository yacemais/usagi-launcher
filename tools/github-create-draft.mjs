import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const {version}=JSON.parse(readFileSync('package.json','utf8'));
const repository=process.env.RELEASE_REPOSITORY,channel=process.env.RELEASE_CHANNEL;
if(repository!=='yacemais/usagi-launcher'||!['stable','beta'].includes(channel))throw new Error('Unexpected release coordinates.');
const tag=`launcher-v${version}`;
const existing=spawnSync('gh',['release','view',tag,'--repo',repository],{encoding:'utf8',shell:false,windowsHide:true});if(existing.status===0)throw new Error('This release already exists. Existing release assets are never overwritten.');
const args=['release','create',tag,`release/Usagi-Setup-${version}.exe`,`release/usagi-${channel}.json`,'release/SHA256SUMS.txt','--repo',repository,'--target',process.env.GITHUB_SHA||'main','--title',`Usagi ${version}`,'--notes-file','deploy/site/public/changelog.md','--draft'];if(channel==='beta')args.push('--prerelease');
const result=spawnSync('gh',args,{stdio:'inherit',shell:false,windowsHide:true});if(result.status!==0)throw new Error('Draft creation failed. Nothing is published automatically.');
