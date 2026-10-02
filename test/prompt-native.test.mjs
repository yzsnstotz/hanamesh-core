/** P05-CORE-01: the one-time bind prompt must be seen by the user before it is spent, and must never lock the host.
 *  Real Chrome + the built client bundle + the desktop host's settings concealment rule (test/fixtures/prompt-host.mjs).
 *  Clicks are CDP mouse events, so Chrome's own hit-testing decides what an inert or invisible layer swallows.
 *  `HM_CORE_CLIENT_BUNDLE` points the same tests at another bundle (used to replay the rc.46 RED). */
import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromeBinary, launchChrome, openPage} from './fixtures/cdp.mjs';
import {startPromptHost} from './fixtures/prompt-host.mjs';

const binary = await chromeBinary();
const skip = binary ? false : 'CHROME_MISSING: set HM_CHROMIUM to a Chrome/Chromium binary (recorded as NOT_RUN, never PASS)';
const OBSERVE_MS = 1500; // ~7 accelerated 60 s polls
let chrome;
before(async () => { if (!skip) chrome = await launchChrome(); });
after(async () => { await chrome?.close(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function session(t, {query = ''} = {}) {
  const host = await startPromptHost();
  const page = await openPage(chrome.port);
  t.after(async () => { page.close(); await host.close(); });
  await page.navigate(`${host.origin}/${query}`);
  await page.waitFor('Boolean(window.__hm && window.__hm.module)', 'client bundle loaded');
  const shot = async name => {
    if (!process.env.HM_EVIDENCE_DIR) return;
    await mkdir(process.env.HM_EVIDENCE_DIR, {recursive: true});
    const {data} = await page.send('Page.captureScreenshot', {format: 'png'});
    await writeFile(join(process.env.HM_EVIDENCE_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const observe = () => page.evaluate(`(() => {
    const node = document.querySelector('dialog[data-hanamesh-core-prompt]');
    return {visible: window.__hm.visiblePrompt(), present: Boolean(node), open: Boolean(node && node.open), text: node ? node.textContent : null,
      buttons: node ? [...node.querySelectorAll('button')].map(b => b.textContent) : [], stampAudit: window.__hm.stampAudit,
      settingsOpen: window.__hm.settingsOpen(), errors: window.__hm.errors};
  })()`);
  return {host, page, shot, observe};
}

test('normal view: pending 分 shows a visible prompt with the amount and both buttons, stamped once and only while visible', {skip}, async t => {
  const {host, page, observe, shot} = await session(t);
  host.state.armed = true;
  await page.waitFor('window.__hm.visiblePrompt()', 'visible prompt in normal view', 5_000);
  await sleep(OBSERVE_MS);
  const seen = await observe();
  await shot('normal-view-prompt');
  assert.equal(seen.visible, true);
  assert.match(seen.text, /15 分/);
  assert.deepEqual(seen.buttons, ['去网站绑定', '以后再说']);
  assert.equal(host.state.stamps, 1);
  assert.deepEqual(seen.stampAudit.map(entry => entry.visible), [true]);
});

test('P05 A path: pending appears while the settings page is open — the prompt is visible without leaving settings and is stamped only while visible', {skip}, async t => {
  const {host, page, observe, shot} = await session(t);
  await page.evaluate('window.__hm.openSettings()');
  host.state.armed = true; // consent granted on the settings page → first pending 分
  await sleep(OBSERVE_MS);
  const seen = await observe();
  await shot('settings-open-after-pending');
  assert.equal(seen.settingsOpen, true);
  assert.equal(seen.visible, true, `the user must see the prompt on the settings page; saw ${JSON.stringify({present: seen.present, open: seen.open})}`);
  assert.ok(seen.stampAudit.every(entry => entry.visible), `marker stamped while the prompt was not visible: ${JSON.stringify(seen.stampAudit)}`);
  assert.equal(host.state.stamps, 1);
});

test('settings open: the user is never locked — whenever no prompt is visible, a real click on "Back to app" works', {skip}, async t => {
  const {host, page, observe} = await session(t);
  await page.evaluate('window.__hm.openSettings()');
  host.state.armed = true;
  await sleep(OBSERVE_MS);
  const seen = await observe();
  if (!seen.visible) {
    await page.clickSelector('#back');
    await sleep(100);
    const after = await page.evaluate('({backClicks: window.__hm.backClicks, settingsOpen: window.__hm.settingsOpen()})');
    assert.deepEqual(after, {backClicks: 1, settingsOpen: false}, `no visible prompt, yet "Back to app" ignored a real click (invisible modal inerts the page); dialog present=${seen.present} open=${seen.open}`);
  } else {
    assert.equal(seen.visible, true); // a visible modal is the only acceptable reason for the host to be unreachable
  }
});

test('以后再说 (real click) closes the prompt, settings and "Back to app" stay operable, and a cold start never prompts again', {skip}, async t => {
  const {host, page, observe, shot} = await session(t);
  await page.evaluate('window.__hm.openSettings()');
  host.state.armed = true;
  await page.waitFor('window.__hm.visiblePrompt()', 'visible prompt over settings', 5_000);
  await page.clickSelector('dialog[data-hanamesh-core-prompt] button:last-of-type');
  await sleep(100);
  const closed = await observe();
  await shot('after-later');
  assert.equal(closed.visible, false);
  assert.equal(closed.open, false);
  await page.clickSelector('#consent');
  assert.equal(await page.evaluate('document.getElementById("consent").checked'), true, 'settings controls respond after dismissal');
  await page.clickSelector('#back');
  await sleep(100);
  assert.deepEqual(await page.evaluate('({backClicks: window.__hm.backClicks, settingsOpen: window.__hm.settingsOpen()})'), {backClicks: 1, settingsOpen: false});
  await page.clickSelector('#composer');
  assert.equal(await page.evaluate('window.__hm.composerClicks'), 1, 'the app behind settings is operable');
  assert.equal(host.state.stamps, 1);
  // Cold start: same host state (marker persisted), fresh page.
  await page.navigate(`${host.origin}/`);
  await page.waitFor('Boolean(window.__hm && window.__hm.module)', 'reloaded');
  await sleep(OBSERVE_MS);
  const cold = await observe();
  assert.equal(cold.present && cold.open, false, 'never prompts again after the marker is stamped');
  assert.equal(host.state.stamps, 1);
});

test('去网站绑定 keeps the existing bind-link + system-browser path and closes the prompt', {skip}, async t => {
  const {host, page, observe} = await session(t);
  host.state.armed = true;
  await page.waitFor('window.__hm.visiblePrompt()', 'visible prompt', 5_000);
  await page.clickSelector('dialog[data-hanamesh-core-prompt] button:first-of-type');
  await page.waitFor('window.__hm.opened.length === 1', 'window.open called');
  await sleep(200);
  const seen = await observe();
  assert.equal(seen.open, false);
  assert.equal(host.state.bindLinks, 1);
  assert.deepEqual(host.state.openExternal, ['https://hanamesh.invalid/bind?challenge=fixture']);
  assert.deepEqual(await page.evaluate('window.__hm.opened'), ['https://hanamesh.invalid/bind?challenge=fixture']);
  await page.clickSelector('#composer');
  assert.equal(await page.evaluate('window.__hm.composerClicks'), 1);
});

test('a prompt that cannot be opened (showModal throws) consumes nothing and never inerts the page', {skip}, async t => {
  const {host, page, observe} = await session(t, {query: '?nomount'});
  await page.evaluate(`HTMLDialogElement.prototype.showModal = function () { throw new DOMException('fixture refusal', 'InvalidStateError'); }; window.__hm.mountFooter();`);
  host.state.armed = true;
  await sleep(OBSERVE_MS);
  const seen = await observe();
  assert.equal(seen.visible, false);
  assert.equal(host.state.stamps, 0, 'a prompt that never opened must not spend the one-time marker');
  await page.clickSelector('#composer');
  assert.equal(await page.evaluate('window.__hm.composerClicks'), 1, 'page stays operable');
});

test('unmounting the footer while the prompt is open removes it and leaves the host operable, with no extra stamp', {skip}, async t => {
  const {host, page, observe} = await session(t);
  host.state.armed = true;
  await page.waitFor('window.__hm.visiblePrompt()', 'visible prompt', 5_000);
  await page.evaluate('window.__hm.unmountFooter()');
  await sleep(200);
  const seen = await observe();
  assert.equal(seen.present && seen.open, false);
  await page.clickSelector('#composer');
  assert.equal(await page.evaluate('window.__hm.composerClicks'), 1);
  assert.equal(host.state.stamps, 1);
});

test('a hidden window (document.visibilityState hidden) defers the prompt and the marker until the window is visible', {skip}, async t => {
  const {host, page, observe} = await session(t, {query: '?nomount'});
  // Headless Chrome is always "visible"; this narrows the OS-hidden window to the property Core reads.
  await page.evaluate(`window.__hmHidden = true; Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => window.__hmHidden ? 'hidden' : 'visible'}); Object.defineProperty(document, 'hidden', {configurable: true, get: () => window.__hmHidden}); window.__hm.mountFooter();`);
  host.state.armed = true;
  await sleep(OBSERVE_MS);
  assert.equal(host.state.stamps, 0, 'nothing is spent while the window is hidden');
  assert.equal((await observe()).open, false);
  await page.evaluate(`window.__hmHidden = false; document.dispatchEvent(new Event('visibilitychange'));`);
  await page.waitFor('window.__hm.visiblePrompt()', 'prompt after window became visible', 5_000);
  await sleep(300);
  assert.equal(host.state.stamps, 1);
  assert.deepEqual((await observe()).stampAudit.map(entry => entry.visible), [true]);
});

test('a prompt that opens but is still not on screen (host style hides it) is closed again: nothing spent, page operable', {skip}, async t => {
  const {host, page, observe} = await session(t);
  await page.evaluate(`(() => { const style = document.createElement('style'); style.textContent = 'dialog[data-hanamesh-core-prompt]{visibility:hidden}'; document.head.append(style); })()`);
  host.state.armed = true;
  await sleep(OBSERVE_MS);
  const seen = await observe();
  assert.equal(seen.open, false, 'an unseen modal must not stay open');
  assert.equal(host.state.stamps, 0);
  await page.clickSelector('#composer');
  assert.equal(await page.evaluate('window.__hm.composerClicks'), 1, 'page stays operable');
});
