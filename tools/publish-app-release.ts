import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createPrivateKey,createPublicKey,sign } from 'node:crypto';
import { verifyAppRelease } from '../src/main/app-updates/release';
import { hashFile,atomicWrite } from '../src/main/security/files';
async function main(){
  const [template,installer,keyFile,output,...extra]=process.argv.slice(2);
  if(!template||!installer||!keyFile||!output||extra.length)throw new Error('Usage: node dist/tools/publish-app-release.cjs <release-template.json> <Usagi-Setup-version.exe> <private-key.pem> <signed-channel.json>');
  const input=JSON.parse(await fs.readFile(template,'utf8')),file=await fs.stat(installer);if(!file.isFile())throw new Error('Select the built NSIS installer.');
  if(path.basename(installer)!==`Usagi-Setup-${input.version}.exe`)throw new Error('Installer filename must match the release version.');
  const url=new URL(input.installer.url);if(decodeURIComponent(url.pathname.split('/').at(-1)!)!==path.basename(installer))throw new Error('Hosted filename must match the installer.');
  input.installer={url:input.installer.url,size:file.size,sha512:Buffer.from(await hashFile(installer,'sha512'),'hex').toString('base64')};
  const payload=Buffer.from(JSON.stringify(input)),key=createPrivateKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519')throw new Error('Use an Ed25519 release signing key.');
  const envelope={payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')};
  const release=verifyAppRelease(envelope,createPublicKey(key).export({type:'spki',format:'pem'}).toString(),input.channel);
  await atomicWrite(path.resolve(output),JSON.stringify(envelope,null,2)+'\n');console.log(`Signed Usagi ${release.version} for ${release.channel}. Upload the installer first, then this signed channel file. No key was printed.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Release signing failed.');process.exitCode=1;});
