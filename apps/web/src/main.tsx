import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { ErrorPage } from "./ErrorPage.tsx";

createRoot(document.getElementById("root")!).render(<ErrorPage><App /></ErrorPage>); // CP-07
// PW-03: the service worker keeps the app's files so it starts without a network; only in a build, the dev server has none.
if (import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
