import { describe,it,expect } from 'vitest';
import path from 'node:path';
import { windowIcon,windowIdentity,WINDOWS_APP_ID } from '../src/main/config/window-icon';
describe('Windows taskbar identity and existing owner icon',()=>{
  it('keeps the installed identity and separates tests and development from its taskbar group',()=>{expect(windowIdentity(true,false)).toBe(WINDOWS_APP_ID);expect(windowIdentity(false,false)).not.toBe(WINDOWS_APP_ID);expect(windowIdentity(true,true)).not.toBe(WINDOWS_APP_ID);expect(windowIdentity(false,true)).not.toBe(windowIdentity(false,false));});
  it('resolves the development icon from the application folder when launched from another working directory',()=>{const root=path.resolve('fixture app');expect(windowIcon(root,path.resolve('resources'),false)).toBe(path.join(root,'build/icon.ico'));expect(windowIcon(root,path.resolve('resources'),true)).toBe(path.resolve('resources/icon.ico'));});
});
