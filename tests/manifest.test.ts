import { describe,it,expect } from 'vitest';
import { generateKeyPairSync,sign } from 'node:crypto';
import { signedManifest,validatePackPath } from '../src/main/updater/manifest';
import { publicIp,httpsUrl } from '../src/main/security/network';
import { commandSchema } from '../src/shared/validation';
const keys=generateKeyPairSync('ed25519'),key=keys.publicKey.export({type:'spki',format:'pem'}).toString();
function envelope(overrides:Record<string,unknown>={}) {const value={schemaVersion:1,sequence:1,version:'fixture-1',minecraft:'1.20.1',forge:'47.4.28',java:17,publishedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),files:[],...overrides};const bytes=Buffer.from(JSON.stringify(value));return {payload:bytes.toString('base64'),signature:sign(null,bytes,keys.privateKey).toString('base64')};}
describe('authenticated manifests',()=>{
  it('accepts an authentic exact-target manifest',()=>expect(signedManifest(envelope(),key).version).toBe('fixture-1'));
  it('rejects a tampered payload',()=>{const e=envelope();e.payload=Buffer.from(JSON.stringify({x:1})).toString('base64');expect(()=>signedManifest(e,key)).toThrow();});
  it('rejects a wrong signing key',()=>expect(()=>signedManifest(envelope(),generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString())).toThrow());
  it('rejects expired manifests',()=>expect(()=>signedManifest(envelope({publishedAt:new Date(Date.now()-100000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()}),key)).toThrow());
  it('rejects rollback and unsupported target versions',()=>{expect(()=>signedManifest(envelope(),key,{minimumSequence:2})).toThrow();expect(()=>signedManifest(envelope({minecraft:'1.21'}),key)).toThrow();});
  it('rejects Windows case collisions',()=>{const file={path:'mods/a.jar',size:0,sha256:'0'.repeat(64),url:'https://fixtures.invalid/a',policy:'managed'};expect(()=>signedManifest(envelope({files:[file,{...file,path:'mods/A.jar'}]}),key)).toThrow();});
  it.each(['../saves/world.dat','mods/../../x','C:/mods/a.jar','mods/a.jar:stream','mods\\a.jar','mods/CON.jar','mods/a.','mods/a /x','saves/world.dat','screenshots/test.png','resourcepacks/../options.txt','config/server.properties','config/private.pem','kubejs/start.cmd'])('rejects unsafe path %s',value=>expect(()=>validatePackPath(value)).toThrow());
});
describe('network and IPC boundaries',()=>{
  it('rejects client-provided executable paths, download sources and offline auth modes',()=>{for(const command of [{type:'appUpdates.install',path:'C:/forged.exe'},{type:'appUpdates.download',url:'https://evil.example/forged.exe'},{type:'auth.login',method:'offline'}])expect(()=>commandSchema.parse(command)).toThrow();});
  it.each(['http://example.com/x','file:///C:/x','https://user:password@example.com/x','https://localhost/x','https://example.com:1234/x'])('rejects unsafe URL %s',url=>expect(()=>httpsUrl(url)).toThrow());
  it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fd00::1'])('rejects private address %s',ip=>expect(publicIp(ip)).toBe(false));
  it('accepts public IPv4/IPv6',()=>{expect(publicIp('1.1.1.1')).toBe(true);expect(publicIp('2606:4700:4700::1111')).toBe(true);});
  it('rejects arbitrary IPC commands and extra payloads',()=>{expect(()=>commandSchema.parse({type:'exec',command:'cmd.exe'})).toThrow();expect(()=>commandSchema.parse({type:'launch',accessToken:'forged'})).toThrow();expect(()=>commandSchema.parse({type:'folder.open',folder:'C:/Windows'})).toThrow();});
});
