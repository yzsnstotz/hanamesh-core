import { createBindLink } from './bind-link.js';
/** C-CORE portable process boundary. No Cordis/DSH or other plugin imports. */
import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createDevice, requestNonce, signWithDevice } from './device.js';
import { fileSharedDeviceStore } from './shared-device.js';
import { serverOriginOf } from './validation.js';
import { ServerTransport } from './transport.js';
import { upstreamError, upstreamJson } from './errors.js';
import { registerDevice } from './registration.js';
const NOTICE = 'hm-agent-usage-v1';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const iso = (v) => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
async function optionalJson(path) { try {
    return JSON.parse(await readFile(path, 'utf8'));
}
catch (error) {
    if (error.code === 'ENOENT')
        return undefined;
    throw error;
} }
async function publish(path, value, claim = false) {
    const temp = `${path}.${randomUUID()}.tmp`;
    const fd = await open(temp, 'wx', 0o600);
    try {
        try {
            await fd.writeFile(JSON.stringify(value));
            await fd.sync();
        }
        finally {
            await fd.close();
        }
        try {
            if (claim)
                await link(temp, path);
            else
                await rename(temp, path);
        }
        catch (error) {
            if (!claim || error.code !== 'EEXIST')
                throw error;
        }
    }
    finally {
        await rm(temp, { force: true });
    }
}
function pair(origin, website) {
    if (!origin || !website)
        fail('BIND_ORIGIN_UNAVAILABLE');
    const loopback = (v) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(v).hostname);
    if (loopback(origin) !== loopback(website))
        fail('CORE_WEBSITE_CONFIGURATION_REQUIRED');
}
function snapshot(value, prepared) {
    const bad = () => fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return bad();
    const v = value;
    if (Object.keys(v).sort().join('|') !== 'agreedAt|authorization|barrier|binding|consentId|deviceId|includeBackfill|noticeVersion|state' || v.deviceId !== prepared.deviceId || v.consentId !== prepared.consentId || v.barrier !== 'committed' || !['pending', 'active', 'withdrawn'].includes(String(v.state)))
        return bad();
    if (v.binding !== null) {
        const b = v.binding;
        if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).sort().join('|') !== 'accountPrincipalId|linkedAt' || typeof b.accountPrincipalId !== 'string' || !(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/).test(b.accountPrincipalId) || !iso(b.linkedAt))
            return bad();
    }
    if (v.noticeVersion !== NOTICE || v.includeBackfill !== true)
        return bad();
    if (v.state === 'active') {
        if (v.authorization !== 'website' || !iso(v.agreedAt) || v.binding === null)
            return bad();
    }
    else if (v.state === 'pending') {
        if (v.authorization !== null || v.agreedAt !== null)
            return bad();
    }
    else if (![null, 'website'].includes(v.authorization) || (v.agreedAt !== null && !iso(v.agreedAt)))
        return bad();
    return v;
}
const CONSENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = (code) => { throw new Error(code); };
function headersFor(device, method, path, body) {
    const timestamp = Date.now().toString(), nonce = requestNonce();
    const bytes = Buffer.from(`${method.toUpperCase()}|${path.replace(/[?#].*$/u, '')}|${timestamp}|${nonce}|${createHash('sha256').update(body ?? '').digest('hex')}`);
    return { 'x-hm-device-id': device.deviceId, 'x-hm-timestamp': timestamp, 'x-hm-nonce': nonce, 'x-hm-signature': Buffer.from(signWithDevice(device, bytes)).toString('base64url') };
}
export async function agentCall(config, input) {
    if (!isAbsolute(config.sharedHome))
        fail('CORE_INPUT_INVALID');
    if (config.timeoutMs !== undefined && (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 10 || config.timeoutMs > 60000))
        fail('CORE_INPUT_INVALID');
    const origin = config.serverOrigin === null ? null : serverOriginOf(config.serverOrigin);
    const website = config.websiteOrigin === null ? null : serverOriginOf(config.websiteOrigin);
    const dir = join(config.sharedHome, 'agent');
    const consentFile = join(dir, 'consent.json');
    const preparedFile = join(dir, 'onboarding.json'), grantFile = join(dir, 'onboarding-grant.json');
    const readConsent = async (checkOrigins = true) => {
        const value = await optionalJson(consentFile);
        let result = { state: 'withheld', changedAt: null, consentId: null, authorization: null, agreedAt: null };
        if (value !== undefined) {
            if (!value || !['granted', 'withheld'].includes(String(value.state)) || typeof value.changedAt !== 'string' || !Number.isFinite(Date.parse(value.changedAt)) || (value.consentId !== undefined && value.consentId !== null && (typeof value.consentId !== 'string' || !CONSENT_ID.test(value.consentId))))
                fail('CORE_CONSENT_CORRUPT');
            result = { state: value.state, changedAt: value.changedAt, consentId: value.consentId ?? null, authorization: value.state === 'granted' ? 'legacy-terminal' : null, agreedAt: null };
            // Explicit local close wins over any concurrent or late website response. A website grant never overwrites this file.
            if (value.state === 'withheld')
                return result;
        }
        const prepared = await readPrepared(checkOrigins);
        const grant = await optionalJson(grantFile);
        if (grant !== undefined) {
            if (!prepared)
                fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
            const facts = snapshot(grant, prepared);
            if (facts.state !== 'active')
                fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
            result = { state: 'granted', changedAt: facts.agreedAt, consentId: prepared.consentId, authorization: 'website', agreedAt: facts.agreedAt };
        }
        else if (prepared && result.state !== 'granted')
            result.consentId = prepared.consentId;
        return result;
    };
    const readPrepared = async (checkOrigins = true) => {
        const value = await optionalJson(preparedFile);
        if (value === undefined)
            return null;
        const p = value;
        if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).sort().join('|') !== 'consentId|deviceId|serverOrigin|websiteOrigin' || typeof p.deviceId !== 'string' || !(/^[A-Za-z0-9_-]{43}$/).test(p.deviceId) || typeof p.consentId !== 'string' || !CONSENT_ID.test(p.consentId) || typeof p.serverOrigin !== 'string' || typeof p.websiteOrigin !== 'string' || (checkOrigins && (p.serverOrigin !== origin || p.websiteOrigin !== website)))
            fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
        return p;
    };
    let consent = await readConsent(!(input.operation === 'withdraw' || (input.operation === 'consent' && input.state === 'withheld')));
    const close = async () => {
        const current = await readConsent(false);
        const stopped = { state: 'withheld', changedAt: new Date().toISOString(), consentId: current.consentId ?? randomUUID() };
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await publish(consentFile, stopped);
        return await readConsent(false);
    };
    if (input.operation === 'consent') {
        if (Object.keys(input).sort().join('|') !== 'operation|state' || !['granted', 'withheld'].includes(String(input.state)))
            fail('CORE_INPUT_INVALID');
        if (input.state === 'withheld')
            return { consent: await close() };
        if (consent.state !== 'granted')
            fail('CORE_AGENT_WEB_CONSENT_REQUIRED');
        if (!consent.consentId) {
            consent = { ...consent, consentId: randomUUID() };
            await publish(consentFile, consent);
        }
        return { consent };
    }
    const store = fileSharedDeviceStore(config.sharedHome);
    const existing = await store.read();
    if (input.operation === 'state')
        return { agentProtocolVersion: 2, deviceId: existing?.deviceId ?? null, publicKey: existing?.publicKey ?? null, consent, serverOrigin: origin, websiteOrigin: website };
    if (input.operation === 'prepareOnboarding' || input.operation === 'syncOnboarding') {
        if (Object.keys(input).join('|') !== 'operation')
            fail('CORE_INPUT_INVALID');
        pair(origin, website);
        if (consent.state === 'withheld' && consent.changedAt !== null)
            fail('CONSENT_WITHHELD');
        const transport = new ServerTransport(origin, config.timeoutMs ?? 10000);
        try {
            let prepared = await readPrepared();
            if (input.operation === 'prepareOnboarding') {
                const device = existing ?? await store.claim(createDevice());
                await mkdir(dir, { recursive: true, mode: 0o700 });
                if (!prepared) {
                    await publish(preparedFile, { deviceId: device.deviceId, consentId: randomUUID(), serverOrigin: origin, websiteOrigin: website }, true);
                    prepared = await readPrepared();
                }
                if (!prepared || prepared.deviceId !== device.deviceId)
                    fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
                await registerDevice(transport, device, null);
                const path = `/v2/usage/me/devices/${device.deviceId}/consents/${prepared.consentId}/onboarding`, body = JSON.stringify({ noticeVersion: NOTICE, includeBackfill: true });
                const facts = snapshot(await upstreamJson(await transport.request(path, { method: 'POST', headers: { ...headersFor(device, 'POST', path, body), 'content-type': 'application/json' }, body })), prepared);
                if (facts.state === 'withdrawn') {
                    await close();
                    fail('CONSENT_WITHHELD');
                }
                const challenge = await upstreamJson(await transport.request('/v1/identity/devices/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'bind' }) }));
                const result = createBindLink(website, device, challenge), url = new URL(result.url);
                url.searchParams.set('flow', 'agent');
                url.searchParams.set('consentId', prepared.consentId);
                url.searchParams.set('noticeVersion', NOTICE);
                const current = await readConsent();
                if (current.changedAt !== null && current.state === 'withheld')
                    fail('CONSENT_WITHHELD');
                return { url: url.href, expiresAt: result.expiresAt, consentId: prepared.consentId, deviceId: device.deviceId };
            }
            if (!prepared || !existing || prepared.deviceId !== existing.deviceId)
                fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
            const path = `/v2/usage/me/devices/${existing.deviceId}/consents/${prepared.consentId}`;
            const facts = snapshot(await upstreamJson(await transport.request(path, { method: 'GET', headers: headersFor(existing, 'GET', path, null) })), prepared);
            if (facts.state === 'withdrawn')
                await close();
            if (facts.state === 'active')
                await publish(grantFile, facts);
            consent = await readConsent();
            if (consent.state === 'withheld' && consent.changedAt !== null)
                fail('CONSENT_WITHHELD');
            return { onboarding: facts, consent };
        }
        finally {
            transport.dispose();
        }
    }
    // After opt-out only this fixed DELETE is signable. No arbitrary signing or new identity is allowed.
    if (input.operation === 'withdraw') {
        consent = await close();
        await readPrepared(); // Refuse sending the old generation to a changed backend, after local close.
        if (!existing)
            return { deletedEvents: 0, barrier: 'no-device', consentId: consent.consentId };
        if (!consent.consentId)
            return fail('CORE_CONSENT_GENERATION_REQUIRED');
        if (!origin)
            return fail('SERVER_ORIGIN_UNAVAILABLE');
        const transport = new ServerTransport(origin, config.timeoutMs ?? 10000);
        try {
            const path = `/v2/usage/me/devices/${existing.deviceId}/consents/${consent.consentId}`;
            const response = await transport.request(path, { method: 'DELETE', headers: headersFor(existing, 'DELETE', path, null) });
            if (!response.ok)
                throw await upstreamError(response);
            const value = await upstreamJson(response);
            if (Object.keys(value).sort().join('|') !== 'barrier|consentId|deletedEvents|state' || value.consentId !== consent.consentId || value.state !== 'withdrawn' || value.barrier !== 'committed' || !Number.isSafeInteger(value.deletedEvents) || Number(value.deletedEvents) < 0)
                return fail('CORE_WITHDRAWAL_UNCONFIRMED');
            return { deletedEvents: value.deletedEvents, consentId: value.consentId, state: value.state, barrier: value.barrier };
        }
        finally {
            transport.dispose();
        }
    }
    if (consent.state !== 'granted')
        fail('CONSENT_WITHHELD');
    const device = existing ?? await store.claim(createDevice());
    if (input.operation === 'sign') {
        if (typeof input.bytes !== 'string' || Buffer.from(input.bytes, 'base64').toString('base64') !== input.bytes)
            fail('CORE_INPUT_INVALID');
        return { signature: Buffer.from(signWithDevice(device, Buffer.from(input.bytes, 'base64'))).toString('base64url') };
    }
    const transport = new ServerTransport(origin, config.timeoutMs ?? 10000);
    try {
        if (input.operation === 'register') {
            if (!origin)
                fail('SERVER_ORIGIN_UNAVAILABLE');
            return { ...await registerDevice(transport, device, null) };
        }
        if (input.operation === 'bindLink') {
            if (!website || !origin)
                fail('BIND_ORIGIN_UNAVAILABLE');
            const loopback = (value) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
            if (loopback(origin) && !loopback(website))
                fail('CORE_WEBSITE_CONFIGURATION_REQUIRED');
            const response = await transport.request('/v1/identity/devices/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'bind' }) });
            if (!response.ok)
                throw await upstreamError(response);
            const challenge = await upstreamJson(response);
            return createBindLink(website, device, challenge);
        }
        if (input.operation === 'signRequest') {
            if (typeof input.method !== 'string' || typeof input.path !== 'string' || !input.path.startsWith('/') || input.path.includes('|') || (input.body !== null && typeof input.body !== 'string'))
                fail('CORE_INPUT_INVALID');
            return headersFor(device, input.method, input.path, input.body);
        }
        return fail('CORE_INPUT_INVALID');
    }
    finally {
        transport.dispose();
    }
}
