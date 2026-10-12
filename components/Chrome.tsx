import Link from "next/link";
import { CreditsBadge } from "./CreditsBadge";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="wrap site-header">
      <Link href="/" className="wordmark">
        talkaboutyourresume
      </Link>
      <div className="site-header-right">
        <CreditsBadge />
        {right}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span className="wordmark" style={{ fontSize: 15 }}>
          talkaboutyourresume
        </span>
        <nav aria-label="Footer">
          <a href="/#pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
          <a href="mailto:hello@talkaboutyourresume.com">Contact</a>
        </nav>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
