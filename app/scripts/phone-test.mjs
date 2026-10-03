#!/usr/bin/env node
/**
 * The app, tested on a real phone: every way in, and what comes out.
 *
 *   npm run test:phone               # all cases
 *   npm run test:phone -- text       # only cases whose name contains "text"
 *
 * Needs a phone on USB with debugging allowed, a debug build of this app
 * installed on it with an API already set up in Settings, and
 * rsvg-convert (brew install librsvg) to draw the test posters.
 *
 * adb sends what another app would send — a share, "open with", the selection
 * menu — and the WebView's DevTools protocol reads the page back, so a case is
 * judged on the dates, times and places the app actually shows. Posters and a
 * PDF are drawn here from SVG, so what each one says is known exactly. Nothing
 * that opens another app (a calendar, a browser) is exercised: a test run
 * should leave nothing behind on the phone, and it removes its own files.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = 'org.droptocal.app';
const DIR = '/sdcard/Download/caldrop-test';
const PORT = 9333;
const only = process.argv[2] ?? '';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the page, over DevTools ----

let ws = null;
let nextId = 1;
const pending = new Map();

async function connect() {
  ws?.close();
  let pid = '';
  for (let i = 0; i < 20 && !pid; i++) {
    pid = sh(`adb shell pidof ${PKG} || true`).split(' ')[0];
    if (!pid) await sleep(500);
  }
  if (!pid) throw new Error('The app is not running.');
  sh(`adb forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`);
  let target;
  for (let i = 0; i < 30 && !target; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      target = list.find((t) => t.url.startsWith('https://localhost'));
    } catch {
      /* not listening yet */
    }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('No page to debug. Is this a debug build?');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
  for (let i = 0; i < 30 && !(await js(`!!document.querySelector('.top h1')`)); i++) await sleep(300);
}

/**
 * Ask the page. A page that is not running — the screen went off, or someone
 * picked the phone up and opened something else — never answers, and a run
 * that waits for ever looks exactly like one that is working. So the wait has
 * an end, and says what usually causes it.
 */
function js(expression, timeout = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const late = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The app stopped answering — is the phone locked, or another app in front?'));
    }, timeout);
    pending.set(id, (d) => {
      clearTimeout(late);
      resolve(d.result?.result?.value ?? null);
    });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

async function fresh() {
  sh(`adb shell am force-stop ${PKG}`);
  sh(`adb shell monkey -p ${PKG} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1`);
  await sleep(2500);
  await connect();
}

/** Every result, with the exact values from its editor. */
async function results() {
  await js(`document.querySelectorAll('.results .card [aria-label="Edit"]').forEach((b) => b.click())`);
  await sleep(400);
  return js(`[...document.querySelectorAll('.results .card')].map((c) => {
    const i = [...c.querySelectorAll('.editor input')];
    return { title: c.querySelector('h2').innerText.trim(), start: i[1].value + ' ' + i[2].value,
      where: c.querySelector('.where')?.innerText.trim() ?? '', repeats: i[7]?.value ?? '',
      note: c.querySelector('.note span')?.innerText.trim() ?? '' };
  })`);
}

const busy = () => js(`!!document.querySelector('.dropzone.working')`);
const messages = () => js(`[...document.querySelectorAll('.toast p')].map((p) => p.innerText.trim())`);
const count = () => js(`document.querySelectorAll('.results .card').length`);
const click = (selector, text) =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((e) => ${text ? `(e.innerText || e.getAttribute('aria-label') || '').includes(${JSON.stringify(text)})` : 'true'});
    if (el) el.click(); return !!el; })()`);

/** Until nothing is being read, and stays that way. */
async function idle(timeout = 300000) {
  const start = Date.now();
  let calm = 0;
  let seen = false;
  while (Date.now() - start < timeout) {
    if (await busy()) {
      seen = true;
      calm = 0;
    } else calm++;
    if (calm >= 3 && (seen || Date.now() - start > 4000)) return;
    await sleep(700);
  }
  throw new Error(`Still reading after ${Math.round(timeout / 60000)} minutes — the endpoint may be slow right now.`);
}

async function typeText(value) {
  await click('button', 'Text');
  await sleep(500);
  await js(`(() => { const ta = document.querySelector('.sheet textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(value)});
    ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  await click('.sheet button', 'Read it');
}

// ---- what other apps send ----

const quote = (s) => `"'${s.replace(/'/g, `'\\''`)}'"`;
const component = `-n ${PKG}/.MainActivity`;
const media = (id) => `content://media/external/file/${id}`;
const share = {
  text: (text) => sh(`adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT ${quote(text)} ${component} >/dev/null 2>&1`),
  selection: (text) => sh(`adb shell am start -a android.intent.action.PROCESS_TEXT -t text/plain --es android.intent.extra.PROCESS_TEXT ${quote(text)} ${component} >/dev/null 2>&1`),
  // The shell can grant only the data URI, so the stream travels as both.
  image: (id) => sh(`adb shell am start -a android.intent.action.SEND -d ${media(id)} -t image/png --eu android.intent.extra.STREAM ${media(id)} --grant-read-uri-permission ${component} >/dev/null 2>&1`),
  pdf: (id) => sh(`adb shell am start -a android.intent.action.VIEW -d ${media(id)} -t application/pdf --grant-read-uri-permission ${component} >/dev/null 2>&1`),
  // What a browser sends for a page: the address, and the page's title beside it.
  link: (url, title) => sh(`adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT ${quote(url)} --es android.intent.extra.SUBJECT ${quote(title)} ${component} >/dev/null 2>&1`),
  openImage: (id) => sh(`adb shell am start -a android.intent.action.VIEW -d ${media(id)} -t image/png --grant-read-uri-permission ${component} >/dev/null 2>&1`),
  sendPdf: (id) => sh(`adb shell am start -a android.intent.action.SEND -t application/pdf --eu android.intent.extra.STREAM ${media(id)} -d ${media(id)} --grant-read-uri-permission ${component} >/dev/null 2>&1`),
};

/** A page that will still say the same thing in years: one fixed date, one place. */
const PAGE = 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_final';
const PAGE_EVENT = ['2026-07-19', 'MetLife'];

// ---- test material ----

const POSTERS = {
  full: ['#fdf3d8', ['OPEN AIR KINO', 'Film: Casablanca', 'Friday 9 October 2026', '20:45', 'Landiwiese, Zürich']],
  title: ['#e3f2fd', ['LATE NIGHT JAZZ', 'with the Anna Keller Trio', 'Moods Jazzclub, Zürich']],
  date: ['#e3f2fd', ['WHEN', 'Thursday 15 October 2026', 'Doors 21:00, music 21:30']],
  two: ['#e8f5e9', ['FLOHMARKT', 'Saturday 17 October 2026, 08:00-16:00', 'Helvetiaplatz, Zürich', '', 'KINDERFLOHMARKT', 'Sunday 18 October 2026, 10:00-14:00', 'Bäckeranlage, Zürich']],
  talk: ['#ffffff', ['VORTRAG: KI IM ALLTAG', 'Dienstag, 13. Oktober 2026', '19:00 bis 20:30 Uhr', 'Volkshochschule Zürich, Raum 3']],
};

function poster(background, lines) {
  const text = lines
    .map((line, i) => `<text x="60" y="${160 + i * 110}" font-family="Helvetica" font-weight="${i ? 'normal' : 'bold'}" font-size="${i ? 46 : 72}" fill="#111">${line}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1300"><rect width="1000" height="1300" fill="${background}"/>${text}</svg>`;
}

/** Draws the posters, puts them on the phone and returns their media ids. */
function prepare() {
  const local = mkdtempSync(join(tmpdir(), 'caldrop-phone-'));
  sh(`adb shell mkdir -p ${DIR}`);
  const ids = {};
  for (const [name, [background, lines]] of Object.entries(POSTERS)) {
    const svg = join(local, `${name}.svg`);
    writeFileSync(svg, poster(background, lines));
    const file = `cdt-${name}.${name === 'talk' ? 'pdf' : 'png'}`;
    execFileSync('rsvg-convert', [...(name === 'talk' ? ['-f', 'pdf'] : []), svg, '-o', join(local, file)]);
    sh(`adb push -q ${join(local, file)} ${DIR}/${file}`);
    sh(`adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${DIR}/${file} >/dev/null`);
    ids[name] = file;
  }
  rmSync(local, { recursive: true, force: true });
  execSync('sleep 3');
  const rows = sh(`adb shell content query --uri content://media/external/file --projection _id:_display_name --where "_display_name\\ LIKE\\ \\'cdt-%\\'"`);
  for (const [name, file] of Object.entries(ids)) {
    const match = rows.match(new RegExp(`_id=(\\d+), _display_name=${file.replace('.', '\\.')}`));
    if (!match) throw new Error(`The phone did not index ${file}.`);
    ids[name] = match[1];
  }
  return ids;
}

function cleanUp(ids) {
  for (const id of Object.values(ids ?? {})) sh(`adb shell content delete --uri ${media(id)} >/dev/null 2>&1 || true`);
  sh(`adb shell rm -rf ${DIR}`);
  sh(`adb forward --remove tcp:${PORT} || true`);
}

// ---- cases ----

/** Every expected event must be among the results: [start, place]. */
function expectEvents(found, wanted) {
  const missing = wanted.filter(([start, place]) => !found.some((e) => e.start.startsWith(start) && e.where.includes(place)));
  const noisy = found.filter((e) => e.note);
  if (missing.length) return `missing ${missing.map(([s, p]) => `${s} @ ${p}`).join('; ')} — got ${found.map((e) => `${e.start} @ ${e.where}`).join('; ') || 'nothing'}`;
  if (noisy.length) return `unexpected note: ${noisy[0].note}`;
  return '';
}

const CASES = [
  ['text: one event, time and place', async () => {
    await fresh(); await typeText('Open Air Kino: Casablanca, Friday 9 October 2026 at 20:45, Landiwiese Zürich'); await idle();
    return expectEvents(await results(), [['2026-10-09 20:45', 'Landiwiese']]);
  }],
  ['text: a programme of three', async () => {
    await fresh(); await typeText('Autumn programme at Rote Fabrik Zürich:\n- 3 Oct 2026, 20:00 Poetry Slam\n- 10 Oct 2026, 21:00 Techno Night\n- 24 Oct 2026, 19:30 Jazz Session'); await idle();
    return expectEvents(await results(), [['2026-10-03 20:00', 'Rote Fabrik'], ['2026-10-10 21:00', 'Rote Fabrik'], ['2026-10-24 19:30', 'Rote Fabrik']]);
  }],
  ['text: repeating event', async () => {
    await fresh(); await typeText('Yoga class every Tuesday at 18:00 starting 6 October 2026, Studio Om, Langstrasse 12, Zürich'); await idle();
    const found = await results();
    return expectEvents(found, [['2026-10-06 18:00', 'Studio Om']]) || (/WEEKLY/.test(found[0]?.repeats) ? '' : `no weekly rule: "${found[0]?.repeats}"`);
  }],
  ['text: repeating, from a day that is not one of its days', async () => {
    // 1 October 2026 is a Thursday: the first run is the Tuesday after it.
    await fresh(); await typeText('Lauftreff every Tuesday starting 1 October 2026, 19:00, Allmend Zürich'); await idle();
    const found = await results();
    return expectEvents(found, [['2026-10-06 19:00', 'Allmend']]) || (/BYDAY=TU/.test(found[0]?.repeats) ? '' : `no Tuesday rule: "${found[0]?.repeats}"`);
  }],
  ['text: repeating yearly', async () => {
    await fresh(); await typeText('Sommerfest jedes Jahr am 21. Juni 2027, ganztägig, Landiwiese Zürich'); await idle();
    const found = await results();
    return expectEvents(found, [['2027-06-21 ', 'Landiwiese']]) || (/^FREQ=YEARLY(;BYMONTH=6;BYMONTHDAY=21)?$/.test(found[0]?.repeats) ? '' : `not a clean yearly rule: "${found[0]?.repeats}"`);
  }],
  ['text: German, weekday and doors', async () => {
    await fresh(); await typeText('Einlass 19:00, Beginn 20 Uhr: Lesung mit Anna Meier am Freitag, 16.10.2026, Kaufleuten Zürich'); await idle();
    return expectEvents(await results(), [['2026-10-16 20:00', 'Kaufleuten']]);
  }],
  ['text: nothing to find', async () => {
    await fresh(); await typeText('Remember to buy milk and bread, and call the plumber about the sink.'); await idle();
    const said = await messages();
    return said.some((m) => m.includes('in that text')) ? '' : `expected the text message, got ${JSON.stringify(said)}`;
  }],
  ['share: text from another app', async () => {
    await fresh(); share.text('Book launch on 22 October 2026, 18:30, Orell Füssli Bahnhofstrasse, Zürich'); await idle();
    return expectEvents(await results(), [['2026-10-22 18:30', 'Orell Füssli']]);
  }],
  ['share: selected text (PROCESS_TEXT)', async () => {
    await fresh(); share.selection('Team dinner Thursday 29 October 2026 19:00 at Zeughauskeller Zürich'); await idle();
    return expectEvents(await results(), [['2026-10-29 19:00', 'Zeughauskeller']]);
  }],
  ['share: a link from a browser, with its title', async () => {
    await fresh(); share.link(PAGE, '2026 FIFA World Cup final - Wikipedia, the free encyclopedia'); await idle();
    return expectEvents(await results(), [PAGE_EVENT]);
  }],
  ['share: selected text that is a link', async () => {
    await fresh(); share.selection(PAGE); await idle();
    return expectEvents(await results(), [PAGE_EVENT]);
  }],
  ['share: image, app closed', async ({ ids }) => {
    sh(`adb shell am force-stop ${PKG}`); share.image(ids.full); await sleep(2500); await connect(); await idle();
    return expectEvents(await results(), [['2026-10-09 20:45', 'Landiwiese']]);
  }],
  ['share: image with two events', async ({ ids }) => {
    await fresh(); share.image(ids.two); await idle();
    return expectEvents(await results(), [['2026-10-17 08:00', 'Helvetiaplatz'], ['2026-10-18 10:00', 'Bäckeranlage']]);
  }],
  ['open with: an image', async ({ ids }) => {
    await fresh(); share.openImage(ids.full); await idle();
    return expectEvents(await results(), [['2026-10-09 20:45', 'Landiwiese']]);
  }],
  ['share: a PDF', async ({ ids }) => {
    await fresh(); share.sendPdf(ids.talk); await idle();
    return expectEvents(await results(), [['2026-10-13 19:00', 'Volkshochschule']]);
  }],
  ['share: PDF opened with the app', async ({ ids }) => {
    await fresh(); share.pdf(ids.talk); await idle();
    return expectEvents(await results(), [['2026-10-13 19:00', 'Volkshochschule']]);
  }],
  ['share: second share during a read waits its turn', async ({ ids }) => {
    await fresh(); share.image(ids.two); await sleep(1500); share.image(ids.full); await idle(); await idle();
    return expectEvents(await results(), [['2026-10-17 08:00', 'Helvetiaplatz'], ['2026-10-09 20:45', 'Landiwiese']]);
  }],
  ['photo: add a page after nothing was found', async ({ ids }) => {
    await fresh(); share.image(ids.title); await idle();
    if (!(await click('button', 'Add a page'))) return `no "Add a page" in ${JSON.stringify(await messages())}`;
    await sleep(1200); share.image(ids.date); await idle();
    return expectEvents(await results(), [['2026-10-15 21:30', 'Moods']]);
  }],
  ['list: select, discard, clear, cancel', async ({ ids }) => {
    await fresh(); share.image(ids.two); await idle(); share.image(ids.full); await idle();
    if ((await count()) !== 3) return `expected 3 results, got ${await count()}`;
    await click('.bulk-head button', 'Select none');
    if (!(await js(`document.querySelector('.bulk .split-main').disabled`))) return 'Add stays enabled with nothing selected';
    await click('.bulk-head button', 'Select all');
    await js(`document.querySelector('.card [aria-label="Discard"]').click()`);
    if ((await count()) !== 2) return 'Discard did not remove one';
    await click('.bulk-head button', 'Clear all'); await sleep(800);
    if ((await count()) !== 0) return 'Clear all left results';
    share.image(ids.two); await sleep(1500);
    await click('.dropzone.working button', 'Cancel'); await sleep(1500);
    return (await busy()) || (await count()) ? 'Cancel did not stop the read' : '';
  }],
  ['paste: nothing to read says so', async () => {
    await fresh();
    await js(`window.Capacitor.Plugins.ClipboardRead.read = () => Promise.resolve({})`);
    await click('button', 'Paste'); await sleep(800);
    return (await messages()).some((m) => m.startsWith('Nothing to paste')) ? '' : 'no message';
  }],
];

// ---- run ----

const chosen = CASES.filter(([name]) => name.includes(only));
if (!chosen.length) {
  console.error(`No case matches "${only}".`);
  process.exit(2);
}
if (!sh('adb devices').split('\n').some((l) => /\tdevice$/.test(l))) {
  console.error('No phone with USB debugging allowed. Plug it in and accept the prompt.');
  process.exit(2);
}

// A screen that is off pauses the app; wake it (a locked phone still needs a hand).
sh('adb shell input keyevent KEYCODE_WAKEUP');

let ids;
let failed = 0;
let skipped = 0;
// Stopped halfway, the run still takes its files off the phone.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanUp(ids);
    process.exit(130);
  });
}
try {
  ids = prepare();
  for (const [name, run] of chosen) {
    const start = Date.now();
    let problem;
    try {
      problem = await run({ ids });
    } catch (err) {
      problem = err.message;
    }
    if (problem === 'skip') {
      skipped++;
      console.log(`– ${name} (skipped: this phone's Android cannot send it from the shell)`);
      continue;
    }
    // What the app said is usually the reason; show it with the failure.
    if (problem) {
      const said = await messages().catch(() => []);
      if (said?.length) problem += `\n    the app said: ${said.join(' / ')}`;
    }
    const seconds = Math.round((Date.now() - start) / 1000);
    if (problem) failed++;
    console.log(`${problem ? '✗' : '✓'} ${name} (${seconds}s)${problem ? `\n    ${problem}` : ''}`);
  }
} finally {
  cleanUp(ids);
  ws?.close();
}
console.log(`\n${chosen.length - failed - skipped} of ${chosen.length - skipped} passed${skipped ? `, ${skipped} skipped` : ''}.`);
process.exit(failed ? 1 : 0);
