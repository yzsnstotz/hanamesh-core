/** Device-lifetime Agent admission and one-way signing consumption. Never an Agent data store. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const invalid = () => { throw Error('CORE_ORIGIN_LEDGER_INVALID'); };
const bad = () => { throw Error('CORE_INPUT_INVALID'); };
const hex64 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const schema = `
CREATE TABLE ledger_meta(k TEXT PRIMARY KEY, v TEXT NOT NULL) STRICT;
CREATE TABLE origins(key BLOB PRIMARY KEY CHECK(length(key)=32), admitted INTEGER NOT NULL CHECK(admitted IN(0,1)), consumed_digest BLOB CHECK(consumed_digest IS NULL OR length(consumed_digest)=32)) STRICT;
CREATE TABLE installs(hana_key BLOB PRIMARY KEY CHECK(length(hana_key)=32), consumed_digest BLOB NOT NULL CHECK(length(consumed_digest)=32)) STRICT;
`;
/** Complete a fresh SQLite file before atomic publication; racing creators only open the winning complete file. */
function createLedger(path, deviceId) {
    if (existsSync(path))
        return;
    const temp = path + '.' + randomUUID() + '.tmp';
    let db;
    try {
        const fd = openSync(temp, 'wx', 0o600);
        closeSync(fd);
        db = new DatabaseSync(temp);
        db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE;' + schema);
        const put = db.prepare('INSERT INTO ledger_meta(k,v) VALUES(?,?)');
        for (const [k, v] of Object.entries({ schema: '1', deviceId, hmacKey: randomBytes(32).toString('hex'), createdAt: new Date().toISOString() }))
            put.run(k, v);
        db.exec('COMMIT');
        db.close();
        db = undefined;
        const file = openSync(temp, 'r');
        try {
            fsyncSync(file);
        }
        finally {
            closeSync(file);
        }
        try {
            linkSync(temp, path);
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        const dir = openSync(join(path, '..'), 'r');
        try {
            fsyncSync(dir);
        }
        finally {
            closeSync(dir);
        }
    }
    finally {
        db?.close();
        for (const p of [temp, temp + '-journal'])
            try {
                unlinkSync(p);
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
    }
}
export class AgentOriginLedger {
    db;
    hmacKey;
    constructor(sharedHome, deviceId) {
        const dir = join(sharedHome, 'identity'), path = join(dir, 'agent-origins.sqlite');
        let db;
        try {
            mkdirSync(dir, { recursive: true, mode: 0o700 });
            createLedger(path, deviceId);
            db = new DatabaseSync(path);
            db.exec('PRAGMA busy_timeout=10000; PRAGMA synchronous=FULL;');
            const check = db.prepare('PRAGMA quick_check(1)').get();
            if (!check || Object.values(check)[0] !== 'ok')
                invalid();
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name);
            if (tables.join('|') !== 'installs|ledger_meta|origins')
                invalid();
            const meta = Object.fromEntries(db.prepare('SELECT k,v FROM ledger_meta').all().map(x => [String(x.k), String(x.v)]));
            if (Object.keys(meta).sort().join('|') !== 'createdAt|deviceId|hmacKey|schema' || meta.schema !== '1' || meta.deviceId !== deviceId || !hex64(meta.hmacKey) || typeof meta.createdAt !== 'string' || !Number.isFinite(Date.parse(meta.createdAt)) || new Date(meta.createdAt).toISOString() !== meta.createdAt)
                invalid();
            this.db = db;
            this.hmacKey = Buffer.from(meta.hmacKey, 'hex');
        }
        catch {
            db?.close();
            throw Error('CORE_ORIGIN_LEDGER_INVALID');
        }
    }
    static validateExisting(sharedHome, deviceId) { if (existsSync(join(sharedHome, 'identity/agent-origins.sqlite'))) {
        const ledger = new AgentOriginLedger(sharedHome, deviceId);
        ledger.close();
    } }
    close() { this.db.close(); this.hmacKey.fill(0); }
    fingerprint(value) { return createHmac('sha256', this.hmacKey).update(value).digest(); }
    transaction(fn) {
        let begun = false;
        try {
            this.db.exec('BEGIN IMMEDIATE');
            begun = true;
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        }
        catch (e) {
            if (begun)
                try {
                    this.db.exec('ROLLBACK');
                }
                catch { }
            if (e instanceof Error && /^CORE_/.test(e.message))
                throw e;
            return invalid();
        }
    }
    /** Core-internal identity lifecycle serialization; no corresponding agentCall operation. */
    withIdentityTransaction(fn) { return this.transaction(fn); }
    observe(factId, admitted) {
        if (!hex64(factId) || typeof admitted !== 'boolean')
            bad();
        return this.transaction(() => {
            const key = this.fingerprint(factId), row = this.db.prepare('SELECT admitted FROM origins WHERE key=?').get(key);
            if (row) {
                if (row.admitted !== 0 && row.admitted !== 1)
                    invalid();
                return { admitted: row.admitted === 1, first: false };
            }
            this.db.prepare('INSERT INTO origins(key,admitted,consumed_digest) VALUES(?,?,NULL)').run(key, admitted ? 1 : 0);
            return { admitted, first: true };
        });
    }
    sign(factId, hanaRef, action, bytes, signer) {
        if (!hex64(factId))
            bad();
        return this.transaction(() => {
            const key = this.fingerprint(factId), origin = this.db.prepare('SELECT admitted,consumed_digest FROM origins WHERE key=?').get(key);
            if (!origin)
                throw Error('CORE_ORIGIN_UNKNOWN');
            if (origin.admitted === 0)
                throw Error('CORE_ORIGIN_DENIED');
            if (origin.admitted !== 1)
                invalid();
            const digest = createHash('sha256').update(bytes).digest(), hanaKey = this.fingerprint(hanaRef);
            const prior = action === 'use' ? origin : this.db.prepare('SELECT consumed_digest FROM installs WHERE hana_key=?').get(hanaKey);
            const priorDigest = prior?.consumed_digest;
            if (priorDigest !== null && priorDigest !== undefined) {
                if (!(priorDigest instanceof Uint8Array) || priorDigest.length !== 32)
                    throw Error('CORE_ORIGIN_LEDGER_INVALID');
                if (!Buffer.from(priorDigest).equals(digest))
                    throw Error('CORE_ORIGIN_CONSUMED');
            }
            else if (action === 'use')
                this.db.prepare('UPDATE origins SET consumed_digest=? WHERE key=? AND consumed_digest IS NULL').run(digest, key);
            else
                this.db.prepare('INSERT INTO installs(hana_key,consumed_digest) VALUES(?,?)').run(hanaKey, digest);
            return { signature: signer() };
        });
    }
}
const namespace = Buffer.from('6aa7b4d188f54f9689e2cf5ffca77c2d', 'hex');
function eventId(deviceId, key) {
    const b = createHash('sha1').update(namespace).update(JSON.stringify([deviceId, 'hanamesh-usage', key])).digest().subarray(0, 16);
    b[6] = (b[6] & 15) | 80;
    b[8] = (b[8] & 63) | 128;
    const h = b.toString('hex');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}
export function checkedAgentEvent(value, factId, deviceId, consentId) {
    if (!hex64(factId) || !value || typeof value !== 'object' || Array.isArray(value))
        return bad();
    const e = value;
    if (Object.keys(e).sort().join('|') !== 'action|channel|deviceId|eventId|feature|hanaRef|nonce|occurredAt|success' || e.deviceId !== deviceId || typeof e.hanaRef !== 'string' || e.hanaRef.length > 160 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._:-]*$/i.test(e.hanaRef) || !['use', 'install'].includes(String(e.action)) || !['codex', 'claude'].includes(String(e.channel)) || typeof e.feature !== 'string' || !/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]{0,154}$/.test(e.feature) || (e.success !== null && typeof e.success !== 'boolean') || typeof e.occurredAt !== 'string' || !Number.isFinite(Date.parse(e.occurredAt)) || new Date(e.occurredAt).toISOString() !== e.occurredAt)
        return bad();
    const expected = eventId(deviceId, e.action === 'use' ? `agent:${String(e.channel)}:${factId}` : `agent-install:${e.hanaRef}`);
    const nonce = `g${consentId}.n${createHash('sha256').update(JSON.stringify(['hanamesh-usage:seat-event-nonce:v1', expected])).digest('base64url')}`;
    if (e.eventId !== expected || e.nonce !== nonce)
        return bad();
    const bytes = Buffer.from(JSON.stringify({ deviceId: e.deviceId, hanaRef: e.hanaRef, action: e.action, occurredAt: e.occurredAt, eventId: e.eventId, nonce: e.nonce, channel: e.channel, feature: e.feature, success: e.success }));
    return { hanaRef: e.hanaRef, action: e.action, bytes };
}
