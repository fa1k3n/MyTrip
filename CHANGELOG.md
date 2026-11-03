# Changelog

Requirement IDs refer to `requirements/*.md` in the planning repository. Interface names are in Swedish, as in the app.

## Unreleased

### Fixed
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
