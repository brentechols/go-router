import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/" aria-label="go-router home">
            <span className="brand__mark" aria-hidden="true">
              go/
            </span>
            <span className="brand__name">router</span>
          </Link>
          <nav className="app-nav" aria-label="Primary navigation">
            <NavLink to="/" end>
              Routes
            </NavLink>
            <a href="/api/docs" target="_blank" rel="noreferrer">
              API docs
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Link className="button button--primary button--small" to="/new">
              <span aria-hidden="true">＋</span> New route
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="main-content">
        {children}
      </main>
      <footer className="app-footer">
        <span>Self-hosted shortcuts for your team.</span>
        <span>MIT licensed.</span>
      </footer>
    </div>
  );
}
