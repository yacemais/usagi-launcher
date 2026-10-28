import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
export async function inspectJava(file:string) {
  let result;
  try { result=await run(file,['-XshowSettings:properties','-version'],{windowsHide:true,timeout:15000,maxBuffer:128*1024}); }
  catch { throw new Error('Java could not start. Select a working 64-bit Java 17 executable in Settings. On Windows, some Java 17 builds require their runtime folder to use ASCII characters; your Minecraft folder may still contain Unicode characters.'); }
  const output=result.stderr+'\n'+result.stdout;
  const version=output.match(/(?:java\.version\s*=\s*|version\s+")([^\s"]+)/)?.[1]; const arch=output.match(/os\.arch\s*=\s*(\S+)/)?.[1];
  const major=Number(version?.split('.')[0]); if(!version || major!==17) throw new Error('Minecraft 1.20.1 requires Java 17. Select a Java 17 executable.');
  if(arch && !['amd64','x86_64'].includes(arch)) throw new Error('Select 64-bit Java 17.');
  return {path:file,version,major};
}
