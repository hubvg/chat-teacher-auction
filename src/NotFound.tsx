import { Brand } from './components/TopBar';

/** Static 404 page. Rendered once at build time; it ships no JavaScript. */
export function NotFound() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar__inner">
          <Brand />
        </div>
      </header>
      <main id="main">
        <section className="hero hero--short" aria-labelledby="page-title">
          <div className="wrap">
            <h1 id="page-title" className="hero__title hero__title--md">
              This page skipped class
            </h1>
            <p className="hero__tagline">There’s nothing at this address. The live auction is on the home page.</p>
            <div className="hero__actions">
              <a className="btn btn--ink btn--lg" href="/">
                Go to the auction
              </a>
            </div>
          </div>
          <div className="rails" aria-hidden="true" />
        </section>
      </main>
    </>
  );
}
