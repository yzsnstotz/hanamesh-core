import {validateCoreEnvironment} from './devkit.preflight.mjs';
import {mutationConfig} from './devkit.mutations.mjs';
import {packConfig} from './devkit.pack.mjs';
export default {
  'check-toolchain': {root: process.cwd(), pins: {node: '24.13.1', pnpm: '10.33.0', typescript: '5.9.3', nodeTypes: '24.13.4'}},
  preflight: {root: process.cwd(), validate: validateCoreEnvironment},
  mutations: mutationConfig,
  'verify-pack': packConfig,
};
