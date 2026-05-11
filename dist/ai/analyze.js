function buildPrompt(featureDescription, pageComponents, bridgerMap, language) {
    // Récupère le code source des composants présents sur la page
    const relevantComponents = pageComponents
        .filter(name => bridgerMap.components[name])
        .map(name => {
        const c = bridgerMap.components[name];
        return `### ${name} (${c.path})\n\`\`\`tsx\n${c.code}\n\`\`\``;
    })
        .join('\n\n');
    const stackSummary = Object.entries(bridgerMap.stack)
        .filter(([, values]) => values.length > 0)
        .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
        .join('\n');
    const langInstruction = language === 'fr'
        ? 'Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks. Tous les textes en français.'
        : 'Respond ONLY with valid JSON, no markdown, no backticks. All text in English.';
    return `You are a senior software architect analyzing a React codebase.
${langInstruction}

## Project Stack
${stackSummary || 'Unknown stack'}

## Components currently on the page
${pageComponents.join(', ')}

## Source code of these components
${relevantComponents || 'No source code available'}

## Feature requested by the PO
"${featureDescription}"

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
    "complexity": "low" | "medium" | "high"
  },
  "claudeCodePrompt": "A ready-to-use prompt for Claude Code or Cursor that includes the project context, the feature to implement, and step-by-step instructions for the dev"
}`;
}
export async function analyzeFeature(featureDescription, pageComponents, bridgerMap, apiKey, language = 'fr') {
    const prompt = buildPrompt(featureDescription, pageComponents, bridgerMap, language);
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
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Anthropic API error: ${err.error?.message ?? response.statusText}`);
    }
    const data = await response.json();
    const text = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
    try {
        const clean = text.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }
    catch {
        throw new Error('Failed to parse AI response as JSON');
    }
}
