import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;

  return {
    base: normalizedBase,
    define: {
      CESIUM_BASE_URL: JSON.stringify(`${normalizedBase}cesium`),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
          { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
          { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
          { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
        ],
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
