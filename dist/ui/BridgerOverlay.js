import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { scanCurrentPage } from '../scanner/fiber.js';
import { analyzeFeature, regenerateSection, chatWithContext } from '../ai/analyze.js';
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
const editTextareaStyle = {
    width: '100%',
    background: '#0f0f18',
    border: '1px solid #6366f1',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    padding: 8,
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.6,
    boxSizing: 'border-box',
};
function hoverableStyle(base) {
    return { ...base, cursor: 'text', padding: '2px 4px', borderRadius: 4 };
}
function spColor(sp) {
    if (sp <= 3)
        return '#22c55e';
    if (sp <= 8)
        return '#f59e0b';
    return '#ef4444';
}
export function BridgerOverlay({ apiKey, language = 'fr' }) {
    const [step, setStep] = useState('idle');
    const [feature, setFeature] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [bridgerMap, setBridgerMap] = useState(null);
    const [activeTab, setActiveTab] = useState('ticket');
    // Inline editing
    const [editedTicket, setEditedTicket] = useState(null);
    const [editingField, setEditingField] = useState(null);
    // Partial regeneration
    const [regenTarget, setRegenTarget] = useState(null);
    const [regenInstruction, setRegenInstruction] = useState('');
    const [regenLoading, setRegenLoading] = useState(null);
    // Components badge
    const [showComponents, setShowComponents] = useState(false);
    const componentsBadgeRef = useRef(null);
    // Chat
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);
    // Original context for regen/chat
    const [originalContext, setOriginalContext] = useState(null);
    useEffect(() => {
        import('virtual:bridger-map')
            .then((mod) => setBridgerMap(mod.bridgerMap))
            .catch(() => console.warn('[Bridger] virtual:bridger-map not found — did you add the Vite plugin?'));
    }, []);
    useEffect(() => {
        const handler = (e) => {
            if (e.shiftKey && e.key === 'B')
                setStep(s => s === 'idle' ? 'home' : 'idle');
            if (e.key === 'Escape')
                setStep('idle');
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    useEffect(() => {
        if (!showComponents)
            return;
        const handler = (e) => {
            if (componentsBadgeRef.current && !componentsBadgeRef.current.contains(e.target)) {
                setShowComponents(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showComponents]);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, chatLoading]);
    const analyze = useCallback(async () => {
        if (!feature.trim() || !bridgerMap)
            return;
        setStep('loading');
        setError('');
        try {
            const pageComponents = scanCurrentPage();
            const analysis = await analyzeFeature(feature, pageComponents, bridgerMap, apiKey, language);
            setResult(analysis);
            setEditedTicket(analysis.ticket);
            setOriginalContext({ feature, pageComponents });
            setChatMessages([]);
            setStep('result');
        }
        catch (err) {
            setError(err.message ?? 'Unknown error');
            setStep('error');
        }
    }, [feature, bridgerMap, apiKey, language]);
    const regenerate = useCallback(async (section, instruction) => {
        if (!result || !originalContext || !bridgerMap)
            return;
        setRegenTarget(null);
        setRegenInstruction('');
        setRegenLoading(section);
        try {
            const partial = await regenerateSection(section, originalContext.feature, originalContext.pageComponents, bridgerMap, result, apiKey, language, instruction);
            setResult(prev => prev ? { ...prev, ...partial } : prev);
            if (partial.ticket)
                setEditedTicket(partial.ticket);
        }
        catch {
            // silently ignore regen errors
        }
        finally {
            setRegenLoading(null);
        }
    }, [result, originalContext, bridgerMap, apiKey, language]);
    const sendChat = useCallback(async () => {
        if (!chatInput.trim() || chatLoading || !result || !originalContext || !bridgerMap)
            return;
        const userMsg = { role: 'user', content: chatInput.trim() };
        const newMessages = [...chatMessages, userMsg];
        setChatMessages(newMessages);
        setChatInput('');
        setChatLoading(true);
        try {
            const reply = await chatWithContext(newMessages, originalContext.feature, originalContext.pageComponents, bridgerMap, result, apiKey, language);
            setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        }
        catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }]);
        }
        finally {
            setChatLoading(false);
        }
    }, [chatInput, chatLoading, chatMessages, result, originalContext, bridgerMap, apiKey, language]);
    const copyPrompt = useCallback(() => {
        if (!result)
            return;
        navigator.clipboard.writeText(result.claudeCodePrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [result]);
    const copyTicket = useCallback(() => {
        if (!editedTicket)
            return;
        const text = [
            `## ${editedTicket.title}`,
            '',
            editedTicket.userStory,
            '',
            language === 'fr' ? "### Critères d'acceptance" : '### Acceptance criteria',
            ...editedTicket.acceptanceCriteria.map(c => `- ${c}`),
            '',
            `📝 ${editedTicket.technicalNotes}`,
        ].join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [editedTicket, language]);
    const reset = () => {
        setStep('home');
        setFeature('');
        setResult(null);
        setError('');
        setEditedTicket(null);
        setEditingField(null);
        setRegenTarget(null);
        setRegenInstruction('');
        setRegenLoading(null);
        setOriginalContext(null);
        setChatMessages([]);
        setChatInput('');
        setShowComponents(false);
        setActiveTab('ticket');
    };
    // ── Render helpers ──────────────────────────────────────────────────────────
    const renderRegenBtn = (section) => {
        if (regenLoading === section) {
            return (_jsxs("span", { style: { color: '#6366f1', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }, children: [_jsx("span", { style: { animation: 'spin 1s linear infinite', display: 'inline-block' }, children: "\u27F3" }), language === 'fr' ? 'Régénération…' : 'Regenerating…'] }));
        }
        const isActive = regenTarget === section;
        return (_jsxs("button", { onClick: () => { setRegenInstruction(''); setRegenTarget(prev => prev === section ? null : section); }, disabled: regenLoading !== null, style: {
                background: isActive ? '#6366f120' : 'none',
                border: `1px solid ${isActive ? '#6366f1' : '#2a2a3a'}`,
                color: isActive ? '#6366f1' : '#555',
                borderRadius: 5, padding: '2px 8px',
                cursor: regenLoading !== null ? 'not-allowed' : 'pointer',
                fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }, children: ["\u21BB ", language === 'fr' ? 'Régénérer' : 'Regenerate'] }));
    };
    const renderRegenForm = (section) => (_jsxs("div", { style: { background: '#0f0f18', border: '1px solid #3a3a5a', borderRadius: 7, padding: '10px 12px', marginBottom: 10 }, children: [_jsx("input", { autoFocus: true, type: "text", value: regenInstruction, onChange: e => setRegenInstruction(e.target.value), placeholder: language === 'fr' ? 'Précise ce que tu veux changer… (optionnel)' : 'Specify what you want to change… (optional)', onKeyDown: e => {
                    if (e.key === 'Enter')
                        regenerate(section, regenInstruction);
                    if (e.key === 'Escape') {
                        setRegenTarget(null);
                        setRegenInstruction('');
                    }
                }, style: {
                    width: '100%', background: 'transparent', border: 'none',
                    borderBottom: '1px solid #2a2a3a', color: '#e0e0e0', fontSize: 12,
                    outline: 'none', paddingBottom: 8, marginBottom: 8, boxSizing: 'border-box',
                } }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { onClick: () => regenerate(section, regenInstruction), style: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }, children: language === 'fr' ? '✓ Confirmer' : '✓ Confirm' }), _jsx("button", { onClick: () => { setRegenTarget(null); setRegenInstruction(''); }, style: { background: 'none', border: '1px solid #2a2a3a', color: '#666', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }, children: language === 'fr' ? 'Annuler' : 'Cancel' })] })] }));
    // ── Floating button (idle) ──────────────────────────────────────────────────
    if (step === 'idle') {
        return (_jsx("button", { onClick: () => setStep('home'), title: "Bridger \u2014 Describe a feature (Shift+B)", style: {
                position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
                background: 'linear-gradient(135deg, #3730a3, #5b21b6)',
                border: 'none', borderRadius: 5,
                padding: '9px 18px', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(55,48,163,0.5)',
                color: '#e0e7ff', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
                transition: 'transform 0.15s, box-shadow 0.15s',
            }, onMouseEnter: e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(55,48,163,0.65)'; }, onMouseLeave: e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(55,48,163,0.5)'; }, children: "Bridger" }));
    }
    // ── Modal ──────────────────────────────────────────────────────────────────
    const chatDisabled = !result || !originalContext;
    return (_jsxs("div", { style: {
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }, children: [_jsxs("div", { style: {
                    background: '#0f0f13', border: '1px solid #2a2a3a',
                    borderRadius: 12, width: '90vw', height: '90vh',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                }, children: [_jsxs("div", { style: {
                            padding: '16px 24px', borderBottom: '1px solid #1e1e2e', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }, children: [_jsx("span", { style: { color: '#fff', fontWeight: 700, fontSize: 15 }, children: "Bridger" }), _jsx("button", { onClick: () => setStep('idle'), style: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, lineHeight: 1 }, children: "\u00D7" })] }), step === 'result' && originalContext && originalContext.pageComponents.length > 0 && (_jsxs("div", { ref: componentsBadgeRef, style: { position: 'relative', padding: '5px 24px', borderBottom: '1px solid #141420', flexShrink: 0 }, children: [_jsxs("button", { onClick: () => setShowComponents(prev => !prev), style: {
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#2e2e45', fontSize: 11,
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s',
                                }, onMouseEnter: e => (e.currentTarget.style.color = '#4a4a6a'), onMouseLeave: e => (e.currentTarget.style.color = '#2e2e45'), children: ["\uD83D\uDD0D ", originalContext.pageComponents.length, ' ', language === 'fr'
                                        ? `composant${originalContext.pageComponents.length > 1 ? 's' : ''} analysé${originalContext.pageComponents.length > 1 ? 's' : ''} sur cette page`
                                        : `component${originalContext.pageComponents.length > 1 ? 's' : ''} analyzed on this page`, _jsx("span", { style: { fontSize: 8, opacity: 0.5 }, children: showComponents ? '▲' : '▼' })] }), showComponents && (_jsx("div", { style: {
                                    position: 'absolute', top: 'calc(100% + 2px)', left: 24, zIndex: 100,
                                    background: '#0f0f18', border: '1px solid #2a2a3a',
                                    borderRadius: 8, padding: 10,
                                    maxHeight: 220, overflowY: 'auto',
                                    display: 'flex', flexWrap: 'wrap', gap: 5,
                                    minWidth: 220, maxWidth: 420,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                }, children: originalContext.pageComponents.map(name => (_jsx("span", { style: {
                                        background: '#1a1a24', border: '1px solid #2a2a3a',
                                        color: '#555', fontSize: 11, padding: '2px 8px',
                                        borderRadius: 4, fontFamily: 'monospace',
                                    }, children: name }, name))) }))] })), _jsxs("div", { style: { display: 'flex', flex: 1, overflow: 'hidden' }, children: [_jsxs("div", { style: { flex: 1, overflowY: 'auto', padding: 24, minWidth: 0 }, children: [step === 'home' && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '72%', gap: 28 }, children: [_jsx("h2", { style: { color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, textAlign: 'center' }, children: language === 'fr' ? 'Que voulez-vous faire ?' : 'What do you want to do?' }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 440 }, children: [_jsx("button", { onClick: () => setStep('open'), style: {
                                                            background: '#1a1a24', border: '1px solid #2a2a3a',
                                                            borderRadius: 10, padding: '20px 22px',
                                                            cursor: 'pointer', textAlign: 'left',
                                                            display: 'flex', alignItems: 'flex-start', gap: 16,
                                                            transition: 'border-color 0.15s, background 0.15s',
                                                        }, onMouseEnter: e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#1e1e2e'; }, onMouseLeave: e => { e.currentTarget.style.borderColor = '#2a2a3a'; e.currentTarget.style.background = '#1a1a24'; }, children: _jsxs("div", { children: [_jsx("p", { style: { color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 4px' }, children: language === 'fr' ? 'Rédiger un ticket' : 'Write a ticket' }), _jsx("p", { style: { color: '#555', fontSize: 13, margin: 0 }, children: language === 'fr' ? 'Une tâche précise et bien cadrée' : 'A precise and well-scoped task' })] }) }), _jsx("button", { disabled: true, style: {
                                                            background: '#13131a', border: '1px solid #1a1a24',
                                                            borderRadius: 10, padding: '20px 22px',
                                                            cursor: 'not-allowed', textAlign: 'left', opacity: 0.45,
                                                            display: 'flex', alignItems: 'flex-start', gap: 16,
                                                        }, children: _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }, children: [_jsx("p", { style: { color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }, children: language === 'fr' ? 'Planifier une feature' : 'Plan a feature' }), _jsx("span", { style: { background: '#2a2a3a', color: '#555', fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }, children: language === 'fr' ? 'Bientôt' : 'Soon' })] }), _jsx("p", { style: { color: '#444', fontSize: 13, margin: 0 }, children: language === 'fr' ? 'Découper une feature en plusieurs tickets' : 'Break a feature into multiple tickets' })] }) })] })] })), (step === 'open' || step === 'loading') && (_jsxs("div", { children: [_jsx("p", { style: { color: '#888', fontSize: 13, margin: '0 0 16px' }, children: language === 'fr'
                                                    ? "Décris la feature que tu veux ajouter sur cette page. L'IA analysera les composants présents et te donnera une conception technique."
                                                    : 'Describe the feature you want to add on this page. The AI will analyze the current components and provide a technical conception.' }), _jsx("textarea", { autoFocus: true, value: feature, onChange: e => setFeature(e.target.value), placeholder: language === 'fr'
                                                    ? 'Ex: Je veux ajouter un système de filtres par catégorie sur la liste des produits...'
                                                    : 'Ex: I want to add a category filter system on the product list...', disabled: step === 'loading', style: {
                                                    width: '100%', minHeight: 140, padding: 14,
                                                    background: '#1a1a24', border: '1px solid #2a2a3a',
                                                    borderRadius: 10, color: '#e0e0e0', fontSize: 14,
                                                    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                                                }, onKeyDown: e => { if (e.key === 'Enter' && e.metaKey)
                                                    analyze(); } }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, children: [_jsx("span", { style: { color: '#555', fontSize: 12 }, children: language === 'fr' ? '⌘ + Entrée pour analyser' : '⌘ + Enter to analyze' }), _jsx("button", { onClick: analyze, disabled: !feature.trim() || step === 'loading' || !bridgerMap, style: {
                                                            background: step === 'loading' ? '#3a3a5a' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                            color: '#fff', border: 'none', borderRadius: 7,
                                                            padding: '10px 20px', cursor: step === 'loading' ? 'not-allowed' : 'pointer',
                                                            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                                                        }, children: step === 'loading' ? (_jsxs(_Fragment, { children: [_jsx("span", { style: { animation: 'spin 1s linear infinite', display: 'inline-block' }, children: "\u27F3" }), language === 'fr' ? 'Analyse en cours...' : 'Analyzing...'] })) : (language === 'fr' ? '✨ Analyser' : '✨ Analyze') })] })] })), step === 'error' && (_jsxs("div", { children: [_jsx("div", { style: { background: '#2a1a1a', border: '1px solid #5a2a2a', borderRadius: 10, padding: 16, marginBottom: 16 }, children: _jsxs("p", { style: { color: '#f87171', margin: 0, fontSize: 14 }, children: ["\u274C ", error] }) }), _jsx("button", { onClick: reset, style: { background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#aaa', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }, children: language === 'fr' ? '← Réessayer' : '← Retry' })] })), step === 'result' && result && editedTicket && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: { background: '#1a1a24', border: `1px solid ${FEASIBILITY_COLOR[result.feasibility.status]}40`, borderRadius: 10, padding: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { color: FEASIBILITY_COLOR[result.feasibility.status], fontWeight: 700, fontSize: 14 }, children: FEASIBILITY_LABEL[language][result.feasibility.status] }), _jsxs("span", { title: result.ticket.storyPointsReason, style: { background: `${spColor(result.ticket.storyPoints)}20`, color: spColor(result.ticket.storyPoints), fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, cursor: 'default' }, children: [result.ticket.storyPoints, " pts"] })] }), renderRegenBtn('feasibility')] }), regenTarget === 'feasibility' && renderRegenForm('feasibility'), _jsx("div", { style: { opacity: regenLoading === 'feasibility' ? 0.4 : 1, transition: 'opacity 0.2s' }, children: _jsx("p", { style: { color: '#aaa', fontSize: 13, margin: 0, lineHeight: 1.6 }, children: result.feasibility.reason }) })] }), _jsxs("div", { style: { background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, children: [_jsxs("h4", { style: { color: '#fff', margin: 0, fontSize: 13, fontWeight: 600 }, children: ["\uD83D\uDDFA\uFE0F ", language === 'fr' ? 'Conception' : 'Conception'] }), renderRegenBtn('conception')] }), regenTarget === 'conception' && renderRegenForm('conception'), _jsxs("div", { style: { opacity: regenLoading === 'conception' ? 0.4 : 1, transition: 'opacity 0.2s' }, children: [_jsx("p", { style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }, children: result.conception.summary }), _jsx("ol", { style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }, children: result.conception.steps.map((s, i) => _jsx("li", { children: s }, i)) }), result.conception.impactedFiles.length > 0 && (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: result.conception.impactedFiles.map(f => (_jsx("span", { style: { background: '#0f0f18', border: '1px solid #2a2a3a', color: '#6366f1', fontSize: 11, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace' }, children: f }, f))) }))] })] }), _jsxs("div", { children: [_jsx("div", { style: { display: 'flex', gap: 4, marginBottom: 12 }, children: ['ticket', 'prompt'].map(tab => (_jsx("button", { onClick: () => setActiveTab(tab), style: {
                                                                background: activeTab === tab ? '#6366f1' : '#1a1a24',
                                                                border: `1px solid ${activeTab === tab ? '#6366f1' : '#2a2a3a'}`,
                                                                color: activeTab === tab ? '#fff' : '#888',
                                                                borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                                            }, children: tab === 'ticket' ? '🎫 Ticket' : '🤖 Prompt Claude Code' }, tab))) }), activeTab === 'ticket' && (_jsxs("div", { style: { background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }, children: [_jsxs("div", { style: { opacity: regenLoading === 'ticket' ? 0.4 : 1, transition: 'opacity 0.2s', pointerEvents: regenLoading === 'ticket' ? 'none' : 'auto' }, children: [editingField === 'title' ? (_jsx("input", { autoFocus: true, value: editedTicket.title, onChange: e => setEditedTicket(prev => prev ? { ...prev, title: e.target.value } : prev), onBlur: () => setEditingField(null), style: { width: '100%', background: '#0f0f18', border: '1px solid #6366f1', borderRadius: 5, color: '#fff', fontSize: 14, padding: 8, outline: 'none', fontWeight: 600, boxSizing: 'border-box', marginBottom: 8 } })) : (_jsx("p", { onClick: () => setEditingField('title'), title: language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit', style: hoverableStyle({ color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }), onMouseEnter: e => (e.currentTarget.style.background = '#ffffff0d'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: editedTicket.title })), editingField === 'userStory' ? (_jsx("textarea", { autoFocus: true, value: editedTicket.userStory, rows: 2, onChange: e => setEditedTicket(prev => prev ? { ...prev, userStory: e.target.value } : prev), onBlur: () => setEditingField(null), style: { ...editTextareaStyle, marginBottom: 12, fontStyle: 'italic' } })) : (_jsx("p", { onClick: () => setEditingField('userStory'), title: language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit', style: hoverableStyle({ color: '#888', fontSize: 13, margin: '0 0 12px', fontStyle: 'italic' }), onMouseEnter: e => (e.currentTarget.style.background = '#ffffff0d'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: editedTicket.userStory })), _jsx("p", { style: { color: '#6366f1', fontSize: 12, fontWeight: 600, margin: '0 0 6px' }, children: language === 'fr' ? "Critères d'acceptance" : 'Acceptance criteria' }), editingField === 'acceptanceCriteria' ? (_jsx("textarea", { autoFocus: true, value: editedTicket.acceptanceCriteria.join('\n'), rows: editedTicket.acceptanceCriteria.length + 1, placeholder: language === 'fr' ? 'Un critère par ligne' : 'One criterion per line', onChange: e => setEditedTicket(prev => prev ? { ...prev, acceptanceCriteria: e.target.value.split('\n') } : prev), onBlur: () => { setEditedTicket(prev => prev ? { ...prev, acceptanceCriteria: prev.acceptanceCriteria.filter(l => l.trim()) } : prev); setEditingField(null); }, style: { ...editTextareaStyle, marginBottom: 12 } })) : (_jsx("ul", { onClick: () => setEditingField('acceptanceCriteria'), title: language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit', style: { color: '#aaa', fontSize: 13, margin: '0 0 12px', padding: '4px 4px 4px 24px', borderRadius: 4, lineHeight: 1.8, cursor: 'text' }, onMouseEnter: e => (e.currentTarget.style.background = '#ffffff0d'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: editedTicket.acceptanceCriteria.map((c, i) => _jsx("li", { children: c }, i)) })), editingField === 'technicalNotes' ? (_jsx("textarea", { autoFocus: true, value: editedTicket.technicalNotes, rows: 2, onChange: e => setEditedTicket(prev => prev ? { ...prev, technicalNotes: e.target.value } : prev), onBlur: () => setEditingField(null), style: editTextareaStyle })) : (_jsxs("p", { onClick: () => setEditingField('technicalNotes'), title: language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit', style: hoverableStyle({ color: '#555', fontSize: 12, margin: 0, fontStyle: 'italic' }), onMouseEnter: e => (e.currentTarget.style.background = '#ffffff0d'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: ["\uD83D\uDCDD ", editedTicket.technicalNotes] }))] }), _jsxs("div", { style: { marginTop: 14, paddingTop: 12, borderTop: '1px solid #2a2a3a' }, children: [regenTarget === 'ticket' && renderRegenForm('ticket'), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [renderRegenBtn('ticket'), _jsx("button", { onClick: copyTicket, style: { background: copied ? '#22c55e' : '#2a2a3a', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }, children: copied ? (language === 'fr' ? '✓ Copié !' : '✓ Copied!') : (language === 'fr' ? '📋 Copier' : '📋 Copy') })] })] })] })), activeTab === 'prompt' && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }, children: [renderRegenBtn('claudeCodePrompt'), _jsx("button", { onClick: copyPrompt, style: { background: copied ? '#22c55e' : '#2a2a3a', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }, children: copied ? '✓ Copied!' : 'Copy' })] }), regenTarget === 'claudeCodePrompt' && renderRegenForm('claudeCodePrompt'), _jsx("div", { style: { opacity: regenLoading === 'claudeCodePrompt' ? 0.4 : 1, transition: 'opacity 0.2s' }, children: _jsx("pre", { style: { background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16, color: '#aaa', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0 }, children: result.claudeCodePrompt }) })] }))] }), _jsx("button", { onClick: reset, style: { background: 'none', border: '1px solid #2a2a3a', color: '#666', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start' }, children: language === 'fr' ? '← Nouvelle feature' : '← New feature' })] }))] }), step !== 'home' && _jsxs("div", { style: {
                                    width: 300, flexShrink: 0,
                                    borderLeft: '1px solid #1e1e2e',
                                    display: 'flex', flexDirection: 'column',
                                    background: '#0b0b10',
                                }, children: [_jsx("div", { style: { padding: '14px 16px', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }, children: _jsx("span", { style: { color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }, children: "Chat" }) }), _jsxs("div", { style: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }, children: [chatDisabled ? (_jsx("div", { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("p", { style: { color: '#2a2a3a', fontSize: 12, textAlign: 'center', lineHeight: 1.6, margin: 0 }, children: language === 'fr' ? 'Lance une analyse\npour commencer\nle chat' : 'Run an analysis\nto start\nchatting' }) })) : (_jsxs(_Fragment, { children: [chatMessages.length === 0 && (_jsx("p", { style: { color: '#333', fontSize: 12, textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }, children: language === 'fr' ? 'Pose des questions sur le projet, la stack ou l\'implémentation…' : 'Ask questions about the project, stack, or implementation…' })), chatMessages.map((msg, i) => (_jsx("div", { style: {
                                                            background: msg.role === 'user' ? '#6366f118' : '#13131a',
                                                            border: `1px solid ${msg.role === 'user' ? '#6366f130' : '#1e1e2e'}`,
                                                            borderRadius: 7, padding: '8px 10px',
                                                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                                            maxWidth: '90%',
                                                        }, children: _jsx("p", { style: { color: msg.role === 'user' ? '#c7d2fe' : '#888', fontSize: 12, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }, children: msg.content }) }, i))), chatLoading && (_jsxs("div", { style: { display: 'flex', gap: 5, alignItems: 'center', color: '#444', fontSize: 12 }, children: [_jsx("span", { style: { animation: 'spin 1s linear infinite', display: 'inline-block' }, children: "\u27F3" }), language === 'fr' ? "Réflexion…" : 'Thinking…'] }))] })), _jsx("div", { ref: chatEndRef })] }), _jsx("div", { style: { padding: '10px 12px', borderTop: '1px solid #1e1e2e', flexShrink: 0 }, children: _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("textarea", { value: chatInput, onChange: e => setChatInput(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && e.metaKey)
                                                        sendChat(); }, placeholder: chatDisabled
                                                        ? (language === 'fr' ? 'Disponible après analyse' : 'Available after analysis')
                                                        : (language === 'fr' ? 'Message… (⌘↵)' : 'Message… (⌘↵)'), disabled: chatDisabled, rows: 2, style: {
                                                        flex: 1, background: chatDisabled ? '#0f0f13' : '#13131a',
                                                        border: '1px solid #1e1e2e', borderRadius: 7,
                                                        color: chatDisabled ? '#333' : '#e0e0e0',
                                                        fontSize: 12, padding: '8px 10px',
                                                        resize: 'none', outline: 'none', lineHeight: 1.5,
                                                    } }), _jsx("button", { onClick: sendChat, disabled: !chatInput.trim() || chatLoading || chatDisabled, style: {
                                                        background: !chatInput.trim() || chatLoading || chatDisabled ? '#1a1a24' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                        border: 'none', color: !chatInput.trim() || chatLoading || chatDisabled ? '#333' : '#fff',
                                                        borderRadius: 7, padding: '0 12px',
                                                        cursor: !chatInput.trim() || chatLoading || chatDisabled ? 'not-allowed' : 'pointer',
                                                        fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }, children: "\u2191" })] }) })] })] })] }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` })] }));
}
