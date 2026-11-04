// "Nytt i Basläger": the most important news of a new version, once per device, with a link to the page of all news (US-41, US-43).
import { useEffect, useRef } from "react";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";
import { CHANGELOG_URL, NEWS_PAGE, newsVersions } from "./version.ts";
import { onOutside } from "./outside.ts";

export function WhatsNewDialog({ version, close }: { version: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    ok.current?.focus(); // on Okej, not on the close button, whose tooltip would cover the first line
    return () => { opener?.focus(); };
  }, []);
  return (
    <dialog ref={ref} aria-label={sv.whatsNew.title(version)} onClose={close} onClick={onOutside(close)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{sv.whatsNew.title(version)}</h3>
      <ul className="news">{(sv.whatsNew.news[version] ?? []).map((n) => <li key={n}>{n}</li>)}</ul>
      <p className="newslink"><a href={NEWS_PAGE} target="_blank" rel="noopener noreferrer">{sv.whatsNew.more}</a></p>
      <button ref={ok} className="btn" type="button" onClick={close}>{sv.whatsNew.ok}</button>
    </dialog>
  );
}

/** US-43: the news of every version, newest first, on its own page. */
export function WhatsNewPage() {
  return (
    <main className="newspage">
      <h1>{sv.whatsNew.pageTitle}</h1>
      {newsVersions(sv.whatsNew.news).map((v) => (
        <section key={v}>
          <h2>{sv.whatsNew.title(v)}</h2>
          <ul className="news">{sv.whatsNew.news[v]!.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      ))}
      <p className="newslink"><a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">{sv.whatsNew.changelog}</a></p>
      <p className="newslink"><a href="/">{sv.whatsNew.back}</a></p>
    </main>
  );
}
