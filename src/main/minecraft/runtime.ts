import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { MinecraftFolder, Version, LaunchPrecheck, generateArguments, type LaunchOption } from '@xmcl/core';
import { createNodeInstallRuntime, executeInstallManifest, executeInstallWorkflow, createModernForgeInstallWorkflow, createJavaRuntimeInstallWorkflow, resolveMinecraftVersionJsonInstallFile, resolveMinecraftJarInstallFile, resolveLibraryInstallFiles, resolveAssetMetadataInstallFiles, resolveAssetObjectInstallFiles, DEFAULT_RUNTIME_ALL_URL, type InstallFile, type JavaRuntimeTarget } from '@xmcl/installer';
import type { Settings, Progress } from '../../shared/types';
import { atomicWrite, exists, hashFile, inside, readJson, safePath } from '../security/files';
import { secureFetch, limitedBytes } from '../security/network';
import { Downloads } from '../installer/downloads';
import { Logger } from '../logging/logger';
import { inspectJava } from './java';
import type { MinecraftSession } from '../authentication/accounts';
export const MC='1.20.1', FORGE='47.4.28', VERSION_ID='1.20.1-forge-47.4.28';
const receiptSchema=z.object({version:z.literal(VERSION_ID),files:z.record(z.string(),z.string().regex(/^[a-f0-9]{64}$/)),at:z.string()}).strict();
export class MinecraftRuntime {
  readonly resources:string; readonly javaRoot:string; private inventory=new Set<string>();
  constructor(private root:string,private log:Logger,private report:(p:Progress)=>void) {this.resources=path.join(root,'minecraft');this.javaRoot=path.join(root,'java17');}
  private async guard(file:string) {
    const root=[this.resources,this.javaRoot].find(r=>inside(r,file)); if(!root) throw new Error('Runtime path escapes its managed directory.');
    await safePath(root,path.relative(root,file).split(path.sep).join('/'));
  }
  private executor(signal:AbortSignal,settings:Settings,java?:string) {
    const downloads=new Downloads(this.report,file=>this.guard(file));
    const runtime=createNodeInstallRuntime({signal,download:async files=>{for(const f of files)this.inventory.add(f.path);await downloads.run(files,signal,settings.concurrency,'Installing Minecraft');},runJava:async command=>{
      if(command.executable!==java) throw new Error('Unexpected Java installer executable.');
      this.report({phase:'Preparing Forge',file:'Running official Forge processors',downloaded:0,total:0,speed:0,filesDone:0,filesTotal:0});
      await new Promise<void>((resolve,reject)=>{ const child=spawn(command.executable,command.args,{cwd:command.cwd,env:{...process.env,...command.env},shell:false,windowsHide:true,signal}); let errorText=''; child.stdout.on('data',b=>this.log.write(String(b),'installer.log'));child.stderr.on('data',b=>{errorText+=String(b).slice(0,4000);this.log.write(String(b),'installer.log');});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Forge processor failed. See installer.log.'))); });
    }});
    const materialize=runtime.materialize; runtime.materialize=async operations=>{ for(const op of operations) { await this.guard(op.path); if('source' in op) await this.guard(op.source); if(op.type==='link') { const target=path.resolve(path.dirname(op.path),op.source); await this.guard(target); } } return materialize(operations); };
    return runtime;
  }
  async ensureJava(settings:Settings,signal:AbortSignal) {
    if(settings.javaPath) return inspectJava(settings.javaPath);
    const executable=path.join(this.javaRoot,'bin/java.exe');
    if(await exists(executable)) {
      try { return await inspectJava(executable); }
      catch { this.log.write('The managed Java runtime did not start. Verifying its official files before retrying.'); }
    }
    const response=await limitedBytes(await secureFetch(DEFAULT_RUNTIME_ALL_URL,{signal}),4*1024*1024);
    const index=JSON.parse(response.toString('utf8')) as Record<string,Record<string,JavaRuntimeTarget[]>>;
    const target=index['windows-x64']?.['java-runtime-gamma']?.find(t=>t.version.name.startsWith('17.'));
    if(!target) throw new Error('Official Java 17 runtime is unavailable. Select an installed Java 17 executable.');
    await executeInstallWorkflow(createJavaRuntimeInstallWorkflow({target,destination:this.javaRoot}),this.executor(signal,settings),{signal}); return inspectJava(executable);
  }
  async install(settings:Settings,signal:AbortSignal) {
    await fs.mkdir(this.resources,{recursive:true}); this.inventory.clear(); const java=await this.ensureJava(settings,signal); const runtime=this.executor(signal,settings,java.path); const folder=new MinecraftFolder(this.resources);
    const list=JSON.parse((await limitedBytes(await secureFetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',{signal}),8*1024*1024)).toString('utf8')) as {versions:{id:string;url:string;sha1:string}[]};
    const info=list.versions.find(v=>v.id===MC); if(!info || !/^[a-f0-9]{40}$/.test(info.sha1)) throw new Error('Official Minecraft metadata is unavailable.');
    const json=resolveMinecraftVersionJsonInstallFile({id:MC,url:info.url},folder); json.checksum={algorithm:'sha1',value:info.sha1};
    const files=async(id:string,items:InstallFile[])=>executeInstallManifest({schemaVersion:1,tasks:[{id,type:'files',files:items}]},runtime,{signal});
    await files('minecraft-metadata',[json]); let version=await Version.parse(folder,MC);
    const jar=resolveMinecraftJarInstallFile(version); if(!jar) throw new Error('Minecraft client download is missing.');
    await files('minecraft-base',[jar,...resolveLibraryInstallFiles(version.libraries,folder),...resolveAssetMetadataInstallFiles(version,folder)]);
    await files('minecraft-assets',await resolveAssetObjectInstallFiles(version,folder));
    const artifact=`${MC}-${FORGE}`, installerUrl=`https://maven.minecraftforge.net/net/minecraftforge/forge/${artifact}/forge-${artifact}-installer.jar`;
    const sha=(await limitedBytes(await secureFetch(installerUrl+'.sha1',{signal}),1024)).toString('utf8').trim().split(/\s/)[0]; if(!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Forge installer checksum is invalid.');
    await executeInstallWorkflow(createModernForgeInstallWorkflow({id:'forge',minecraft:folder,minecraftVersion:MC,artifactVersion:artifact,java:java.path,side:'client',installer:{path:path.join(this.resources,'installers',`forge-${artifact}.jar`),urls:[installerUrl],checksum:{algorithm:'sha1',value:sha}},installOptions:{java:java.path,versionId:VERSION_ID}}),runtime,{signal});
    version=await Version.parse(folder,VERSION_ID); await files('forge-libraries',resolveLibraryInstallFiles(version.libraries,folder));
    for(const lib of version.libraries) this.inventory.add(path.join(this.resources,'libraries',lib.download.path));
    this.inventory.add(folder.getVersionJson(VERSION_ID));this.inventory.add(folder.getVersionJson(MC));
    const digests:Record<string,string>={};
    for(const file of this.inventory) {signal.throwIfAborted(); if(!inside(this.resources,file)) continue; if(!await exists(file))throw new Error('A required runtime file was not installed: '+path.basename(file)); await this.guard(file); digests[path.relative(this.resources,file).split(path.sep).join('/')]=await hashFile(file); }
    await atomicWrite(path.join(this.root,'runtime-receipt.json'),JSON.stringify({version:VERSION_ID,files:digests,at:new Date().toISOString()})); return java;
  }
  async verify(signal?:AbortSignal) {
    const receiptFile=path.join(this.root,'runtime-receipt.json'); if(!await exists(receiptFile)) return false;
    const receipt=receiptSchema.parse(await readJson(receiptFile)); if(!Object.keys(receipt.files).length) return false;
    for(const [file,digest] of Object.entries(receipt.files)) {signal?.throwIfAborted(); const full=await safePath(this.resources,file); if(!await exists(full) || await hashFile(full)!==digest) return false;}
    await Version.parse(this.resources,VERSION_ID); return true;
  }
  async launch(settings:Settings,session:MinecraftSession) {
    const java=await inspectJava(settings.javaPath || path.join(this.javaRoot,'bin/java.exe'));
    const version=await Version.parse(this.resources,VERSION_ID); const folder=new MinecraftFolder(this.resources);
    const options:LaunchOption={gamePath:settings.gameDirectory,resourcePath:this.resources,javaPath:java.path,version,gameProfile:{id:session.profile.id,name:session.profile.name},accessToken:session.token,userType:'mojang',launcherName:'Usagi',launcherBrand:'usagi',minMemory:1024,maxMemory:settings.ramMb,extraJVMArgs:['-Dfile.encoding=UTF-8'],resolution:{width:settings.width,height:settings.height,fullscreen:settings.fullscreen},quickPlayMultiplayer:settings.autoJoin && settings.serverHost ? `${settings.serverHost.includes(':')?'['+settings.serverHost+']':settings.serverHost}:${settings.serverPort}` : undefined};
    for(const check of LaunchPrecheck.DEFAULT_PRECHECKS) await check(folder,version,options);
    const args=await generateArguments(options); const userType=args.indexOf('--userType'); if(userType<0) throw new Error('Minecraft authentication argument is missing.'); args[userType+1]='msa';
    this.log.secret(session.token); this.log.write(`Launching Minecraft ${MC} Forge ${FORGE} with Java ${java.version}. Arguments and credentials are not logged.`);
    return new Promise<ReturnType<typeof spawn>>((resolve,reject)=>{const child=spawn(java.path,args,{cwd:settings.gameDirectory,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});child.once('error',reject);child.once('spawn',()=>resolve(child));});
  }
}
