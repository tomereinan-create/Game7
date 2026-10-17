// Generate the campaign's "iconic moments" posters through the Higgsfield API.
//
//   HF_CREDENTIALS="keyid:secret" node scripts/moments/generate.mjs [--only slug,slug] [--dry]
//   (or HF_API_KEY_ID=... HF_API_KEY_SECRET=..., the names the Higgsfield docs use)
//
// Reads src/data/moments.json (the prompt sheet the map also reads), submits one SOUL V2 request
// per moment that has no file yet in public/moments/, polls each to a terminal state, downloads
// the picture as public/moments/<slug>.<ext> and writes public/moments/manifest.json, which is
// how the map knows which posters exist.
//
// The key is read from the environment only. It is never written to disk or printed.
//
// Checked against docs.higgsfield.ai on 2026-10-16:
//   POST https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard
//   Authorization: Key <id>:<secret>
//   body: prompt, aspect_ratio ("3:4" ...), resolution ("720p" | "1080p"), batch_size (1 | 4),
//         enhance_prompt (false), seed (1..1000000)
//   reply: { status, request_id, status_url, cancel_url }; poll status_url until status is one of
//          completed | failed | nsfw | canceled; a completed reply carries images[0].url, which is
//          kept for at least seven days.

import { readFile, writeFile, access, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SHEET = path.join(ROOT, 'src/data/moments.json')
const OUT = path.join(ROOT, 'public/moments')
const API = 'https://api.higgsfield.ai'
const MODEL = process.env.HF_MODEL || 'higgsfield-ai/soul/v2/standard'
const CONCURRENCY = 3

const creds =
  process.env.HF_CREDENTIALS ||
  (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET ? `${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}` : '')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
// a dry run only prints the sheet and a pick only copies a file, so neither needs the key
if (!dry && !args.includes('--pick') && !creds.includes(':')) {
  console.error('No credentials: set HF_CREDENTIALS="keyid:secret" (or HF_API_KEY_ID and HF_API_KEY_SECRET).')
  process.exit(2)
}
const AUTH = { Authorization: `Key ${creds}` }

const onlyIx = args.indexOf('--only')
const only = onlyIx >= 0 ? new Set(args[onlyIx + 1].split(',')) : null
/**
 * CANDIDATES (his question, 2026-10-16: one roll per moment was giving absurd pictures - two
 * men merged into one, borders, gibberish). `--n 4` asks the API for four pictures of each
 * moment (its batch_size takes 1 or 4) and saves them ALL to scripts/moments/candidates/<slug>/
 * instead of public/moments, leaving the manifest alone, so the slot keeps whatever it has
 * until one of the four is picked:  node scripts/moments/generate.mjs --pick the-stepover 3
 */
const nIx = args.indexOf('--n')
const N = nIx >= 0 ? Number(args[nIx + 1]) : 1
if (![1, 4].includes(N)) { console.error('--n takes 1 or 4'); process.exit(2) }
const CAND = path.join(ROOT, 'scripts/moments/candidates')
const pickIx = args.indexOf('--pick')
/**
 * STYLES. SOUL V2 takes a `style_id`; the default is a general photographic look, which is why
 * every poster came back as a photo-collage with a fake credit line however hard the prompt
 * asked for a screen print. `--styles` lists the model's own styles (name and id) so one that
 * is an illustration can be chosen; the sheet's `style_id` (or `--style <id>`) then rides on
 * every request.
 */
const styleIx = args.indexOf('--style')
if (args.includes('--styles')) {
  const r = await fetch(`${API}/v1/text2image/soul-styles/v2`, { headers: AUTH })
  if (!r.ok) { console.error(`styles: ${r.status} ${await r.text()}`); process.exit(1) }
  const j = await r.json()
  const list = Array.isArray(j) ? j : (j.styles ?? j.items ?? j.data ?? [])
  for (const s of list) console.log(`${s.id}  ${s.name ?? s.title ?? ''}  ${s.description ?? ''}`.trim())
  console.log(`${list.length} styles`)
  process.exit(0)
}

const sheet = JSON.parse(await readFile(SHEET, 'utf8'))
const STYLE = sheet.style
const exists = (p) => access(p).then(() => true, () => false)

async function submit(m) {
  const body = {
    prompt: `${m.prompt} ${STYLE}`,
    aspect_ratio: sheet.aspect_ratio || '3:4',
    resolution: sheet.resolution || '1080p',
    batch_size: N,
    enhance_prompt: false,
  }
  const styleId = styleIx >= 0 ? args[styleIx + 1] : sheet.style_id
  if (styleId) body.style_id = styleId
  const r = await fetch(`${API}/${MODEL}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`submit ${m.slug}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function poll(statusUrl, slug) {
  let wait = 2000
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    const r = await fetch(statusUrl, { headers: AUTH })
    if (!r.ok) throw new Error(`status ${slug}: ${r.status} ${await r.text()}`)
    const j = await r.json()
    if (['completed', 'failed', 'nsfw', 'canceled'].includes(j.status)) return j
    await new Promise((res) => setTimeout(res, wait))
    wait = Math.min(wait * 1.5, 10_000)
  }
  throw new Error(`timeout ${slug}`)
}

/** the picture's own extension — the API hands back a URL, and its type decides the name */
const extOf = (url, type) => {
  const t = (type || '').toLowerCase()
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  const m = /\.(png|webp|jpe?g)(?:$|\?)/i.exec(url || '')
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

async function download(url) {
  const img = await fetch(url)
  if (!img.ok) throw new Error(`download ${url}: ${img.status}`)
  return { ext: extOf(url, img.headers.get('content-type')), bytes: Buffer.from(await img.arrayBuffer()) }
}

async function one(m, manifest) {
  const have = manifest[m.slug]?.file && (await exists(path.join(ROOT, 'public', manifest[m.slug].file)))
  // a candidates run is asked for on purpose, so a slot that already has a picture still gets its four
  if (have && N === 1) { console.log(`skip   ${m.slug} (have it)`); return }
  if (dry) { console.log(`would  ${m.slug} x${N}: ${m.prompt}`); return }
  console.log(`submit ${m.slug}${N > 1 ? ` x${N}` : ''}`)
  const sub = await submit(m)
  const done = await poll(sub.status_url, m.slug)
  if (done.status !== 'completed') {
    console.log(`FAIL   ${m.slug}: ${done.status} ${done.error || ''}`)
    if (N === 1) manifest[m.slug] = { ...m, status: done.status, error: done.error || null }
    return
  }
  const urls = (done.images ?? []).map((i) => i.url).filter(Boolean)
  if (N > 1) {
    const dir = path.join(CAND, m.slug)
    await mkdir(dir, { recursive: true })
    for (const [k, url] of urls.entries()) {
      const { ext, bytes } = await download(url)
      await writeFile(path.join(dir, `${k + 1}.${ext}`), bytes)
    }
    console.log(`cands  ${m.slug}: ${urls.length} in scripts/moments/candidates/${m.slug}/`)
    return
  }
  const { ext, bytes } = await download(urls[0])
  await writeFile(path.join(OUT, `${m.slug}.${ext}`), bytes)
  manifest[m.slug] = { ...m, status: 'completed', file: `moments/${m.slug}.${ext}`, request_id: done.request_id }
  console.log(`saved  ${m.slug}.${ext}`)
}

/** --pick <slug> <k>: the k-th candidate becomes the slot's picture; shrink.py then makes the JPEG */
async function pick(slug, k) {
  const m = sheet.moments.find((x) => x.slug === slug)
  if (!m) throw new Error(`no moment ${slug}`)
  const dir = path.join(CAND, slug)
  const { readdir, copyFile } = await import('node:fs/promises')
  const file = (await readdir(dir)).find((f) => f.startsWith(`${k}.`))
  if (!file) throw new Error(`no candidate ${k} in ${dir}`)
  const ext = file.split('.').pop()
  await copyFile(path.join(dir, file), path.join(OUT, `${slug}.${ext}`))
  const manifestPath = path.join(OUT, 'manifest.json')
  const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
  manifest[slug] = { ...m, status: 'completed', file: `moments/${slug}.${ext}`, picked: Number(k) }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`picked ${slug}: candidate ${k}`)
}

await mkdir(OUT, { recursive: true })
if (pickIx >= 0) {
  await pick(args[pickIx + 1], args[pickIx + 2])
  const { spawnSync } = await import('node:child_process')
  spawnSync('python', [path.join(ROOT, 'scripts/moments/shrink.py')], { stdio: 'inherit' })
  process.exit(0)
}
const manifestPath = path.join(OUT, 'manifest.json')
const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
const queue = sheet.moments.filter((m) => !only || only.has(m.slug))
let i = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < queue.length) {
    const m = queue[i++]
    try { await one(m, manifest) } catch (e) { console.log(`ERROR  ${m.slug}: ${e.message}`) }
  }
}))
if (!dry) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(dry ? 'dry run done' : `manifest: ${path.relative(ROOT, manifestPath)}`)

// The API hands back ~4MB PNGs; the map draws a poster at most ~340px wide. shrink.py turns each
// new PNG into a 1024px JPEG, keeps the original out of git, and re-points the manifest.
if (!dry) {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync('python', [path.join(ROOT, 'scripts/moments/shrink.py')], { stdio: 'inherit' })
  if (r.status !== 0) console.log('shrink.py did not run (python + Pillow needed); the PNGs stay as they are')
}
