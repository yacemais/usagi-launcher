import { generateKeyPairSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const [directory,name,...extra]=process.argv.slice(2);
if(!directory||!name||extra.length||!path.isAbsolute(directory)||!/^[a-z0-9-]+$/.test(name))throw new Error('Usage: node tools/create-signing-key.mjs <absolute-secure-folder> <key-name>');
await fs.mkdir(directory,{recursive:true});const keys=generateKeyPairSync('ed25519');
await fs.writeFile(path.join(directory,name+'-private.pem'),keys.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
await fs.writeFile(path.join(directory,name+'-public.pem'),keys.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
console.log('Created key files. Keep the private key outside the repository and hosting folders. Only distribute the public key.');
