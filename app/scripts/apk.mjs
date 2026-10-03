#!/usr/bin/env node
/**
 * Build the APK here and put it on the phone.
 *
 *   npm run apk              # web app, sync, Gradle, install on the connected phone
 *   npm run apk -- --no-install
 *
 * For trying a change before it is pushed. What the phone should normally run
 * is GitHub's build (npm run install:latest); both are signed with the same
 * key and numbered the same way, so either installs over the other without
 * losing the app's data.
 *
 * Needs JDK 21 and the Android SDK. They are looked up where Homebrew puts
 * them unless JAVA_HOME and ANDROID_HOME already say otherwise.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const apk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const install = !process.argv.includes('--no-install');

const env = { ...process.env };
env.JAVA_HOME ??= ['/opt/homebrew/opt/openjdk@21', '/usr/local/opt/openjdk@21'].find(existsSync);
env.ANDROID_HOME ??= ['/opt/homebrew/share/android-commandlinetools', join(homedir(), 'Library/Android/sdk')].find(existsSync);
if (!env.JAVA_HOME) throw new Error('No JDK 21: brew install openjdk@21, or set JAVA_HOME.');
if (!env.ANDROID_HOME) throw new Error('No Android SDK: brew install --cask android-commandlinetools, or set ANDROID_HOME.');
if (!existsSync(join(homedir(), '.caldrop-signing/signing.properties')) && !env.CALDROP_SIGNING) {
  console.warn('! No signing key in ~/.caldrop-signing: this build will not install over GitHub\'s.');
}

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });

run('npm', ['run', 'web']);
run('npx', ['cap', 'sync', 'android']);
/**
 * Numbered the way GitHub's builds are — minutes since 2026-01-01 — so this
 * one is never older than the one on the phone. It used to be 1, which made
 * every local install over GitHub's a downgrade; Android 11 kept the app's
 * data through that, and Android 16 threw it away, settings and key with it.
 */
const build = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000);
run('./gradlew', ['--no-daemon', '--quiet', 'assembleDebug', `-PcaldropBuild=${build}`, '-PcaldropVersion=local'], join(root, 'android'));
console.log(`\nBuilt ${apk}`);

if (install) {
  const phones = execSync('adb devices', { encoding: 'utf8' }).split('\n').filter((l) => /\tdevice$/.test(l));
  if (phones.length === 0) {
    console.error('No phone with USB debugging allowed; the APK is built but not installed.');
    process.exit(1);
  }
  // -d: a build made here is version 1, and GitHub's carry the run number. A
  // debug build may go over a newer one, which is what trying a change needs.
  run('adb', ['install', '-r', '-d', apk]);
}
