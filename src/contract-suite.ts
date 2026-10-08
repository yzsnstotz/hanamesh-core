import {readFile} from 'node:fs/promises';
import {CORE_OPTIONAL_METHODS, CORE_PROTOCOL_VERSION, CORE_REQUIRED_METHODS, checkCoreService} from './contract.js';
import type {ConsentState} from './contract.js';
import {coreCanonicalRequest, coreHandshakeCases, verifyCoreSignature} from './contract-fixtures.js';
import type {CoreConsumerUnderTest, CoreProviderUnderTest} from './contract-fixtures.js';

export interface CoreSuiteRow {readonly id: string; readonly ok: boolean; readonly detail: string}
export interface CoreSuiteResult {
  readonly suite: 'hanamesh-core/contract';
  readonly protocolVersion: '1';
  readonly side: 'provider' | 'consumer';
  readonly subject: string;
  readonly ok: boolean;
  readonly results: readonly CoreSuiteRow[];
}
type Schema = Record<string, unknown>;

const SCHEMA_URL = new URL('../contract/hanamesh-core.v1.schema.json', import.meta.url);
let schemaCache: Schema | null = null;
export async function loadCoreSchema(): Promise<Schema> {
  schemaCache ??= JSON.parse(await readFile(SCHEMA_URL, 'utf8')) as Schema;
  return schemaCache;
}

const typeOf = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
/** Validates the JSON Schema subset this contract uses: $ref, type, const, enum, required, properties, additionalProperties:false, minLength, pattern, minimum. */
function validate(schema: Schema, node: Schema, value: unknown, path: string, errors: string[]): void {
  if (typeof node.$ref === 'string') {
    const name = node.$ref.replace('#/$defs/', '');
    validate(schema, (schema.$defs as Record<string, Schema>)[name] ?? {}, value, path, errors);
    return;
  }
  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type as string[] : [node.type as string];
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) { errors.push(`${path}: expected ${types.join('|')}, got ${actual}`); return; }
  }
  if ('const' in node && value !== node.const) errors.push(`${path}: expected ${JSON.stringify(node.const)}`);
  if (Array.isArray(node.enum) && !node.enum.includes(value)) errors.push(`${path}: not one of ${JSON.stringify(node.enum)}`);
  if (typeof value === 'string') {
    if (typeof node.minLength === 'number' && value.length < node.minLength) errors.push(`${path}: shorter than ${node.minLength}`);
    if (typeof node.pattern === 'string' && !new RegExp(node.pattern, 'u').test(value)) errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (typeof value === 'number' && typeof node.minimum === 'number' && value < node.minimum) errors.push(`${path}: below ${node.minimum}`);
  if (typeOf(value) === 'object') {
    const record = value as Record<string, unknown>;
    const properties = (node.properties ?? {}) as Record<string, Schema>;
    for (const key of (node.required ?? []) as string[]) if (!(key in record)) errors.push(`${path}.${key}: required`);
    if (node.additionalProperties === false) for (const key of Object.keys(record)) if (!(key in properties)) errors.push(`${path}.${key}: not allowed`);
    for (const [key, child] of Object.entries(properties)) if (key in record) validate(schema, child, record[key], `${path}.${key}`, errors);
  }
}
/** Returns schema violations of `value` against `$defs/<defName>` of the v1 schema (empty array = valid). */
export function validateCoreValue(defName: string, value: unknown, schema: Schema | null = schemaCache): string[] {
  if (!schema) throw new Error('CORE_SCHEMA_NOT_LOADED: await loadCoreSchema() first');
  const node = (schema.$defs as Record<string, Schema>)[defName];
  if (!node) throw new Error(`CORE_SCHEMA_UNKNOWN_DEF: ${defName}`);
  const errors: string[] = [];
  validate(schema, node, value, defName, errors);
  return errors;
}

async function row(id: string, check: () => unknown | Promise<unknown>): Promise<CoreSuiteRow> {
  try {
    const detail = await check();
    return {id, ok: true, detail: typeof detail === 'string' ? detail : 'ok'};
  } catch (error) {
    return {id, ok: false, detail: error instanceof Error ? error.message : String(error)};
  }
}
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const schemaOk = (defName: string, value: unknown): void => { const errors = validateCoreValue(defName, value); expect(errors.length === 0, errors.join('; ')); };
const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
const done = (side: 'provider' | 'consumer', subject: string, results: CoreSuiteRow[]): CoreSuiteResult =>
  ({suite: 'hanamesh-core/contract', protocolVersion: CORE_PROTOCOL_VERSION, side, subject, ok: results.every(item => item.ok), results});

/**
 * Provider side: runs a candidate `hanameshCore` provider through every v1 expectation.
 * Consent is changed only through `provider.setConsent` and restored to its starting value afterwards.
 */
export async function runCoreProviderSuite(provider: CoreProviderUnderTest): Promise<CoreSuiteResult> {
  await loadCoreSchema();
  const core = provider.service;
  const results: CoreSuiteRow[] = [];
  results.push(await row('handshake.present', () => {
    const handshake = checkCoreService(core);
    expect(handshake.status === 'present' && handshake.protocolVersion === CORE_PROTOCOL_VERSION, JSON.stringify(handshake));
  }));
  results.push(await row('handshake.rejects-other-version', () => {
    const handshake = checkCoreService(core, ['2']);
    expect(handshake.status === 'incompatible' && handshake.reason === 'CORE_PROTOCOL_UNSUPPORTED', JSON.stringify(handshake));
  }));
  results.push(await row('surface.closed', () => {
    const allowed = new Set<string>(['protocolVersion', ...CORE_REQUIRED_METHODS, ...CORE_OPTIONAL_METHODS]);
    const extra = Object.keys(core).filter(key => !allowed.has(key));
    expect(extra.length === 0, `members outside v1: ${extra.join(', ')}`);
  }));
  results.push(await row('identity.deviceId', () => {
    schemaOk('DeviceId', core.getDeviceId());
    expect(core.getDeviceId() === core.getDeviceId(), 'device id is not stable');
  }));
  const publicKey = typeof core.getPublicKey === 'function' ? core.getPublicKey() : null;
  results.push(await row('identity.publicKey', () => {
    if (publicKey === null) return 'optional method absent';
    schemaOk('PublicKey', publicKey);
    return 'ok';
  }));
  results.push(await row('sign.ed25519', () => {
    const bytes = new TextEncoder().encode('hanamesh-core contract v1');
    const copy = bytes.slice();
    const signature = core.sign(bytes);
    expect(signature instanceof Uint8Array && signature.byteLength === 64, 'signature is not 64 bytes');
    expect(Buffer.from(bytes).equals(Buffer.from(copy)), 'sign mutated its input');
    if (publicKey === null) return 'shape only: getPublicKey absent';
    expect(verifyCoreSignature(publicKey, bytes, signature), 'signature does not verify with getPublicKey');
    return 'ok';
  }));
  results.push(await row('signRequest.canonical', async () => {
    const body = new TextEncoder().encode('{"probe":1}');
    for (const input of [{method: 'post', path: '/v1/usage/events?x=1#y', body}, {method: 'GET', path: '/v1/identity/me', body: null}]) {
      const headers = await core.signRequest(input);
      schemaOk('DeviceAuthHeaders', headers);
      expect(headers['x-hm-device-id'] === core.getDeviceId(), 'x-hm-device-id differs from getDeviceId()');
      if (publicKey !== null) {
        const canonical = coreCanonicalRequest(input, headers['x-hm-timestamp'], headers['x-hm-nonce']);
        expect(verifyCoreSignature(publicKey, canonical, Buffer.from(headers['x-hm-signature'], 'base64url')), `signature does not verify over METHOD|pathname|ms|nonce|sha256 for ${input.method} ${input.path}`);
      }
    }
  }));
  results.push(await row('signRequest.rejects-invalid', async () => {
    let rejected = false;
    try { await core.signRequest({method: 1, path: null, body: 'x'} as never); } catch { rejected = true; }
    expect(rejected, 'invalid signRequest input was accepted');
  }));
  results.push(await row('consent.state', () => schemaOk('ConsentState', core.getConsent())));
  results.push(await row('consent.subscribe', async () => {
    const start = core.getConsent();
    const next: ConsentState = start === 'granted' ? 'withheld' : 'granted';
    const calls: Array<[ConsentState, string]> = [];
    const count = (): number => calls.length;
    const stop = core.onConsentChange((state, changedAt) => { calls.push([state, changedAt]); });
    expect(typeof stop === 'function', 'onConsentChange did not return an unsubscribe function');
    try {
      await settle();
      expect(count() === 0, 'current value was replayed on subscribe');
      await provider.setConsent(next);
      await settle();
      expect(count() === 1 && calls[0]?.[0] === next, `expected one ${next} notification, got ${JSON.stringify(calls)}`);
      expect(!Number.isNaN(Date.parse(calls[0]?.[1] ?? '')), 'changedAt is not a timestamp');
      expect(core.getConsent() === next, 'getConsent does not read back the change');
    } finally {
      stop();
      await provider.setConsent(start);
      await settle();
    }
    expect(count() === 1, 'listener was called after unsubscribe');
    expect(core.getConsent() === start, 'consent was not restored');
  }));
  results.push(await row('session.schema', () => {
    const session = core.getSession();
    schemaOk('SessionSnapshot', session);
    expect(session.deviceId === core.getDeviceId(), 'session deviceId differs from getDeviceId()');
  }));
  results.push(await row('serverOrigin', () => {
    const origin = core.getServerOrigin();
    schemaOk('ServerOrigin', origin);
    if (origin !== null) expect(new URL(origin).origin === origin, `${origin} is not a bare origin`);
  }));
  results.push(await row('health.schema', () => {
    if (typeof core.getHealth !== 'function') return 'optional method absent';
    schemaOk('HealthSnapshot', core.getHealth());
    return 'ok';
  }));
  return done('provider', provider.label, results);
}

/** Consumer side: the consumer's acceptance function must classify the fixed handshake matrix exactly (no silent compatibility). */
export async function runCoreConsumerSuite(consumer: CoreConsumerUnderTest, cases = coreHandshakeCases()): Promise<CoreSuiteResult> {
  await loadCoreSchema();
  const results: CoreSuiteRow[] = [];
  for (const item of cases) {
    results.push(await row(item.id, async () => {
      const actual = await consumer.accept(item.value);
      expect(actual && actual.status === item.expected.status, `expected status ${item.expected.status}, got ${JSON.stringify(actual)}`);
      const expectedReason = 'reason' in item.expected ? item.expected.reason : undefined;
      if (actual.reason !== undefined) expect(actual.reason === expectedReason, `expected reason ${String(expectedReason)}, got ${actual.reason}`);
    }));
  }
  return done('consumer', consumer.label, results);
}
