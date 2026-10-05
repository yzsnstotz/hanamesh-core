import {runMutations} from '@hanamesh/devkit';
import {mutationConfig, validateMutationEvidence} from '../devkit.mutations.mjs';
// Isolated copies resolve their own lib; inherited fixture overrides must not bypass it.
delete process.env.HM_TEST_LIB;
delete process.env.HM_ADAPTER_EVIDENCE;
await runMutations(mutationConfig);
await validateMutationEvidence();
