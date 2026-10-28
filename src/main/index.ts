import { app, BrowserWindow, protocol, ipcMain, dialog, shell, safeStorage, session, nativeImage, Notification } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { Controller } from './controller';
import { commandSchema } from '../shared/validation';
import type { Command, Response } from '../shared/types';
import { inside } from './security/files';
import { httpsUrl, secureFetch, limitedBytes } from './security/network';
import { loadProduct } from './config/product';
import { AppUpdates } from './app-updates/service';
import { microsoftBrowserUrl } from './authentication/browser';
app.setName('Usagi');
app.setAppUserModelId('smp.celestia.launcher');
const testRoot=!app.isPackaged?process.env.USAGI_TEST_DATA||process.env.CELESTIA_TEST_DATA:undefined;
const dataRoot=process.env.USAGI_DATA_DIR||process.env.CELESTIA_DATA_DIR||testRoot;
if(dataRoot && (!path.isAbsolute(dataRoot) || [path.join(os.homedir(),'AppData/Roaming/PrismLauncher'),path.join(os.homedir(),'Documents/RobloxProject')].some(root=>inside(root.toLowerCase(),dataRoot.toLowerCase()) || inside(dataRoot.toLowerCase(),root.toLowerCase()))))throw new Error('Choose an absolute, dedicated Celestia data folder outside Prism and SMP development files.');
app.setPath('userData',dataRoot || path.join(app.getPath('appData'),'CelestiaLauncher'));
protocol.registerSchemesAsPrivileged([{scheme:'celestia',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:false}}]);
app.enableSandbox();
let window:BrowserWindow|undefined,controller:Controller|undefined,appUpdates:AppUpdates|undefined,closing=false,lastNotice='';
const configuredDevUrl=process.env.USAGI_DEV_URL||process.env.CELESTIA_DEV_URL;
const devUrl=!app.isPackaged && configuredDevUrl==='http://127.0.0.1:5173'?configuredDevUrl:undefined;
const csp=`default-src 'none'; script-src 'self'; style-src 'self'${devUrl?" 'unsafe-inline'":''}; img-src 'self' data:; font-src 'self'; connect-src ${devUrl?'http://127.0.0.1:5173 ws://127.0.0.1:5173':"'none'"}; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`;
function trusted(url:string) {try{const u=new URL(url);return devUrl?u.origin===devUrl:u.protocol==='celestia:'&&u.hostname==='app';}catch{return false;}}
if(!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async()=>{
  const product=await loadProduct(app.getAppPath());
  const renderer=path.resolve(__dirname,'../renderer');
  protocol.handle('celestia',async request=>{
    try {const u=new URL(request.url);if(u.hostname!=='app' || request.method!=='GET')return new Response(null,{status:403});const relative=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';const file=path.resolve(renderer,relative);if(!inside(renderer,file) || relative.includes('\\'))return new Response(null,{status:403});const body=await fs.readFile(file);const ext=path.extname(file);const type:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff'};return new Response(body,{headers:{'Content-Type':type[ext]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff'}});}catch{return new Response(null,{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[csp]}}));
  controller=new Controller(app.getPath('userData'),{available:async()=>await safeStorage.isAsyncEncryptionAvailable() && (process.platform!=='linux' || safeStorage.getSelectedStorageBackend()!=='basic_text'),encrypt:v=>safeStorage.encryptStringAsync(v),decrypt:async v=>(await safeStorage.decryptStringAsync(v)).result},state=>{if(window && !window.isDestroyed())window.webContents.send('celestia:state',state);const notice=state.error || (state.gameExit?.at?state.gameExit.at:'');if(notice && notice!==lastNotice){lastNotice=notice;if(state.settings.notifications && Notification.isSupported())new Notification({title:'Usagi',body:state.error || state.message}).show();}},async url=>{
    const u=new URL(url);if(u.hostname!=='textures.minecraft.net' || u.protocol!=='https:')return undefined;const bytes=await limitedBytes(await secureFetch(u.href),2*1024*1024);const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty() || image.getSize().width<16)return undefined;return image.crop({x:8,y:8,width:8,height:8}).toDataURL();
  },async url=>shell.openExternal(microsoftBrowserUrl(url)),product);
  appUpdates=new AppUpdates(path.join(app.getPath('userData'),'launcher-updates'),product.launcherUpdates,{version:app.getVersion(),name:'Usagi',isPackaged:app.isPackaged,appUpdateConfigPath:path.join(app.getAppPath(),'config/app-update.yml'),userDataPath:app.getPath('userData'),baseCachePath:path.join(app.getPath('userData'),'launcher-updates'),whenReady:async()=>{await app.whenReady();},relaunch:()=>app.relaunch(),quit:()=>{if(appUpdates?.state.phase==='installing')app.quit();},onQuit:handler=>app.on('quit',(_event,code)=>handler(code))},controller.log,()=>{controller!.state.appUpdate=appUpdates!.state;controller!.emit();},()=>controller!.state.phase==='idle'&&!controller!.accounts.busy);
  controller.state.appUpdate=appUpdates.state;
  window=new BrowserWindow({width:1200,height:760,minWidth:960,minHeight:620,frame:false,backgroundColor:'#262225',show:false,title:'Usagi',icon:app.isPackaged?path.join(process.resourcesPath,'icon.ico'):path.resolve('build/icon.ico'),webPreferences:{preload:path.resolve(__dirname,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();});
  window.once('ready-to-show',()=>{if(app.isPackaged || process.env.CELESTIA_GUI_TEST!=='1')window?.show();});window.on('maximize',()=>{controller!.state.maximized=true;controller!.emit(true);});window.on('unmaximize',()=>{controller!.state.maximized=false;controller!.emit(true);});
  window.on('close',event=>{
    if(closing || !controller || ['idle','playing'].includes(controller.state.phase)&&!appUpdates?.busy)return;
    event.preventDefault();void dialog.showMessageBox(window!,{type:'question',buttons:['Keep working','Cancel safely and close'],defaultId:0,cancelId:0,message:'A download or verification is in progress.',detail:'Usagi will finish any file replacement transaction before closing.'}).then(async result=>{if(result.response===1){controller!.cancel();appUpdates?.cancel();await Promise.all([controller!.settled(),appUpdates?.settled()]);closing=true;window?.close();}});
  });
  ipcMain.handle('celestia:request',async(event,input):Promise<Response>=>{
    try {
      if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || !trusted(event.senderFrame.url))throw new Error('Untrusted IPC request.');
      const parsed=commandSchema.parse(input) as Command;const c=controller!;
      if(appUpdates?.state.phase==='installing'&&!['snapshot','window'].includes(parsed.type))throw new Error('Usagi is restarting to install an update.');
      if(parsed.type==='settings.save'&&appUpdates?.busy)throw new Error('Finish the Usagi update operation before changing settings.');
      switch(parsed.type) {
        case 'snapshot':return {ok:true,state:c.snapshot()};
        case 'settings.save':{const previous=c.settings.value.appUpdateChannel;await c.save(parsed.settings);if(previous!==c.settings.value.appUpdateChannel)appUpdates!.selectChannel(c.settings.value.appUpdateChannel);break;}
        case 'directory.choose':{const r=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});return {ok:true,path:r.canceled?undefined:r.filePaths[0]};}
        case 'java.choose':{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Java executable',extensions:['exe']}]});return {ok:true,path:r.canceled?undefined:r.filePaths[0]};}
        case 'install':await c.install();break;
        case 'verify':await c.verify();break;
        case 'updates.check':await c.checkUpdates();break;
        case 'cancel':c.cancel();break;
        case 'launch':await c.launch(()=>{if(c.settings.value.minimizeOnLaunch || c.settings.value.launchBehavior==='minimize')window?.minimize();});break;
        case 'auth.login':if(c.state.phase!=='idle')throw new Error('Finish the current operation before signing in.');await c.accounts.login(parsed.method);break;
        case 'appUpdates.check':await appUpdates!.check(c.settings.value.appUpdateChannel);break;
        case 'appUpdates.download':await appUpdates!.download();break;
        case 'appUpdates.cancel':appUpdates!.cancel();break;
        case 'appUpdates.install':{if(c.state.phase!=='idle'||c.accounts.busy)throw new Error('Close Minecraft and finish the current operation first.');const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Restart and install'],defaultId:0,cancelId:0,message:'Install the downloaded Usagi update?',detail:'Usagi will close and open the verified Windows installer. Minecraft files and player data remain in their current folder.'});if(answer.response===1)await appUpdates!.install();break;}
        case 'auth.cancel':c.accounts.cancel();break;
        case 'auth.logout':if(c.state.phase!=='idle')throw new Error('Close Minecraft or finish the operation before changing accounts.');await c.accounts.logout(parsed.accountId);break;
        case 'auth.select':if(c.state.phase!=='idle')throw new Error('Close Minecraft or finish the operation before changing accounts.');await c.accounts.select(parsed.accountId);break;
        case 'server.refresh':await c.refreshServer();break;
        case 'news.refresh':await c.refreshNews();break;
        case 'external.open':await shell.openExternal(httpsUrl(parsed.url).href);break;
        case 'folder.open':{const error=await shell.openPath(await c.folder(parsed.folder));if(error)throw new Error(error);break;}
        case 'window':if(parsed.action==='close')window.close();else if(parsed.action==='minimize')window.minimize();else if(window.isMaximized())window.unmaximize();else window.maximize();break;
      }
      return {ok:true,state:c.snapshot()};
    }catch(error){const text=controller?.log.clean(error instanceof Error?error.message:'Request failed.') ?? 'Request failed.';return {ok:false,error:text};}
  });
  await window.loadURL(devUrl || 'celestia://app/index.html');void controller.initialise().then(()=>{if(appUpdates!.state.phase!=='unconfigured')void appUpdates!.check(controller!.settings.value.appUpdateChannel).catch(error=>controller!.log.write(String(error),'app-updates.log'));});
  const timer=setInterval(()=>void controller?.refreshServer(),60000);timer.unref();
});
app.on('second-instance',()=>{if(window?.isMinimized())window.restore();window?.focus();});app.on('window-all-closed',()=>app.quit());
