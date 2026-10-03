import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DropToCal, as an app.
 *
 * The web app is the app: the same bundle that GitHub Pages serves is copied
 * into www/ and shipped inside the shell, so there is one implementation of
 * everything and no second version to keep in step. What the shell adds is
 * what a browser cannot give: the bundle on the device rather than over the
 * network, a launcher icon, no address bar eating the viewfinder — and, on
 * Android, the ability to hand an event to a calendar app directly, which a
 * web page is not allowed to do.
 */
const config: CapacitorConfig = {
  appId: 'org.droptocal.app',
  appName: 'DropToCal',
  webDir: 'www',
  server: {
    // Serve the bundle from https://localhost rather than http://. The camera
    // and the clipboard are only offered to a secure context, and this app is
    // built entirely out of those two.
    androidScheme: 'https',
  },
};

export default config;
