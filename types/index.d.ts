import type { Context } from '@deepseek-ai/cordis';
import type { PluginConfig, IdentityClientService } from '../lib/contracts.js';
import '@deepseek-ai/dsh-client-connection';
import '@deepseek-ai/dsh-host-webserver';
import '@deepseek-ai/dsh-storage-domain';
export type { PluginConfig, IdentityClientService } from '../lib/contracts.js';
declare module '@deepseek-ai/cordis' {
  interface Context { hanameshIdentity: IdentityClientService; }
}
export declare const name: 'hanamesh-plugin-identity';
export declare const inject: string[];
export declare function apply(ctx: Context, config: PluginConfig): Promise<void>;
