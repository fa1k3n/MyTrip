// A small celebration when an expense is saved in Uppleva: the amount rises and coins burst from the button (UP-35).
import { money } from "./budget.ts";
import { kr } from "./format.ts";

/** "+28,50 €": the amount as entered, in its own currency. */
export function burstLabel(e: { amount: number; foreign?: { amount: number; currency: string } }, tripCurrency: string) {
  if (e.foreign) return `+${money(e.foreign.amount, e.foreign.currency)}`;
  return `+${tripCurrency === "SEK" ? kr(e.amount) : money(e.amount, tripCurrency)}`;
}

/** Where each coin flies: spread evenly over an arc above the button, from 160° to 20°. */
export function coinOffsets(n: number, radius: number) {
  return Array.from({ length: n }, (_, i) => {
    const deg = n === 1 ? -90 : -160 + (i * 140) / (n - 1), r = (deg * Math.PI) / 180;
    return { dx: Math.round(Math.cos(r) * radius * 10) / 10, dy: Math.round(Math.sin(r) * radius * 10) / 10, spin: (i % 2 ? 1 : -1) * (180 + i * 40) };
  });
}

/** Nothing moves with reduced motion (AC-06), and nothing starts from nowhere. */
export const wantsBurst = (reduced: boolean, hasOrigin: boolean) => !reduced && hasOrigin;

/** The button again, if the view was drawn anew while the form was open: found by its accessible name. */
const again = (el: Element | null) => {
  if (!el || el.isConnected) return el;
  const name = el.getAttribute("aria-label");
  return name ? document.querySelector(`button[aria-label="${CSS.escape(name)}"]`) : el.classList.contains("addrow") ? document.querySelector(".addrow") : null;
};

/** Plays the burst over `start`; the elements remove themselves when done. */
export function burst(start: Element | null, label: string) {
  const el = again(start);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!wantsBurst(reduced, !!el?.isConnected)) return;
  const r = el!.getBoundingClientRect();
  const box = document.createElement("span");
  box.className = "burst";
  box.setAttribute("aria-hidden", "true");
  box.style.left = `${Math.min(Math.max(r.left + r.width / 2, 64), innerWidth - 64)}px`; // the label and coins stay on screen
  box.style.top = `${r.top + r.height / 2}px`;
  const text = document.createElement("span");
  text.className = "lbl";
  text.textContent = label;
  box.append(text);
  coinOffsets(6, 64).forEach((c, i) => {
    const coin = document.createElement("span");
    coin.className = "coin";
    coin.style.setProperty("--dx", `${c.dx}px`);
    coin.style.setProperty("--dy", `${c.dy}px`);
    coin.style.setProperty("--spin", `${c.spin}deg`);
    coin.style.animationDelay = `${i * 25}ms`;
    box.append(coin);
  });
  document.body.append(box);
  el!.classList.add("chaching");
  setTimeout(() => { box.remove(); el!.classList.remove("chaching"); }, 1400);
}
