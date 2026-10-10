import Link from "next/link";

export function Nav({ cta = true }: { cta?: boolean }) {
  return (
    <header className="nav">
      <div className="container nav-in">
        <Link href="/" className="logo" aria-label="GD Arena home">
          <span className="logo-mark" aria-hidden />
          GD Arena
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link href="/report/demo" className="btn btn-ghost btn-sm">
            Sample report
          </Link>
          {cta ? (
            <Link href="/setup" className="btn btn-primary btn-sm" id="nav-enter">
              Enter the Arena
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
