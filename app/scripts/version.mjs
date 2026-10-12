#!/usr/bin/env node
/**
 * Version codes, the one place they are worked out.
 *
 *   node scripts/version.mjs dev          # the code for a build between releases
 *   node scripts/version.mjs check v1.2.0 # does build.gradle say what the tag says?
 *
 * A release's code follows from its name: 1.2.3 is 10,203,000 (major ×
 * 10,000,000 + minor × 100,000 + patch × 1,000). F-Droid builds a tag and
 * reads versionCode and versionName from build.gradle as written, so both
 * stay literals there, and a tag that disagrees with them is not released.
 *
 * The thousand codes after a release belong to the builds that follow it: the
 * last tag's code plus the commits since (at most 999). So every build is
 * newer than the release before it and older than the release after — an
 * installed release updates to a later test build, and that to the next
 * release, without anything having to be uninstalled.
 *
 * Builds before this scheme counted minutes since 2026-01-01 (about 400,000
 * by October 2026), so 1.2.0 and everything after it is newer than all of them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gradle = join(import.meta.dirname, '../android/app/build.gradle');

export function codeOf(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Not a release version: ${version}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`${version}: minor and patch go up to 99`);
  return major * 10_000_000 + minor * 100_000 + patch * 1_000;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function devCode() {
  const tag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
  const since = Number(git('rev-list', '--count', `${tag}..HEAD`));
  return codeOf(tag) + Math.min(since, 999);
}

function check(tag) {
  const text = readFileSync(gradle, 'utf8');
  const code = Number(/versionCode\s+(\d+)/.exec(text)?.[1]);
  const name = /versionName\s+"([^"]+)"/.exec(text)?.[1];
  const want = tag.replace(/^v/, '');
  if (name !== want || code !== codeOf(want)) {
    throw new Error(
      `build.gradle says ${name} (${code}); ${tag} needs versionName "${want}" and versionCode ${codeOf(want)}.`,
    );
  }
  console.log(`${tag}: ${code}`);
}

if (process.argv[1] === import.meta.filename) {
  const [command, arg] = process.argv.slice(2);
  if (command === 'dev') console.log(devCode());
  else if (command === 'check' && arg) check(arg);
  else {
    console.error('usage: version.mjs dev | check <tag>');
    process.exit(2);
  }
}
