import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import fg from 'fast-glob'

export interface ComponentInfo {
  name: string
  path: string
  code: string
  exports: string[]
}

export interface BridgerMap {
  components: Record<string, ComponentInfo>
  stack: Record<string, string[]>
  generatedAt: string
}

function extractComponents(code: string, filePath: string): string[] {
  const names: string[] = []
  const constMatches = code.matchAll(/export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/g)
  for (const m of constMatches) names.push(m[1])
  const fnMatches = code.matchAll(/export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9]*)/g)
  for (const m of fnMatches) names.push(m[1])
  const namedFnMatches = code.matchAll(/^(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/gm)
  for (const m of namedFnMatches) names.push(m[1])
  const defaultFnRefMatches = code.matchAll(/export\s+default\s+([A-Z][a-zA-Z0-9]*)\s*;?/g)
  for (const m of defaultFnRefMatches) names.push(m[1])
  const defaultClassMatch = code.match(/export\s+default\s+(?:function|class)\s+([A-Z][a-zA-Z0-9]*)/)
  if (defaultClassMatch) names.push(defaultClassMatch[1])
  return [...new Set(names)]
}

function truncateCode(code: string, maxLines = 100): string {
  const lines = code.split('\n')
  if (lines.length <= maxLines) return code
  return lines.slice(0, maxLines).join('\n') + `\n// ... (${lines.length - maxLines} more lines)`
}

function detectStack(cwd: string): Record<string, string[]> {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return {}
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const has = (name: string) => name in deps
  return {
    framework: [
      has('next') ? 'Next.js' : has('react') ? 'React' : '',
      has('vue') ? 'Vue' : '',
      has('svelte') ? 'Svelte' : '',
    ].filter(Boolean),
    styling: [
      has('tailwindcss') ? 'Tailwind CSS' : '',
      has('styled-components') ? 'Styled Components' : '',
      has('@emotion/react') ? 'Emotion' : '',
    ].filter(Boolean),
    state: [
      has('zustand') ? 'Zustand' : '',
      has('@reduxjs/toolkit') ? 'Redux Toolkit' : '',
      has('jotai') ? 'Jotai' : '',
      has('@tanstack/react-query') ? 'TanStack Query' : '',
    ].filter(Boolean),
    testing: [
      has('vitest') ? 'Vitest' : '',
      has('jest') ? 'Jest' : '',
      has('@testing-library/react') ? 'React Testing Library' : '',
    ].filter(Boolean),
  }
}

export function bridger(): any {
  let cwd: string
  let bridgerMap: BridgerMap

  return {
    name: 'vite-plugin-bridger',
    enforce: 'pre',

    configResolved(config: any) {
      cwd = config.root
    },

    async buildStart() {
      if (process.env.NODE_ENV === 'production') return
      console.log('\n🌉 Bridger: scanning components...')
      const files = await fg(['src/**/*.{tsx,jsx}'], {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '**/*.stories.*'],
      })
      const components: Record<string, ComponentInfo> = {}
      for (const absPath of files) {
        try {
          const code = readFileSync(absPath, 'utf-8')
          const relPath = relative(cwd, absPath)
          const names = extractComponents(code, absPath)
          for (const name of names) {
            components[name] = { name, path: relPath, code: truncateCode(code), exports: names }
          }
        } catch { }
      }
      bridgerMap = { components, stack: detectStack(cwd), generatedAt: new Date().toISOString() }
      console.log(`🌉 Bridger: ${Object.keys(components).length} components indexed ✓\n`)
    },

    resolveId(id: string) {
      if (id === 'virtual:bridger-map') return '\0virtual:bridger-map'
    },

    load(id: string) {
      if (id === '\0virtual:bridger-map') {
        return `export const bridgerMap = ${JSON.stringify(bridgerMap ?? { components: {}, stack: {}, generatedAt: '' })}`
      }
    },
  }
}