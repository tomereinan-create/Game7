/**
 * COPY, WITH THE OLD WAY BEHIND IT. The clipboard API is refused outside a tap in WebKit and by some
 * in-app browsers outright — exactly where the escape link and the save code matter most — so a
 * refusal falls back to a selected textarea and `execCommand('copy')`. False means neither worked,
 * and the caller must say so (the live check, 2026-10-22: the buttons stayed silent and the player
 * believed the code was copied).
 */
export async function copyText(t: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t)
      return true
    }
  } catch {
    /* refused: try the old way */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, t.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
