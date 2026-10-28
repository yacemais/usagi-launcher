import { build } from 'esbuild';
for(const name of ['publish-manifest','publish-app-release','github-pages'])await build({entryPoints:[`tools/${name}.ts`],outfile:`dist/tools/${name}.cjs`,bundle:true,platform:'node',format:'cjs',target:'node24'});
