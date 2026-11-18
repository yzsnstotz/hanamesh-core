import { requireCondition } from '../errors.js';
import semver from 'semver';

const npmName=value=>typeof value==='string'&&value.length<=214&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
const own=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));

/** Encode a reviewed immutable target for the official DSH CLI's native pnpm Git path. */
export function pinnedGithubSpec(repository,commit,subdirectory){
  requireCondition(typeof repository==='string'&&/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(repository),
    'INVALID_INPUT','GitHub installation requires an owner/repository identity.');
  requireCondition(typeof commit==='string'&&/^[0-9a-f]{40}$/i.test(commit),'INVALID_INPUT','GitHub installation requires a full commit SHA.');
  requireCondition(subdirectory===undefined||subdirectory===null||(typeof subdirectory==='string'&&subdirectory.length>0&&
    subdirectory.split('/').every(part=>part!=='.'&&part!=='..'&&/^[A-Za-z0-9_@+.-]+$/.test(part))),
    'INVALID_INPUT','GitHub installation requires a relative repository subdirectory.');
  return `github:${repository}#${commit.toLowerCase()}${subdirectory?'&path:'+subdirectory:''}`;
}

/** The Indexer's package target is a data selector, never an executable command. */
export function packageInstallTarget(value){
  const github=value?.source==='github';
  requireCondition(own(value,github?['source','repo','ref','path','packageName','allowBuild']:['source','name','version','allowBuild'])&&
    (github||value.source==='npm')&&npmName(github?value.packageName:value.name)&&
    Array.isArray(value.allowBuild)&&value.allowBuild.every(entry=>typeof entry==='string'&&entry.length>0&&entry.length<=2048&&!/[\s\u0000-\u001f\u007f-\u009f]/u.test(entry)),
    'INVALID_INPUT','Invalid catalog package installation target.');
  if(github){
    requireCondition(value.path===null||typeof value.path==='string','INVALID_INPUT','GitHub path must be a relative path or null.');
    pinnedGithubSpec(value.repo,value.ref,value.path);
    return{source:'github',repo:value.repo,ref:value.ref.toLowerCase(),path:value.path,packageName:value.packageName,allowBuild:[...value.allowBuild]};
  }
  requireCondition(typeof value.version==='string'&&value.version.length<=128&&semver.valid(value.version)===value.version,
    'INVALID_INPUT','npm target version must be the exact version fixed at collection.');
  return{source:'npm',name:value.name,version:value.version,allowBuild:[...value.allowBuild]};
}

export const installTargetName=target=>target.source==='github'?target.packageName:target.name;
export const sameInstallTarget=(left,right)=>JSON.stringify(packageInstallTarget(left))===JSON.stringify(packageInstallTarget(right));
export const catalogInstallationAllowed=item=>Array.isArray(item?.installMethods)&&item?.oneClickInstall?.allowed===true;
export function catalogPackageTargets(item){
  if(!catalogInstallationAllowed(item))return[];
  return (item.installMethods??[]).filter(method=>['hanamesh','dsh'].includes(method.channel)&&method.target)
    .map(method=>packageInstallTarget(method.target));
}
