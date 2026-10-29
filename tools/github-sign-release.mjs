import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPrivateKey,createPublicKey,createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const config=JSON.parse(await fs.readFile('config/usagi.json','utf8'));
const repository=process.env.RELEASE_REPOSITORY,channel=process.env.RELEASE_CHANNEL;
if(repository!=='yacemais/usagi-launcher'||!['stable','beta'].includes(channel))throw new Error('Unexpected release repository/channel.');
if(!process.env.USAGI_APP_SIGNING_KEY)throw new Error('Configure the USAGI_APP_SIGNING_KEY Actions secret before creating a signed-feed release.');
const key=createPrivateKey(process.env.USAGI_APP_SIGNING_KEY),publicKey=createPublicKey(key).export({type:'spki',format:'pem'}).toString();
if(publicKey.trim()!==config.launcherUpdates.publicKey.trim())throw new Error('The Actions signing key does not match the public key embedded in Usagi.');
const keyFile=path.join(process.env.RUNNER_TEMP||os.tmpdir(),'usagi-app-private.pem');
await fs.writeFile(keyFile,key.export({type:'pkcs8',format:'pem'}),{mode:0o600});
try{
  const installer=`Usagi-Setup-${version}.exe`,now=Date.now();
  const template={schemaVersion:1,product:'usagi',platform:'win32',arch:'x64',channel,sequence:Math.floor(now/1000),version,publishedAt:new Date(now).toISOString(),expiresAt:new Date(now+90*86400000).toISOString(),notes:await fs.readFile('deploy/site/public/changelog.md','utf8'),installer:{url:`https://github.com/${repository}/releases/download/launcher-v${version}/${installer}`}};
  await fs.writeFile('release/app-release-template.json',JSON.stringify(template));
  execFileSync(process.execPath,['dist/tools/publish-app-release.cjs','release/app-release-template.json',`release/${installer}`,keyFile,`release/usagi-${channel}.json`],{stdio:'inherit',shell:false,windowsHide:true});
  const digest=createHash('sha256').update(await fs.readFile(`release/${installer}`)).digest('hex');await fs.writeFile('release/SHA256SUMS.txt',`${digest}  ${installer}\n`);
}finally{await fs.rm(keyFile,{force:true});}
