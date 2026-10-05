import {checkToolchain, preflight} from '@hanamesh/devkit';
import config from '../devkit.config.mjs';
checkToolchain(config['check-toolchain']);
await preflight(config.preflight);
