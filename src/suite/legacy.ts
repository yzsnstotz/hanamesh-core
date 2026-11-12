import semver from 'semver';
import {CoreError} from '../errors.js';
import {frozen, repositoryIdentity, isPackageName} from './facts.js';
import {compatibilityIssues} from './compatibility.js';
import {OWN_PACKAGE} from './own.js';
import {formatSuiteInstallCommand} from './install-command.js';
import type {LegacyInstallationFacts, LegacyInstallationAssessment, SuiteManifest, PackageMetadata} from './types.js';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Public, read-only Core assessor. Core has no independent numeric version floor (owner ratified). */
export async function assessLegacyInstallation(facts: LegacyInstallationFacts): Promise<LegacyInstallationAssessment> {
  return assessLegacyInstallationWithManifest(facts, OWN_PACKAGE.hanameshSuite!, OWN_PACKAGE.hanameshSuiteInstall?.command ?? null);
}
export async function assessLegacyInstallationWithManifest(facts: LegacyInstallationFacts, manifest: SuiteManifest, command: string | null): Promise<LegacyInstallationAssessment> {
  const required = [{moduleName: manifest.core.name, repository: manifest.core.repository, versionRange: null}, ...manifest.components];
  if (!object(facts) || (facts.scope !== undefined && facts.scope !== 'profile') || !semver.valid(facts.nodeVersion) || !Array.isArray(facts.components) || facts.components.length !== required.length
    || !facts.components.every(row => object(row) && required.some(r => r.moduleName === row.moduleName) && object(row.observation) && object(row.peers))
    || new Set(facts.components.map(row => row.moduleName)).size !== required.length) throw new CoreError('CORE_LEGACY_FACTS_INVALID', 400);
  const issues: {code: string; moduleName: string; message: string}[] = [];
  const add = (moduleName: string, code: string, message: string): void => {issues.push({code, moduleName, message: `${moduleName}：${message}`});};
  const components: {name: string; version: string | null; active?: boolean; status: string}[] = [];
  const records: PackageMetadata[] = [];
  for (const member of required) {
    const {observation: observed, runningVersion} = facts.components.find(row => row.moduleName === member.moduleName)!;
    const version = typeof observed.version === 'string' && semver.valid(observed.version) === observed.version ? observed.version : null;
    const component = {name: member.moduleName, version, ...(observed.phase ? {active: observed.phase === 'active'} : {}), status: observed.kind};
    components.push(component);
    if (observed.kind === 'missing') {add(member.moduleName, 'CORE_LEGACY_COMPONENT_MISSING', '缺少必需组件。'); continue;}
    if (observed.kind === 'unreadable' || observed.kind === 'ambiguous') {add(member.moduleName, 'CORE_LEGACY_COMPONENT_UNKNOWN', '组件事实无法确认，请重新检测。'); continue;}
    if (observed.kind !== 'present') {add(member.moduleName, 'CORE_LEGACY_COMPONENT_DAMAGED', '组件入口缺失或组件已损坏。'); continue;}
    const metadata = observed.metadata;
    if (!version || !object(metadata) || metadata.name !== member.moduleName || metadata.version !== version) {add(member.moduleName, 'CORE_LEGACY_COMPONENT_METADATA', '包名或版本格式校验失败。'); continue;}
    if (repositoryIdentity(metadata.repository) !== repositoryIdentity(member.repository)) {add(member.moduleName, 'CORE_LEGACY_COMPONENT_SOURCE', '组件来源与已登记仓库不一致。'); continue;}
    if (member.versionRange && !semver.satisfies(version, member.versionRange)) add(member.moduleName, 'CORE_LEGACY_COMPONENT_VERSION', `版本 ${version} 不满足已有要求 ${member.versionRange}。`);
    if (observed.phase !== 'active') add(member.moduleName, 'CORE_LEGACY_COMPONENT_INACTIVE', '组件未启用或加载失败。');
    if (runningVersion !== undefined && runningVersion !== version) add(member.moduleName, 'CORE_LEGACY_RUNNING_PHYSICAL_MISMATCH', '磁盘版本与当前运行版本不一致，需完全退出并重开客户端。');
    records.push(metadata as unknown as PackageMetadata);
  }
  const unknownPeers = new Map<string, Set<string>>();
  const compatibility = await compatibilityIssues(records, facts.scope === 'profile' ? null : facts.nodeVersion, async (name, record) => {
    if (!isPackageName(name)) return 'unknown';
    const value = facts.components.find(row => row.moduleName === record.name)?.peers[name];
    if (facts.scope === 'profile' && (value === undefined || value === null)) return undefined;
    if (value === null || typeof value !== 'string' || semver.valid(value) !== value) {
      const names = unknownPeers.get(record.name) ?? new Set<string>(); names.add(name); unknownPeers.set(record.name, names);
    }
    return value === null ? null : typeof value === 'string' && semver.valid(value) === value ? value : 'unknown';
  });
  const explanations: Record<string, string> = {
    CORE_SUITE_BUNDLE_MISSING: '缺少 DSH 组件格式声明。', CORE_SUITE_BUNDLE_INVALID: 'DSH 组件格式声明无效。',
    CORE_SUITE_METADATA_INVALID: '运行环境或依赖要求格式无效。', CORE_SUITE_NODE_INCOMPATIBLE: 'Node 版本不满足组件自身要求。',
    CORE_SUITE_PEER_UNKNOWN: '组件所需依赖版本无法确认。', CORE_SUITE_PEER_INCOMPATIBLE: '依赖版本不满足组件自身要求。',
  };
  for (const issue of compatibility) {
    const peers = issue.code === 'CORE_SUITE_PEER_UNKNOWN' ? [...(unknownPeers.get(issue.moduleName!) ?? [])].join('、') : '';
    add(issue.moduleName!, issue.code, peers ? `组件所需依赖 ${peers} 的版本无法确认。` : explanations[issue.code] ?? '组件兼容性校验失败。');
  }
  const absent = facts.components.every(row => row.observation.kind === 'missing');
  const uncertain = (code: string) => ['CORE_LEGACY_COMPONENT_UNKNOWN', 'CORE_SUITE_PEER_UNKNOWN'].includes(code);
  const status = absent ? 'not-installed' : issues.some(i => !uncertain(i.code)) ? 'incomplete' : issues.length ? 'unknown' : 'installed';
  const release = OWN_PACKAGE.hanameshSuiteInstall;
  const action = command && release && semver.valid(release.version) && command === formatSuiteInstallCommand(release.version) ? command : '按本渠道的 HanaMesh 安装说明升级。';
  const reason = status === 'not-installed' ? null : {
    code: status === 'installed' ? 'CORE_LEGACY_COMPONENTS_INSTALLED' : status === 'incomplete' ? 'CORE_LEGACY_COMPONENTS_UNUSABLE' : 'CORE_LEGACY_COMPONENTS_UNKNOWN',
    message: status === 'installed' ? '已安装（旧版组件），建议升级。' : issues.map(i => i.message).join(' ').slice(0, 500), action,
  };
  return frozen({status, components, issues, reason});
}
