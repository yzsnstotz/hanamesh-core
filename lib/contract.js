/** Cordis service name under which Core provides the contract. */
export const CORE_SERVICE_NAME = 'hanameshCore';
/** Protocol this package provides. A breaking change ships as `'2'`; v1 only ever gains optional members. */
export const CORE_PROTOCOL_VERSION = '1';
export const CORE_SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([CORE_PROTOCOL_VERSION]);
export const CORE_REQUIRED_METHODS = Object.freeze(['getDeviceId', 'sign', 'signRequest', 'getConsent', 'onConsentChange', 'getSession', 'getServerOrigin']);
export const CORE_OPTIONAL_METHODS = Object.freeze(['getPublicKey', 'getHealth']);
/**
 * Consumer-side handshake: `accept` is the list of protocol versions the consumer implements.
 * Order is fixed (absent → not an object → protocol → required methods) so every input has exactly one result;
 * nothing is coerced or accepted silently. Optional methods are reported only when they are functions.
 */
export function checkCoreService(value, accept = CORE_SUPPORTED_PROTOCOL_VERSIONS) {
    if (value === undefined || value === null)
        return { status: 'absent', reason: 'CORE_ABSENT' };
    if (typeof value !== 'object')
        return { status: 'incompatible', reason: 'CORE_NOT_OBJECT' };
    const record = value;
    const provided = record.protocolVersion;
    if (typeof provided !== 'string' || !accept.includes(provided)) {
        return { status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: typeof provided === 'string' ? provided : null, supported: [...accept] };
    }
    const missing = CORE_REQUIRED_METHODS.filter(name => typeof record[name] !== 'function');
    if (missing.length > 0)
        return { status: 'incompatible', reason: 'CORE_METHOD_MISSING', missing };
    return { status: 'present', protocolVersion: provided, optional: CORE_OPTIONAL_METHODS.filter(name => typeof record[name] === 'function') };
}
