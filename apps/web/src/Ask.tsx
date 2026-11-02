// A question before removing or replacing something, in the app's own dialog instead of the browser's (UI-11).
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";
import { onOutside } from "./outside.ts";

type Opts = { ok?: string; details?: string[] };

function AskDialog({ question, ok = sv.remove, details, end }: Opts & { question: string; end: (yes: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="ask" aria-label={question} onClose={() => end(false)}
      onClick={onOutside(() => end(false))}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={() => end(false)} /></span>
      <h3>{question}</h3>
      {details?.length ? <ul className="asklist">{details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
      <div className="dlgbar"><button className="btn red" type="button" autoFocus onClick={() => end(true)}>{ok}</button></div>
    </dialog>
  );
}

/** Asks `question` and resolves true when the user presses the red button; the X, Esc and the backdrop answer no. */
export function ask(question: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((done) => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    let settled = false;
    const end = (yes: boolean) => {
      if (settled) return;
      settled = true;
      host.querySelector("dialog")?.close(); // gives the focus back to the button that asked
      setTimeout(() => { root.unmount(); host.remove(); }); // not while React is handling the click
      done(yes);
    };
    root.render(<AskDialog question={question} {...opts} end={end} />);
  });
}
