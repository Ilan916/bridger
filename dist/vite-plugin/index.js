import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import fg from 'fast-glob';
function extractComponents(code, filePath) {
    const names = [];
    const constMatches = code.matchAll(/export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/g);
    for (const m of constMatches)
        names.push(m[1]);
    const fnMatches = code.matchAll(/export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9]*)/g);
    for (const m of fnMatches)
        names.push(m[1]);
    const namedFnMatches = code.matchAll(/^(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/gm);
    for (const m of namedFnMatches)
        names.push(m[1]);
    const defaultFnRefMatches = code.matchAll(/export\s+default\s+([A-Z][a-zA-Z0-9]*)\s*;?/g);
    for (const m of defaultFnRefMatches)
        names.push(m[1]);
    const defaultClassMatch = code.match(/export\s+default\s+(?:function|class)\s+([A-Z][a-zA-Z0-9]*)/);
    if (defaultClassMatch)
        names.push(defaultClassMatch[1]);
    return [...new Set(names)];
}
function truncateCode(code, maxLines = 100) {
    const lines = code.split('\n');
    if (lines.length <= maxLines)
        return code;
    return lines.slice(0, maxLines).join('\n') + `\n// ... (${lines.length - maxLines} more lines)`;
}
function detectStack(cwd) {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath))
        return {};
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (name) => name in deps;
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
    };
}
export function bridger() {
    let cwd;
    let bridgerMap;
    return {
        name: 'vite-plugin-bridger',
        enforce: 'pre',
        configResolved(config) {
            cwd = config.root;
        },
        async buildStart() {
            if (process.env.NODE_ENV === 'production')
                return;
            console.log('\n🌉 Bridger: scanning components...');
            const files = await fg(['src/**/*.{tsx,jsx}'], {
                cwd,
                absolute: true,
                ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '**/*.stories.*'],
            });
            const components = {};
            for (const absPath of files) {
                try {
                    const code = readFileSync(absPath, 'utf-8');
                    const relPath = relative(cwd, absPath);
                    const names = extractComponents(code, absPath);
                    for (const name of names) {
                        components[name] = { name, path: relPath, code: truncateCode(code), exports: names };
                    }
                }
                catch { }
            }
            bridgerMap = { components, stack: detectStack(cwd), generatedAt: new Date().toISOString() };
            console.log(`🌉 Bridger: ${Object.keys(components).length} components indexed ✓\n`);
        },
        resolveId(id) {
            if (id === 'virtual:bridger-map')
                return '\0virtual:bridger-map';
        },
        load(id) {
            if (id === '\0virtual:bridger-map') {
                return `export const bridgerMap = ${JSON.stringify(bridgerMap ?? { components: {}, stack: {}, generatedAt: '' })}`;
            }
        },
    };
}
