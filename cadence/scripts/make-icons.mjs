// Renders the PNG app icons from the SVG mark. Run: npm run icons
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(path.join(execSync('npm root -g').toString().trim(), 'noop.js'))
const { chromium } = require('playwright')

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const mark = (scale, { stroke = '#fff' } = {}) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <path d="M42.6 21.4 A15 15 0 1 0 42.6 42.6" fill="none" stroke="${stroke}" stroke-width="5.2" stroke-linecap="round"/>
    <circle cx="46.5" cy="32" r="3.6" fill="${stroke}"/>
  </g>`
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fa697"/><stop offset="1" stop-color="#3a6556"/></linearGradient></defs>`

const icons = {
  'icon-192.png': [192, `${grad}<rect width="64" height="64" rx="14" fill="url(#g)"/>${mark(1.05)}`],
  'icon-512.png': [512, `${grad}<rect width="64" height="64" rx="14" fill="url(#g)"/>${mark(1.05)}`],
  'maskable-512.png': [512, `${grad}<rect width="64" height="64" fill="url(#g)"/>${mark(0.82)}`],
  'apple-touch-icon.png': [180, `${grad}<rect width="64" height="64" fill="url(#g)"/>${mark(1.0)}`],
  'badge-96.png': [96, `${mark(1.35)}`],
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage()
for (const [name, [size, body]] of Object.entries(icons)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg></body></html>`)
  writeFileSync(path.join(out, name), await page.screenshot({ omitBackground: true }))
  console.log('wrote', name)
}
await browser.close()
