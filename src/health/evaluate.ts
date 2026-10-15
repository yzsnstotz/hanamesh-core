import {createHash} from 'node:crypto';
import semver from 'semver';
import type {ComponentHealth, ComponentObservation, ComponentStatus, CoreHealthSnapshot, SuiteComponent, SuiteProfile} from './types.js';

const reasons: Record<ComponentStatus, string> = {
  satisfied: '必需组件已加载，版本符合当前 profile。',
  missing: '当前加载配置中找不到此必需组件。',
  incompatible: '实际组件版本不在 profile 要求的范围内。',
  damaged: '必需组件的入口文件缺失。',
  unreadable: '当前无法读取或确认此组件的包元数据。',
  inactive: '组件未处于已生效状态。',
  failed: 'Loader 报告此组件加载失败。',
  ambiguous: '同一必需组件匹配到多个 Loader 条目。',
};
const startupDiagnostics = {
  'invalid-record': ['本地存储记录不符合当前组件的数据格式。', '先备份本地数据，再安装支持此数据格式的组件版本；保留原数据，完全退出并重开 DSH 后重新检查。'],
  'version-mismatch': ['本地存储版本与当前组件不兼容。', '先备份本地数据，确认宿主与组件的存储版本兼容后重新检查。'],
  'backend-not-found': ['组件所需的存储后端未就绪。', '启用组件所需的存储后端，再重新检查。'],
  'malformed-medium': ['本地存储介质无法按预期格式读取。', '先备份本地数据，检查存储介质与组件兼容性，再重新检查。'],
  'invalid-config': ['组件配置未通过校验。', '在插件配置中修正必填项与字段类型，再重新检查。'],
  'startup-failed': ['组件启动失败，当前无法安全识别具体原因。', '查看该组件日志并修复启动问题，再重新检查。'],
  'diagnostic-timeout': ['组件启动失败，读取原因已超时。', '查看该组件日志并修复启动问题，再重新检查。'],
} as const;

function startupText(diagnostic: NonNullable<ComponentObservation['startupFailure']>): {reason: string; nextStep: string} {
  const code = Object.hasOwn(startupDiagnostics, diagnostic.code) ? diagnostic.code : 'startup-failed';
  const [explanation, nextStep] = startupDiagnostics[code];
  const domain = code === 'invalid-record' && diagnostic.domain === 'hanamesh_usage_events' ? '（hanamesh_usage_events）' : '';
  return {reason: `${code}${domain}：${explanation}`, nextStep};
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function componentResult(required: SuiteComponent, observation: ComponentObservation): ComponentHealth {
  let status: ComponentStatus;
  if (observation.kind !== 'present') status = observation.kind;
  else if (!semver.valid(observation.version ?? '')) status = 'unreadable';
  else if (!semver.satisfies(observation.version ?? '', required.versionRange)) status = 'incompatible';
  else if (observation.phase === 'failed') status = 'failed';
  else if (observation.phase !== 'active') status = 'inactive';
  else status = 'satisfied';
  const diagnostic = status === 'failed' && observation.startupFailure ? startupText(observation.startupFailure) : null;
  return {
    id: required.id, moduleName: required.moduleName, label: required.label, requiredRange: required.versionRange,
    onFailure: required.onFailure, status, reason: diagnostic?.reason ?? reasons[status], impact: required.impact,
    version: semver.valid(observation.version ?? '') ? observation.version ?? null : null,
    phase: observation.phase ?? 'unavailable', stagedVersion: semver.valid(observation.stagedVersion ?? '') ? observation.stagedVersion ?? null : null,
    nextStep: status === 'satisfied' ? null : diagnostic?.nextStep ?? 'restore-pinned-component',
  };
}

export function evaluate(profile: SuiteProfile, observations: readonly ComponentObservation[], revision: number, now = new Date()): CoreHealthSnapshot {
  const components = profile.components.map((row, index) => componentResult(row, observations[index] ?? {kind: 'unreadable'}));
  const issues = components.filter(row => row.status !== 'satisfied');
  let mode: CoreHealthSnapshot['mode'] = 'normal';
  if (issues.some(row => ['damaged', 'unreadable', 'failed', 'ambiguous'].includes(row.status))) mode = 'repair';
  else if (issues.some(row => row.onFailure === 'block')) mode = 'blocked';
  else if (issues.some(row => row.onFailure === 'restrict')) mode = 'restricted';
  return freeze({
    schemaVersion: 1, profile: {id: profile.id, version: profile.version, label: profile.label, digest: createHash('sha256').update(JSON.stringify(profile)).digest('hex')},
    revision, checkedAt: now.toISOString(), mode, components,
    newProtectedOperations: mode === 'normal' ? 'resource-check-still-required' : 'reject',
    runningTaskPolicy: mode === 'normal' ? 'unchanged' : profile.runningTaskPolicy,
    nextStep: mode === 'normal' ? '继续使用；受保护资源仍由资源端逐次检查。' : mode === 'repair' ? '按各组件提示修复启动或存储问题，再执行重新检查。' : '恢复锁定版本的必需组件，再执行重新检查。',
    persistence: 'durable',
  });
}

export function faultSnapshot(profile: SuiteProfile, revision: number, fault: NonNullable<CoreHealthSnapshot['fault']>): CoreHealthSnapshot {
  const base = evaluate(profile, [], revision);
  return freeze({...base, mode: 'repair', newProtectedOperations: 'reject', runningTaskPolicy: profile.runningTaskPolicy, fault, persistence: 'unavailable'});
}
