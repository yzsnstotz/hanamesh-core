// Prints configuration input only. Does not install, edit a profile or start/stop a host.
import assert from 'node:assert/strict';
import {isAbsolute, join} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export function coreInstallInput(environmentRoot, ports = {}) {
  assert.ok(isAbsolute(environmentRoot), 'Owned environment root must be absolute');
  const origin = port => {
    if (port === undefined) return null; // explicit offline configuration, never factory production defaults
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535 && port !== 3080, 'Expected a mechanism-owned service port');
    return `http://127.0.0.1:${port}`;
  };
  const config = {
    serverOrigin: origin(ports.server),
    websiteOrigin: origin(ports.web),
    sharedIdentityDir: join(environmentRoot, 'core-shared'),
    allowSystemBrowser: false,
  };
  return {
    config,
    patch: '- id: hanamesh-core\n  config:\n' + Object.entries(config).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}\n`).join(''),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assert.ok(process.env.SEGFLOW_ENV_DIR, 'SEGFLOW_ENV_DIR required; no HOME/profile fallback');
  const root = await realpath(process.env.SEGFLOW_ENV_DIR);
  const ports = {};
  for (const [key, variable] of [['server', 'SEGFLOW_PORT_SERVER'], ['web', 'SEGFLOW_PORT_WEB']]) {
    if (process.env[variable] !== undefined) ports[key] = Number(process.env[variable]);
  }
  process.stdout.write(JSON.stringify(coreInstallInput(root, ports), null, 2) + '\n');
}
