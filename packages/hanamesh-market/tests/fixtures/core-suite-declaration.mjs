import recordedInstallation from './core-suite-installation.json' with {type:'json'};
const SUITE_INSTALL_COMMAND=recordedInstallation.command+' '+recordedInstallation.args.join(' ');
// Generated with Core 5969368 public createSuiteInstallRelease(0.1.1, {registry}).
// Recorded declaration DTO data avoids coupling AppHost publication to an unpublished SDK; no command parsing.
export const installation=recordedInstallation;
// Public C-CORE section D DTO fixture. This is not a Core runtime integration receipt.
export const registry='https://registry.example.test/';
export const names=['@hanamesh/core','@hanamesh/usage','@hanamesh/dsh-app-host'];
export const versions=['0.3.12','0.2.0-rc.34','0.6.5'];
const ids=['core','usage','app-host'];
const repositories=['https://github.com/yzsnstotz/hanamesh-core','https://github.com/yzsnstotz/hanamesh-usage','https://github.com/yzsnstotz/hanamesh-plugin-app-host'];
export function declaration(){return{schemaVersion:1,bundleVersion:'0.1.0',installCommand:SUITE_INSTALL_COMMAND,checkedAt:'2026-10-16T00:00:00.000Z',declarationId:'a'.repeat(64),manifest:{schemaVersion:1,id:'hanamesh-suite',bundle:{name:'@hanamesh/hanamesh',repository:repositories[0]},core:{name:names[0],version:versions[0],repository:repositories[0]},components:names.slice(1).map((moduleName,i)=>({id:ids[i+1],moduleName,versionRange:'*',repository:repositories[i+1]}))},nodeVersion:'24.13.1',registry,completeness:'complete',installed:names.map((moduleName,i)=>({id:ids[i],moduleName,requiredRange:i?'*':'0.3.12',repository:repositories[i],actualVersion:versions[i],actualRepository:repositories[i],status:'satisfied',...(i===0?{runningVersion:versions[0]}:{})})),upgrades:[{installation:structuredClone(installation),bundle:{id:'bundle',moduleName:'@hanamesh/hanamesh',version:'0.1.1',repository:repositories[0],metadataDigest:'d'.repeat(64)},registry,targets:names.map((moduleName,i)=>({id:ids[i],moduleName,version:['0.4.0','0.3.0','0.7.0'][i],repository:repositories[i],metadataDigest:String(i+1).repeat(64)}))}],blocked:[],peerFacts:{},metadataDigests:{}};}
export const core=value=>({protocolVersion:'1',getSuiteDeclaration:async()=>structuredClone(value)});
/** A profile with one direct bundle; children are resolved physical package metadata. */
export async function writeSuiteProfile(root, memberVersions, bundleVersion='0.1.0'){
 const {mkdir,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const dependencies=Object.fromEntries(names.map((name,i)=>[name,Array.isArray(memberVersions)?memberVersions[i]:memberVersions[name]]));
 const directory=join(root,'node_modules','@hanamesh/hanamesh');await mkdir(directory,{recursive:true});
 await writeFile(join(directory,'package.json'),JSON.stringify({name:'@hanamesh/hanamesh',version:bundleVersion,dependencies}));
 await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{'@hanamesh/hanamesh':bundleVersion},dsh:{profile:{bundles:['@hanamesh/hanamesh']}}}));
}
