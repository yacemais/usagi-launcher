import { promises as fs } from 'node:fs';
import path from 'node:path';
const packages=['lucide-react','@fontsource/inter','react','react-dom','electron','@xmcl/core','@xmcl/installer','@xmcl/user','@azure/msal-node','zod','undici','electron-updater','semver'];
const notices=['Third-party notices for Usagi. Additional dependency notices remain in the packaged node_modules and Electron distribution.\n'];
for(const name of packages){const root=path.join('node_modules',name);const files=await fs.readdir(root);const file=files.find(n=>/^licen[cs]e(?:\.md|\.txt)?$/i.test(n));if(!file)throw new Error('Missing license notice: '+name);notices.push('\n=== '+name+' ===\n'+await fs.readFile(path.join(root,file),'utf8'));}
await fs.writeFile('THIRD_PARTY_NOTICES.txt',notices.join('\n'));
