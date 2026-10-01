import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build --mode artifact` makes the self-contained preview bundle that
// scripts/build-preview.mjs folds into one HTML page.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === 'artifact' && {
    base: './',
    resolve: {
      alias: [
        { find: /^\.\/fonts\.js$/, replacement: path.resolve('src/fonts.preview.js') },
        { find: '@supabase/supabase-js', replacement: path.resolve('src/supabase.stub.js') },
      ],
    },
    build: {
      outDir: 'dist-preview',
      copyPublicDir: false,
      modulePreload: false,
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  }),
  test: {
    include: ['tests/**/*.test.js'],
  },
}))
