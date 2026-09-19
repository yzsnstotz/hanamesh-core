import type {Context} from '@deepseek-ai/cordis';
import type {PluginConfig} from '../lib/contracts.js';
import type {HanaMeshCoreContract} from '../lib/contract.js';
import '@deepseek-ai/dsh-client-connection';
import '@deepseek-ai/dsh-storage-domain';
export type {PluginConfig} from '../lib/contracts.js';
export type {HanaMeshCoreContract} from '../lib/contract.js';
declare module '@deepseek-ai/cordis' {
  interface Context {hanameshCore: HanaMeshCoreContract;}
}
export declare const name: 'hanamesh-core';
export declare const inject: string[];
export declare function apply(ctx: Context, config: PluginConfig): Promise<void>;
