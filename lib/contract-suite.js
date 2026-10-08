import { readFile } from 'node:fs/promises';
import { CORE_OPTIONAL_METHODS, CORE_PROTOCOL_VERSION, CORE_REQUIRED_METHODS, checkCoreService } from './contract.js';
import { coreCanonicalRequest, coreHandshakeCases, verifyCoreSignature } from './contract-fixtures.js';
const SCHEMA_URL = new URL('../contract/hanamesh-core.v1.schema.json', import.meta.url);
let schemaCache = null;
export async function loadCoreSchema() {
    schemaCache ??= JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
    return schemaCache;
}
const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
/** Validates the JSON Schema subset this contract uses: $ref, type, const, enum, required, properties, additionalProperties:false, minLength, pattern, minimum. */
function validate(schema, node, value, path, errors) {
    if (typeof node.$ref === 'string') {
        const name = node.$ref.replace('#/$defs/', '');
        validate(schema, schema.$defs[name] ?? {}, value, path, errors);
        return;
    }
    if (node.type !== undefined) {
        const types = Array.isArray(node.type) ? node.type : [node.type];
        const actual = typeOf(value);
        if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) {
            errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
            return;
        }
    }
    if ('const' in node && value !== node.const)
        errors.push(`${path}: expected ${JSON.stringify(node.const)}`);
    if (Array.isArray(node.enum) && !node.enum.includes(value))
        errors.push(`${path}: not one of ${JSON.stringify(node.enum)}`);
    if (typeof value === 'string') {
        if (typeof node.minLength === 'number' && value.length < node.minLength)
            errors.push(`${path}: shorter than ${node.minLength}`);
        if (typeof node.pattern === 'string' && !new RegExp(node.pattern, 'u').test(value))
            errors.push(`${path}: does not match ${node.pattern}`);
    }
    if (typeof value === 'number' && typeof node.minimum === 'number' && value < node.minimum)
        errors.push(`${path}: below ${node.minimum}`);
    if (typeOf(value) === 'object') {
        const record = value;
        const properties = (node.properties ?? {});
        for (const key of (node.required ?? []))
            if (!(key in record))
                errors.push(`${path}.${key}: required`);
        if (node.additionalProperties === false)
            for (const key of Object.keys(record))
                if (!(key in properties))
                    errors.push(`${path}.${key}: not allowed`);
        for (const [key, child] of Object.entries(properties))
            if (key in record)
                validate(schema, child, record[key], `${path}.${key}`, errors);
    }
}
/** Returns schema violations of `value` against `$defs/<defName>` of the v1 schema (empty array = valid). */
export function validateCoreValue(defName, value, schema = schemaCache) {
    if (!schema)
        throw new Error('CORE_SCHEMA_NOT_LOADED: await loadCoreSchema() first');
    const node = schema.$defs[defName];
    if (!node)
        throw new Error(`CORE_SCHEMA_UNKNOWN_DEF: ${defName}`);
    const errors = [];
    validate(schema, node, value, defName, errors);
    return errors;
}
async function row(id, check) {
    try {
        const detail = await check();
        return { id, ok: true, detail: typeof detail === 'string' ? detail : 'ok' };
    }
    catch (error) {
        return { id, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
}
function expect(condition, message) { if (!condition)
    throw new Error(message); }
const schemaOk = (defName, value) => { const errors = validateCoreValue(defName, value); expect(errors.length === 0, errors.join('; ')); };
const settle = () => new Promise(resolve => setImmediate(resolve));
const done = (side, subject, results) => ({ suite: 'hanamesh-core/contract', protocolVersion: CORE_PROTOCOL_VERSION, side, subject, ok: results.every(item => item.ok), results });
/**
 * Provider side: runs a candidate `hanameshCore` provider through every v1 expectation.
 * Consent is changed only through `provider.setConsent` and restored to its starting value afterwards.
 */
export async function runCoreProviderSuite(provider) {
    await loadCoreSchema();
    const core = provider.service;
    const results = [];
    results.push(await row('handshake.present', () => {
        const handshake = checkCoreService(core);
        expect(handshake.status === 'present' && handshake.protocolVersion === CORE_PROTOCOL_VERSION, JSON.stringify(handshake));
    }));
    results.push(await row('handshake.rejects-other-version', () => {
        const handshake = checkCoreService(core, ['2']);
        expect(handshake.status === 'incompatible' && handshake.reason === 'CORE_PROTOCOL_UNSUPPORTED', JSON.stringify(handshake));
    }));
    results.push(await row('surface.closed', () => {
        const allowed = new Set(['protocolVersion', ...CORE_REQUIRED_METHODS, ...CORE_OPTIONAL_METHODS]);
        const extra = Object.keys(core).filter(key => !allowed.has(key));
        expect(extra.length === 0, `members outside v1: ${extra.join(', ')}`);
    }));
    results.push(await row('identity.deviceId', () => {
        schemaOk('DeviceId', core.getDeviceId());
        expect(core.getDeviceId() === core.getDeviceId(), 'device id is not stable');
    }));
    const publicKey = typeof core.getPublicKey === 'function' ? core.getPublicKey() : null;
    results.push(await row('identity.publicKey', () => {
        if (publicKey === null)
            return 'optional method absent';
        schemaOk('PublicKey', publicKey);
        return 'ok';
    }));
    results.push(await row('sign.ed25519', () => {
        const bytes = new TextEncoder().encode('hanamesh-core contract v1');
        const copy = bytes.slice();
        const signature = core.sign(bytes);
        expect(signature instanceof Uint8Array && signature.byteLength === 64, 'signature is not 64 bytes');
        expect(Buffer.from(bytes).equals(Buffer.from(copy)), 'sign mutated its input');
        if (publicKey === null)
            return 'shape only: getPublicKey absent';
        expect(verifyCoreSignature(publicKey, bytes, signature), 'signature does not verify with getPublicKey');
        return 'ok';
    }));
    results.push(await row('signRequest.canonical', async () => {
        const body = new TextEncoder().encode('{"probe":1}');
        for (const input of [{ method: 'post', path: '/v1/usage/events?x=1#y', body }, { method: 'GET', path: '/v1/identity/me', body: null }]) {
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
        try {
            await core.signRequest({ method: 1, path: null, body: 'x' });
        }
        catch {
            rejected = true;
        }
        expect(rejected, 'invalid signRequest input was accepted');
    }));
    results.push(await row('consent.state', () => schemaOk('ConsentState', core.getConsent())));
    results.push(await row('consent.subscribe', async () => {
        const start = core.getConsent();
        const next = start === 'granted' ? 'withheld' : 'granted';
        const calls = [];
        const count = () => calls.length;
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
        }
        finally {
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
        if (origin !== null)
            expect(new URL(origin).origin === origin, `${origin} is not a bare origin`);
    }));
    results.push(await row('health.schema', () => {
        if (typeof core.getHealth !== 'function')
            return 'optional method absent';
        schemaOk('HealthSnapshot', core.getHealth());
        return 'ok';
    }));
    return done('provider', provider.label, results);
}
/** Consumer side: the consumer's acceptance function must classify the fixed handshake matrix exactly (no silent compatibility). */
export async function runCoreConsumerSuite(consumer, cases = coreHandshakeCases()) {
    await loadCoreSchema();
    const results = [];
    for (const item of cases) {
        results.push(await row(item.id, async () => {
            const actual = await consumer.accept(item.value);
            expect(actual && actual.status === item.expected.status, `expected status ${item.expected.status}, got ${JSON.stringify(actual)}`);
            const expectedReason = 'reason' in item.expected ? item.expected.reason : undefined;
            if (actual.reason !== undefined)
                expect(actual.reason === expectedReason, `expected reason ${String(expectedReason)}, got ${actual.reason}`);
        }));
    }
    return done('consumer', consumer.label, results);
}
