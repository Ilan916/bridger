const REACT_FIBER_KEY_RE = /^__react(Fiber|Container|InternalInstance)/;
function getFiberFromNode(node) {
    if (!node)
        return null;
    const fiberKey = Object.keys(node).find(key => REACT_FIBER_KEY_RE.test(key));
    return fiberKey ? node[fiberKey] : null;
}
function findReactFiber() {
    const preferredNodes = [
        document.getElementById('root'),
        document.body,
        document.documentElement,
    ];
    for (const node of preferredNodes) {
        const fiber = getFiberFromNode(node);
        if (fiber)
            return fiber;
    }
    // Fallback for non-standard mount points or React 19 internals.
    for (const node of Array.from(document.querySelectorAll('*'))) {
        const fiber = getFiberFromNode(node);
        if (fiber)
            return fiber;
    }
    return null;
}
// Remonte le Fiber tree depuis la racine et collecte les noms de composants
function walkFiber(fiber, components, depth = 0) {
    if (!fiber || depth > 50)
        return; // sécurité anti boucle infinie
    const name = fiber.type?.displayName ?? fiber.type?.name;
    // On garde uniquement les composants (pas les éléments HTML natifs)
    if (name && typeof name === 'string' && /^[A-Z]/.test(name)) {
        components.add(name);
    }
    // Parcourt enfants et frères
    if (fiber.child)
        walkFiber(fiber.child, components, depth + 1);
    if (fiber.sibling)
        walkFiber(fiber.sibling, components, depth + 1);
}
// API publique — retourne les noms de composants sur la page courante
export function scanCurrentPage() {
    try {
        let fiber = findReactFiber();
        if (!fiber) {
            console.warn('[Bridger] React root not found — make sure Bridger is mounted inside a React app');
            return [];
        }
        // Si on récupère un nœud interne, remonte à la racine Fiber avant de parcourir l'arbre.
        while (fiber.return)
            fiber = fiber.return;
        const components = new Set();
        walkFiber(fiber, components);
        // Filtre les composants internes React et Bridger lui-même
        const filtered = [...components].filter(name => !name.startsWith('Bridger') &&
            !['Router', 'Route', 'Switch', 'Suspense', 'Fragment', 'StrictMode', 'Provider', 'Consumer'].includes(name));
        return filtered;
    }
    catch (err) {
        console.warn('[Bridger] Fiber scan failed:', err);
        return [];
    }
}
