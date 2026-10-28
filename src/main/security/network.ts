import { lookup, type LookupAddress } from 'node:dns';
import { isIP, type TcpNetConnectOpts } from 'node:net';
import { Agent, fetch as httpFetch } from 'undici';
export function httpsUrl(value:string):URL {
  const u=new URL(value); if(u.protocol!=='https:' || u.username || u.password || u.hash || (u.port && u.port!=='443')) throw new Error('Only public HTTPS resources on port 443 are allowed.');
  if(u.hostname==='localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local')) throw new Error('Local download endpoints are not allowed.');
  return u;
}
export function publicIp(ip:string) {
  if(isIP(ip)===4) { const a=ip.split('.').map(Number); return !(a[0]===0 || a[0]===10 || a[0]===127 || a[0]>=224 || a[0]===169&&a[1]===254 || a[0]===172&&a[1]>=16&&a[1]<=31 || a[0]===192&&a[1]===168 || a[0]===100&&a[1]>=64&&a[1]<=127); }
  return isIP(ip)===6 && !/^(::|fc|fd|fe[89ab])/i.test(ip);
}
const publicLookup:NonNullable<TcpNetConnectOpts['lookup']>=(hostname,options,callback)=>{
  lookup(hostname,{all:true},(error,addresses)=>{
    if(error){callback(error,'',0);return;}
    if(!addresses.length || addresses.some(a=>!publicIp(a.address))){callback(new Error('Download host resolves to a private address.'),'',0);return;}
    if((options as {all?:boolean}).all)(callback as unknown as (error:Error|null,addresses:LookupAddress[])=>void)(null,addresses);
    else callback(null,addresses[0].address,addresses[0].family);
  });
};
const dispatcher=new Agent({connect:{lookup:publicLookup},headersTimeout:30000,bodyTimeout:30000});
export async function secureFetch(url:string, options:RequestInit={}, hops=0):Promise<Response> {
  const u=httpsUrl(url); const hostname=u.hostname.replace(/^\[|\]$/g,'');if(isIP(hostname) && !publicIp(hostname))throw new Error('Private download addresses are not allowed.');
  const signal=options.signal ?? AbortSignal.timeout(30000);
  const response=await httpFetch(u,{...options,signal,redirect:'manual',dispatcher} as Parameters<typeof httpFetch>[1]) as unknown as Response;
  if([301,302,303,307,308].includes(response.status)) { await response.body?.cancel(); if(hops>=4) throw new Error('Too many download redirects.'); const next=new URL(response.headers.get('location') ?? '',u); return secureFetch(next.href,options,hops+1); }
  if(!response.ok) { await response.body?.cancel(); throw new Error(`Request failed (${response.status}) for ${u.hostname}.`); }
  return response;
}
export async function limitedBytes(response:Response, max:number) {
  if(Number(response.headers.get('content-length'))>max) { await response.body?.cancel(); throw new Error('Response exceeds allowed size.'); }
  const parts:Uint8Array[]=[]; let size=0; if(!response.body) throw new Error('Empty response.');
  for await(const part of response.body) { size+=part.length; if(size>max) { throw new Error('Response exceeds allowed size.'); } parts.push(part); }
  return Buffer.concat(parts);
}
