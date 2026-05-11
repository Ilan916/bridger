import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { scanCurrentPage } from '../scanner/fiber.js';
import { analyzeFeature } from '../ai/analyze.js';
const COMPLEXITY_COLOR = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
};
const FEASIBILITY_COLOR = {
    yes: '#22c55e',
    partial: '#f59e0b',
    no: '#ef4444',
};
const FEASIBILITY_LABEL = {
    fr: { yes: '✅ Faisable', partial: '⚠️ Partiellement faisable', no: '❌ Non faisable' },
    en: { yes: '✅ Feasible', partial: '⚠️ Partially feasible', no: '❌ Not feasible' },
};
export function BridgerOverlay({ apiKey, language = 'fr' }) {
    const [step, setStep] = useState('idle');
    const [feature, setFeature] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [bridgerMap, setBridgerMap] = useState(null);
    const [activeTab, setActiveTab] = useState('ticket');
    // Charge la map générée par le plugin Vite
    useEffect(() => {
        import('virtual:bridger-map')
            .then((mod) => setBridgerMap(mod.bridgerMap))
            .catch(() => console.warn('[Bridger] virtual:bridger-map not found — did you add the Vite plugin?'));
    }, []);
    // Raccourci clavier: Shift+B
    useEffect(() => {
        const handler = (e) => {
            if (e.shiftKey && e.key === 'B') {
                setStep(s => s === 'idle' ? 'open' : 'idle');
            }
            if (e.key === 'Escape')
                setStep('idle');
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    const analyze = useCallback(async () => {
        if (!feature.trim() || !bridgerMap)
            return;
        setStep('loading');
        setError('');
        try {
            const pageComponents = scanCurrentPage();
            const analysis = await analyzeFeature(feature, pageComponents, bridgerMap, apiKey, language);
            setResult(analysis);
            setStep('result');
        }
        catch (err) {
            setError(err.message ?? 'Unknown error');
            setStep('error');
        }
    }, [feature, bridgerMap, apiKey, language]);
    const copyPrompt = useCallback(() => {
        if (!result)
            return;
        navigator.clipboard.writeText(result.claudeCodePrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [result]);
    const reset = () => {
        setStep('open');
        setFeature('');
        setResult(null);
        setError('');
    };
    if (step === 'idle') {
        return (_jsx("button", { onClick: () => setStep('open'), title: "Bridger \u2014 Describe a feature (Shift+B)", style: {
                position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
                width: 48, height: 48, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: 'white', transition: 'transform 0.2s',
            }, onMouseEnter: e => (e.currentTarget.style.transform = 'scale(1.1)'), onMouseLeave: e => (e.currentTarget.style.transform = 'scale(1)'), children: "\uD83C\uDF09" }));
    }
    return (_jsxs("div", { style: {
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }, children: [_jsxs("div", { style: {
                    background: '#0f0f13', border: '1px solid #2a2a3a',
                    borderRadius: 16, width: '100%', maxWidth: 640,
                    maxHeight: '85vh', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                }, children: [_jsxs("div", { style: {
                            padding: '20px 24px', borderBottom: '1px solid #1e1e2e',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { style: { fontSize: 20 }, children: "\uD83C\uDF09" }), _jsx("span", { style: { color: '#fff', fontWeight: 700, fontSize: 16 }, children: "Bridger" }), _jsx("span", { style: {
                                            background: '#6366f1', color: '#fff', fontSize: 10,
                                            padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                                        }, children: "by Ayve" })] }), _jsx("button", { onClick: () => setStep('idle'), style: {
                                    background: 'none', border: 'none', color: '#666',
                                    cursor: 'pointer', fontSize: 20, lineHeight: 1,
                                }, children: "\u00D7" })] }), _jsxs("div", { style: { padding: 24, overflowY: 'auto', flex: 1 }, children: [(step === 'open' || step === 'loading') && (_jsxs("div", { children: [_jsx("p", { style: { color: '#888', fontSize: 13, margin: '0 0 16px' }, children: language === 'fr'
                                            ? 'Décris la feature que tu veux ajouter sur cette page. L\'IA analysera les composants présents et te donnera une conception technique.'
                                            : 'Describe the feature you want to add on this page. The AI will analyze the current components and provide a technical conception.' }), _jsx("textarea", { autoFocus: true, value: feature, onChange: e => setFeature(e.target.value), placeholder: language === 'fr'
                                            ? 'Ex: Je veux ajouter un système de filtres par catégorie sur la liste des produits...'
                                            : 'Ex: I want to add a category filter system on the product list...', disabled: step === 'loading', style: {
                                            width: '100%', minHeight: 120, padding: 14,
                                            background: '#1a1a24', border: '1px solid #2a2a3a',
                                            borderRadius: 10, color: '#e0e0e0', fontSize: 14,
                                            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                            lineHeight: 1.6,
                                        }, onKeyDown: e => {
                                            if (e.key === 'Enter' && e.metaKey)
                                                analyze();
                                        } }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, children: [_jsx("span", { style: { color: '#555', fontSize: 12 }, children: language === 'fr' ? '⌘ + Entrée pour analyser' : '⌘ + Enter to analyze' }), _jsx("button", { onClick: analyze, disabled: !feature.trim() || step === 'loading' || !bridgerMap, style: {
                                                    background: step === 'loading' ? '#3a3a5a' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    color: '#fff', border: 'none', borderRadius: 8,
                                                    padding: '10px 20px', cursor: step === 'loading' ? 'not-allowed' : 'pointer',
                                                    fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                                                }, children: step === 'loading' ? (_jsxs(_Fragment, { children: [_jsx("span", { style: { animation: 'spin 1s linear infinite', display: 'inline-block' }, children: "\u27F3" }), language === 'fr' ? 'Analyse en cours...' : 'Analyzing...'] })) : (language === 'fr' ? '✨ Analyser' : '✨ Analyze') })] })] })), step === 'error' && (_jsxs("div", { children: [_jsx("div", { style: {
                                            background: '#2a1a1a', border: '1px solid #5a2a2a',
                                            borderRadius: 10, padding: 16, marginBottom: 16,
                                        }, children: _jsxs("p", { style: { color: '#f87171', margin: 0, fontSize: 14 }, children: ["\u274C ", error] }) }), _jsx("button", { onClick: reset, style: {
                                            background: '#1e1e2e', border: '1px solid #2a2a3a',
                                            color: '#aaa', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                                        }, children: language === 'fr' ? '← Réessayer' : '← Retry' })] })), step === 'result' && result && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: {
                                            background: '#1a1a24', border: `1px solid ${FEASIBILITY_COLOR[result.feasibility.status]}40`,
                                            borderRadius: 10, padding: 16,
                                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }, children: [_jsx("span", { style: {
                                                            color: FEASIBILITY_COLOR[result.feasibility.status],
                                                            fontWeight: 700, fontSize: 14,
                                                        }, children: FEASIBILITY_LABEL[language][result.feasibility.status] }), _jsx("span", { style: {
                                                            background: `${COMPLEXITY_COLOR[result.ticket.complexity]}20`,
                                                            color: COMPLEXITY_COLOR[result.ticket.complexity],
                                                            fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                                                        }, children: result.ticket.complexity.toUpperCase() })] }), _jsx("p", { style: { color: '#aaa', fontSize: 13, margin: 0, lineHeight: 1.6 }, children: result.feasibility.reason })] }), _jsxs("div", { style: { background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }, children: [_jsxs("h4", { style: { color: '#fff', margin: '0 0 10px', fontSize: 13, fontWeight: 600 }, children: ["\uD83D\uDDFA\uFE0F ", language === 'fr' ? 'Conception' : 'Conception'] }), _jsx("p", { style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }, children: result.conception.summary }), _jsx("ol", { style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }, children: result.conception.steps.map((step, i) => _jsx("li", { children: step }, i)) }), result.conception.impactedFiles.length > 0 && (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: result.conception.impactedFiles.map(f => (_jsx("span", { style: {
                                                        background: '#0f0f18', border: '1px solid #2a2a3a',
                                                        color: '#6366f1', fontSize: 11, padding: '2px 8px', borderRadius: 6,
                                                        fontFamily: 'monospace',
                                                    }, children: f }, f))) }))] }), _jsxs("div", { children: [_jsx("div", { style: { display: 'flex', gap: 4, marginBottom: 12 }, children: ['ticket', 'prompt'].map(tab => (_jsx("button", { onClick: () => setActiveTab(tab), style: {
                                                        background: activeTab === tab ? '#6366f1' : '#1a1a24',
                                                        border: `1px solid ${activeTab === tab ? '#6366f1' : '#2a2a3a'}`,
                                                        color: activeTab === tab ? '#fff' : '#888',
                                                        borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                                    }, children: tab === 'ticket' ? '🎫 Ticket' : '🤖 Prompt Claude Code' }, tab))) }), activeTab === 'ticket' && (_jsxs("div", { style: { background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }, children: [_jsx("p", { style: { color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }, children: result.ticket.title }), _jsx("p", { style: { color: '#888', fontSize: 13, margin: '0 0 12px', fontStyle: 'italic' }, children: result.ticket.userStory }), _jsx("p", { style: { color: '#6366f1', fontSize: 12, fontWeight: 600, margin: '0 0 6px' }, children: language === 'fr' ? 'Critères d\'acceptance' : 'Acceptance criteria' }), _jsx("ul", { style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }, children: result.ticket.acceptanceCriteria.map((c, i) => _jsx("li", { children: c }, i)) }), _jsxs("p", { style: { color: '#555', fontSize: 12, margin: 0, fontStyle: 'italic' }, children: ["\uD83D\uDCDD ", result.ticket.technicalNotes] })] })), activeTab === 'prompt' && (_jsxs("div", { style: { position: 'relative' }, children: [_jsx("pre", { style: {
                                                            background: '#1a1a24', border: '1px solid #2a2a3a',
                                                            borderRadius: 10, padding: 16, color: '#aaa', fontSize: 12,
                                                            lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0,
                                                        }, children: result.claudeCodePrompt }), _jsx("button", { onClick: copyPrompt, style: {
                                                            position: 'absolute', top: 10, right: 10,
                                                            background: copied ? '#22c55e' : '#2a2a3a',
                                                            border: 'none', color: '#fff', borderRadius: 6,
                                                            padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                        }, children: copied ? '✓ Copied!' : 'Copy' })] }))] }), _jsx("button", { onClick: reset, style: {
                                            background: 'none', border: '1px solid #2a2a3a',
                                            color: '#666', borderRadius: 8, padding: '8px 16px',
                                            cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start',
                                        }, children: language === 'fr' ? '← Nouvelle feature' : '← New feature' })] }))] })] }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` })] }));
}
