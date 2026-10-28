import { build } from 'esbuild';
await build({entryPoints:['services/social/main.ts'],outfile:'services/social/dist/main.cjs',platform:'node',format:'cjs',bundle:true,target:'node24',external:['ws']});
