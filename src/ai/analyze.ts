import type { BridgerMap } from '../vite-plugin/index.js'

export interface AnalysisResult {
  feasibility: {
    status: 'yes' | 'partial' | 'no'
    reason: string
  }
  conception: {
    summary: string
    steps: string[]
    impactedFiles: string[]
  }
  ticket: {
    title: string
    userStory: string
    acceptanceCriteria: string[]
    technicalNotes: string
    complexity: 'low' | 'medium' | 'high'
    storyPoints: 1 | 2 | 3 | 5 | 8 | 13 | 21
    storyPointsReason: string
  }
  claudeCodePrompt: string
}

export type RegenerableSection = 'feasibility' | 'conception' | 'ticket' | 'claudeCodePrompt'

function buildContext(
  featureDescription: string,
  pageComponents: string[],
  bridgerMap: BridgerMap,
): string {
  const relevantComponents = pageComponents
    .filter(name => bridgerMap.components[name])
    .map(name => {
      const c = bridgerMap.components[name]
      return `### ${name} (${c.path})\n\`\`\`tsx\n${c.code}\n\`\`\``
    })
    .join('\n\n')

  const stackSummary = Object.entries(bridgerMap.stack)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
    .join('\n')

  return `## Project Stack
${stackSummary || 'Unknown stack'}

## Components currently on the page
${pageComponents.join(', ')}

## Source code of these components
${relevantComponents || 'No source code available'}

## Feature requested by the PO
"${featureDescription}"`
}

function buildPrompt(
  featureDescription: string,
  pageComponents: string[],
  bridgerMap: BridgerMap,
  language: 'fr' | 'en'
): string {
  const context = buildContext(featureDescription, pageComponents, bridgerMap)
  const langInstruction = language === 'fr'
    ? 'Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks. Tous les textes en français.'
    : 'Respond ONLY with valid JSON, no markdown, no backticks. All text in English.'

  return `You are a senior software architect analyzing a React codebase.
${langInstruction}

${context}

Analyze this feature request and respond with this exact JSON structure:
{
  "feasibility": {
    "status": "yes" | "partial" | "no",
    "reason": "explanation in 2-3 sentences"
  },
  "conception": {
    "summary": "brief technical approach",
    "steps": ["step 1", "step 2", "step 3"],
    "impactedFiles": ["path/to/file1.tsx", "path/to/file2.ts"]
  },
  "ticket": {
    "title": "clear ticket title",
    "userStory": "As a [user], I want [feature] so that [benefit]",
    "acceptanceCriteria": ["criteria 1", "criteria 2", "criteria 3"],
    "technicalNotes": "technical context for the dev",
    "complexity": "low" | "medium" | "high",
    "storyPoints": 1 | 2 | 3 | 5 | 8 | 13 | 21,
    "storyPointsReason": "one sentence explaining the Fibonacci score"
  },
  "claudeCodePrompt": "A ready-to-use prompt for Claude Code or Cursor that includes the project context, the feature to implement, and step-by-step instructions for the dev"
}`
}

export async function analyzeFeature(
  featureDescription: string,
  pageComponents: string[],
  bridgerMap: BridgerMap,
  apiKey: string,
  language: 'fr' | 'en' = 'fr'
): Promise<AnalysisResult> {
  const prompt = buildPrompt(featureDescription, pageComponents, bridgerMap, language)

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Anthropic API error: ${err.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  const text = data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as AnalysisResult
  } catch {
    throw new Error('Failed to parse AI response as JSON')
  }
}

export async function regenerateSection(
  section: RegenerableSection,
  featureDescription: string,
  pageComponents: string[],
  bridgerMap: BridgerMap,
  currentResult: AnalysisResult,
  apiKey: string,
  language: 'fr' | 'en' = 'fr',
  instruction?: string
): Promise<Partial<AnalysisResult>> {
  const context = buildContext(featureDescription, pageComponents, bridgerMap)
  const langInstruction = language === 'fr'
    ? 'Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks. Tous les textes en français.'
    : 'Respond ONLY with valid JSON, no markdown, no backticks. All text in English.'

  const sectionSchemas: Record<RegenerableSection, string> = {
    feasibility: `{"feasibility":{"status":"yes|partial|no","reason":"..."}}`,
    conception: `{"conception":{"summary":"...","steps":["..."],"impactedFiles":["..."]}}`,
    ticket: `{"ticket":{"title":"...","userStory":"...","acceptanceCriteria":["..."],"technicalNotes":"...","complexity":"low|medium|high","storyPoints":3,"storyPointsReason":"..."}}`,
    claudeCodePrompt: `{"claudeCodePrompt":"..."}`,
  }

  const instructionClause = instruction?.trim()
    ? (language === 'fr'
        ? `\n\nInstruction du PO: "${instruction.trim()}"`
        : `\n\nPO instruction: "${instruction.trim()}"`)
    : ''

  const prompt = `You are a senior software architect analyzing a React codebase.
${langInstruction}

${context}

Current analysis:
${JSON.stringify(currentResult, null, 2)}

Regenerate ONLY the "${section}" section with a fresh perspective or different wording.${instructionClause}
Respond with ONLY this JSON structure: ${sectionSchemas[section]}`

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Anthropic API error: ${err.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  const text = data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean) as Partial<AnalysisResult>
}

export async function chatWithContext(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  featureDescription: string,
  pageComponents: string[],
  bridgerMap: BridgerMap,
  currentResult: AnalysisResult,
  apiKey: string,
  language: 'fr' | 'en' = 'fr'
): Promise<string> {
  const stackSummary = Object.entries(bridgerMap.stack)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
    .join('\n')

  const system = language === 'fr'
    ? `Tu es un expert technique assistant un Product Owner et une équipe de développement React.

Stack: ${stackSummary || 'inconnue'}
Composants sur la page: ${pageComponents.join(', ')}
Feature analysée: "${featureDescription}"
Analyse: ${JSON.stringify(currentResult)}

Réponds de façon concise. Tu peux utiliser du markdown.`
    : `You are a technical expert assisting a PO and React dev team.

Stack: ${stackSummary || 'unknown'}
Components on page: ${pageComponents.join(', ')}
Analyzed feature: "${featureDescription}"
Analysis: ${JSON.stringify(currentResult)}

Respond concisely. You can use markdown.`

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Anthropic API error: ${err.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  return data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
}
