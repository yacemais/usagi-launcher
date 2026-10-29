import { describe,it,expect,beforeEach,afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
let root:string,stage:string,digest:string,asset:string;
beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'Usagi publication approval '));stage=path.join(root,'stage');await fs.mkdir(path.join(root,'tools'),{recursive:true});await fs.mkdir(path.join(root,'dist/tools'),{recursive:true});await fs.mkdir(path.join(stage,'assets'),{recursive:true});
  await fs.copyFile('tools/Publish-Modpack.ps1',path.join(root,'tools/Publish-Modpack.ps1'));
  await fs.writeFile(path.join(root,'tools/build-release-tools.mjs'),'// Isolated test substitute.\n');
  await fs.writeFile(path.join(root,'dist/tools/modpack-release.cjs'),'// Isolated substitute; production validation is tested separately.\n');
  const body='test artifact, never executed',sha256=createHash('sha256').update(body).digest('hex');asset='file-'+sha256;await fs.writeFile(path.join(stage,'assets',asset),body);await fs.writeFile(path.join(stage,'assets/changelog.md'),'Explicit private test release; no network.');
  const plan={repository:'yacemais/usagi-launcher',tag:'modpack-v0.1.0',version:'0.1.0',assets:[{name:asset,size:Buffer.byteLength(body),sha256}]};const bytes=JSON.stringify(plan);await fs.writeFile(path.join(stage,'release-plan.json'),bytes);digest=createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(root,'fake-gh.ps1'),String.raw`
$fixtureRoot = $PSScriptRoot
$record = @($args)
Add-Content -LiteralPath (Join-Path $fixtureRoot 'gh-calls.jsonl') -Value (ConvertTo-Json -InputObject $record -Compress)
$storeFile = Join-Path $fixtureRoot 'uploaded.json'
if ($args[0] -eq 'api') {
  if ($args -contains '--slurp' -and ($args -contains '--jq' -or $args -contains '--template')) { throw 'The --slurp option is not supported with --jq or --template.' }
  if ($args[1] -match '/assets$') { if (Test-Path -LiteralPath (Join-Path $fixtureRoot 'paged.json')) { Get-Content -LiteralPath (Join-Path $fixtureRoot 'paged.json') -Raw } elseif (Test-Path -LiteralPath $storeFile) { '[' + (Get-Content -LiteralPath $storeFile -Raw) + ']' } else { '[[]]' } }
  elseif ($args[1] -match '/assets/(\d+)$') { $assetId = [int]$Matches[1]; Get-Content -LiteralPath $storeFile -Raw | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { $_.id -eq $assetId } | ConvertTo-Json -Compress }
} elseif ($args[0] -eq 'release' -and $args[1] -eq 'view') { '{"databaseId":42,"isDraft":true}' }
elseif ($args[0] -eq 'release' -and $args[1] -eq 'upload') {
  $file = Get-Item -LiteralPath $args[3]
  $sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  ConvertTo-Json -InputObject @(@{id=1;name=$file.Name;size=$file.Length;digest="sha256:$sha"}) -Compress | Set-Content -LiteralPath $storeFile
}
$global:LASTEXITCODE=0
`);
});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
async function publish(approval:string,resume=false){return new Promise<{code:number|null;output:string}>((resolve,reject)=>{
  // Windows PowerShell must rebuild its native module paths when Node was launched by PowerShell 7.
  const env={...process.env};for(const key of Object.keys(env))if(key.toUpperCase()==='PSMODULEPATH')delete env[key];
  const child=spawn('powershell.exe',['-NoProfile','-File',path.join(root,'tools/Publish-Modpack.ps1'),'-Stage',stage,'-PrivateKey','fixture-unused-key','-Gh',path.join(root,'fake-gh.ps1'),...(resume?['-ResumeDraft']:[])],{cwd:root,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{output+=b.toString();});child.once('error',reject);child.once('close',code=>resolve({code,output}));child.stdin.end(approval+'\n');
});}
describe.skipIf(process.platform!=='win32')('actual PowerShell approval flow with isolated fake tools and no network',()=>{
  it('makes no GitHub calls when approval is declined',async()=>{const result=await publish('cancel');expect(result.code).not.toBe(0);expect(result.output).toContain('Publication not approved');await expect(fs.stat(path.join(root,'gh-calls.jsonl'))).rejects.toThrow();});
  it('uploads and publishes only after the exact reviewed plan approval',async()=>{const result=await publish('publish modpack-v0.1.0 '+digest);expect(result.code,result.output).toBe(0);const calls=(await fs.readFile(path.join(root,'gh-calls.jsonl'),'utf8')).trim().split(/\r?\n/).map(s=>JSON.parse(s) as string[]);expect(calls.some(a=>a[0]==='release'&&a[1]==='create'&&a.includes('--draft'))).toBe(true);expect(calls.filter(a=>a[1]==='upload')).toHaveLength(1);expect(calls.at(-1)?.slice(0,2)).toEqual(['release','edit']);expect(calls.at(-1)).toContain('--draft=false');});
  it('refuses to overwrite a mismatching asset in an interrupted draft',async()=>{await fs.writeFile(path.join(root,'uploaded.json'),JSON.stringify([{id:1,name:asset,size:1,digest:'sha256:wrong'}]));const result=await publish('publish modpack-v0.1.0 '+digest,true);expect(result.code).not.toBe(0);expect(result.output).toContain('No overwrite is allowed');const calls=(await fs.readFile(path.join(root,'gh-calls.jsonl'),'utf8')).trim().split(/\r?\n/).map(s=>JSON.parse(s) as string[]);expect(calls.some(a=>a[1]==='upload'||a[1]==='edit')).toBe(false);});
  it('verifies every asset across slurped pages, including empty pages',async()=>{
    const planFile=path.join(stage,'release-plan.json'),plan=JSON.parse(await fs.readFile(planFile,'utf8'));
    const bytes=await fs.readFile(path.join(stage,'assets',asset));await fs.writeFile(path.join(stage,'assets','second-artifact'),bytes);
    plan.assets.push({...plan.assets[0],name:'second-artifact'});const encoded=JSON.stringify(plan);await fs.writeFile(planFile,encoded);
    const remote=plan.assets.map((a:{name:string;size:number;sha256:string},i:number)=>({id:i+1,name:a.name,size:a.size,digest:'sha256:'+a.sha256}));
    await fs.writeFile(path.join(root,'uploaded.json'),JSON.stringify(remote));await fs.writeFile(path.join(root,'paged.json'),JSON.stringify([[],[remote[0]],[],[remote[1]]]));
    const result=await publish('publish modpack-v0.1.0 '+createHash('sha256').update(encoded).digest('hex'),true);expect(result.code,result.output).toBe(0);
    const calls=(await fs.readFile(path.join(root,'gh-calls.jsonl'),'utf8')).trim().split(/\r?\n/).map(s=>JSON.parse(s) as string[]);expect(calls.some(a=>a[1]==='upload')).toBe(false);expect(calls.at(-1)).toContain('--draft=false');
  });
});
