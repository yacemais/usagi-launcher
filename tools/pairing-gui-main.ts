import {app,BrowserWindow,ipcMain,protocol} from 'electron';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Controller} from '../src/main/controller';
import {SocialClient} from '../src/main/social/client';
import {commandSchema} from '../src/shared/validation';
import {inside} from '../src/main/security/files';

if(!process.env.USAGI_PAIRING_TEST_ROOT || !process.env.USAGI_PAIRING_TEST_ORIGIN)throw new Error('Isolated pairing fixture required.');
app.setPath('userData',process.env.USAGI_PAIRING_TEST_ROOT);
protocol.registerSchemesAsPrivileged([{scheme:'celestia',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.enableSandbox();
void app.whenReady().then(async()=>{
  const renderer=path.resolve('dist/renderer');
  protocol.handle('celestia',async request=>{
    const url=new URL(request.url),file=path.resolve(renderer,url.pathname.slice(1)||'index.html');
    if(url.hostname!=='app' || !inside(renderer,file))return new Response(null,{status:403});
    try {const type=({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'} as Record<string,string>)[path.extname(file)]||'application/octet-stream';return new Response(await fs.readFile(file),{headers:{'Content-Type':type,'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'"}});}catch{return new Response(null,{status:404});}
  });
  const window=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{preload:path.resolve('dist/preload/index.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true}});
  const controller=new Controller(app.getPath('userData'),{available:()=>false,encrypt:()=>{throw new Error('No saved account fixture');},decrypt:()=>{throw new Error('No saved account fixture');}},()=>{},async()=>undefined);
  let selected='fixture-alpha';
  const snapshot=()=>({...controller.snapshot(),phase:'idle' as const,selectedAccount:selected,profiles:[{accountId:'fixture-alpha',id:'1'.repeat(32),name:'TestAlpha'},{accountId:'fixture-beta',id:'2'.repeat(32),name:'TestBeta'}]});
  const client=new SocialClient(process.env.USAGI_PAIRING_TEST_ORIGIN!,async()=>({token:selected==='fixture-alpha'?'synthetic-pairing-alpha-session':'synthetic-pairing-beta-session'}),()=>{controller.state.social=client.state;window.webContents.send('celestia:state',snapshot());},()=>{},true);
  ipcMain.handle('celestia:request',async(event,input)=>{
    try {
      if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || !event.senderFrame.url.startsWith('celestia://app/'))throw new Error('Untrusted fixture request.');
      const command=commandSchema.parse(input);
      if(command.type==='startup.visibility')return {ok:true,visible:true};
      if(command.type==='discord.pairing')return {ok:true,pairing:await client.pairing(command.action)};
      if(command.type==='social.connect')await client.connect();
      else if(command.type==='auth.select'){await client.disconnect();selected=command.accountId;await client.connect();}
      else if(command.type!=='snapshot')throw new Error('Unsupported fixture command.');
      return {ok:true,state:snapshot()};
    }catch(error){return {ok:false,error:error instanceof Error ? error.message:'Fixture request failed.'};}
  });
  await window.loadURL('celestia://app/index.html');await client.connect();app.on('before-quit',()=>{void client.disconnect(false);});
});
app.on('window-all-closed',()=>app.quit());
