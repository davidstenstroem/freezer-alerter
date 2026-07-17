import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/main.ts',
  outDir: './dist',
  format: 'esm',
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
  platform: 'node',
  unbundle: false,
  clean: true,
  minify: true,
  sourcemap: false,
  outputOptions: {
    codeSplitting: false,
  },
});
