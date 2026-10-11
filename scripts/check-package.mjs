import {verifyPack} from '@hanamesh/devkit';
import {packConfig} from '../devkit.pack.mjs';
try { await verifyPack(packConfig); } catch (error) {
  if (error?.stdout) process.stderr.write(error.stdout);
  if (error?.stderr) process.stderr.write(error.stderr);
  throw error;
}
