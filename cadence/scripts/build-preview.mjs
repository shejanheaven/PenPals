// Builds Cadence as one self-contained HTML page (for sharing a live preview).
// Output: dist-preview/cadence-preview.html
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

execSync('npx vite build --mode artifact', { stdio: 'inherit' })

const dir = path.resolve('dist-preview')
const html = readFileSync(path.join(dir, 'index.html'), 'utf8')
const jsFile = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)[1]
const cssFile = html.match(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"/)[1]
const js = readFileSync(path.join(dir, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script')
const css = readFileSync(path.join(dir, cssFile), 'utf8')

const fonts =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,0..100;1,9..144,300..700,0..100&family=Inter:wght@300..700&display=swap'

const page = `<title>Cadence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
/* The host already pads the page for the phone's status bar. */
:root { --sat: 0px; }
.topbar { top: env(safe-area-inset-top, 0px); }
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`
writeFileSync(path.join(dir, 'cadence-preview.html'), page)
console.log(`wrote dist-preview/cadence-preview.html (${(page.length / 1024).toFixed(0)} KB)`)
