import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createPrivateKey,createPublicKey,sign } from 'node:crypto';
import { signedManifest } from '../src/main/updater/manifest';
import { safePath,hashFile,atomicWrite } from '../src/main/security/files';
async function main() {
  const [input,keyFile,root,output,...extra]=process.argv.slice(2);
  if(!input || !keyFile || !root || !output || extra.length)throw new Error('Usage: node dist/tools/publish-manifest.cjs <unsigned.json> <private-key.pem> <approved-client-folder> <signed.json>');
  const payload=Buffer.from(JSON.stringify(JSON.parse(await fs.readFile(input,'utf8'))));
  const key=createPrivateKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519')throw new Error('Use an Ed25519 signing key.');
  const envelope={payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')};
  const pack=signedManifest(envelope,createPublicKey(key).export({type:'spki',format:'pem'}).toString());
  for(const file of pack.files){const full=await safePath(path.resolve(root),file.path);const stat=await fs.stat(full);if(!stat.isFile() || stat.size!==file.size || await hashFile(full)!==file.sha256)throw new Error('Release file does not match manifest: '+file.path);}
  await atomicWrite(path.resolve(output),JSON.stringify(envelope,null,2)+'\n');
  console.log(`Signed ${pack.version}, sequence ${pack.sequence}, ${pack.files.length} verified client files. No private key was printed.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Publishing failed.');process.exitCode=1;});
