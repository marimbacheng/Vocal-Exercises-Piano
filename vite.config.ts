/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 子路徑部署,資產一律相對路徑(SPEC Section 5,陷阱 #4)
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // public/ 內非 build 產物的資產也要進 precache
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Vocal Exercises Piano',
        short_name: 'Vocal Exercises Piano',
        description: 'Vocal exercise scales on a sampled grand piano, with automatic chromatic transposition. Works offline.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 關鍵:precache 所有鋼琴取樣 mp3,否則離線 = 無聲(陷阱 #5)
        globPatterns: ['**/*.{js,css,html,mp3,png,svg,ico,webmanifest}'],
        // 單一 mp3 約 110KB,遠低於預設 2MB 上限;放寬以防未來換更大取樣
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
