export interface ComponentInfo {
    name: string;
    path: string;
    code: string;
    exports: string[];
}
export interface BridgerMap {
    components: Record<string, ComponentInfo>;
    stack: Record<string, string[]>;
    generatedAt: string;
}
export declare function bridger(): any;
