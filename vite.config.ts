import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Preloads the Latin subset of Inter, so text renders in it from the first paint instead of
 * swapping in later and re-wrapping the page (a layout shift).
 */
function preloadFont(): Plugin {
  return {
    name: 'preload-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_, { bundle }) {
        const font = Object.keys(bundle ?? {}).find((name) =>
          /inter-latin-wght-normal-[\w-]+\.woff2$/.test(name),
        );
        if (!font) return [];
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${font}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloadFont()],
  // Clear of the hub (5180) and Vite's default (5173); moves up if taken.
  server: { port: 5190 },
});
