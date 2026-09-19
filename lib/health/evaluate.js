import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const semver = require('../../vendor/semver/index.js');
const reasons = {
    satisfied: '必需组件已加载，版本符合当前 profile。',
    missing: '当前加载配置中找不到此必需组件。',
    incompatible: '实际组件版本不在 profile 要求的范围内。',
    damaged: '必需组件的入口文件缺失。',
    unreadable: '当前无法读取或确认此组件的包元数据。',
    inactive: '组件未处于已生效状态。',
    failed: 'Loader 报告此组件加载失败。',
    ambiguous: '同一必需组件匹配到多个 Loader 条目。',
};
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
function componentResult(required, observation) {
    let status;
    if (observation.kind !== 'present')
        status = observation.kind;
    else if (!semver.valid(observation.version ?? ''))
        status = 'unreadable';
    else if (!semver.satisfies(observation.version ?? '', required.versionRange))
        status = 'incompatible';
    else if (observation.phase === 'failed')
        status = 'failed';
    else if (observation.phase !== 'active')
        status = 'inactive';
    else
        status = 'satisfied';
    return {
        id: required.id, moduleName: required.moduleName, label: required.label, requiredRange: required.versionRange,
        onFailure: required.onFailure, status, reason: reasons[status], impact: required.impact,
        version: semver.valid(observation.version ?? '') ? observation.version ?? null : null,
        phase: observation.phase ?? 'unavailable', stagedVersion: semver.valid(observation.stagedVersion ?? '') ? observation.stagedVersion ?? null : null,
        nextStep: status === 'satisfied' ? null : 'restore-pinned-component',
    };
}
export function evaluate(profile, observations, revision, now = new Date()) {
    const components = profile.components.map((row, index) => componentResult(row, observations[index] ?? { kind: 'unreadable' }));
    const issues = components.filter(row => row.status !== 'satisfied');
    let mode = 'normal';
    if (issues.some(row => ['damaged', 'unreadable', 'failed', 'ambiguous'].includes(row.status)))
        mode = 'repair';
    else if (issues.some(row => row.onFailure === 'block'))
        mode = 'blocked';
    else if (issues.some(row => row.onFailure === 'restrict'))
        mode = 'restricted';
    return freeze({
        schemaVersion: 1, profile: { id: profile.id, version: profile.version, label: profile.label, digest: createHash('sha256').update(JSON.stringify(profile)).digest('hex') },
        revision, checkedAt: now.toISOString(), mode, components,
        newProtectedOperations: mode === 'normal' ? 'resource-check-still-required' : 'reject',
        runningTaskPolicy: mode === 'normal' ? 'unchanged' : profile.runningTaskPolicy,
        nextStep: mode === 'normal' ? '继续使用；受保护资源仍由资源端逐次检查。' : '恢复锁定版本的必需组件，再执行重新检查。',
        persistence: 'durable',
    });
}
export function faultSnapshot(profile, revision, fault) {
    const base = evaluate(profile, [], revision);
    return freeze({ ...base, mode: 'repair', newProtectedOperations: 'reject', runningTaskPolicy: profile.runningTaskPolicy, fault, persistence: 'unavailable' });
}
