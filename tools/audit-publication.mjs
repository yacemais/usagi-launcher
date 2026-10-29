import { execFileSync } from 'node:child_process';
import { readFileSync,lstatSync } from 'node:fs';
const staged=process.argv.includes('--staged');
const files=execFileSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:process.argv.includes('--worktree')?['ls-files','--cached','--others','--exclude-standard','-z']:['ls-files','-z'],{encoding:'utf8',shell:false,windowsHide:true}).split('\0').filter(Boolean);
if(!files.length)throw new Error('No reviewed Git files found. Stage the explicit publication file list first.');
const blocked=[];let scanned=0;
for(const name of files){
  if(/(^|\/)(?:node_modules|release|dist|\.scratch-runtime|\.scratch|saves|screenshots|logs|crash-reports)(?:\/|$)/i.test(name)&&!name.startsWith('docs/screenshots/'))blocked.push(name+': private/generated directory');
  if(/(?:^|\/)(?:\.env(?:\..*)?|accounts\.protected|settings\.json|credentials(?:\..*)?|secrets?(?:\..*)?)$|\.(?:pem|key|pfx|p12|protected|log)$/i.test(name))blocked.push(name+': sensitive filename');
  if(name==='branding/owner-original.png'||/^docs\/.*-results\.json$/.test(name))blocked.push(name+': owner/machine evidence kept local');
  if(/\.private\.json$|(?:^|\/)file-[a-f0-9]{64}$|\.(?:jar|mrpack|modpack\.zip)$/i.test(name)&&name!=='integrations/forge/gradle/wrapper/gradle-wrapper.jar')blocked.push(name+': private modpack review or binary distribution asset');
  if(lstatSync(name).isSymbolicLink())blocked.push(name+': symlink');
  const bytes=staged?execFileSync('git',['show',':'+name],{shell:false,windowsHide:true,maxBuffer:16*1024*1024}):readFileSync(name);scanned++;
  if(bytes.includes(0))continue;const text=bytes.toString('utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)||/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/.test(text))blocked.push(name+': possible credential material');
  if(/C:[\\/]Users[\\/](?!Public[\\/])[^\\/\r\n]+[\\/]/i.test(text))blocked.push(name+': personal local filesystem path');
}
if(blocked.length){for(const problem of blocked)console.error(problem);process.exitCode=1;}else console.log(`Publication check passed for ${scanned} ${staged?'staged':process.argv.includes('--worktree')?'worktree':'tracked'} files. No blocked paths or recognized credential patterns found. Manual diff review is still required.`);
