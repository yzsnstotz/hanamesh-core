import test from 'node:test';
import assert from 'node:assert/strict';
import {coreInstallInput} from './fixtures/core-install-input.mjs';
import {configOf, CORE_DEFAULTS} from '../lib/validation.js';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

test('pre-activation input explicitly supplies offline origins and an owned shared identity without changing legal budgets', async t => {
  const input = coreInstallInput('/FIXTURE/current-environment');
  assert.deepEqual(input.config, {serverOrigin: null, websiteOrigin: null, sharedIdentityDir: '/FIXTURE/current-environment/core-shared', allowSystemBrowser: false});
  const configured = configOf(input.config);
  for (const [key, value] of Object.entries(CORE_DEFAULTS)) assert.equal(configured[key], value, key);
  assert.match(input.patch, /serverOrigin: null/);
  assert.match(input.patch, /websiteOrigin: null/);
  assert.doesNotMatch(input.patch, /https:|hanamesh\.com/);
  const controller = await SessionController.create(input.config, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  t.after(() => controller.dispose());
  assert.equal(controller.service.getServerOrigin(), null);
  assert.equal(controller.service.getConsent(), 'withheld');
  assert.equal(controller.state().websiteOrigin, null);
});

test('pre-activation input uses only supplied loopback service ports and retains product configuration validation', () => {
  const input = coreInstallInput('/FIXTURE/current-environment', {server: 49151, web: 49152});
  assert.equal(configOf(input.config).serverOrigin, 'http://127.0.0.1:49151');
  assert.equal(configOf(input.config).websiteOrigin, 'http://127.0.0.1:49152');
  // Validate the input without connecting to this number or any running service.
  assert.equal(configOf(coreInstallInput('/FIXTURE/current-environment', {server: 3080}).config).serverOrigin, 'http://127.0.0.1:3080');
  assert.equal(configOf(coreInstallInput('/FIXTURE/current-environment', {server: 80}).config).serverOrigin, 'http://127.0.0.1');
  for (const port of [0, 65536, NaN, '49151', 'https://api.hanamesh.com']) assert.throws(() => coreInstallInput('/FIXTURE/current-environment', {server: port}));
  assert.throws(() => coreInstallInput('relative/profile'));
  assert.throws(() => configOf({...input.config, sharedIdentityDir: 'relative'}), {code: 'CORE_INPUT_INVALID'});
  assert.throws(() => configOf({...input.config, serverOrigin: 'https://user:password@fixture.invalid'}), {code: 'CORE_ORIGIN_REJECTED'});
});
