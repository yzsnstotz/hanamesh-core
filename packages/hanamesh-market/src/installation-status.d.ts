/** Advertised metadata only. Discovery performs no installation read. */
export const INSTALLATION_STATUS_CAPABILITY:Readonly<{contract:'hanamesh.installation-status';contractVersion:'1';path:'/hanamesh/library/installation-status'}>;
export interface InstallationStatusRequest {contractVersion:'1';consent:'read-installations'}
export interface InstallationObservation {
 channel:'hanamesh'|'dsh'|'claude'|'codex';
 scope:{id:'current-runtime'|'other-runtime'|'agent-cli'|'desktop-app';kind:'responding-runtime'|'other-client'|'official-user-profile'|'desktop-app';label:string};
 status:'installed'|'not-installed'|'incomplete'|'unknown';version:string|null;versionKind:'suite-bundle'|'agent-distribution';
 components:readonly {name:string;version:string|null;active?:boolean;status?:string}[];
 identity:{pluginName:string;marketplace:string}|null;
 reason:{code:string;message:string;action:string}|null;
 blocked?:readonly {code:string;moduleName?:string}[];
}
export interface InstallationStatus {schemaVersion:1;client:'hanamesh'|'dsh';checkedAt:string;observations:readonly InstallationObservation[];traceId?:string}
