import {createDevice} from '../../lib/device.js';
import {fileSharedDeviceStore} from '../../lib/shared-device.js';

// One "client process" racing for the machine identity: claim its own fresh device, print whichever won.
const [root] = process.argv.slice(2);
const winner = await fileSharedDeviceStore(root).claim(createDevice());
process.stdout.write(winner.deviceId);
