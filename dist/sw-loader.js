/**
 * SummaKey Shopper — Service Worker Entry Point
 *
 * This file loads Supabase first (via importScripts), then loads the
 * bundled background logic. This two-step approach is required because:
 *   1. Chrome MV3 service workers don't support ES module imports
 *   2. The Supabase bundle exposes globals needed by supabase.js
 *   3. supabase.js exposes auth helper globals needed by background.js
 *
 * The Vite build outputs the bundled code to dist/background.js.
 * This loader (dist/sw-loader.js) is what the manifest actually points to.
 */

importScripts('google-analytics.js', 'supabase-bundle.js', 'supabase.js', 'background.js');
