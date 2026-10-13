import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';

// These labels are the existing budget span's projection, not the whole config.
export function budgetPhrases(config) {
  return [
    `请求时限 ${config.timeoutMs}ms`, `健康检查 ${config.checkIntervalMs}ms`,
    `名称请求时限 ${config.profileTimeoutMs}ms`, `Hana 行预算 ${config.maxHanaRows}`,
    `响应字节预算 ${config.maxResponseBytes}`, `界面轮询 ${config.clientPollIntervalMs}ms`,
    `积分刷新 ${config.pointsRefreshMs}ms`, `贡献刷新 ${config.contributionIntervalMs}ms`,
    `活动每次 ${config.activityPageBudget} 页、显示 ${config.activityDisplayRows} 行`,
    `名称并发 ${config.catalogConcurrency}`,
  ];
}

export function assertCallExamples(sample) {
  assert.equal(sample.synchronous, true);
  assert.equal(sample.sessionFrozen, true);
  assert.equal(sample.healthFrozen, true);
  assert.ok(['granted', 'withheld'].includes(sample.consent));
  assert.ok(sample.serverOrigin === null || typeof sample.serverOrigin === 'string');
  const rawPublic = Buffer.from(sample.publicKey, 'base64url');
  assert.match(sample.publicKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(rawPublic.length, 32);
  assert.equal(createHash('sha256').update(rawPublic).digest('base64url'), sample.deviceId);
  const key = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPublic]), type: 'spki', format: 'der'});
  const utf8 = text => new TextEncoder().encode(text);
  const verifies = (message, signature) => verify(null, message, key, signature);
  assert.deepEqual(Object.keys(sample.session).sort(), ['protocolVersion', 'deviceId', 'registration', 'principalId', 'bound', 'serverReachable', 'checkedAt', 'reason'].sort());
  assert.equal(sample.session.protocolVersion, '1');
  assert.equal(sample.session.deviceId, sample.deviceId);
  assert.ok(['unregistered', 'registered', 'failed'].includes(sample.session.registration));
  for (const field of ['principalId', 'checkedAt', 'reason']) assert.ok(sample.session[field] === null || typeof sample.session[field] === 'string', field);
  for (const field of ['bound', 'serverReachable']) assert.ok(sample.session[field] === null || typeof sample.session[field] === 'boolean', field);
  if (sample.session.checkedAt !== null) assert.equal(new Date(sample.session.checkedAt).toISOString(), sample.session.checkedAt);
  assert.ok(Number.isSafeInteger(sample.health.revision) && sample.health.revision >= 0);
  assert.ok(['normal', 'restricted', 'blocked', 'repair'].includes(sample.health.mode));
  assert.ok(Array.isArray(sample.health.components));
  if (sample.health.fault !== undefined) assert.equal(typeof sample.health.fault, 'string');
  assert.equal(sample.raw.label, 'FIXTURE_BYTES_NOT_C_USAGE_NORM');
  assert.equal(sample.raw.isUint8Array, true);
  const signature = Buffer.from(sample.raw.signature, 'base64url');
  assert.doesNotMatch(sample.raw.signature, /[=+/]/);
  assert.equal(signature.length, 64);
  assert.equal(sample.raw.signature, sample.raw.repeated);
  assert.equal(verifies(utf8(sample.raw.message), signature), true);
  const fixture = JSON.parse(sample.raw.message);
  assert.deepEqual(Object.keys(fixture), ['deviceId', 'hanaRef', 'action', 'occurredAt', 'eventId', 'nonce']);
  assert.equal(fixture.deviceId, sample.deviceId);
  for (const field of Object.keys(fixture)) assert.equal(verifies(utf8(JSON.stringify({...fixture, [field]: fixture[field] + '-changed'})), signature), false, field);
  assert.equal(verifies(utf8(JSON.stringify(fixture, null, 2)), signature), false);
  assert.equal(verifies(utf8(createHash('sha256').update(utf8(sample.raw.message)).digest('hex')), signature), false);
  assert.equal(sample.requests.length, 3);
  assert.deepEqual(sample.requests.map(row => row.input.method.toUpperCase()), ['POST', 'GET', 'DELETE']);
  for (const row of sample.requests) {
    assert.equal(row.promise, true);
    assert.deepEqual(Object.keys(row.headers).sort(), ['x-hm-device-id', 'x-hm-timestamp', 'x-hm-nonce', 'x-hm-signature'].sort());
    assert.equal(row.headers['x-hm-device-id'], sample.deviceId);
    const timestamp = row.headers['x-hm-timestamp'], nonce = row.headers['x-hm-nonce'];
    assert.match(timestamp, /^\d+$/); assert.equal(typeof nonce, 'string'); assert.ok(nonce.length > 0);
    const body = row.input.bodyBase64 === null ? Buffer.alloc(0) : Buffer.from(row.input.bodyBase64, 'base64');
    const hash = createHash('sha256').update(body).digest('hex');
    const path = row.input.path.replace(/[?#].*$/u, '');
    const canonical = `${row.input.method.toUpperCase()}|${path}|${timestamp}|${nonce}|${hash}`;
    const sig = Buffer.from(row.headers['x-hm-signature'], 'base64url');
    assert.equal(sig.length, 64); assert.doesNotMatch(row.headers['x-hm-signature'], /[=+/]/);
    assert.equal(verifies(utf8(canonical), sig), true);
    for (const altered of [canonical.replace(path, '/tampered'), canonical.replace(timestamp, timestamp + '1'), canonical.replace(nonce, nonce + 'changed'), canonical.replace(hash, '0'.repeat(64)), 'PUT' + canonical.slice(canonical.indexOf('|'))]) assert.equal(verifies(utf8(altered), sig), false);
    if (row.input.path !== path) assert.equal(verifies(utf8(canonical.replace(path, row.input.path)), sig), false);
  }
  assert.equal(sample.invalidRequest.promise, true);
  assert.deepEqual(sample.invalidRequest.result, {code: 'CORE_INPUT_INVALID', status: 400});
}
