// Calls the injected provider, never implements or substitutes it. All payloads
// are explicit local FIXTURE bytes; no events or transactions are submitted.
export async function callExamples(core) {
  const deviceId = core.getDeviceId();
  const publicKey = core.getPublicKey();
  const session = core.getSession();
  const health = core.getHealth();
  const serverOrigin = core.getServerOrigin();
  const consent = core.getConsent();
  const fixture = {deviceId, hanaRef: 'hana_FIXTURE_雪', action: 'use', occurredAt: '2026-01-01T00:00:00.000Z', eventId: 'native-fixture-event', nonce: 'native-fixture-event-nonce'};
  const message = JSON.stringify(fixture);
  const payload = new TextEncoder().encode(message);
  const signature = core.sign(payload);
  const again = core.sign(payload);
  const requests = [];
  for (const input of [
    {method: 'post', path: '/v1/usage/events?fixture=1#ignored', body: new TextEncoder().encode('[]')},
    {method: 'GET', path: '/v1/usage/me/contributions?from=fixture&to=fixture', body: null},
    {method: 'DELETE', path: `/v1/usage/me/devices/${deviceId}/events`, body: new Uint8Array()},
  ]) {
    const result = core.signRequest(input);
    requests.push({input: {method: input.method, path: input.path, bodyBase64: input.body === null ? null : Buffer.from(input.body).toString('base64')}, promise: result instanceof Promise, headers: await result});
  }
  const bad = core.signRequest({method: 'GET', path: '/FIXTURE', body: {invalid: true}});
  let rejected;
  try { await bad; rejected = {resolvedUnexpectedly: true}; }
  catch (error) { rejected = {code: error.code, status: error.status}; }
  return {
    deviceId, publicKey, session, health, serverOrigin, consent,
    synchronous: [deviceId, publicKey, session, health, serverOrigin, consent, signature].every(value => !(value instanceof Promise)),
    sessionFrozen: Object.isFrozen(session), healthFrozen: Object.isFrozen(health),
    raw: {label: 'FIXTURE_BYTES_NOT_C_USAGE_NORM', message, isUint8Array: signature instanceof Uint8Array, signature: Buffer.from(signature).toString('base64url'), repeated: Buffer.from(again).toString('base64url')},
    requests, invalidRequest: {promise: bad instanceof Promise, result: rejected},
  };
}
