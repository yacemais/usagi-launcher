import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash,generateKeyPairSync,verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=await fs.mkdtemp(path.resolve('.scratch-runtime/publisher-'));
try{
  await fs.mkdir(path.join(root,'client/config'),{recursive:true});const body=Buffer.from('{}\n');await fs.writeFile(path.join(root,'client/config/fixture.json'),body);
  const keys=generateKeyPairSync('ed25519');await fs.writeFile(path.join(root,'fixture-only-private.pem'),keys.privateKey.export({type:'pkcs8',format:'pem'}));
  const manifest={schemaVersion:1,sequence:1,version:'TEST FIXTURE',minecraft:'1.20.1',forge:'47.4.28',java:17,publishedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),files:[{path:'config/fixture.json',size:body.length,sha256:createHash('sha256').update(body).digest('hex'),url:'https://fixture.example.invalid/config/fixture.json',policy:'managed',optional:false}]};await fs.writeFile(path.join(root,'unsigned.json'),JSON.stringify(manifest));
  const run=()=>spawnSync(process.execPath,['dist/tools/publish-manifest.cjs',path.join(root,'unsigned.json'),path.join(root,'fixture-only-private.pem'),path.join(root,'client'),path.join(root,'signed.json')],{encoding:'utf8',shell:false,windowsHide:true});
  const good=run();if(good.status!==0)throw new Error(good.stderr);const envelope=JSON.parse(await fs.readFile(path.join(root,'signed.json'),'utf8'));if(!verify(null,Buffer.from(envelope.payload,'base64'),keys.publicKey,Buffer.from(envelope.signature,'base64')))throw new Error('Publisher signature failed verification.');
  await fs.writeFile(path.join(root,'client/config/fixture.json'),'changed');if(run().status===0)throw new Error('Publisher accepted changed release content.');
  const appFile=path.join(root,'Usagi-Setup-0.3.0.exe');await fs.writeFile(appFile,'fixture payload, never executed');
  await fs.writeFile(path.join(root,'app-template.json'),JSON.stringify({schemaVersion:1,product:'usagi',platform:'win32',arch:'x64',channel:'stable',sequence:1,version:'0.3.0',publishedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),notes:'Explicit test fixture only',installer:{url:'https://fixture.example.invalid/Usagi-Setup-0.3.0.exe'}}));
  const signed=spawnSync(process.execPath,['dist/tools/publish-app-release.cjs',path.join(root,'app-template.json'),appFile,path.join(root,'fixture-only-private.pem'),path.join(root,'app-signed.json')],{encoding:'utf8',shell:false,windowsHide:true});if(signed.status!==0)throw new Error(signed.stderr);
  const appEnvelope=JSON.parse(await fs.readFile(path.join(root,'app-signed.json'),'utf8'));if(!verify(null,Buffer.from(appEnvelope.payload,'base64'),keys.publicKey,Buffer.from(appEnvelope.signature,'base64')))throw new Error('App publisher signature failed.');const decoded=JSON.parse(Buffer.from(appEnvelope.payload,'base64').toString());if(decoded.installer.sha512!==createHash('sha512').update(await fs.readFile(appFile)).digest('base64'))throw new Error('App publisher checksum failed.');
  await fs.writeFile('docs/publisher-results.json',JSON.stringify({checks:['actual CLI signs verified local fixture','signature independently verified with node:crypto','corrupt release file rejected'],productionSigningKey:'not supplied or generated'},null,2));console.log('PUBLISHER CHECKS PASSED');
}finally{await fs.rm(root,{recursive:true,force:true});}
