// Compone las capturas before/after lado a lado (mismo viewport 390×844).
// Uso: node tests/ux-compare.mjs
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const names = ['inicio', 'entrenar', 'crossfit', 'mas', 'perfil', 'rutinas']
const OUT = 'ux-shots/compare'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 820, height: 900 } })
for (const name of names) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#111;font-family:system-ui;color:#eee}
    h1{font-size:16px;text-align:center;margin:10px 0}
    .row{display:flex;gap:8px;justify-content:center;align-items:flex-start}
    figure{margin:0}
    figcaption{font-size:13px;text-align:center;padding:4px 0}
    img{width:390px;height:auto;border:1px solid #333}
  </style></head><body>
    <h1>${name} — ANTES vs DESPUÉS (390×844)</h1>
    <div class="row">
      <figure><figcaption>ANTES</figcaption><img src="../before/${name}.png"></figure>
      <figure><figcaption>DESPUÉS</figcaption><img src="../after/${name}.png"></figure>
    </div>
  </body></html>`
  const file = resolve(OUT, `${name}.html`)
  writeFileSync(file, html)
  await page.goto(pathToFileURL(file).href)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true })
  console.log(`${OUT}/${name}.png`)
}
await browser.close()
