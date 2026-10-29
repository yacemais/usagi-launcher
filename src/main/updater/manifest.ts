import { z } from 'zod';
import { createPublicKey, verify } from 'node:crypto';
import { httpsUrl } from '../security/network';
import semver from 'semver';
export const MAX_MANIFEST_BYTES=9*1024*1024;
export const packFileSchema=z.object({path:z.string().min(1).max(240),size:z.number().int().min(0).max(1024*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),url:z.string().max(2048),policy:z.enum(['managed','seed']),optional:z.boolean().default(false)}).strict();
export const manifestSchema=z.object({schemaVersion:z.literal(1),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),version:z.string().min(1).max(80),minecraft:z.literal('1.20.1'),forge:z.literal('47.4.28'),java:z.literal(17),minLauncherVersion:z.string().refine(v=>semver.valid(v)!==null).optional(),notes:z.string().max(16000).optional(),publishedAt:z.string().datetime(),expiresAt:z.string().datetime(),files:z.array(packFileSchema).max(10000)}).strict();
export type PackManifest=z.infer<typeof manifestSchema>;
export type PackFile=z.infer<typeof packFileSchema>;
export const envelopeSchema=z.object({payload:z.string().min(1).max(8*1024*1024),signature:z.string().max(200)}).strict();
export function validatePackPath(value:string) {
  const parts=value.split('/');
  if(parts.length<2 || !['mods','config','kubejs','defaultconfigs','resourcepacks','shaderpacks','moonlight-global-datapacks'].includes(parts[0]) || value.includes('\\') || value.includes(':') || parts.some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p) || /[<>"|?*\x00-\x1f]/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('Disallowed modpack path: '+value);
  if(/(?:^|\/)(?:server\.properties|whitelist\.json|ops\.json|eula\.txt|\.env|.*\.(?:pem|key|pfx|exe|bat|cmd|ps1|dll))$/i.test(value)) throw new Error('Private or executable client distribution file rejected.');
}
export function assertPackCompatibility(pack:PackManifest,launcherVersion:string) {
  if(pack.minLauncherVersion && !semver.gte(launcherVersion,pack.minLauncherVersion))throw new Error(`Modpack ${pack.version} requires Usagi ${pack.minLauncherVersion} or newer. Update the launcher first.`);
}
export function signedManifest(envelope:unknown, publicKey:string, options:{minimumSequence?:number; checkExpiry?:boolean; now?:number}={}):PackManifest {
  const parsed=envelopeSchema.parse(envelope); const payload=Buffer.from(parsed.payload,'base64'); const signature=Buffer.from(parsed.signature,'base64');
  if(payload.toString('base64')!==parsed.payload || signature.length!==64) throw new Error('Invalid signature encoding.');
  const key=createPublicKey(publicKey); if(key.asymmetricKeyType!=='ed25519' || !verify(null,payload,key,signature)) throw new Error('Modpack signature is invalid.');
  const pack=manifestSchema.parse(JSON.parse(payload.toString('utf8'))); const now=options.now ?? Date.now();
  if(pack.sequence<(options.minimumSequence ?? 0)) throw new Error('Manifest rollback was rejected.');
  if(Date.parse(pack.publishedAt)>now+5*60*1000 || Date.parse(pack.expiresAt)<=Date.parse(pack.publishedAt)) throw new Error('Invalid manifest dates.');
  if(options.checkExpiry!==false && Date.parse(pack.expiresAt)<=now) throw new Error('This manifest has expired.');
  const paths=new Set<string>(); let total=0;
  for(const file of pack.files) { validatePackPath(file.path); httpsUrl(file.url); const key=file.path.toLowerCase(); if(paths.has(key)) throw new Error('Duplicate managed path.'); paths.add(key); total+=file.size; }
  if(total>50*1024*1024*1024) throw new Error('Pack exceeds the supported total size.');
  return pack;
}
