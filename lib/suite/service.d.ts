import type { SuiteDeclaration, SuiteDeclarationRequest, SuiteServiceOptions } from './types.js';
export declare class SuiteDeclarationService {
    readonly options: SuiteServiceOptions;
    constructor(options: SuiteServiceOptions);
    read(request?: SuiteDeclarationRequest): Promise<SuiteDeclaration>;
    private validRecord;
    private validManifest;
}
