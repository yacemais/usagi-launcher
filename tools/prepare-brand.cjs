const {app,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
app.setPath('userData',path.resolve('.scratch-runtime/brand-assets'));
app.whenReady().then(async()=>{
  const source=process.argv[2] || path.resolve('branding/owner-original.png');
  const original=nativeImage.createFromPath(source);if(original.isEmpty())throw new Error('Owner logo could not be read.');
  await fs.mkdir('branding',{recursive:true});await fs.mkdir('src/renderer/assets',{recursive:true});await fs.mkdir('build',{recursive:true});
  if(path.resolve(source)!==path.resolve('branding/owner-original.png'))await fs.copyFile(source,'branding/owner-original.png');
  const normalized=original.resize({width:1600,height:1600});
  const {width,height}=normalized.getSize(),bitmap=normalized.toBitmap();
  const background=[bitmap[0],bitmap[1],bitmap[2]];
  if(bitmap[3]!==0)for(let i=0;i<bitmap.length;i+=4){const distance=Math.max(...background.map((c,k)=>Math.abs(bitmap[i+k]-c)));if(distance<18)bitmap[i+3]=0;}
  const transparent=bitmap[3]===0?normalized:nativeImage.createFromBitmap(bitmap,{width,height});
  const mark=transparent.crop({x:300,y:150,width:1000,height:1120});
  const wordmark=transparent.crop({x:280,y:1300,width:960,height:165});
  await fs.writeFile('src/renderer/assets/usagi-mark.png',mark.resize({height:720}).toPNG());
  await fs.writeFile('src/renderer/assets/usagi-wordmark.png',wordmark.resize({width:720}).toPNG());
  const icon=normalized.crop({x:210,y:100,width:1200,height:1200}).resize({width:256,height:256}).toPNG();
  await fs.writeFile('build/icon.png',icon);
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(icon.length,14);header.writeUInt32LE(22,18);
  await fs.writeFile('build/icon.ico',Buffer.concat([header,icon]));
  console.log(JSON.stringify({sourceWidth:width,sourceHeight:height,backgroundBGR:background,method:'deterministic crop, background key, and resize of owner artwork; no generation'}));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
