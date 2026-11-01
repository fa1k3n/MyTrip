// All interface text in one place (LC-01).
export const sv = {
  hub: "Drömmar", family: "Familjen", newTrip: "+ Skapa ny resa", newTripTitle: "Ny resa",
  noDates: "Datum saknas", noPurpose: "Skriv syftet med resan här.",
  allTrips: "Alla resor", back: "Tillbaka", tripSettings: "Resans inställningar", // MT-13
  tabs: { dr: "Önska", nala: "Nåla", up: "Uppleva", mi: "Minnas" },
  proposal: { // MC-15..MC-18
    title: "Förslag", waiting: (n: number) => (n === 1 ? "1 förslag väntar" : `${n} förslag väntar`), made: (at: string) => `Gjort ${at}`,
    show: "Visa i planen", hide: "Sluta visa i planen", approve: "Godkänn", reject: "Avvisa", rejectAsk: "Avvisa förslaget? Det går inte att ångra.",
    stale: "Resan har ändrats sedan förslaget gjordes. Avvisa det och be om ett nytt.", problems: "Förslaget går inte att godkänna:", none: "Förslaget ändrar ingenting.",
    pin: (title: string) => `Rubbar en nål: ${title}`,
    other: "Övrigt", added: "Ny", changed: "Ändrad", removed: "Tas bort", preview: "Så här blir planen med förslaget. Inget är sparat än.",
    kinds: { activity: "Aktivitet", days: "Dag", places: "Plats", bookings: "Bokning", budget: "Budgetpost", tasks: "Att göra", info: "Praktiskt", travelers: "Resenär", dreams: "Önskan", expenses: "Utlägg", payments: "Betalning" },
  },
  pin: { on: "Nåla fast", off: "Ta bort nålen", mark: "Nålad", ask: (title: string) => `Ta bort nålen för ${title}? Då kan den flyttas, tidsändras och tas bort.`, locked: "Aktiviteten är nålad: tid och längd ändras inte, och den flyttas eller tas inte bort förrän nålen tas bort." }, // ED-24, ED-25
  undo: { button: "Ångra", failed: "Kunde inte ångra. Resan har ändrats sedan dess.", kinds: { add: "Lade till", change: "Ändrade", remove: "Tog bort" } }, // ED-22
  wish: { // DB-05..DB-14
    fromMail: (name?: string) => (name ? `Mejl från ${name}` : "Mejl"), // DB-23
    mail: { // DB-22
      open: "Mejla in en önskan", copy: "Kopiera adressen", copied: "Kopierad.",
      hint: "Mejla eller dela en sida hit, så blir den en önskan direkt. Ämnesraden blir titel, första länken blir önskans länk och en bifogad bild blir dess foto.",
    },
    url: "Länk till sidan (valfri)", badUrl: "Ange en adress som börjar med https:// eller http://.", photoBy: "Foto:", commons: "Wikimedia Commons", about: "Om önskan", more: (title: string) => `Mer om ${title}`, openPage: "Öppna sidan", credited: "Fotograf och licens finns under Om önskan",
    image: (title: string) => `Bild för ${title}`, query: "Sök bild med orden", find: "Sök", finding: "Söker…", use: "Använd",
    none: "Hittade ingen bild med fri licens. Prova andra ord eller ladda upp ett eget foto.", busy: "Wikimedia svarar inte just nu. Försök igen om en stund.",
    upload: "Ladda upp eget foto", uploading: "Laddar upp…", badPhoto: "Kunde inte läsa fotot. Prova ett annat.", failed: "Kunde inte spara bilden.",
    remove: "Ta bort bilden", removeAsk: "Ta bort bilden från önskan?", saveLink: "Spara länken",
    hint: "Bilder hämtas bara från Wikimedia Commons med fri licens, utan AI, och sparas hos oss med fotograf och licens.",
    cache: "Bildcache", cacheText: "Ta bort automatiskt hämtade bilder från resor som är avslutade. Egna foton behålls.", cacheButton: "Töm cachen för avslutade resor",
    cacheAsk: (images: number, kb: number) => `Ta bort ${images} bilder från avslutade resor? Det frigör ${kb} kB. Egna foton behålls.`,
    cacheDone: (images: number, kb: number) => `Tog bort ${images} bilder och frigjorde ${kb} kB.`, cacheEmpty: "Det finns inga hämtade bilder i avslutade resor.",
    planned: "Med i planen", votes: (n: number) => (n === 1 ? "1 hjärta" : `${n} hjärtan`), wishes: "Önskningar", noWishes: "Inga önskningar än. Lägg till dem i Önska.", toDay: "Lägg på dag", toDayOf: (title: string) => `Lägg ${title} på dag`, day: "Dag", // DB-16..DB-19
    dragHint: "Dra till en dag i Nåla",
  },
  minnas: { // MI-15..MI-25
    memories: "Upplevt", budget: "Pengar", views: "Upplevt eller pengar", listed: (what: string, n: number) => `${what} (${n})`,
    notYet: "Här hamnar önskningarna ni har fått uppleva, när deras dag har varit.", album: "Öppna det delade albumet",
    verdicts: { again: "Igen", ok: "Okej", never: "Inte igen" },
    give: (verdict: string, name: string, n: number) => `${verdict}: ${name} (${n})`,
    carousel: "karusell", prev: "Föregående önskan", next: "Nästa önskan", count: (verdict: string, n: number) => `${verdict}: ${n}`,
    write: (name: string) => `Kommentar till nästa resa om ${name}`, note: "Kommentar till nästa resa", as: "Som",
    noteHint: "Bara planerarna ser kommentarerna, utan namn.", dream: "Önskan", noDream: "Ingen önskan",
    tooLong: (n: number) => `Högst ${n} tecken.`,
    albumLabel: "Länk till delat album", noAlbum: "Ingen", editAlbum: "Ändra länken till albumet", albumHint: "En https-adress till ett album ni delar. Lämna tomt för att ta bort den.", badAlbum: "Ange en adress som börjar med https://.",
    relink: (text: string) => `Ändra vilken önskan ${text} gäller`, relinkTitle: "Önskan", relinkGone: "Utlägget eller önskan finns inte längre.", // MI-41
    remove: (text: string) => `Ta bort utlägget ${text}`, removeAsk: (text: string) => `Ta bort utlägget ”${text}”? Det går inte att ångra.`, // MI-34
    removePayment: (s: string) => `Ta bort inbetalningen ${s}`, removePaymentAsk: (s: string) => `Ta bort inbetalningen ${s}? Det går inte att ångra.`, // MI-35
    split: (text: string) => `Välj vilka som delar på ${text}`, splitTitle: "Delas av", splitNeeded: "Välj minst en person.",
  },
  up: { // the day's timeline in Uppleva (UP-16..UP-21)
    applies: "Aktivitet", wish: "Önskan", noActivity: "Ingen", // UP-43, UP-47, MI-41: one wish, so the singular
    sheetKicker: "Utlägg", what: "Beskrivning", whatExample: "Till exempel: bensin", saveExpense: "Spara utlägg", // UP-42
    now: "Nu",
    place: "Visa platsen",
    expenseTitle: (name: string) => `Nytt utlägg för ${name}`, shortText: "Kort beskrivning (valfri)",
    noRate: (c: string) => `Kunde inte hämta växelkursen för ${c}. Försök igen när du har nät.`,
    clash: (end: string, name: string, start: string) => `Slutar ${end.replace(":", ".")} och krockar med ${name} ${start.replace(":", ".")}`,
    hours: (h: number) => `${h} tim`, minutes: (m: number) => `${m} min`, about: "ca",
  },
  today: "Idag", startsToday: "börjar idag", noBookingsToday: "Inga bokningar den här dagen.",
  noActivities: "Inga aktiviteter inlagda.", noDays: "Resan har inga dagar ännu. Lägg in dem under Nåla.",
  balance: "Saldo", owedBack: "får tillbaka", owes: "ska betala", even: "kvitt", settleUp: "Förslag på betalningar", allEven: "Alla är kvitt.",
  register: "Registrera inbetalning:", expenses: "Utlägg", addExpense: "Lägg till utlägg", newExpense: "Nytt utlägg", noExpenses: "Inga utlägg ännu.",
  amount: "Belopp (kr)", paidBy: "Betalt av", addedBy: "Tillagd av", sharedBy: "Delas av", everyone: "alla", text: "Beskrivning",
  payments: "Inbetalningar", addPayment: "Registrera inbetalning", newPayment: "Ny inbetalning", noPayments: "Inga inbetalningar ännu.",
  from: "Från", to: "Till", note: "Notering",
  addPerson: "Lägg till person", newPerson: "Ny person", name: "Namn", noPeople: "Lägg till personerna som delar på kostnaderna.",
  of: "av", badAmount: "Ange ett belopp större än noll, t.ex. 640,50.",
  budgetCategories: ["Boende", "Transport", "Mat", "Upplevelse", "Shopping", "Övrigt"], // MI-30
  expandAll: "Visa alla dagar", collapseAll: "Fäll ihop alla", travelTime: "restid på dagen",
  bookings: "Bokningar", budget: "Budget", tripBudget: "Resans budget", // UP-45: the whole trip, not the day
  plan: { planned: "Plan", actual: "Utfall", forecast: "Prognos", max: "Max", left: "Kvar", over: "Över max", byActivity: "Utlägg per dag", noWish: "Utan önskan", noDate: "Utan datum", items: "Budgetposter" }, // BG-17, BG-20, BG-21
  budgetChart: "Budget per kategori", total: "totalt",
  budgetMax: "Maxbudget", editBudgetMax: "Ändra maxbudget", noBudgetMax: "Ingen maxbudget",
  budgetMaxHint: "Prognosen jämförs med maxbudgeten: planen, eller utfallet där det är större. Lämna tomt för att ta bort den.",
  unused: "Oanvänt", // BG-18
  who: { traveler: "Resenär", planner: "Planerare", follower: "Följare" }, // the role in the header (AU-16)
  roles: { owner: "Skapare", planner: "Planerare", traveler: "Resenär", by: (n: string) => `Skapad av ${n}` }, // US-23, US-24
  fullApp: "Öppna hela appen i Safari", // PW-15
  installHint: "Lägg appen på hemskärmen, så fungerar den också utan nät: tryck på ⋯ och Dela (eller på Dela-knappen), välj Lägg till på hemskärmen och slå på Öppna som webbapp.", // PW-12
  notice: { // NT-01..NT-05: the texts of notices, also used by the server
    expense: (who: string, what: string) => `${who} lade till ett utlägg: ${what}`, waits: " (väntar på godkännande)",
    approved: (who: string, text: string) => `${who} godkände utlägget ${text}`, rejected: (who: string, text: string) => `${who} avvisade utlägget ${text}`,
    added: (who: string, text: string, day: string) => `${who} lade till ${text}, ${day}`, changed: (who: string, text: string, day: string) => `${who} ändrade ${text}, ${day}`,
    removed: (who: string, text: string, day: string) => `${who} tog bort ${text}, ${day}`,
    booking: (who: string, name: string) => `${who} lade till bokningen ${name}`, task: (who: string, text: string) => `${who} lade till uppgiften ${text}`,
    info: (who: string, title: string) => `${who} lade till ${title} under Praktiskt`, dream: (who: string, title: string) => `${who} lade till önskan ${title}`,
    payment: (who: string, amount: string) => `${who} registrerade en inbetalning på ${amount}`, more: (n: number) => `och ${n} ändringar till`, admin: "Administratören",
    title: "Notiser", bell: "Notiser för resan", on: "Notiser på den här telefonen", onText: "Du får en notis när någon annan ändrar i resan.",
    offText: "Slå på för att få en notis när någon annan ändrar i resan.", denied: "Telefonen tillåter inte notiser från appen. Ändra det i telefonens inställningar.",
    install: "Lägg först appen på hemskärmen, och öppna den därifrån, så kan den visa notiser.", unsupported: "Den här webbläsaren kan inte visa notiser.",
    serverOff: "Notiser är inte påslagna på servern.", failed: "Det gick inte att slå på notiser. Försök igen.",
  },
  unhandled: { // MI-09..MI-11
    title: "Ohanterade utlägg", waiting: "Väntar på godkännande", note: "Räknas in i avräkningen först när de är godkända.",
    approve: (text: string) => `Godkänn ${text}`, reject: (text: string) => `Avvisa ${text}`, rejectAsk: (text: string) => `Avvisa och ta bort ${text}?`,
  },
  queue: { // PW-06, PW-09
    waiting: "Ej skickat", noContact: "Ingen kontakt med servern.", server: (n: number) => `Servern svarade ${n}.`, sendNow: "Skicka nu", // PW-18
    sending: "Skickar…", tried: (why: string, hhmm: string) => `${why} Försökte ${hhmm}.`, title: "Ej skickade utlägg", // PW-19, UP-46
    failed: (reason: string) => `Kunde inte skickas. ${reason}`, retry: "Försök igen", remove: "Ta bort",
    removeAsk: "Ta bort utlägget? Det har inte kommit fram.", forbidden: "Behörigheten har ändrats.", rejected: (status: number) => `Servern tog inte emot det (${status}).`,
  },
  offline: { // PW-04, PW-10
    title: "Offline", since: (time: string) => `Offline – senast uppdaterad ${time}`,
    needsNet: "Kräver nätverk. Visas när du är uppkopplad igen.", weatherFrom: (time: string) => `Väder hämtat ${time}`,
  },
  choose: { // PW-16, PW-17
    remove: (trip: string) => `Ta bort ${trip} från telefonen`,
    removeAsk: (trip: string) => `Ta bort ${trip} från telefonen? Du behöver länken igen för att öppna resan.`,
    gone: "En länk gäller inte längre och togs bort från telefonen.",
    unsent: (n: number) => (n === 1 ? "Ett utlägg är inte skickat än och försvinner." : `${n} utlägg är inte skickade än och försvinner.`),
  },
  hiddenActivity: "Dold aktivitet", hiddenText: "Dold text", hiddenTitle: "Dold rubrik", hiddenMark: (names: string) => `Dold för ${names}`, // AU-18, AU-30
  limit: { // BG-13
    near: (used: string, max: string, pct: number, left: string) => `Nära maxbudgeten: ${used} av ${max} (${pct} %). ${left} kvar.`,
    over: (over: string, used: string, max: string) => `Över maxbudgeten med ${over}: ${used} av ${max}.`,
  },
  map: "Karta:", todo: "Att göra", close: "Stäng",
  vote: "Rösta", addDream: "Lägg till önskan", newDream: "Ny önskan", title: "Titel", category: "Kategori",
  manual: "Manuellt", save: "Spara",
  apiKey: "API-nyckel",
  danger: "Farozon", deleteTrip: "Ta bort resa", confirmDelete: "Ta bort resan?",
  tripAi: "Använd AI för den här resan", tripAiTip: "Följer inställningarna under Drömmar. Stäng av så skickas inget från resan till AI-tjänsten.",
  aiOffAll: "AI är avstängt för alla resor.", aiOpenSettings: "Öppna inställningarna",
  settings: "Inställningar", ai: "AI", aiMain: "Använd AI i appen", aiPerArea: "Vad AI får göra",
  aiPrivacy: "Data skickas till AI-tjänsten först när AI är påslaget. Bokningsnummer och telefonnummer skickas aldrig.",
  aiNoService: "Ingen AI-tjänst är kopplad till den här instansen. Inställningarna börjar gälla när en nyckel finns.",
  aiAreas: {
    images: ["Generera bilder", "Omslagsbilder till resor och bilder till önskningar"],
    texts: ["Skriva texter", "Sammanfattningar av dagar, morgonbrief, resedagbok och betalningstexter"],
    suggestions: ["Ge förslag", "Resmål, fler önskningar, tempo för barnen och budgetuppskattningar"],
    changes: ["Ändra mina planer", "Fylla dagarna, planera om, packlistor och ändringar med egna ord. Du godkänner alltid först."],
    mail: ["Läsa mina mejl", "Mejlade länkar blir önskningar och bokningsbekräftelser blir bokningar"],
    receipts: ["Läsa kvitton", "Ett foto av ett kvitto blir ett utlägg i Minnas"],
    web: ["Söka på webben", "Öppettider, adresser och telefonnummer till platser"],
    location: ["Använda min plats", "Visa önskningar i närheten under resan"],
  },
  remove: "Ta bort", askOk: { replace: "Byt", reject: "Avvisa" }, // UI-11
  confirmRemove: "Ta bort?", confirmRemoveFiles: "Ta bort? Biljetterna raderas och går inte att få tillbaka.", couldNotSave: "Kunde inte spara.", // ED-26
  conflict: "Resan ändrades samtidigt av någon annan. Den är nu uppdaterad, försök igen.", edit: "Ändra",
  tripDetails: "Resan", tripDates: "Datum", editDates: "Ändra datum", firstDay: "Första dagen", lastDay: "Sista dagen",
  datesHint: "Nya datum får en tom dag. Dagar utanför datumen tas bort.", confirmRemoveDays: "Dessa dagar tas bort:",
  activityNote: "Anteckning (visas under rubriken)", editTrip: "Ändra namn och syfte", purpose: "Syfte",
  suggestPurpose: "Föreslå syfte utifrån planen", purposeHint: "Syftet hjälper till att ge bra förslag på aktiviteter. Förslaget bygger på dagarna i Nåla, ändra fritt innan du sparar.", noPurposeYet: "Lägg in dagar i Nåla först, så kan ett syfte föreslås.",
  newDay: "Ny dag", emptyDay: "Inget planerat än.", editDay: "Ändra dag",
  login: {
    title: "Logga in", password: "Lösenord", submit: "Logga in", logout: "Logga ut",
    noLink: "Logga in med ditt konto, eller öppna resan med länken du fått.",
    expired: "Länken gäller inte längre. Be om en ny länk, eller logga in med ditt konto.",
    email: "Mejladress", google: "Logga in med Google", // US-07, US-09
    googleInstalled: "Google-inloggning fungerar inte i appen på hemskärmen. Logga in med mejladress och lösenord här, eller med Google i Safari.", // US-19
    noAccount: "Det finns inget konto för den här adressen.", googleFailed: "Inloggningen med Google gick inte. Försök igen.",
    setTitle: "Välj lösenord", setFor: (name: string, email: string) => `Kontot för ${name}, ${email}.`, min: "Minst 10 tecken.", // US-05
    setSave: "Spara och logga in", setGone: "Länken gäller inte längre. Be den som skapade kontot om en ny.", setShort: "Lösenordet behöver minst 10 tecken.",
    pasteLink: "Klistra in länken du fått", openLink: "Öppna resan", badLink: "Det där är ingen länk till en resa.", // PW-02
    wrong: "Fel mejladress eller lösenord.", tooMany: "För många försök. Vänta en kvart och försök igen.", off: "Inloggningen är inte påslagen på servern.",
  },
  prevDay: "Föregående dag", nextDay: "Nästa dag",
  gap: "Lucka", clash: "Krock", moveActivity: "Flytta", moveHint: "Dra för att flytta, eller använd piltangenterna", dropHere: "Släpp en aktivitet här",
  missing: { label: "Saknar", time: "tid", duration: "uppskattad tid", category: "kategori" },
  duration: "Uppskattad tid", chooseDuration: "Välj…",
  addActivity: "Lägg till aktivitet", newActivity: "Ny aktivitet", editActivity: "Ändra aktivitet",
  addBooking: "Lägg till bokning", newBooking: "Ny bokning", editBooking: "Ändra bokning",
  addCost: "Lägg till kostnad", newCost: "Ny kostnad", editCost: "Ändra kostnad",
  date: "Datum", summaryLabel: "Sammanfattning (en mening, utan klockslag)", icons: "Egna ikoner, en eller två (visas när aktiviteterna saknar kategori)",
  start: "Start", end: "Slut", estimate: "ca", location: "Ort (för vädret)", time: "Tid", what: "Vad",
  placeLabel: "Plats", noPlace: "Ingen plats", newPlace: "Ny plats…", placeName: "Platsens namn", address: "Adress",
  firstDate: "Första datum", lastDate: "Sista datum", status: "Status", reference: "Bokningsnummer",
  statuses: { paid: "Betald", ready: "Klar", cancelled: "Avbokad" }, paidMark: "Betald", owner: "Ansvarig",
  noCategory: "Ingen kategori", notChecked: "ej kollat", noTime: "tid ej beräknad",
  badge: { paid: "betald", ready: "klar", cancelled: "avbokad" },
  tickets: { // BK-09, BK-10
    title: "Biljetter", show: "Visa biljett", add: "Lägg till biljett", remove: (n: string) => `Ta bort ${n}`, confirmRemove: "Ta bort biljetten?",
    uploading: "Laddar upp…", tooBig: "PDF:en är större än 2 MB.", badType: "Bara PDF, PNG eller JPEG går att lägga till.", badImage: "Bilden gick inte att göra mindre än 2 MB.",
    failed: "Kunde inte ladda upp filen.", loading: "Hämtar biljetten…", error: "Kunde inte visa biljetten.", page: (name: string, n: number) => `${name}, sida ${n}`,
  },
  mail: { // BK-17, BK-18
    review: "Bokning från mejl", from: (subject: string, from: string) => `Från mejl: ${subject}${from ? ` (${from})` : ""}`,
    waiting: (n: number) => (n === 1 ? "1 bokning från mejl att granska" : `${n} bokningar från mejl att granska`), open: (s: string) => `Granska ${s}`,
    reject: "Ta bort förslaget", confirmReject: "Ta bort bokningen från mejlet? Dess filer raderas.", checkFilled: "Ifyllt från mejlet. Kontrollera innan du sparar.",
    paste: "Fyll i från bekräftelse", pasteLabel: "Klistra in texten från bokningsbekräftelsen", read: "Fyll i",
    filled: "Fälten är ifyllda från texten. Kontrollera dem innan du sparar.", nothing: "Hittade inget att fylla i.", noSubject: "(utan ämne)",
  },
  bookingKinds: { // BK-07, BK-08
    label: "Typ", stay: "Boende", ticket: "Biljett", other: "Övrigt", transport: "Resa", in: "in", out: "ut",
    checkIn: "Incheckning", checkOut: "Utcheckning", start: "Starttid", activity: "Gäller aktiviteten", noActivity: "Ingen särskild",
  },
  noTasks: "Inga uppgifter ännu.", tasksShared: "Bockarna sparas i resan och syns för alla som har tillgång till den.", overdue: "försenad",
  addTask: "Lägg till uppgift", newTask: "Ny uppgift", editTask: "Ändra uppgift", due: "Klart senast",
  info: "Praktiskt", addInfo: "Lägg till praktisk info", newInfo: "Ny praktisk info", editInfo: "Ändra praktisk info", noInfo: "Ingen praktisk info ännu.",
  unsuitable: "Passar inte", unsuitableLabel: "Passar inte, därför (lämna tomt om den passar)", verify: "Uppgiften kan vara inaktuell, kontrollera den innan.", verifyLabel: "Källan kan vara inaktuell",
  packing: "Packlista", sharedList: "Alla", addItem: "Lägg till", itemLabel: "Sak att packa", removeItem: "Ta bort", years: "år",
  editPlace: "Ändra plats", placeNew: "Ny plats", phone: "Telefon", notes: "Bra att veta", website: "Webbplats",
  bookingUrl: "Länk för bokning eller biljett", bookingLabel: "Text på knappen, t.ex. Köp biljett", bookTicket: "Boka biljett",
  openInMaps: "Öppna i Google Maps", mapTitle: "Karta", trafficMapTitle: "Trafikkarta",
  transport: "Transport och trafik", trafficChecking: "Kollar trafikläget…",
  trafficOff: "Automatisk trafikkontroll är avstängd. Kartan visar ändå trafikläget.", trafficError: "Kunde inte hämta trafikläget.",
  trafficDelay: (n: number) => `⚠️ Köer: ca +${n} min mot normalt`, trafficJam: "⚠️ Trafikstockning på delar av rutten",
  trafficOk: (d: string) => `Inga köer. Körtid med trafik: ${d}`,
  noBreaks: "Tiderna är uppskattningar utan pauser.", openRoute: "Öppna rutten i Google Maps",
  vehicleNames: { "🚗": "Bil", "🚢": "Färja", "🚆": "Tåg", "🚇🚶": "Kollektivtrafik och promenad" } as Record<string, string>,
  estimateLabel: "Uppskattning", amountMax: "Upp till (för ett intervall)", currency: "Valuta", currencies: ["SEK", "EUR", "DKK", "NOK", "USD", "GBP"],
  description: "Beskrivning",
  errors: {
    title: "Ange en titel.", date: "Ange ett datum.", dateTaken: "Det finns redan en dag med det datumet.",
    summary: "Skriv en kort sammanfattning av dagen.", icons: "Ange en eller två ikoner, t.ex. 🚗🏛️.",
    time: "Ange start- och sluttid.", endBeforeStart: "Sluttiden kan inte vara före starttiden.", day: "Dagen finns inte längre.",
    text: "Beskriv aktiviteten.", activityTime: "Ange tiden som TT:MM.", place: "Ange namn och adress för den nya platsen.",
    name: "Ange ett namn.", dates: "Ange första och sista datum.", toBeforeFrom: "Sista datum kan inte vara före första.",
    expenseText: "Beskriv utlägget.", category: "Välj en kategori.", range: "Det högre beloppet måste vara minst lika stort som det lägre.",
    taskText: "Beskriv uppgiften.", url: "Webbadressen ser inte ut att stämma, t.ex. www.exempel.se.", item: "Skriv vad som ska packas.",
    tooLong: "En resa kan vara högst 60 dagar.", activityDate: "Aktiviteten ligger inte på bokningens första datum.",
    activityStart: "Ange när aktiviteten börjar.", duration: "Ange ungefär hur lång tid aktiviteten tar.", move: "Aktiviteten eller dagen finns inte längre.", pinned: "Aktiviteten är nålad. Ta bort nålen först.", planWish: "Önskan eller dagen finns inte längre.",
  },
  loading: "Laddar…", error: "Kunde inte nå servern.", weatherCredit: "Väderdata:",
  weekdays: ["sön", "mån", "tis", "ons", "tor", "fre", "lör"],
  monthsLong: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
  months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
};
