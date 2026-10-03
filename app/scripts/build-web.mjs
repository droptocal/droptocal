/**
 * Put the web app into www/.
 *
 * The shell holds no copy of DropToCal: it builds the real thing from ../web,
 * beside it in the same repository, and ships the result.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const www = join(here, 'www');

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

/**
 * Which commit of the web app this is.
 *
 * "main" names a moving target, so a build stamped with it says nothing
 * about what is actually inside: two APKs a week apart carry the same label
 * and no way to tell which one has the fix being tested. The commit does not
 * move, so it is read here — this is the one place that knows which checkout
 * was used — and handed to the build that stamps the version.
 */
function webCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // A source tree that is not a checkout at all still builds.
    return 'unknown';
  }
}

const dir = join(here, '..', 'web');
const commit = webCommit(dir);
console.log(`web app: commit ${commit}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${commit}\n`);
run('npm', [existsSync(join(dir, 'package-lock.json')) ? 'ci' : 'install'], dir);
run('npm', ['run', 'build'], dir);
rmSync(www, { recursive: true, force: true });
cpSync(join(dir, 'dist'), www, { recursive: true });
console.log(`web app: built into ${www}`);
