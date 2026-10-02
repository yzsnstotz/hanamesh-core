// Real Google Chrome (Playwright driver, read-only dependency of hanamesh-web-market) against the isolated DSH web host.
// usage: node ui.mjs <tag> <port> <out-prefix> <steps-json>
// steps: {"wait":ms} {"capture":"sfx"} {"click":"text"} {"clickRole":["button","name"]} {"press":"Key"}
import fs from 'node:fs';
import { chromium } from '/Users/yzliu/work/projects/hanamesh/hanamesh-web-market/node_modules/playwright/index.mjs';
const [tag, port, prefix, stepsJson] = process.argv.slice(2), RUN = process.env.RUN, EVID = process.env.EVID;
const url = fs.readFileSync(`${RUN}/${tag}.url`, 'utf8').trim(), red = s => s.replace(/token=[A-Za-z0-9_-]+/g, 'token=<redacted>');
const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const out = { tag:prefix, captures:[], consoleErrors:[], coreRequests:[], steps:[] };
try {
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
  page.on('console', m => { if (m.type() === 'error') out.consoleErrors.push(red(m.text()).slice(0, 300)); });
  page.on('response', r => { const u = new URL(r.url()); if (/hanamesh/.test(u.pathname)) out.coreRequests.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  const nav = await page.goto(url, { waitUntil:'domcontentloaded', timeout:30_000 }); out.rootStatus = nav?.status() ?? null;
  await page.waitForTimeout(2_500);
  for (const t of ['Continue', 'Configure later']) { const b = page.getByText(t, { exact:true }); if (await b.isVisible().catch(() => false)) { await b.click(); out.steps.push(`dismissed ${t}`); await page.waitForTimeout(800); } }
  out.loaderIds = await page.evaluate(() => { const l = window.__ModuleLoader__; const ids = l?.modules ? [...(l.modules.keys?.() ?? Object.keys(l.modules))] : null; return ids; }).catch(e => `n/a: ${e.message}`);
  for (const s of JSON.parse(stepsJson || '[]')) {
    try {
      if (s.wait) await page.waitForTimeout(s.wait);
      else if (s.click) { await page.getByText(s.click, { exact:true }).first().click({ timeout:5_000 }); out.steps.push(`click ${s.click}`); }
      else if (s.clickRole) { await page.getByRole(s.clickRole[0], { name:s.clickRole[1] }).first().click({ timeout:5_000 }); out.steps.push(`clickRole ${s.clickRole.join(':')}`); }
      else if (s.press) { await page.keyboard.press(s.press); out.steps.push(`press ${s.press}`); }
      else if (s.capture) { const f = `${prefix}-${s.capture}`; fs.writeFileSync(`${EVID}/ui/${f}.txt`, JSON.stringify({ title:await page.title(), path:new URL(page.url()).pathname, bodyText:red((await page.locator('body').innerText()).slice(0, 20_000)) }, null, 2));
        await page.screenshot({ path:`${EVID}/ui/${f}.png`, fullPage:true }); out.captures.push(f); }
    } catch (e) { out.steps.push(`FAILED ${JSON.stringify(s)}: ${e.message.split('\n')[0]}`); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(out));
