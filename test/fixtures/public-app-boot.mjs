// TEST-ONLY host observations. Compatibility delegates to the actual public npm API.
import {readFileSync} from 'node:fs';
import {evaluatePluginCompatibility as officialCompatibility,getDshRuntimeVersion as officialRuntimeVersion} from 'test:real-dsh-app-boot';
export const compatibilityCalls=[];
export function evaluatePluginCompatibility(manifest,exemptions,runtimeVersion){
 compatibilityCalls.push({manifest,runtimeVersion});
 return officialCompatibility(manifest,exemptions,runtimeVersion);
}
export function getDshRuntimeVersion(){
 const file=process.env.HM_TEST_DSH_BOOT_METADATA;
 return file?JSON.parse(readFileSync(file,'utf8')).version:officialRuntimeVersion();
}
