// Candidates through the Higgsfield CLI (logged-in, no key in the environment):
//
//   node scripts/moments/cands.mjs <slug> [n=3] [model=gpt_image_2_5] [quality=high]
//
// Builds the moment's prompt from src/data/moments.json (prompt + style), runs n jobs in
// parallel with `higgsfield generate create <model> --wait --json`, downloads each result to
// scripts/moments/candidates/<slug>/<model>-<k>.<ext>, and prints what landed. Pick one with
//   node scripts/moments/generate.mjs --pick <slug> <model>-<k>
//
// Why a second script: generate.mjs talks to the API with a key; this one talks to the CLI,
// whose catalogue (GPT Image 2.5, Nano Banana Pro, Ideogram 4.5, Recraft, Seedream) is the
// one that made a 5/5 poster. The daily limit during the account's grace period shows up as
// a failed job here; the others still land.

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [slug, nArg = '3', model = 'gpt_image_2_5', quality = 'high'] = process.argv.slice(2)
if (!slug) { console.error('usage: node scripts/moments/cands.mjs <slug> [n] [model] [quality]'); process.exit(2) }
const n = Number(nArg)
const sheet = JSON.parse(await readFile(path.join(ROOT, 'src/data/moments.json'), 'utf8'))
const m = sheet.moments.find((x) => x.slug === slug)
if (!m) { console.error(`no moment ${slug}`); process.exit(2) }
const prompt = `${m.prompt} ${m.look ? m.look + " " : ""}${sheet.style}`
const dir = path.join(ROOT, 'scripts/moments/candidates', slug)
await mkdir(dir, { recursive: true })
const short = model.replace(/_image|_/g, '').replace(/\d+$/, (d) => d) // gpt_image_2_5 -> gpt25

function run(args) {
  return new Promise((resolve) => {
    const p = spawn('higgsfield', args, { shell: true })
    let out = '', err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => resolve({ code, out, err }))
  })
}

const extOf = (u) => { const x = /\.(png|webp|jpe?g)(?:$|\?)/i.exec(u); return x ? x[1].toLowerCase().replace('jpeg', 'jpg') : 'png' }

console.log(`submit ${slug} x${n} (${model}, ${quality})`)
const jobs = Array.from({ length: n }, async (_, i) => {
  const r = await run(['generate', 'create', model, '--prompt', JSON.stringify(prompt), '--aspect_ratio', sheet.aspect_ratio || '3:4', '--quality', quality, '--resolution', '2k', '--wait', '--wait-timeout', '15m', '--json'])
  if (r.code !== 0) { console.log(`FAIL   ${slug} #${i + 1}: ${(r.err || r.out).trim().slice(0, 200)}`); return null }
  let job
  try { job = JSON.parse(r.out); job = Array.isArray(job) ? job[0] : job } catch { console.log(`FAIL   ${slug} #${i + 1}: unreadable reply`); return null }
  const url = job.result_url || job.results?.[0]?.url
  if (job.status !== 'completed' || !url) { console.log(`FAIL   ${slug} #${i + 1}: ${job.status}`); return null }
  const res = await fetch(url)
  if (!res.ok) { console.log(`FAIL   ${slug} #${i + 1}: download ${res.status}`); return null }
  const file = path.join(dir, `${short}-${i + 1}.${extOf(url)}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  console.log(`cand   ${path.relative(ROOT, file)}`)
  return file
})
const files = (await Promise.all(jobs)).filter(Boolean)
console.log(`${files.length} of ${n} landed in scripts/moments/candidates/${slug}/`)
