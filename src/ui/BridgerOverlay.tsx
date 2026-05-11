import { useState, useEffect, useCallback } from 'react'
import { scanCurrentPage } from '../scanner/fiber.js'
import { analyzeFeature, type AnalysisResult } from '../ai/analyze.js'
import type { BridgerMap } from '../vite-plugin/index.js'

interface BridgerOverlayProps {
  apiKey: string
  language?: 'fr' | 'en'
}

type Step = 'idle' | 'open' | 'loading' | 'result' | 'error'

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

export function BridgerOverlay({ apiKey, language = 'fr' }: BridgerOverlayProps) {
  const [step, setStep] = useState<Step>('idle')
  const [feature, setFeature] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [bridgerMap, setBridgerMap] = useState<BridgerMap | null>(null)
  const [activeTab, setActiveTab] = useState<'ticket' | 'prompt'>('ticket')

  // Charge la map générée par le plugin Vite
  useEffect(() => {
    import('virtual:bridger-map')
      .then((mod) => setBridgerMap(mod.bridgerMap))
      .catch(() => console.warn('[Bridger] virtual:bridger-map not found — did you add the Vite plugin?'))
  }, [])

  // Raccourci clavier: Shift+B
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'B') {
        setStep(s => s === 'idle' ? 'open' : 'idle')
      }
      if (e.key === 'Escape') setStep('idle')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const analyze = useCallback(async () => {
    if (!feature.trim() || !bridgerMap) return
    setStep('loading')
    setError('')
    try {
      const pageComponents = scanCurrentPage()
      const analysis = await analyzeFeature(feature, pageComponents, bridgerMap, apiKey, language)
      setResult(analysis)
      setStep('result')
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
      setStep('error')
    }
  }, [feature, bridgerMap, apiKey, language])

  const copyPrompt = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(result.claudeCodePrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const reset = () => {
    setStep('open')
    setFeature('')
    setResult(null)
    setError('')
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('open')}
        title="Bridger — Describe a feature (Shift+B)"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: 'white', transition: 'transform 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        🌉
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#0f0f13', border: '1px solid #2a2a3a',
        borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #1e1e2e',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌉</span>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Bridger</span>
            <span style={{
              background: '#6366f1', color: '#fff', fontSize: 10,
              padding: '2px 8px', borderRadius: 20, fontWeight: 600,
            }}>by Ayve</span>
          </div>
          <button onClick={() => setStep('idle')} style={{
            background: 'none', border: 'none', color: '#666',
            cursor: 'pointer', fontSize: 20, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {/* Form */}
          {(step === 'open' || step === 'loading') && (
            <div>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>
                {language === 'fr'
                  ? 'Décris la feature que tu veux ajouter sur cette page. L\'IA analysera les composants présents et te donnera une conception technique.'
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
                  width: '100%', minHeight: 120, padding: 14,
                  background: '#1a1a24', border: '1px solid #2a2a3a',
                  borderRadius: 10, color: '#e0e0e0', fontSize: 14,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  lineHeight: 1.6,
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.metaKey) analyze()
                }}
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
                    color: '#fff', border: 'none', borderRadius: 8,
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
              <div style={{
                background: '#2a1a1a', border: '1px solid #5a2a2a',
                borderRadius: 10, padding: 16, marginBottom: 16,
              }}>
                <p style={{ color: '#f87171', margin: 0, fontSize: 14 }}>❌ {error}</p>
              </div>
              <button onClick={reset} style={{
                background: '#1e1e2e', border: '1px solid #2a2a3a',
                color: '#aaa', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
              }}>
                {language === 'fr' ? '← Réessayer' : '← Retry'}
              </button>
            </div>
          )}

          {/* Result */}
          {step === 'result' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Feasibility */}
              <div style={{
                background: '#1a1a24', border: `1px solid ${FEASIBILITY_COLOR[result.feasibility.status]}40`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    color: FEASIBILITY_COLOR[result.feasibility.status],
                    fontWeight: 700, fontSize: 14,
                  }}>
                    {FEASIBILITY_LABEL[language][result.feasibility.status]}
                  </span>
                  <span style={{
                    background: `${COMPLEXITY_COLOR[result.ticket.complexity]}20`,
                    color: COMPLEXITY_COLOR[result.ticket.complexity],
                    fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                  }}>
                    {result.ticket.complexity.toUpperCase()}
                  </span>
                </div>
                <p style={{ color: '#aaa', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  {result.feasibility.reason}
                </p>
              </div>

              {/* Conception */}
              <div style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }}>
                <h4 style={{ color: '#fff', margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
                  🗺️ {language === 'fr' ? 'Conception' : 'Conception'}
                </h4>
                <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
                  {result.conception.summary}
                </p>
                <ol style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }}>
                  {result.conception.steps.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
                {result.conception.impactedFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.conception.impactedFiles.map(f => (
                      <span key={f} style={{
                        background: '#0f0f18', border: '1px solid #2a2a3a',
                        color: '#6366f1', fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        fontFamily: 'monospace',
                      }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabs: Ticket / Prompt */}
              <div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {(['ticket', 'prompt'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                      background: activeTab === tab ? '#6366f1' : '#1a1a24',
                      border: `1px solid ${activeTab === tab ? '#6366f1' : '#2a2a3a'}`,
                      color: activeTab === tab ? '#fff' : '#888',
                      borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>
                      {tab === 'ticket' ? '🎫 Ticket' : '🤖 Prompt Claude Code'}
                    </button>
                  ))}
                </div>

                {activeTab === 'ticket' && (
                  <div style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16 }}>
                    <p style={{ color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }}>
                      {result.ticket.title}
                    </p>
                    <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px', fontStyle: 'italic' }}>
                      {result.ticket.userStory}
                    </p>
                    <p style={{ color: '#6366f1', fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>
                      {language === 'fr' ? 'Critères d\'acceptance' : 'Acceptance criteria'}
                    </p>
                    <ul style={{ color: '#aaa', fontSize: 13, margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }}>
                      {result.ticket.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                    <p style={{ color: '#555', fontSize: 12, margin: 0, fontStyle: 'italic' }}>
                      📝 {result.ticket.technicalNotes}
                    </p>
                  </div>
                )}

                {activeTab === 'prompt' && (
                  <div style={{ position: 'relative' }}>
                    <pre style={{
                      background: '#1a1a24', border: '1px solid #2a2a3a',
                      borderRadius: 10, padding: 16, color: '#aaa', fontSize: 12,
                      lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0,
                    }}>
                      {result.claudeCodePrompt}
                    </pre>
                    <button onClick={copyPrompt} style={{
                      position: 'absolute', top: 10, right: 10,
                      background: copied ? '#22c55e' : '#2a2a3a',
                      border: 'none', color: '#fff', borderRadius: 6,
                      padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              {/* Reset */}
              <button onClick={reset} style={{
                background: 'none', border: '1px solid #2a2a3a',
                color: '#666', borderRadius: 8, padding: '8px 16px',
                cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start',
              }}>
                {language === 'fr' ? '← Nouvelle feature' : '← New feature'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
