const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
app.setName('Usagi');app.setPath('userData',path.resolve('.scratch-runtime/credential-migration'));
app.whenReady().then(async()=>{
  if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('Asynchronous credential protection unavailable.');
  const file=path.join(app.getPath('userData'),'migration-fixture.protected');
  const legacy=await safeStorage.decryptStringAsync(await fs.readFile(file));if(legacy.result!=='explicit-local-migration-fixture')throw new Error('Legacy ciphertext failed.');
  const encrypted=await safeStorage.encryptStringAsync(legacy.result);if((await safeStorage.decryptStringAsync(encrypted)).result!==legacy.result)throw new Error('Async protected-storage round trip failed.');
  await fs.writeFile('docs/credential-migration-results.json',JSON.stringify({fixture:'not a real account or token',oldAppName:'Celestia Launcher',newAppName:'Usagi',legacySyncCiphertextReadableByAsync:true,asyncEncryptionRoundtrip:true},null,2));console.log('LEGACY TO USAGI ASYNC STORAGE PASSED');app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
