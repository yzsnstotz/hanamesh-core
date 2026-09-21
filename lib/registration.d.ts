import type { StoredDevice } from './device.js';
import { ServerTransport } from './transport.js';
interface RegistrationResponse {
    deviceId: string;
    principalId: string;
    label?: DeviceLabel;
}
/** identity 0.2.0-rc.3 `POST /v1/identity/devices` optional `label`: hostname ≤64, os ≤32, shell ≤48 (trimmed, no control characters). */
export interface DeviceLabel {
    readonly hostname: string;
    readonly os: string;
    readonly shell: string;
}
/** Owner-facing label so several DSH profiles on one machine can be told apart on the website (STATUS `DEVICE-PER-PROFILE`).
 *  `shell` is `HANAMESH_SHELL` when the hosting shell sets it (desktop: `hanamesh-desktop/<version>`), else `dsh` (official DSH sets nothing). */
export declare function deviceLabel(env?: NodeJS.ProcessEnv): DeviceLabel | null;
export declare function registerDevice(transport: ServerTransport, device: StoredDevice, label?: DeviceLabel | null): Promise<RegistrationResponse>;
export {};
