// Closing a dialog from the area outside it (PL-12, UI-29): backdrop clicks land on the dialog itself, outside its box.
import type { MouseEvent } from "react";

type Box = { left: number; right: number; top: number; bottom: number };

/** Whether a point lies outside the dialog's box; the edge belongs to the dialog. */
export const outside = (r: Box, x: number, y: number) => x < r.left || x > r.right || y < r.top || y > r.bottom;

/** The dialog's onClick: calls `close` for a click on the backdrop, not for one inside the dialog. */
export const onOutside = (close: () => void) => (e: MouseEvent<HTMLDialogElement>) => {
  if (e.target === e.currentTarget && outside(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) close();
};
