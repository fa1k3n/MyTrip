import { test } from "node:test";
import assert from "node:assert/strict";
import { dateText, parseDate, typedDate } from "../src/format.ts";

// REQ: LC-05 a date field shows its date as dd/mm/åååå, whatever the browser's language
test("LC-05 dateText", () => {
  assert.equal(dateText("2027-11-01"), "01/11/2027");
  assert.equal(dateText("2026-12-31"), "31/12/2026");
  assert.equal(dateText(""), "");
  assert.equal(dateText("hej"), "");
});

// REQ: LC-05 a date field takes dd/mm/åååå, also with dots, dashes, one digit or only the eight digits, and an ISO date
test("LC-05 parseDate", () => {
  for (const s of ["01/11/2027", "1/11/2027", "1.11.2027", "01-11-2027", "01112027", " 1/11/2027 ", "2027-11-01"]) assert.equal(parseDate(s), "2027-11-01", s);
  for (const s of ["", "11/2027", "32/01/2027", "29/02/2027", "01/13/2027", "1/11/27", "abc"]) assert.equal(parseDate(s), undefined, s);
  assert.equal(parseDate("29/02/2028"), "2028-02-29");
});

// REQ: LC-05 typing digits puts the slashes in, so a phone's number keyboard is enough
test("LC-05 typedDate", () => {
  assert.equal(typedDate("0"), "0");
  assert.equal(typedDate("011"), "01/1");
  assert.equal(typedDate("01112027"), "01/11/2027");
  assert.equal(typedDate("01/11/20279"), "01/11/2027");
  assert.equal(typedDate("01/"), "01/", "a slash typed by hand stays");
  assert.equal(typedDate("1.11.2027"), "1.11.2027", "other separators are left as typed");
});
