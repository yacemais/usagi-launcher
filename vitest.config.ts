import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@xmcl/unzip':path.resolve('node_modules/@xmcl/unzip/dist/index.js'),'@xmcl/core/utils':path.resolve('src/main/compat/xmcl-utils.ts')}},test:{include:['tests/**/*.test.ts'],testTimeout:20000,hookTimeout:20000,fileParallelism:false}});
