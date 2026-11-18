/** Native Discover presentation policy. No profile scanning, installation or persistence. */
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import semver from 'semver';

/** anchor is the trusted running DSH installation anchor, never a browser value. */
export function createNativeMarketPolicy({anchor,pluginManager}){
  const manager=()=>typeof pluginManager==='function'?pluginManager():undefined;
  async function compatibility(manifest){
    const current=manager();
    if(!anchor||typeof current?.listVersionExemptions!=='function')throw new Error('DSH_COMPATIBILITY_UNAVAILABLE');
    // Resolve from the host installation just as the existing version reader does.
    // Never use an AppHost copy of engines.dsh or exemption matching rules.
    const sdk=await import(pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot')).href);
    if(typeof sdk.evaluatePluginCompatibility!=='function'||typeof sdk.getDshRuntimeVersion!=='function')throw new Error('DSH_COMPATIBILITY_UNAVAILABLE');
    const runtimeVersion=sdk.getDshRuntimeVersion();
    const snapshot=await current.listVersionExemptions();
    if(manager()!==current||!snapshot||!snapshot.exemptions||typeof snapshot.exemptions!=='object'||Array.isArray(snapshot.exemptions))throw new Error('DSH_COMPATIBILITY_UNAVAILABLE');
    const issue=sdk.evaluatePluginCompatibility(manifest,snapshot.exemptions,runtimeVersion);
    return issue===undefined?{compatible:true,runtimeVersion}:{compatible:false,runtimeVersion,requirements:issue.requirements,exempted:issue.exempted};
  }
  async function installation(name,version){
    const current=manager();
    if(typeof current?.listBundles!=='function')throw new Error('DSH_BUNDLES_UNAVAILABLE');
    const bundles=await current.listBundles();
    if(manager()!==current||!Array.isArray(bundles))throw new Error('DSH_BUNDLES_UNAVAILABLE');
    const bundle=bundles.find(candidate=>candidate.name===name);
    if(!bundle||!bundle.installed&&bundle.availability!=='installation')return{status:'not-installed'};
    const installedVersion=bundle.version;
    if(!bundle.installed)return{status:'provided',...(installedVersion===undefined?{}:{installedVersion})};
    if(installedVersion===undefined)return{status:'different-version'};
    if(installedVersion===version)return{status:'installed',installedVersion};
    return{status:semver.valid(installedVersion)&&semver.valid(version)&&semver.gt(version,installedVersion)?'update-available':'different-version',installedVersion};
  }
  return{compatibility,installation};
}
