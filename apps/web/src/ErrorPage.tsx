// A failure while drawing a page shows a calm page with a reload button instead of an empty page (CP-07).
import { Component, type ReactNode } from "react";
import { sv } from "./sv.ts";

export class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error("The app failed:", e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="wrap crash" role="alert">
      <div className="top"><div className="logo">{sv.hub}</div></div>
      <h1>{sv.crash.title}</h1>
      <p>{sv.crash.text}</p>
      <button type="button" className="btn" onClick={() => location.reload()}>{sv.crash.reload}</button>
    </div>;
  }
}
