import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await build({
  configFile: false,
  plugins: [react()],
  logLevel: 'warn',
  build: {
    ssr: resolve('scripts/render_studies.tsx'),
    outDir: '.analysis-build',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'render-studies.mjs' } },
  },
});
await import(pathToFileURL(resolve('.analysis-build/render-studies.mjs')).href);
