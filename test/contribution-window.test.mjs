import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {configOf} from '../lib/validation.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const GRANTED = {...INITIAL_CORE_SNAPSHOT, consent: {state: 'granted', changedAt: '2026-10-15T00:00:00.000Z'},
  registration: {status: 'registered', principalId: 'p', registeredAt: '2026-10-15T00:00:00.000Z', lastError: null, attempts: 1}};
const DAY = 86_400_000;

test('contributionWindowDays is a named config: default 90, integer 1..90', () => {
  assert.equal(configOf({serverOrigin: null, websiteOrigin: null}).contributionWindowDays, 90);
  assert.equal(configOf({serverOrigin: null, websiteOrigin: null, contributionWindowDays: 1}).contributionWindowDays, 1);
  assert.equal(configOf({serverOrigin: null, websiteOrigin: null, contributionWindowDays: 30}).contributionWindowDays, 30);
  for (const value of [0, 91, 1.5, '30', -1]) assert.throws(() => configOf({serverOrigin: null, websiteOrigin: null, contributionWindowDays: value}), {code: 'CORE_INPUT_INVALID'}, String(value));
});

test('contributions read the configured window and carry availability', async t => {
  const urls = [];
  let availability = 'available';
  const fetcher = async url => { urls.push(new URL(String(url))); return Response.json({...(availability === undefined ? {} : {availability}), byHana: [{actions: {install: 1, open: 2, use: 3, uninstall: 0}}]}); };
  const controller = await SessionController.create({serverOrigin: 'https://server.fixture.invalid', websiteOrigin: null, contributionWindowDays: 30}, memoryStore(GRANTED).store, {fetcher});
  t.after(() => controller.dispose());
  const ready = await controller.refreshContributions();
  assert.deepEqual(ready, {status: 'ready', windowDays: 30, availability: 'available', actions: {install: 1, open: 2, use: 3, uninstall: 0}});
  const from = Date.parse(urls[0].searchParams.get('from'));
  const to = Date.parse(urls[0].searchParams.get('to'));
  assert.equal(to - from, 30 * DAY);
  assert.equal(controller.state().configuration.contributionWindowDays, 30);

  availability = 'unavailable';
  await controller.refresh();
  assert.equal(controller.state().contributions.availability, 'unavailable', 'numbers stay, availability says they are incomplete');
  assert.equal(controller.state().contributions.actions.use, 3);

  availability = undefined;
  await controller.refresh();
  assert.equal(controller.state().contributions.availability, null, 'a server that does not say is reported as unknown, not complete');

  availability = 'partial';
  await controller.refresh();
  assert.deepEqual(controller.state().contributions, {status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE'});
});

test('activity defaults to the configured window', async t => {
  const urls = [];
  const fetcher = async url => {
    const parsed = new URL(String(url));
    urls.push(parsed);
    return Response.json({items: [], nextAfter: null, window: {from: parsed.searchParams.get('from'), to: parsed.searchParams.get('to')}});
  };
  const controller = await SessionController.create({serverOrigin: 'https://server.fixture.invalid', websiteOrigin: null, contributionWindowDays: 7}, memoryStore(GRANTED).store, {fetcher});
  t.after(() => controller.dispose());
  const page = await controller.activity();
  assert.equal(page.status, 'ready');
  assert.equal(Date.parse(page.window.to) - Date.parse(page.window.from), 7 * DAY);
});
