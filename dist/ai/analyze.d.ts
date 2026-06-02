import type { BridgerMap } from '../vite-plugin/index.js';
export interface AnalysisResult {
    feasibility: {
        status: 'yes' | 'partial' | 'no';
        reason: string;
    };
    conception: {
        summary: string;
        steps: string[];
        impactedFiles: string[];
    };
    ticket: {
        title: string;
        userStory: string;
        acceptanceCriteria: string[];
        technicalNotes: string;
        complexity: 'low' | 'medium' | 'high';
        storyPoints: 1 | 2 | 3 | 5 | 8 | 13 | 21;
        storyPointsReason: string;
    };
    claudeCodePrompt: string;
}
export type RegenerableSection = 'feasibility' | 'conception' | 'ticket' | 'claudeCodePrompt';
export declare function analyzeFeature(featureDescription: string, pageComponents: string[], bridgerMap: BridgerMap, apiKey: string, language?: 'fr' | 'en'): Promise<AnalysisResult>;
export declare function regenerateSection(section: RegenerableSection, featureDescription: string, pageComponents: string[], bridgerMap: BridgerMap, currentResult: AnalysisResult, apiKey: string, language?: 'fr' | 'en', instruction?: string): Promise<Partial<AnalysisResult>>;
export declare function chatWithContext(messages: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, featureDescription: string, pageComponents: string[], bridgerMap: BridgerMap, currentResult: AnalysisResult, apiKey: string, language?: 'fr' | 'en'): Promise<string>;
