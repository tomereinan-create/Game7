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

/**
 * THE MODELS. SOUL is a photograph-of-people model: every poster it made was a photo-collage
 * with a misspelt wordmark and a fake credit line, however the prompt was worded, and its style
 * list is film looks only. The same key reaches other models on the same API (checked against
 * docs.higgsfield.ai, 2026-10-17): Recraft is built for illustration and poster design and
 * takes a palette; Ideogram is the one that renders text and numbers cleanly. Neither takes a
 * batch, so `--n 4` on them is four requests in flight at once.
 *
 *   --model soul      higgsfield-ai/soul/v2/standard   (batch_size 1|4, style_id)
 *   --model recraft   recraft/v4.1/pro/text-to-image   (2k, colors[], background_color)
 *   --model ideogram  ideogram/v4.0                    (rendering_speed QUALITY)
 */
const MODELS = {
  soul: {
    path: 'higgsfield-ai/soul/v2/standard',
    batch: true,
    body: (m) => {
      const b = { prompt: `${m.prompt} ${m.look ? m.look + " " : ""}${STYLE}`, aspect_ratio: sheet.aspect_ratio || '3:4', resolution: sheet.resolution || '1080p', batch_size: N, enhance_prompt: false }
      const styleId = styleIx >= 0 ? args[styleIx + 1] : sheet.style_id
      if (styleId) b.style_id = styleId
      return b
    },
  },
  recraft: {
    path: 'recraft/v4.1/pro/text-to-image',
    batch: false,
    body: (m) => {
      const b = { prompt: `${m.prompt} ${m.look ? m.look + " " : ""}${STYLE}`, aspect_ratio: sheet.aspect_ratio || '3:4', resolution: '2k', output_format: 'png' }
      if (m.colors) b.colors = m.colors.map((rgb) => ({ rgb }))
      if (m.background) b.background_color = { rgb: m.background }
      return b
    },
  },
  ideogram: {
    path: 'ideogram/v4.0',
    batch: false,
    body: (m) => ({ prompt: `${m.prompt} ${m.look ? m.look + " " : ""}${STYLE}`, aspect_ratio: sheet.aspect_ratio || '3:4', rendering_speed: 'QUALITY' }),
  },
  /** takes up to ten public reference URLs in `refs` on the moment - the real photograph, for composition */
  grok: {
    path: 'xai/grok-imagine-image-2.0',
    batch: false,
    body: (m) => {
      const b = { prompt: `${m.prompt} ${m.look ? m.look + " " : ""}${STYLE}`, aspect_ratio: sheet.aspect_ratio || '3:4', resolution: '2k', quality: 'medium' }
      if (m.refs?.length) b.image_urls = m.refs.slice(0, 10)
      return b
    },
  },
}
const modelIx = args.indexOf('--model')
const MODEL_KEY = modelIx >= 0 ? args[modelIx + 1] : (sheet.model || 'soul')
if (!MODELS[MODEL_KEY]) { console.error(`--model takes ${Object.keys(MODELS).join(' | ')}`); process.exit(2) }
const M = MODELS[MODEL_KEY]

/**
 * FOUR DIFFERENT ONES (his ruling, 2026-10-18: "Offer 4 different ones. This one all had the
 * fireballs and the same concept."). A moment may carry `concepts`, a list of settings; the k-th
 * candidate of a run takes the k-th concept in front of the moment's base prompt, so four
 * candidates are four ideas rather than four rolls of one. A model with a batch cannot vary the
 * prompt inside it, so this only applies to the models that take one request per picture.
 */
const withConcept = (m, k) => {
  const c = m.concepts?.length ? m.concepts[k % m.concepts.length] : null
  return c ? { ...m, prompt: `${c} ${m.prompt}` } : m
}

async function submit(m, k = 0) {
  const body = M.body(withConcept(m, k))
  const r = await fetch(`${API}/${process.env.HF_MODEL || M.path}`, {
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
  console.log(`submit ${m.slug}${N > 1 ? ` x${N}` : ''} (${MODEL_KEY})`)
  // a model with a batch takes one request for N pictures; the others take N requests at once
  const runs = M.batch ? 1 : N
  // a failed submit is one candidate lost, not the whole moment
  const dones = await Promise.all(
    Array.from({ length: runs }, async (_, k) => {
      try { return await poll((await submit(m, k)).status_url, m.slug) } catch (e) { return { status: 'failed', error: e.message } }
    }),
  )
  const good = dones.filter((d) => d.status === 'completed')
  for (const d of dones) if (d.status !== 'completed') console.log(`FAIL   ${m.slug}: ${d.status} ${d.error || ''}`)
  if (!good.length) {
    if (N === 1) manifest[m.slug] = { ...m, status: dones[0].status, error: dones[0].error || null }
    return
  }
  const done = good[0]
  const urls = good.flatMap((d) => (d.images ?? []).map((i) => i.url)).filter(Boolean)
  if (N > 1) {
    const dir = path.join(CAND, m.slug)
    await mkdir(dir, { recursive: true })
    // named by model, and by the run's index so the k-th file is the k-th concept even when one
    // run failed:  --pick <slug> recraft-2
    let saved = 0
    for (const [k, d] of dones.entries()) {
      const url = d.images?.[0]?.url
      if (!url) continue
      const { ext, bytes } = await download(url)
      await writeFile(path.join(dir, `${MODEL_KEY}-${k + 1}.${ext}`), bytes)
      saved++
    }
    console.log(`cands  ${m.slug}: ${saved} in scripts/moments/candidates/${m.slug}/ (${MODEL_KEY}-1..${runs})`)
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
