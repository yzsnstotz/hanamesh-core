import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';
import {Context} from '@deepseek-ai/cordis';
import {usageServiceReady} from '../lib/dsh.mjs';

test('health provider feeds the contract, state and explicit recheck route', async () => {
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  let revision = 1;
  const provider = {getHealth: () => ({revision, mode: 'normal', components: [{id: 'usage', status: 'satisfied'}]}), recheck: async () => ({revision: ++revision, mode: 'normal', components: []})};
  controller.attachHealth(provider);
  assert.equal(controller.service.getHealth().revision, 1);
  assert.equal(controller.state().components[0].id, 'usage');
  const response = await createRouteHandler(controller)(new Request(`http://127.0.0.1:41001${ROUTES.healthRecheck}`, {method: 'POST', headers: {origin: 'http://127.0.0.1:41001', 'sec-fetch-site': 'same-origin'}}));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 2);
});

test('state projects health faults and duck-typed usage service readiness', async () => {
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  controller.attachHealth({
    getHealth: () => ({revision: 1, mode: 'repair', fault: 'PERSISTENCE_UNAVAILABLE', components: [
      {id: 'usage', label: '使用记录', status: 'satisfied', version: '0.2.0-rc.6', requiredRange: '0.2.0-rc.6', nextStep: null},
      {id: 'app-host', label: '应用容器', status: 'incompatible', version: '0.0.1', requiredRange: '0.1.0-rc.23', nextStep: 'restore-pinned-component'},
    ]}),
    recheck: async () => ({revision: 2, mode: 'repair', components: []}),
  });
  controller.attachUsageProbe(() => false);
  const state = controller.state();
  assert.deepEqual(state.health, {mode: 'repair', fault: 'PERSISTENCE_UNAVAILABLE'});
  assert.equal(state.components[0].serviceReady, false);
  assert.equal(state.components[1].requiredRange, '0.1.0-rc.23');
});

test('duck-typed Cordis usage lookup distinguishes an available service without a hard inject edge', async () => {
  const ctx = new Context();
  assert.equal(usageServiceReady(ctx), false);
  ctx.provide('hanameshUsage', {ready: true});
  assert.equal(usageServiceReady(ctx), true);
  await ctx.fiber.dispose();
});
