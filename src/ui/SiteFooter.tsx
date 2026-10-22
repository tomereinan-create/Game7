import { SITE } from '../site'

/**
 * THE LINE EVERY PUBLIC PAGE ENDS ON (P2, the launch gate): who this is not affiliated with, where
 * the numbers come from, and the privacy page. The words are SITE.disclaimer, the same sentence the
 * privacy page and the mover print. `children` is for the front door's own links (the save code).
 */
export function SiteFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="site-foot">
      <p>{SITE.disclaimer}</p>
      <nav>
        {children}
        <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy</a>
      </nav>
    </footer>
  )
}
