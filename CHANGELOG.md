# Changelog

Requirement IDs refer to `requirements/*.md` in the planning repository. Interface names are in Swedish, as in the app.

## 0.4.0 – 2026-11-06

AI that is faster and cheaper, and a firmer hand on mail, links and limits.

### Added
- Wish suggestions appear one by one while the helper works, with a status line and empty cards during the wait (AI-108, AI-109).
- A booking mail that lacks something is read with AI when it arrives (AI-106, AI-107). A ferry or train mail becomes a Resa (BK-45, BK-46).
- "Logga ut på alla enheter" in the settings ends every login of the account, also the one you sit in (US-49).
- A new inbox address for a trip can be made from the mail dialog (BK-41).
- An account without AI sees a calm note on what AI would do in Ny resa and Önska (AI-100).

### Changed
- Kontrollera resan names the level of each warning in words, once per group, with no triangle on every row (DQ-15, replaced by DQ-17).
- Packing lists and the reading of mails and receipts use a smaller AI model, and the helper for packing stops asking when nothing has changed (AI-97, AI-111).
- Text that comes from outside (mails, mailed wishes) goes to the AI as data in its own delimiters (AI-101).

### Fixed
- A wish image of more than 150 kB no longer gives an error in the image search, and the number of Commons lookups per trip and day is capped (DB-07, DB-30).
- A personal or share link that was just made works at once (SP-15).
- The first change in the gear on an older trip no longer says that someone else has changed it (BK-44).
- Packing lists are compared item by item, so travellers do not lose items (AI-112).
- Uploads are refused by their stated size before they are read, and files sent back to a browser are sandboxed (BK-42, SP-16). Ticket files that nothing uses are removed once a day (BK-43).
- The superuser's own opens are not counted in "Användning (beta)" (US-50).

### Security
- A daily cap on Google Routes calls, and the paid services are listed with their alerts (SP-14, SP-03).

### Internal
- The live deploy needs a passed user test per feature and a signed approval for the exact build (DP-32 to DP-37); CI runs ESLint and bundles the Worker; the code is private in one repository (DP-23, DP-44 to DP-53).

## 0.3.2 – 2026-11-04

Dependency updates; nothing new to see in the app.

### Internal
- zod 4 for the trip schema, the API validation and the MCP server; @hono/node-server 2 for the local server; vite 6 for the web build. `npm audit` finds no known vulnerabilities (DP-20).
- CI runs `npm audit --omit=dev --audit-level=high` and fails on a high or critical advisory in a runtime dependency (DP-20).
- zod runs without eval, so the content security policy reports no blocked eval in the browser (SP-12).

## 0.3.1 – 2026-11-04

Privacy and security.

### Added
- A privacy policy in plain Swedish, linked from the login, the beta notice and the settings (SP-09).
- A second factor (code from an authenticator app, with recovery codes) for the superuser (SP-13).
- Security headers and a content security policy on every page and API answer (SP-12).
- SECURITY.md, `security.txt` and a software bill of materials (SBOM) attached to each release (DP-22).

### Fixed
- An account without AI sees one line that AI is not switched on for the account, instead of a text about a missing service and switches it cannot change (AI-99).
- The login limit holds across server instances (SP-11).

### Internal
- Dependabot for npm and actions; CI actions are pinned to commit SHAs (DP-20).

## 0.3.0 – 2026-11-04

Uppleva on the phone, "Kör nu" where the work is, and clearer warnings.

### Added
- "Nytt i Basläger" is a page with the news of every version, newest first; the dialog links to it (US-43).
- "Kör nu" sits on the Att göra and Packlista cards (AI-96).

### Changed
- Uppleva opens on the current or next activity (UP-56).
- In Uppleva the day follows the finger when you swipe and slides in (UP-55).
- Kontrollera resan tints each warning by its own level and keeps the card neutral (DQ-14).
- A hotel's address is read from the mail text (BK-40).
- The AI requests cache their fixed part and search the web at most five times a run, which makes them cheaper (AI-97).

### Internal
- CI runs type check, tests and web build on every push; the AI prompts have a lock file that shows stale recordings; the API is split into route modules (DP-17, DP-18, DP-19).

## 0.2.2 – 2026-11-03

### Fixed
- An empty day added from the trip's dates shows a calendar line icon like the other days, not the system's coloured emoji (UI-08).

## 0.2.1 – 2026-11-03

Fixes from the first beta trips, and "Kör nu" for wish suggestions in Önska.

### Changed
- "Kör nu" for wish suggestions sits in Önska, above the wishes, with the runs left in its tooltip (AI-96).

### Fixed
- Changing the first date of a trip offers "Flytta resan", which moves the days with their plan and the due dates of Att göra, or "Ändra längden"; moving is preselected when the new dates do not overlap the old ones, and the last date follows the first; bookings still to be booked move along, and a booked one left outside the new dates is named before anything is saved, so the plan is no longer lost (ED-30, ED-31, ED-32, TK-11).
- Suggestions after "Kör nu" appear at once, without switching tabs (AI-96).
- A new trip's card on Drömmar shows your roles at once, without reloading the page (US-40).
- Editing part of a filled-in date keeps the other digits; slashes are added only while typing forward (LC-05).
- Texts written by the AI name the travelers instead of internal references such as "r1" (AI-98).
- A wish gets an image only from an article with the same name, so "Riddle & Finns" no longer shows a map of Finnic languages (DB-29).

## 0.2.0 – 2026-11-03

The first beta release: accounts, AI help, bookings by mail and a check of the plan.

### Accounts and beta
- User accounts with password or Google login, own trips and role icons (US-01..US-24); invitations, forgotten password by mail and answers to beta notes (US-30..US-37).
- Beta notice to accept, a "Tyck till" button and a usage overview (US-26..US-29); each note carries the app's version (US-38).
- The creator of a trip is its first traveler, a Planerare; the trip card shows Skapare and that permission (US-39, US-40).
- "Nytt i Basläger": the news of a new version shown once per device, with a link to this changelog, and again from "Tyck till" (US-41).
- Trip settings: Resenärer with a dialog per traveler, permissions per content for Resenär and Följare, a permission matrix with one button per cell (AU-34..AU-41).

### Uppleva and Minnas
- Uppleva as a timeline of the day, with expenses in any currency at the rate of their date and past-day weather (UP-16..UP-40, WX-16).
- Verdicts on the wishes that came true, also offline, and Pengar in Minnas (MI-15..MI-41, UP-53, UP-54).
- Phone app with a tab bar, Uppleva first, swipe between days (PW-24, PW-25); offline for accounts and expenses sent later (PW-18..PW-23, UP-49).

### Budget
- One counting model: plan, utfall and prognos per category, expenses per day and wish, shared costs (BG-15..BG-22, MI-33..MI-40).
- A booking's price becomes its own budget item; a price in another currency is counted with the rate of the day it is saved (BK-24, BK-25, BG-07).

### Wishes and planning
- Wish images, Om önskan, wishes by mail, planning a wish onto a day (DB-05..DB-28).
- Review of LLM proposals, pins and Ångra (MC-15..MC-20, ED-21..ED-29).
- The way to an activity in Google Maps and public transport lines with changes, in Nåla and Uppleva (TR-21..TR-27).
- Date fields as dd/mm/åååå in every browser language (LC-05).

### AI help (optional, per trip)
- Skapa med AI: a draft of a new trip from its description, applied at once, with planning rules the description gives, keeping the creator as one of the travelers (AI-10, AI-75..AI-80, AI-93, AI-94).
- Helpers Bra att veta inför resan, Förslag på önskningar and Packlistor, behind switches and spending caps, without the same place twice under other names or two branches of one chain (AI-01..AI-04, AI-64..AI-74, AI-86..AI-92, AI-95).
- Everything the AI adds is marked; keep or remove it in its row, or Behåll allt; a wish and its place are confirmed in one step (AI-83..AI-85).
- Läs med AI for booking mails and Läs kvitto for receipts (AI-60, AI-42).

### Bookings
- One mail address per trip for bookings and wishes, sorted without AI in any language (BK-26..BK-33).
- Reading a confirmation: name, dates, reference, price, the place with its telephone and web page, and train, bus, flight and ferry trips with their departure and arrival, one booking per direction of a journey out and back (BK-16, BK-22..BK-25, BK-35..BK-39).
- The kind Resa with from, to, departure and arrival (BK-37); bookings still to book shown as a yellow warning (BK-34).

### Kontrollera resan
- A card first in Nåla that checks the plan by rules, without network or AI: nights without a stay, times that cannot be reached, departures, too little buffer, days too full and travel over the trip's planning rules (DQ-06..DQ-13, DM-15).
- Red when the plan cannot happen, yellow when it is risky or tiring, a green check when nothing is found; marks on the day cards; a warning can be dismissed with a reason (DQ-11).
- Places from the AI are marked to be checked on the map or their site (DQ-01, DQ-02); estimates are shown with "ca" (DQ-05).

### Films and look
- Om Basläger, Skapa resan med AI, Så funkar Nåla and Bjud in till resan as narrated films (UI-13..UI-31).
- Own fonts, colours from tokens, sage navigation and dialogs that close outside (UI-25..UI-29).

## 0.1.0

The first tagged version: the trip plan in Nåla, bookings with ticket files and mail import, Uppleva, budget, packing lists, links per role and the installable phone app.
