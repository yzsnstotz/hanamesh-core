import { isAbsolute } from 'node:path';
import { CoreError } from './errors.js';
import { INITIAL_CORE_SNAPSHOT } from './contracts.js';
import { registryUrl } from './suite/facts.js';
export const CORE_DEFAULTS = Object.freeze({ timeoutMs: 10_000, checkIntervalMs: 3_000, maxHanaRows: 200, profileTimeoutMs: 1_500, maxResponseBytes: 1024 * 1024, clientPollIntervalMs: 10000, pointsRefreshMs: 60000, contributionIntervalMs: 60000, activityPageBudget: 5, activityDisplayRows: 25, catalogConcurrency: 4, contributionWindowDays: 90, suiteLocalTestRegistries: Object.freeze([]) });
/** C-USAGE: a raw-event window (contributions from/to, device events from/to) is at most 90 days. Contract invariant, not a setting. */
export const USAGE_MAX_WINDOW_DAYS = 90;
const SECRET_KEY = /(?:password|token|cookie|authorization|credential|secret|signer|private.?key)/i;
function originOf(value) {
    if (value === null)
        return null;
    if (typeof value !== 'string')
        throw new CoreError('CORE_INPUT_INVALID', 400);
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new CoreError('CORE_ORIGIN_REJECTED', 400);
    }
    // WHATWG URL keeps IPv6 brackets in `hostname` (`http://[::1]:3000` → `[::1]`).
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.replace(/\/$/, '') !== url.origin) {
        throw new CoreError('CORE_ORIGIN_REJECTED', 400);
    }
    return url.origin;
}
/** The same rules as the `serverOrigin` config, for the address set in Core's settings page (a non-null string). */
export function serverOriginOf(value) {
    if (typeof value !== 'string')
        throw new CoreError('CORE_INPUT_INVALID', 400);
    return originOf(value);
}
export function configOf(input) {
    if (!input || typeof input !== 'object')
        throw new CoreError('CORE_INPUT_INVALID', 400);
    const timeoutMs = input.timeoutMs ?? CORE_DEFAULTS.timeoutMs;
    const checkIntervalMs = input.checkIntervalMs ?? CORE_DEFAULTS.checkIntervalMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60_000 || !Number.isInteger(checkIntervalMs) || checkIntervalMs < 250 || checkIntervalMs > 60_000) {
        throw new CoreError('CORE_INPUT_INVALID', 400);
    }
    const maxHanaRows = input.maxHanaRows ?? CORE_DEFAULTS.maxHanaRows;
    const profileTimeoutMs = input.profileTimeoutMs ?? CORE_DEFAULTS.profileTimeoutMs;
    const maxResponseBytes = input.maxResponseBytes ?? CORE_DEFAULTS.maxResponseBytes;
    for (const value of [maxHanaRows, profileTimeoutMs, maxResponseBytes]) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new CoreError('CORE_INPUT_INVALID', 400);
    }
    const clientPollIntervalMs = input.clientPollIntervalMs ?? CORE_DEFAULTS.clientPollIntervalMs;
    const pointsRefreshMs = input.pointsRefreshMs ?? CORE_DEFAULTS.pointsRefreshMs;
    const contributionIntervalMs = input.contributionIntervalMs ?? CORE_DEFAULTS.contributionIntervalMs;
    const activityPageBudget = input.activityPageBudget ?? CORE_DEFAULTS.activityPageBudget;
    const activityDisplayRows = input.activityDisplayRows ?? CORE_DEFAULTS.activityDisplayRows;
    const catalogConcurrency = input.catalogConcurrency ?? CORE_DEFAULTS.catalogConcurrency;
    for (const value of [clientPollIntervalMs, pointsRefreshMs, contributionIntervalMs, activityPageBudget, activityDisplayRows, catalogConcurrency]) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new CoreError('CORE_INPUT_INVALID', 400);
    }
    // JavaScript timers use a signed 32-bit millisecond delay.
    for (const value of [clientPollIntervalMs, pointsRefreshMs, contributionIntervalMs]) {
        if (value > 2_147_483_647)
            throw new CoreError('CORE_INPUT_INVALID', 400);
    }
    const contributionWindowDays = input.contributionWindowDays ?? CORE_DEFAULTS.contributionWindowDays;
    if (!Number.isSafeInteger(contributionWindowDays) || contributionWindowDays < 1 || contributionWindowDays > USAGE_MAX_WINDOW_DAYS)
        throw new CoreError('CORE_INPUT_INVALID', 400);
    const sharedIdentityDir = input.sharedIdentityDir ?? null;
    let suiteLocalTestRegistries = CORE_DEFAULTS.suiteLocalTestRegistries;
    if (input.suiteLocalTestRegistries !== undefined) {
        if (!Array.isArray(input.suiteLocalTestRegistries))
            throw new CoreError('CORE_INPUT_INVALID', 400);
        try {
            suiteLocalTestRegistries = Object.freeze(input.suiteLocalTestRegistries.map(value => {
                const normalized = registryUrl(value, [value]);
                if (!normalized.startsWith('http:'))
                    throw new Error();
                return normalized;
            }));
        }
        catch {
            throw new CoreError('CORE_INPUT_INVALID', 400);
        }
    }
    if (sharedIdentityDir !== null && (typeof sharedIdentityDir !== 'string' || !isAbsolute(sharedIdentityDir)))
        throw new CoreError('CORE_INPUT_INVALID', 400);
    return Object.freeze({
        serverOrigin: originOf(input.serverOrigin),
        websiteOrigin: originOf(input.websiteOrigin),
        allowSystemBrowser: input.allowSystemBrowser ?? false,
        timeoutMs,
        authNonceSource: input.authNonceSource ?? 'client',
        checkIntervalMs, maxHanaRows, profileTimeoutMs, maxResponseBytes, clientPollIntervalMs, pointsRefreshMs, contributionIntervalMs, activityPageBudget, activityDisplayRows, catalogConcurrency, contributionWindowDays,
        sharedIdentityDir, suiteLocalTestRegistries,
    });
}
export function snapshotOf(input) {
    if (!input || typeof input !== 'object')
        throw new CoreError('CORE_STORAGE_UNAVAILABLE');
    return structuredClone(input);
}
export function publicJson(input) {
    if (Array.isArray(input))
        return input.map(publicJson);
    if (input && typeof input === 'object') {
        const output = {};
        for (const [key, value] of Object.entries(input))
            if (!SECRET_KEY.test(key))
                output[key] = publicJson(value);
        return output;
    }
    return input;
}
export { INITIAL_CORE_SNAPSHOT };
