import { SocialError } from './store';
export interface VerifiedIdentity{uuid:string;name:string}
export type IdentityVerifier=(token:string)=>Promise<VerifiedIdentity>;
export const verifyMinecraftIdentity:IdentityVerifier=async token=>{
  const headers={Authorization:'Bearer '+token};
  const options={headers,redirect:'error' as const,signal:AbortSignal.timeout(20000)};
  const ownership=await fetch('https://api.minecraftservices.com/entitlements/mcstore',options);
  if(!ownership.ok)throw new SocialError('identity','Minecraft could not verify this session. Sign in again.');
  const entitlements=await ownership.json() as {items?:{name:string}[]};
  if(!entitlements.items?.some(i=>i.name==='game_minecraft'||i.name==='product_minecraft'))throw new SocialError('ownership','Minecraft Java ownership is required.');
  const response=await fetch('https://api.minecraftservices.com/minecraft/profile',options);
  if(!response.ok)throw new SocialError('identity','Minecraft profile verification failed.');
  const profile=await response.json() as {id?:string;name?:string};
  if(!profile.id||!profile.name||!/^[a-f0-9]{32}$/i.test(profile.id)||!/^[A-Za-z0-9_]{1,16}$/.test(profile.name))throw new SocialError('identity','Minecraft returned an invalid profile.');
  return {uuid:profile.id.toLowerCase(),name:profile.name};
};
