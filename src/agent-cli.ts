#!/usr/bin/env node
import {homedir} from 'node:os';
import {join} from 'node:path';
import {CoreError, upstreamFacts} from './errors.js';
import {agentCall} from './agent.js';

// One JSON request per short-lived process. The Usage adapter supplies configuration explicitly.
try {
  const chunks:Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {config?:Record<string,unknown>;input?:Record<string,unknown>};
  const config = request.config ?? {};
  const result = await agentCall({sharedHome:String(config.sharedHome ?? process.env['HANAMESH_SHARED_HOME'] ?? join(homedir(),'.hanamesh-shared')),
    serverOrigin:typeof config.serverOrigin === 'string' ? config.serverOrigin : null,
    websiteOrigin:typeof config.websiteOrigin === 'string' ? config.websiteOrigin : null,
    ...(typeof config.timeoutMs==='number'?{timeoutMs:config.timeoutMs}:{})},request.input ?? {});
  process.stdout.write(`${JSON.stringify({result})}\n`);
} catch(error) {
  const candidate = (error as {code?:string;message?:string}).code ?? (error as Error).message;
  const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate ?? '') ? candidate : 'CORE_AGENT_FAILED';
  process.stdout.write(`${JSON.stringify({error:{code,...(error instanceof CoreError?{status:error.status,...upstreamFacts(error)}:{})}})}\n`); process.exitCode = 1;
}
