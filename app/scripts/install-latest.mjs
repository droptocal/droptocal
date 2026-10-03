#!/usr/bin/env node
/**
 * Put GitHub's newest APK on the phone.
 *
 *   npm run install:latest
 *
 * GitHub's build is the one the phone should run: every push to main makes
 * it, versions it by run number and stamps it with the web app's commit. This
 * finds the newest successful one, downloads it with gh, checks that it is
 * signed with the shared key — an APK signed with any other would only install
 * after an uninstall, which takes the API key with it — and installs it.
 *
 * Needs gh (logged in) and adb with the phone connected.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'DropToCal/droptocal';
// The key every DropToCal build is signed with (see android/app/build.gradle).
const KEY = '3f6821d36a7c0f98c3d7a3f2db242a3c3314635df347ee66c9e0fff52c1b21ff';

// apksigner is Java; use Homebrew's JDK 21 unless JAVA_HOME says otherwise.
const env = { ...process.env };
env.JAVA_HOME ??= ['/opt/homebrew/opt/openjdk@21', '/usr/local/opt/openjdk@21'].find(existsSync);
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', env }).trim();

const [run] = JSON.parse(
  out('gh', ['run', 'list', '-R', REPO, '--workflow', 'android.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'databaseId,displayTitle,createdAt']),
);
if (!run) throw new Error('No successful build on main yet.');
console.log(`Build ${run.databaseId}: ${run.displayTitle} (${run.createdAt})`);

const dir = mkdtempSync(join(tmpdir(), 'caldrop-apk-'));
try {
  execFileSync('gh', ['run', 'download', String(run.databaseId), '-R', REPO, '-n', 'droptocal-debug-apk', '-D', dir], { stdio: 'inherit' });
  const apk = join(dir, readdirSync(dir).find((f) => f.endsWith('.apk')));

  const sdk = process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools';
  const tools = join(sdk, 'build-tools', readdirSync(join(sdk, 'build-tools')).sort().at(-1));
  const certs = out(join(tools, 'apksigner'), ['verify', '--print-certs', apk]);
  if (!certs.toLowerCase().includes(KEY)) {
    throw new Error(`That APK is not signed with DropToCal's key, so it would not install over the app:\n${certs}`);
  }

  const phones = execSync('adb devices', { encoding: 'utf8' }).split('\n').filter((l) => /\tdevice$/.test(l));
  if (phones.length === 0) throw new Error(`No phone with USB debugging allowed. The APK is at ${apk}.`);
  execFileSync('adb', ['install', '-r', apk], { stdio: 'inherit' });
  console.log(out('adb', ['shell', 'dumpsys', 'package', 'org.droptocal.app']).match(/versionName=.*/)?.[0] ?? '');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
