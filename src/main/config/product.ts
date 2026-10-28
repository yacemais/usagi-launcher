import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { httpsUrl } from '../security/network';
const endpoint=z.string().refine(v=>{if(!v)return true;try{httpsUrl(v);return true;}catch{return false;}},'Use a public HTTPS endpoint.');
const key=z.string().refine(v=>{if(!v)return true;try{return v.startsWith('-----BEGIN PUBLIC KEY-----')&&createPublicKey(v).asymmetricKeyType==='ed25519';}catch{return false;}},'Use an Ed25519 public key.');
export const productSchema=z.object({
  microsoftClientId:z.union([z.literal(''),z.string().uuid()]),
  modpack:z.object({manifestUrl:endpoint,publicKey:key}).strict(),
  newsUrl:endpoint,server:z.object({host:z.string().max(253),port:z.number().int().min(1).max(65535)}).strict(),
  launcherUpdates:z.object({baseUrl:endpoint,publicKey:key,publisherNames:z.array(z.string().min(1).max(500)).max(10)}).strict()
}).strict();
export type ProductConfig=z.infer<typeof productSchema>;
export const emptyProduct:ProductConfig={microsoftClientId:'',modpack:{manifestUrl:'',publicKey:''},newsUrl:'',server:{host:'',port:25565},launcherUpdates:{baseUrl:'',publicKey:'',publisherNames:[]}};
export async function loadProduct(root:string){return productSchema.parse(JSON.parse(await fs.readFile(path.join(root,'config/usagi.json'),'utf8')));}
