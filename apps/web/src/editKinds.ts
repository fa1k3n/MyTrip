// Edit dialog kinds and titles, kept apart from the forms so the forms can load on demand (PF-01).
import { sv } from "./sv.ts";

export type EditDlg =
  | { kind: "trip" } | { kind: "dates" } | { kind: "budgetMax" } | { kind: "day"; id?: string } | { kind: "activity"; dayId: string; id?: string }
  | { kind: "booking"; id?: string } | { kind: "budget"; id?: string }
  | { kind: "task"; id?: string } | { kind: "placeEdit"; id?: string } | { kind: "info"; id?: string }
  | { kind: "hidden"; dayId: string; id?: string }; // not a form: whom hidden activities are hidden from (AU-25)
export const EDIT_KINDS = ["trip", "dates", "budgetMax", "day", "activity", "booking", "budget", "task", "placeEdit", "info"];
export const editTitle = (d: EditDlg) =>
  d.kind === "hidden" ? sv.hiddenActivity
  : d.kind === "trip" ? sv.editTrip
  : d.kind === "dates" ? sv.editDates
  : d.kind === "budgetMax" ? sv.editBudgetMax
  : d.kind === "day" ? (d.id ? sv.editDay : sv.newDay)
  : d.kind === "activity" ? (d.id ? sv.editActivity : sv.newActivity)
  : d.kind === "booking" ? (d.id ? sv.editBooking : sv.newBooking)
  : d.kind === "task" ? (d.id ? sv.editTask : sv.newTask)
  : d.kind === "placeEdit" ? (d.id ? sv.editPlace : sv.placeNew)
  : d.kind === "info" ? (d.id ? sv.editInfo : sv.newInfo)
  : d.id ? sv.editCost : sv.newCost;
