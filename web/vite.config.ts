import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (project subpath)
// and inside a Capacitor native WebView.
export default defineConfig(({ mode }) => {
  // The app's build (app/scripts/build-web.mjs) sets SOURCE_DATE_EPOCH to the
  // commit's time, so the same commit builds the same bytes — which F-Droid
  // checks before it ships our signed APK. The website keeps the clock.
  const epoch = Number(loadEnv(mode, '.', '').SOURCE_DATE_EPOCH);
  const built = epoch ? new Date(epoch * 1000) : new Date();
  return {
    base: './',
    plugins: [react()],
    // Shown in Settings: without it, a stale cached copy is indistinguishable
    // from a current one, which is exactly the bug this was added for.
    define: { __BUILD__: JSON.stringify(built.toISOString().slice(0, 16).replace('T', ' ')) },
    build: { target: 'es2022' },
  };
});
