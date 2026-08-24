// Materialize a real index.html per static content route.
//
// WHY THIS IS SEPARATE FROM THE 404 FALLBACK. `spa-404.mjs` copies index.html to 404.html, which makes
// a deep link RENDER on GitHub Pages. That is only half the problem, and the half that is visible.
// MEASURED on the deployed site before this: /introduction, /methodology and /benchmark all answered
// HTTP 404 while showing the correct page. A browser check passes that; a crawler, a link checker and
// every chat unfurl sees a broken URL.
//
// Giving Pages a real file at each path is the fix. The SPA still takes over on the client; the only
// difference is what the server answers.
//
// TWO DECLARATION STYLES, because the line uses both. Some apps write literal `<Route path="/x">` in
// main.tsx; others (StockTwin) keep ONE `ROUTES` array that the nav and the router share, so no literal
// path appears in the router at all. Reading only the first style found a single route in StockTwin and
// emitted it, which is worse than failing.
//
// THE GUARD. The first version asked "did I find at least one route?" - and one is not all, so it
// happily shipped 1 of 6. A guard against a partial set has to know what a complete set looks like, so
// this requires the five standard content routes and names whichever are missing.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, 'dist');
const indexPath = resolve(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('[prerender-routes] dist/index.html not found, run after `vite build`');
  process.exit(1);
}
const shell = readFileSync(indexPath, 'utf8');

// read every source file that could declare a route
function sources(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) sources(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

const found = new Set();
for (const file of sources(resolve(here, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<Route\s+path="(\/[a-z0-9-]+)"/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bpath:\s*'(\/[a-z0-9-]+)'/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bpath:\s*"(\/[a-z0-9-]+)"/g)) found.add(m[1]);
}

const routes = [...found].filter((p) => p !== '/');
const REQUIRED = ['/introduction', '/methodology', '/implementation', '/experiments', '/benchmark'];
const missing = REQUIRED.filter((r) => !routes.includes(r));
if (missing.length) {
  console.error(`[prerender-routes] refusing to emit a partial set: did not find ${missing.join(', ')}`);
  console.error(`[prerender-routes] parsed: ${routes.join(', ') || '(none)'}`);
  process.exit(1);
}

for (const route of routes) {
  const dir = resolve(dist, ...route.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), shell);
}
console.log(`[prerender-routes] materialized ${routes.length} content routes -> HTTP 200 deep links (${routes.join(', ')})`);
