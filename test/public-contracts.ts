import {SESSION_STATUSES, type IdentityClientService, type SessionSnapshot, type ScopedResponse} from '../lib/contracts.js';
import {BrowserIdentityClient} from '../lib/client.js';
declare const identity: IdentityClientService;
const snapshot: SessionSnapshot = identity.getState();
const request: Promise<ScopedResponse> = identity.request({path:'/v1/identity/me'});
identity.subscribe(value=>{ const state: typeof SESSION_STATUSES[number] = value.status; void state; });
// @ts-expect-error Ordinary consumers cannot receive raw token getters.
identity.getToken();
// @ts-expect-error Login credentials are not part of the public service facade.
identity.signIn({email:'fixture@example.invalid',password:'not-a-real-password'});
// @ts-expect-error Other plugins cannot force principal or bearer headers.
identity.request({path:'/v1/identity/me',headers:{'x-principal-id':'fake'}});
// @ts-expect-error Session observations are immutable.
snapshot.status='signed_in';
// @ts-expect-error No permission issuer exists.
identity.issueGrant('admin');
// @ts-expect-error No token appears in the PrincipalDTO.
snapshot.principal?.token;
const browser = new BrowserIdentityClient('https://dsh.example.invalid');
// @ts-expect-error Browser SDK has no raw auth object.
browser.auth;
void request;
