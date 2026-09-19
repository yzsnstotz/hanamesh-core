import type { StoredDevice } from './device.js';
import { ServerTransport } from './transport.js';
interface RegistrationResponse {
    deviceId: string;
    principalId: string;
}
export declare function registerDevice(transport: ServerTransport, device: StoredDevice): Promise<RegistrationResponse>;
export {};
