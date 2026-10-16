export interface Me {
  id: string
  name: string
  code: string
}

export const sha256 = async (s: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('')
}

/** The token is the account. Each use also stamps `seen_at`, which is what "online" reads. */
export async function userByToken(env: Env, token: string): Promise<Me | null> {
  if (!token || token.length > 100) return null
  return env.DB.prepare('UPDATE users SET seen_at = ?2 WHERE token_hash = ?1 RETURNING id, name, code')
    .bind(await sha256(token), Date.now())
    .first<Me>()
}
