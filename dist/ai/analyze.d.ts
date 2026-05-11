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
    };
    claudeCodePrompt: string;
}
export declare function analyzeFeature(featureDescription: string, pageComponents: string[], bridgerMap: BridgerMap, apiKey: string, language?: 'fr' | 'en'): Promise<AnalysisResult>;
