// Edit dialog kinds and titles, kept apart from the forms so the forms can load on demand (PF-01).
import { sv } from "./sv.ts";
import type { MailProposal } from "./api.ts";

export type EditDlg =
  | { kind: "trip" } | { kind: "dates" } | { kind: "budgetMax" } | { kind: "day"; id?: string } | { kind: "activity"; dayId: string; id?: string }
  | { kind: "booking"; id?: string; proposal?: MailProposal } | { kind: "budget"; id?: string } // proposal: a mail to review (BK-17)
  | { kind: "task"; id?: string } | { kind: "placeEdit"; id?: string } | { kind: "info"; id?: string }
  | { kind: "album" } | { kind: "memory"; dreamId: string; by: string } | { kind: "split"; id: string } | { kind: "relink"; id: string } // MI-20, MI-17, MI-25, MI-32
  | { kind: "hidden"; dayId: string; id?: string } // not a form: whom hidden activities are hidden from (AU-25)
  | { kind: "tickets"; bookingId: string } // not a form: a booking's ticket files (BK-10)
  | { kind: "wish"; id: string } // not a form: Om önskan (DB-15)
  | { kind: "planWish"; id: string }; // Lägg på dag (DB-18)
export const EDIT_KINDS = ["trip", "dates", "budgetMax", "day", "activity", "booking", "budget", "task", "placeEdit", "info", "album", "memory", "split", "relink", "planWish"];
export const editTitle = (d: EditDlg) =>
  d.kind === "hidden" ? sv.hiddenActivity
  : d.kind === "wish" ? sv.wish.about
  : d.kind === "tickets" ? sv.tickets.title
  : d.kind === "booking" && d.proposal ? sv.mail.review
  : d.kind === "trip" ? sv.editTrip
  : d.kind === "dates" ? sv.editDates
  : d.kind === "budgetMax" ? sv.editBudgetMax
  : d.kind === "album" ? sv.minnas.albumLabel
  : d.kind === "memory" ? sv.minnas.note
  : d.kind === "split" ? sv.minnas.splitTitle
  : d.kind === "relink" ? sv.minnas.relinkTitle
  : d.kind === "planWish" ? sv.wish.toDay
  : d.kind === "day" ? (d.id ? sv.editDay : sv.newDay)
  : d.kind === "activity" ? (d.id ? sv.editActivity : sv.newActivity)
  : d.kind === "booking" ? (d.id ? sv.editBooking : sv.newBooking)
  : d.kind === "task" ? (d.id ? sv.editTask : sv.newTask)
  : d.kind === "placeEdit" ? (d.id ? sv.editPlace : sv.placeNew)
  : d.kind === "info" ? (d.id ? sv.editInfo : sv.newInfo)
  : d.id ? sv.editCost : sv.newCost;
