import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';

// Custom plugin to copy static extension assets to dist
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');

      // Copy static files
      const staticFiles = [
        'manifest.json',
        'sw-loader.js',
        'popup.html',
        'popup.js',
        'options.html',
        'options.js',
        'options.css',
        'get-started.html',
        'get-started.js',
        'get-started.css',
        'supabase-bundle.js',
        'supabase.js',
        'google-analytics.js',
        'LICENSE.txt',
      ];

      for (const file of staticFiles) {
        const src = resolve(__dirname, file);
        if (existsSync(src)) {
          copyFileSync(src, resolve(dist, file));
        }
      }

      // Copy icons directory
      const iconsSrc = resolve(__dirname, 'icons');
      const iconsDist = resolve(dist, 'icons');
      if (existsSync(iconsSrc)) {
        cpSync(iconsSrc, iconsDist, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Build the background service worker as an IIFE (Chrome MV3 requirement)
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      },
    },
    // Disable minification for easier debugging during development
    minify: false,
  },
  resolve: {
    alias: {
      // Ensure @summakey/shared-utils resolves to the local package source
      '@summakey/shared-utils': resolve(__dirname, '../packages/shared-utils/src/index.js'),
    },
  },
  plugins: [copyExtensionAssets()],
});
