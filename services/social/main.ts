import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { createSocialServer } from './server';
process.umask(0o077);
const file=path.resolve(process.env.USAGI_SOCIAL_DB||'data/social.sqlite');mkdirSync(path.dirname(file),{recursive:true});
const app=createSocialServer({file,bridgeSecret:process.env.USAGI_BRIDGE_SECRET||''});
const port=Number(process.env.PORT||8787);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT.');
app.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Usagi Social service listening. TLS termination is required outside loopback.'));
const close=()=>void app.close().then(()=>process.exit(0));process.on('SIGINT',close);process.on('SIGTERM',close);
