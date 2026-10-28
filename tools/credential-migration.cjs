const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const mode=process.argv[2];app.setName(mode==='write'?'Celestia Launcher':'Usagi');
app.setPath('userData',path.resolve('.scratch-runtime/credential-migration'));
app.whenReady().then(async()=>{const file=path.join(app.getPath('userData'),'migration-fixture.protected');await fs.mkdir(app.getPath('userData'),{recursive:true});if(!safeStorage.isEncryptionAvailable())throw new Error('Windows protected storage unavailable.');if(mode==='write'){await fs.writeFile(file,safeStorage.encryptString('explicit-local-migration-fixture'));console.log('LEGACY NAME ENCRYPTION PASSED');}else if(mode==='read'){if(safeStorage.decryptString(await fs.readFile(file))!=='explicit-local-migration-fixture')throw new Error('Name migration decryption failed.');console.log('USAGI NAME DECRYPTION PASSED');}else throw new Error('Use write or read.');app.quit();}).catch(error=>{console.error(error);app.exit(1);});
