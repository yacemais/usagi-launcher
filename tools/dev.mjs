import { spawn } from 'node:child_process';
import { createServer } from 'vite';
await import('./build-main.mjs');
const server = await createServer(); await server.listen();
const { default: electron } = await import('electron');
const child = spawn(electron, ['.'], { stdio:'inherit', env:{ ...process.env, USAGI_DEV_URL:'http://127.0.0.1:5173' }, shell:false });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
