import { isAbsolute } from 'node:path';
import { CoreError } from '../errors.js';
import { registryUrl } from './facts.js';
import { createSuitePackageSource } from './source.js';
const invalid = () => { throw new CoreError('CORE_SUITE_SOURCE_CONFIG_INVALID', 400); };
export function suiteSourceOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalid();
    const v = value, keys = ['archives', 'port', 'peerRegistry', 'maxArchiveBytes', 'maxExpandedBytes', 'maxEntries', 'maxManifestBytes', 'maxResponseBytes', 'timeoutMs'];
    if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k)) || !Array.isArray(v.archives) || !Number.isInteger(v.port) || Number(v.port) < 0 || Number(v.port) > 65535 || typeof v.peerRegistry !== 'string')
        return invalid();
    for (const key of keys.slice(3))
        if (!Number.isSafeInteger(v[key]) || Number(v[key]) <= 0)
            return invalid();
    if (Number(v.timeoutMs) > 2147483647)
        return invalid();
    try {
        if (registryUrl(v.peerRegistry) !== v.peerRegistry)
            return invalid();
    }
    catch {
        return invalid();
    }
    for (const row of v.archives) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join('|') !== 'integrity|path' || typeof row.path !== 'string' || !isAbsolute(row.path) || typeof row.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(row.integrity))
            return invalid();
    }
    return structuredClone(v);
}
function selectionOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new CoreError('CORE_INPUT_INVALID', 400);
    const v = value;
    if (v.mode === 'custom' && Object.keys(v).sort().join('|') === 'mode|options')
        return { mode: 'custom', options: suiteSourceOptions(v.options) };
    if ((v.mode === 'configured' || v.mode === 'disabled') && Object.keys(v).length === 1)
        return { mode: v.mode };
    throw new CoreError('CORE_INPUT_INVALID', 400);
}
export function suiteSourceSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'schemaVersion|selection' || value.schemaVersion !== 1)
        throw new CoreError('CORE_SUITE_SOURCE_STORAGE_INVALID', 503);
    try {
        return { schemaVersion: 1, selection: selectionOf(value.selection) };
    }
    catch {
        throw new CoreError('CORE_SUITE_SOURCE_STORAGE_INVALID', 503);
    }
}
function named(error, code) { return error instanceof CoreError ? error : Object.assign(new CoreError(code, 503), { cause: error }); }
/** All listeners belong to this ordinary plugin activation, never Electron or a boot hook. */
export async function createManagedSuitePackageSource(configured, store) {
    const owned = new ManagedSource(configured, store);
    await owned.initialize();
    return owned;
}
class ManagedSource {
    store;
    service;
    #selection = { mode: 'configured' };
    #source = null;
    #status = 'disabled';
    #lastError = null;
    #archiveCount = 0;
    #disposed = false;
    #closing;
    #tail = Promise.resolve();
    #owned = new Set();
    configured;
    constructor(configured, store) {
        this.store = store;
        this.configured = structuredClone(configured);
        this.service = Object.freeze({ protocolVersion: '1', getState: () => Object.freeze({ protocolVersion: '1', status: this.#status, selection: this.#selection.mode, registry: this.#source?.registry ?? null, archiveCount: this.#archiveCount, lastError: this.#lastError }) });
    }
    #options(selection) { return selection.mode === 'disabled' ? null : selection.mode === 'custom' ? suiteSourceOptions(selection.options) : this.configured === null ? null : suiteSourceOptions(this.configured); }
    async #open(options) { if (!options)
        return null; let source; try {
        source = await createSuitePackageSource(options);
    }
    catch (error) {
        throw named(error, 'CORE_SUITE_SOURCE_LISTEN_FAILED');
    } this.#owned.add(source); return source; }
    async #release(source) { if (!source)
        return; try {
        await source.close();
        this.#owned.delete(source);
    }
    catch (error) {
        throw Object.assign(new CoreError('CORE_SUITE_SOURCE_CLOSE_FAILED', 503), { cause: error });
    } }
    async initialize() { try {
        this.#selection = suiteSourceSnapshot(this.store.read()).selection;
        const options = this.#options(this.#selection);
        this.#source = await this.#open(options);
        this.#archiveCount = options?.archives.length ?? 0;
        this.#status = this.#source ? 'ready' : 'disabled';
    }
    catch (error) {
        this.#status = 'failed';
        this.#lastError = named(error, 'CORE_SUITE_SOURCE_STORAGE_UNAVAILABLE').code;
    } }
    getConfiguration() { return structuredClone({ configured: this.configured, selection: this.#selection }); }
    async configure(input) {
        if (this.#disposed)
            throw new CoreError('CORE_DISPOSED', 503);
        let selection;
        try {
            selection = selectionOf(input);
        }
        catch (error) {
            this.#lastError = named(error, 'CORE_INPUT_INVALID').code;
            throw error;
        }
        const operation = this.#tail.then(async () => {
            if (this.#disposed)
                throw new CoreError('CORE_DISPOSED', 503);
            let candidate = null, committed = false;
            try {
                const options = this.#options(selection);
                if ((this.#status === 'ready' || this.#status === 'disabled') && JSON.stringify(selection) === JSON.stringify(this.#selection)) {
                    this.#lastError = null;
                    return this.service.getState();
                }
                candidate = await this.#open(options);
                if (this.#disposed)
                    throw new CoreError('CORE_DISPOSED', 503);
                try {
                    await this.store.publish({ schemaVersion: 1, selection });
                }
                catch (error) {
                    throw Object.assign(new CoreError('CORE_SUITE_SOURCE_STORAGE_UNAVAILABLE', 503), { cause: error });
                }
                const old = this.#source;
                this.#source = candidate;
                this.#selection = selection;
                this.#archiveCount = options?.archives.length ?? 0;
                this.#status = candidate ? 'ready' : 'disabled';
                this.#lastError = null;
                committed = true;
                await this.#release(old);
                return this.service.getState();
            }
            catch (error) {
                let failure = named(error, 'CORE_SUITE_SOURCE_FAILED');
                if (!committed)
                    try {
                        await this.#release(candidate);
                    }
                    catch (cleanup) {
                        failure = Object.assign(new CoreError('CORE_SUITE_SOURCE_CLOSE_FAILED', 503), { cause: new AggregateError([failure, cleanup]) });
                    }
                this.#lastError = failure.code;
                throw failure;
            }
        });
        this.#tail = operation.then(() => undefined, () => undefined);
        return operation;
    }
    close() { return this.#closing ??= this.#close(); }
    async #close() { this.#disposed = true; await this.#tail; const failures = []; for (const source of this.#owned)
        try {
            await this.#release(source);
        }
        catch (error) {
            failures.push(error);
        } this.#source = null; this.#status = 'disposed'; try {
        await this.store.close();
    }
    catch (error) {
        failures.push(Object.assign(new CoreError('CORE_SUITE_SOURCE_STORAGE_UNAVAILABLE', 503), { cause: error }));
    } if (failures.length) {
        const code = failures.some(e => e instanceof CoreError && e.code === 'CORE_SUITE_SOURCE_CLOSE_FAILED') ? 'CORE_SUITE_SOURCE_CLOSE_FAILED' : 'CORE_SUITE_SOURCE_STORAGE_UNAVAILABLE';
        this.#lastError = code;
        throw Object.assign(new CoreError(code, 503), { cause: new AggregateError(failures) });
    } }
}
