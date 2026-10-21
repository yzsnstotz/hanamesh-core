/** One ordinary plugin activation owns these route registrations. No retry or timer. */
export declare function createActivationGate(admission: {
    requestRejection(request: Request): 401 | 403 | undefined;
}): {
    fetch(request: Request): Promise<Response>;
    ready(value: (request: Request) => Promise<Response>): void;
    fail(): void;
    dispose(): void;
};
