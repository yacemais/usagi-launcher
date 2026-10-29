import path from 'node:path';
export const WINDOWS_APP_ID='smp.celestia.launcher';
export function windowIdentity(packaged:boolean,test:boolean){return test?WINDOWS_APP_ID+'.testing':packaged?WINDOWS_APP_ID:WINDOWS_APP_ID+'.development';}
export function windowIcon(appRoot:string,resourcesRoot:string,packaged:boolean){return packaged?path.join(resourcesRoot,'icon.ico'):path.join(appRoot,'build/icon.ico');}
