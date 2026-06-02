import { useState, useEffect, useCallback, useRef } from 'react'
import { scanCurrentPage } from '../scanner/fiber.js'
import { analyzeFeature, regenerateSection, chatWithContext, type AnalysisResult, type RegenerableSection } from '../ai/analyze.js'
import type { BridgerMap } from '../vite-plugin/index.js'

interface BridgerOverlayProps {
  apiKey: string
  language?: 'fr' | 'en'
}

type Step = 'idle' | 'home' | 'open' | 'loading' | 'result' | 'error'

type EditableTicketField = 'title' | 'userStory' | 'acceptanceCriteria' | 'technicalNotes'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const COMPLEXITY_COLOR = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

const FEASIBILITY_COLOR = {
  yes: '#22c55e',
  partial: '#f59e0b',
  no: '#ef4444',
}

const FEASIBILITY_LABEL = {
  fr: { yes: '✅ Faisable', partial: '⚠️ Partiellement faisable', no: '❌ Non faisable' },
  en: { yes: '✅ Feasible', partial: '⚠️ Partially feasible', no: '❌ Not feasible' },
}

const editTextareaStyle: React.CSSProperties = {
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
}

function hoverableStyle(base: React.CSSProperties): React.CSSProperties {
  return { ...base, cursor: 'text', padding: '2px 4px', borderRadius: 4 }
}

function spColor(sp: number): string {
  if (sp <= 3) return '#22c55e'
  if (sp <= 8) return '#f59e0b'
  return '#ef4444'
}

export function BridgerOverlay({ apiKey, language = 'fr' }: BridgerOverlayProps) {
  const [step, setStep] = useState<Step>('idle')
  const [feature, setFeature] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [bridgerMap, setBridgerMap] = useState<BridgerMap | null>(null)
  const [activeTab, setActiveTab] = useState<'ticket' | 'prompt'>('ticket')

  // Inline editing
  const [editedTicket, setEditedTicket] = useState<AnalysisResult['ticket'] | null>(null)
  const [editingField, setEditingField] = useState<EditableTicketField | null>(null)

  // Partial regeneration
  const [regenTarget, setRegenTarget] = useState<RegenerableSection | null>(null)
  const [regenInstruction, setRegenInstruction] = useState('')
  const [regenLoading, setRegenLoading] = useState<RegenerableSection | null>(null)

  // Components badge
  const [showComponents, setShowComponents] = useState(false)
  const componentsBadgeRef = useRef<HTMLDivElement>(null)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Original context for regen/chat
  const [originalContext, setOriginalContext] = useState<{ feature: string; pageComponents: string[] } | null>(null)

  useEffect(() => {
    import('virtual:bridger-map')
      .then((mod) => setBridgerMap(mod.bridgerMap))
      .catch(() => console.warn('[Bridger] virtual:bridger-map not found — did you add the Vite plugin?'))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'B') setStep(s => s === 'idle' ? 'home' : 'idle')
      if (e.key === 'Escape') setStep('idle')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!showComponents) return
    const handler = (e: MouseEvent) => {
      if (componentsBadgeRef.current && !componentsBadgeRef.current.contains(e.target as Node)) {
        setShowComponents(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showComponents])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const analyze = useCallback(async () => {
    if (!feature.trim() || !bridgerMap) return
    setStep('loading')
    setError('')
    try {
      const pageComponents = scanCurrentPage()
      const analysis = await analyzeFeature(feature, pageComponents, bridgerMap, apiKey, language)
      setResult(analysis)
      setEditedTicket(analysis.ticket)
      setOriginalContext({ feature, pageComponents })
      setChatMessages([])
      setStep('result')
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
      setStep('error')
    }
  }, [feature, bridgerMap, apiKey, language])

  const regenerate = useCallback(async (section: RegenerableSection, instruction: string) => {
    if (!result || !originalContext || !bridgerMap) return
    setRegenTarget(null)
    setRegenInstruction('')
    setRegenLoading(section)
    try {
      const partial = await regenerateSection(
        section, originalContext.feature, originalContext.pageComponents,
        bridgerMap, result, apiKey, language, instruction
      )
      setResult(prev => prev ? { ...prev, ...partial } : prev)
      if (partial.ticket) setEditedTicket(partial.ticket)
    } catch {
      // silently ignore regen errors
    } finally {
      setRegenLoading(null)
    }
  }, [result, originalContext, bridgerMap, apiKey, language])

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || !result || !originalContext || !bridgerMap) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const reply = await chatWithContext(
        newMessages, originalContext.feature, originalContext.pageComponents,
        bridgerMap, result, apiKey, language
      )
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatMessages, result, originalContext, bridgerMap, apiKey, language])

  const copyPrompt = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(result.claudeCodePrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const copyTicket = useCallback(() => {
    if (!editedTicket) return
    const text = [
      `## ${editedTicket.title}`,
      '',
      editedTicket.userStory,
      '',
      language === 'fr' ? "### Critères d'acceptance" : '### Acceptance criteria',
      ...editedTicket.acceptanceCriteria.map(c => `- ${c}`),
      '',
      `📝 ${editedTicket.technicalNotes}`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [editedTicket, language])

  const reset = () => {
    setStep('home')
    setFeature('')
    setResult(null)
    setError('')
    setEditedTicket(null)
    setEditingField(null)
    setRegenTarget(null)
    setRegenInstruction('')
    setRegenLoading(null)
    setOriginalContext(null)
    setChatMessages([])
    setChatInput('')
    setShowComponents(false)
    setActiveTab('ticket')
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderRegenBtn = (section: RegenerableSection) => {
    if (regenLoading === section) {
      return (
        <span style={{ color: '#6366f1', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          {language === 'fr' ? 'Régénération…' : 'Regenerating…'}
        </span>
      )
    }
    const isActive = regenTarget === section
    return (
      <button
        onClick={() => { setRegenInstruction(''); setRegenTarget(prev => prev === section ? null : section) }}
        disabled={regenLoading !== null}
        style={{
          background: isActive ? '#6366f120' : 'none',
          border: `1px solid ${isActive ? '#6366f1' : '#2a2a3a'}`,
          color: isActive ? '#6366f1' : '#555',
          borderRadius: 5, padding: '2px 8px',
          cursor: regenLoading !== null ? 'not-allowed' : 'pointer',
          fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}
      >
        ↻ {language === 'fr' ? 'Régénérer' : 'Regenerate'}
      </button>
    )
  }

  const renderRegenForm = (section: RegenerableSection) => (
    <div style={{ background: '#0f0f18', border: '1px solid #3a3a5a', borderRadius: 7, padding: '10px 12px', marginBottom: 10 }}>
      <input
        autoFocus
        type="text"
        value={regenInstruction}
        onChange={e => setRegenInstruction(e.target.value)}
        placeholder={language === 'fr' ? 'Précise ce que tu veux changer… (optionnel)' : 'Specify what you want to change… (optional)'}
        onKeyDown={e => {
          if (e.key === 'Enter') regenerate(section, regenInstruction)
          if (e.key === 'Escape') { setRegenTarget(null); setRegenInstruction('') }
        }}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          borderBottom: '1px solid #2a2a3a', color: '#e0e0e0', fontSize: 12,
          outline: 'none', paddingBottom: 8, marginBottom: 8, boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => regenerate(section, regenInstruction)}
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {language === 'fr' ? '✓ Confirmer' : '✓ Confirm'}
        </button>
        <button
          onClick={() => { setRegenTarget(null); setRegenInstruction('') }}
          style={{ background: 'none', border: '1px solid #2a2a3a', color: '#666', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
        >
          {language === 'fr' ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </div>
  )

  // ── Floating button (idle) ──────────────────────────────────────────────────

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('home')}
        title="Bridger — Describe a feature (Shift+B)"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          background: 'linear-gradient(135deg, #3730a3, #5b21b6)',
          border: 'none', borderRadius: 5,
          padding: '9px 18px', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(55,48,163,0.5)',
          color: '#e0e7ff', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(55,48,163,0.65)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(55,48,163,0.5)' }}
      >
        Bridger
      </button>
    )
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  const chatDisabled = !result || !originalContext

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#0f0f13', border: '1px solid #2a2a3a',
        borderRadius: 12, width: '90vw', height: '90vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #1e1e2e', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Bridger</span>
          <button onClick={() => setStep('idle')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Components badge ── */}
        {step === 'result' && originalContext && originalContext.pageComponents.length > 0 && (
          <div ref={componentsBadgeRef} style={{ position: 'relative', padding: '5px 24px', borderBottom: '1px solid #141420', flexShrink: 0 }}>
            <button
              onClick={() => setShowComponents(prev => !prev)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#2e2e45', fontSize: 11,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#4a4a6a')}
              onMouseLeave={e => (e.currentTarget.style.color = '#2e2e45')}
            >
              🔍 {originalContext.pageComponents.length}{' '}
              {language === 'fr'
                ? `composant${originalContext.pageComponents.length > 1 ? 's' : ''} analysé${originalContext.pageComponents.length > 1 ? 's' : ''} sur cette page`
                : `component${originalContext.pageComponents.length > 1 ? 's' : ''} analyzed on this page`}
              <span style={{ fontSize: 8, opacity: 0.5 }}>{showComponents ? '▲' : '▼'}</span>
            </button>
            {showComponents && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 2px)', left: 24, zIndex: 100,
                background: '#0f0f18', border: '1px solid #2a2a3a',
                borderRadius: 8, padding: 10,
                maxHeight: 220, overflowY: 'auto',
                display: 'flex', flexWrap: 'wrap', gap: 5,
                minWidth: 220, maxWidth: 420,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {originalContext.pageComponents.map(name => (
                  <span key={name} style={{
                    background: '#1a1a24', border: '1px solid #2a2a3a',
                    color: '#555', fontSize: 11, padding: '2px 8px',
                    borderRadius: 4, fontFamily: 'monospace',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Body: left content + right chat ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left column — scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, minWidth: 0 }}>

            {/* Home */}
            {step === 'home' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '72%', gap: 28 }}>
                <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, textAlign: 'center' }}>
                  {language === 'fr' ? 'Que voulez-vous faire ?' : 'What do you want to do?'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 440 }}>

                  {/* Rédiger un ticket */}
                  <button
                    onClick={() => setStep('open')}
                    style={{
                      background: '#1a1a24', border: '1px solid #2a2a3a',
                      borderRadius: 10, padding: '20px 22px',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'flex-start', gap: 16,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#1e1e2e' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3a'; e.currentTarget.style.background = '#1a1a24' }}
                  >
                    <div>
                      <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>
                        {language === 'fr' ? 'Rédiger un ticket' : 'Write a ticket'}
                      </p>
                      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
                        {language === 'fr' ? 'Une tâche précise et bien cadrée' : 'A precise and well-scoped task'}
                      </p>
                    </div>
                  </button>

                  {/* Planifier une feature — coming soon */}
                  <button
                    disabled
                    style={{
                      background: '#13131a', border: '1px solid #1a1a24',
                      borderRadius: 10, padding: '20px 22px',
                      cursor: 'not-allowed', textAlign: 'left', opacity: 0.45,
                      display: 'flex', alignItems: 'flex-start', gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                          {language === 'fr' ? 'Planifier une feature' : 'Plan a feature'}
                        </p>
                        <span style={{ background: '#2a2a3a', color: '#555', fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                          {language === 'fr' ? 'Bientôt' : 'Soon'}
                        </span>
                      </div>
                      <p style={{ color: '#444', fontSize: 13, margin: 0 }}>
                        {language === 'fr' ? 'Découper une feature en plusieurs tickets' : 'Break a feature into multiple tickets'}
                      </p>
                    </div>
                  </button>

                </div>
              </div>
            )}

            {/* Form */}
            {(step === 'open' || step === 'loading') && (
              <div>
                <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>
                  {language === 'fr'
                    ? "Décris la feature que tu veux ajouter sur cette page. L'IA analysera les composants présents et te donnera une conception technique."
                    : 'Describe the feature you want to add on this page. The AI will analyze the current components and provide a technical conception.'}
                </p>
                <textarea
                  autoFocus
                  value={feature}
                  onChange={e => setFeature(e.target.value)}
                  placeholder={language === 'fr'
                    ? 'Ex: Je veux ajouter un système de filtres par catégorie sur la liste des produits...'
                    : 'Ex: I want to add a category filter system on the product list...'}
                  disabled={step === 'loading'}
                  style={{
                    width: '100%', minHeight: 140, padding: 14,
                    background: '#1a1a24', border: '1px solid #2a2a3a',
                    borderRadius: 10, color: '#e0e0e0', fontSize: 14,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) analyze() }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ color: '#555', fontSize: 12 }}>
                    {language === 'fr' ? '⌘ + Entrée pour analyser' : '⌘ + Enter to analyze'}
                  </span>
                  <button
                    onClick={analyze}
                    disabled={!feature.trim() || step === 'loading' || !bridgerMap}
                    style={{
                      background: step === 'loading' ? '#3a3a5a' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', border: 'none', borderRadius: 7,
                      padding: '10px 20px', cursor: step === 'loading' ? 'not-allowed' : 'pointer',
                      fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {step === 'loading' ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                        {language === 'fr' ? 'Analyse en cours...' : 'Analyzing...'}
                      </>
                    ) : (
                      language === 'fr' ? '✨ Analyser' : '✨ Analyze'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {step === 'error' && (
              <div>
                <div style={{ background: '#2a1a1a', border: '1px solid #5a2a2a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <p style={{ color: '#f87171', margin: 0, fontSize: 14 }}>❌ {error}</p>
                </div>
                <button onClick={reset} style={{ background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#aaa', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                  {language === 'fr' ? '← Réessayer' : '← Retry'}
                </button>
              </div>
            )}

            {/* Result */}
            {step === 'result' && result && editedTicket && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Feasibility */}
                <div style={{ background: '#1a1a24', border: `1px solid ${FEASIBILITY_COLOR[result.feasibility.status]}40`, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: FEASIBILITY_COLOR[result.feasibility.status], fontWeight: 700, fontSize: 14 }}>
                        {FEASIBILITY_LABEL[language][result.feasibility.status]}
                      </span>
                      <span
                        title={result.ticket.storyPointsReason}
                        style={{ background: `${spColor(result.ticket.storyPoints)}20`, color: spColor(result.ticket.storyPoints), fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, cursor: 'default' }}
                      >
                        {result.ticket.storyPoints} pts
                      </span>
                    </div>
                    {renderRegenBtn('feasibility')}
                  </div>
                  {regenTarget === 'feasibility' && renderRegenForm('feasibility')}
                  <div style={{ opacity: regenLoading === 'feasibility' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                    <p style={{ color: '#aaa', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{result.feasibility.reason}</p>
                  </div>
                </div>

                {/* Conception */}
                <div style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 style={{ color: '#fff', margin: 0, fontSize: 13, fontWeight: 600 }}>
                      🗺️ {language === 'fr' ? 'Conception' : 'Conception'}
                    </h4>
                    {renderRegenBtn('conception')}
                  </div>
                  {regenTarget === 'conception' && renderRegenForm('conception')}
                  <div style={{ opacity: regenLoading === 'conception' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                    <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>{result.conception.summary}</p>
                    <ol style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }}>
                      {result.conception.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    {result.conception.impactedFiles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {result.conception.impactedFiles.map(f => (
                          <span key={f} style={{ background: '#0f0f18', border: '1px solid #2a2a3a', color: '#6366f1', fontSize: 11, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace' }}>{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs: Ticket / Prompt */}
                <div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {(['ticket', 'prompt'] as const).map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        background: activeTab === tab ? '#6366f1' : '#1a1a24',
                        border: `1px solid ${activeTab === tab ? '#6366f1' : '#2a2a3a'}`,
                        color: activeTab === tab ? '#fff' : '#888',
                        borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      }}>
                        {tab === 'ticket' ? '🎫 Ticket' : '🤖 Prompt Claude Code'}
                      </button>
                    ))}
                  </div>

                  {/* Ticket Tab */}
                  {activeTab === 'ticket' && (
                    <div style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }}>
                      <div style={{ opacity: regenLoading === 'ticket' ? 0.4 : 1, transition: 'opacity 0.2s', pointerEvents: regenLoading === 'ticket' ? 'none' : 'auto' }}>
                        {editingField === 'title' ? (
                          <input autoFocus value={editedTicket.title}
                            onChange={e => setEditedTicket(prev => prev ? { ...prev, title: e.target.value } : prev)}
                            onBlur={() => setEditingField(null)}
                            style={{ width: '100%', background: '#0f0f18', border: '1px solid #6366f1', borderRadius: 5, color: '#fff', fontSize: 14, padding: 8, outline: 'none', fontWeight: 600, boxSizing: 'border-box', marginBottom: 8 }}
                          />
                        ) : (
                          <p onClick={() => setEditingField('title')} title={language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit'}
                            style={hoverableStyle({ color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 8px' })}
                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0d')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >{editedTicket.title}</p>
                        )}
                        {editingField === 'userStory' ? (
                          <textarea autoFocus value={editedTicket.userStory} rows={2}
                            onChange={e => setEditedTicket(prev => prev ? { ...prev, userStory: e.target.value } : prev)}
                            onBlur={() => setEditingField(null)}
                            style={{ ...editTextareaStyle, marginBottom: 12, fontStyle: 'italic' }}
                          />
                        ) : (
                          <p onClick={() => setEditingField('userStory')} title={language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit'}
                            style={hoverableStyle({ color: '#888', fontSize: 13, margin: '0 0 12px', fontStyle: 'italic' })}
                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0d')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >{editedTicket.userStory}</p>
                        )}
                        <p style={{ color: '#6366f1', fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>
                          {language === 'fr' ? "Critères d'acceptance" : 'Acceptance criteria'}
                        </p>
                        {editingField === 'acceptanceCriteria' ? (
                          <textarea autoFocus
                            value={editedTicket.acceptanceCriteria.join('\n')}
                            rows={editedTicket.acceptanceCriteria.length + 1}
                            placeholder={language === 'fr' ? 'Un critère par ligne' : 'One criterion per line'}
                            onChange={e => setEditedTicket(prev => prev ? { ...prev, acceptanceCriteria: e.target.value.split('\n') } : prev)}
                            onBlur={() => { setEditedTicket(prev => prev ? { ...prev, acceptanceCriteria: prev.acceptanceCriteria.filter(l => l.trim()) } : prev); setEditingField(null) }}
                            style={{ ...editTextareaStyle, marginBottom: 12 }}
                          />
                        ) : (
                          <ul onClick={() => setEditingField('acceptanceCriteria')} title={language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit'}
                            style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', padding: '4px 4px 4px 24px', borderRadius: 4, lineHeight: 1.8, cursor: 'text' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0d')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >{editedTicket.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        )}
                        {editingField === 'technicalNotes' ? (
                          <textarea autoFocus value={editedTicket.technicalNotes} rows={2}
                            onChange={e => setEditedTicket(prev => prev ? { ...prev, technicalNotes: e.target.value } : prev)}
                            onBlur={() => setEditingField(null)}
                            style={editTextareaStyle}
                          />
                        ) : (
                          <p onClick={() => setEditingField('technicalNotes')} title={language === 'fr' ? 'Cliquer pour éditer' : 'Click to edit'}
                            style={hoverableStyle({ color: '#555', fontSize: 12, margin: 0, fontStyle: 'italic' })}
                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0d')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >📝 {editedTicket.technicalNotes}</p>
                        )}
                      </div>
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #2a2a3a' }}>
                        {regenTarget === 'ticket' && renderRegenForm('ticket')}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {renderRegenBtn('ticket')}
                          <button onClick={copyTicket} style={{ background: copied ? '#22c55e' : '#2a2a3a', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>
                            {copied ? (language === 'fr' ? '✓ Copié !' : '✓ Copied!') : (language === 'fr' ? '📋 Copier' : '📋 Copy')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Prompt Tab */}
                  {activeTab === 'prompt' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
                        {renderRegenBtn('claudeCodePrompt')}
                        <button onClick={copyPrompt} style={{ background: copied ? '#22c55e' : '#2a2a3a', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          {copied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                      {regenTarget === 'claudeCodePrompt' && renderRegenForm('claudeCodePrompt')}
                      <div style={{ opacity: regenLoading === 'claudeCodePrompt' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                        <pre style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16, color: '#aaa', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
                          {result.claudeCodePrompt}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={reset} style={{ background: 'none', border: '1px solid #2a2a3a', color: '#666', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start' }}>
                  {language === 'fr' ? '← Nouvelle feature' : '← New feature'}
                </button>
              </div>
            )}
          </div>

          {/* ── Right column: Chat (hidden on home screen) ── */}
          {step !== 'home' && <div style={{
            width: 300, flexShrink: 0,
            borderLeft: '1px solid #1e1e2e',
            display: 'flex', flexDirection: 'column',
            background: '#0b0b10',
          }}>
            {/* Chat header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }}>
              <span style={{ color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Chat
              </span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chatDisabled ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: '#2a2a3a', fontSize: 12, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                    {language === 'fr' ? 'Lance une analyse\npour commencer\nle chat' : 'Run an analysis\nto start\nchatting'}
                  </p>
                </div>
              ) : (
                <>
                  {chatMessages.length === 0 && (
                    <p style={{ color: '#333', fontSize: 12, textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
                      {language === 'fr' ? 'Pose des questions sur le projet, la stack ou l\'implémentation…' : 'Ask questions about the project, stack, or implementation…'}
                    </p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{
                      background: msg.role === 'user' ? '#6366f118' : '#13131a',
                      border: `1px solid ${msg.role === 'user' ? '#6366f130' : '#1e1e2e'}`,
                      borderRadius: 7, padding: '8px 10px',
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                    }}>
                      <p style={{ color: msg.role === 'user' ? '#c7d2fe' : '#888', fontSize: 12, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </p>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: '#444', fontSize: 12 }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                      {language === 'fr' ? "Réflexion…" : 'Thinking…'}
                    </div>
                  )}
                </>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid #1e1e2e', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) sendChat() }}
                  placeholder={chatDisabled
                    ? (language === 'fr' ? 'Disponible après analyse' : 'Available after analysis')
                    : (language === 'fr' ? 'Message… (⌘↵)' : 'Message… (⌘↵)')}
                  disabled={chatDisabled}
                  rows={2}
                  style={{
                    flex: 1, background: chatDisabled ? '#0f0f13' : '#13131a',
                    border: '1px solid #1e1e2e', borderRadius: 7,
                    color: chatDisabled ? '#333' : '#e0e0e0',
                    fontSize: 12, padding: '8px 10px',
                    resize: 'none', outline: 'none', lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading || chatDisabled}
                  style={{
                    background: !chatInput.trim() || chatLoading || chatDisabled ? '#1a1a24' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none', color: !chatInput.trim() || chatLoading || chatDisabled ? '#333' : '#fff',
                    borderRadius: 7, padding: '0 12px',
                    cursor: !chatInput.trim() || chatLoading || chatDisabled ? 'not-allowed' : 'pointer',
                    fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
