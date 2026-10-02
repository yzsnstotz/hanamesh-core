/** Dependency-free Chrome DevTools Protocol driver for the real-browser prompt tests (Node 24 global WebSocket).
 *  The browser binary is `HM_CHROMIUM` or the macOS Google Chrome install; nothing is written outside a temp profile. */
import {spawn} from 'node:child_process';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function chromeBinary() {
  const candidate = process.env.HM_CHROMIUM ?? DEFAULT_CHROME;
  try { await access(candidate); return candidate; } catch { return null; }
}

async function waitFor(read, label, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`CDP_WAIT_TIMEOUT: ${label} after ${timeoutMs} ms`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export async function launchChrome() {
  const binary = await chromeBinary();
  if (!binary) throw new Error('CHROME_MISSING: set HM_CHROMIUM');
  const profile = await mkdtemp(join(tmpdir(), 'hm-core-chrome-'));
  const child = spawn(binary, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1200,800', 'about:blank'], {stdio: 'ignore'});
  const port = await waitFor(async () => {
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return null; }
  }, 'DevToolsActivePort');
  const close = async () => {
    child.kill('SIGKILL');
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
    await rm(profile, {recursive: true, force: true});
  };
  return {port: Number(port), close};
}

export async function openPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const waiting = new Map();
  const listeners = new Set();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const entry = waiting.get(message.id); waiting.delete(message.id);
      if (message.error) entry?.reject(new Error(`${message.error.message} ${message.error.data ?? ''}`)); else entry?.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; waiting.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params}));
  });
  const page = {
    send,
    on: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw new Error(`PAGE_EXCEPTION: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      return result.result.value;
    },
    async navigate(url) {
      const loaded = new Promise(resolve => { const off = page.on(message => { if (message.method === 'Page.loadEventFired') { off(); resolve(); } }); });
      await send('Page.navigate', {url});
      await loaded;
    },
    waitFor: (expression, label, timeoutMs) => waitFor(() => page.evaluate(expression), label, timeoutMs),
    /** Real input: Chrome hit-tests the point, so an inert document or an invisible layer behaves exactly as for a user. */
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1});
    },
    async clickSelector(selector) {
      const box = await page.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const r = node.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height}; })()`);
      if (!box) throw new Error(`CLICK_TARGET_MISSING: ${selector}`);
      await page.click(box.x, box.y);
      return box;
    },
    async pressEscape() {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', {type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
    },
    close: () => socket.close(),
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return page;
}
