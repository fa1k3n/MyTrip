// All interface text in one place (LC-01).
export const sv = {
  hub: "Drömmar", admin: "Administratör" /* US-25 */, newTrip: "+ Skapa ny resa", newTripTitle: "Ny resa",
  noDates: "Datum saknas", noPurpose: "Skriv syftet med resan här.",
  allTrips: "Alla resor", back: "Tillbaka", tripSettings: "Resans inställningar", // MT-13
  tabs: { dr: "Önska", nala: "Nåla", up: "Uppleva", mi: "Minnas" },
  proposal: { // MC-15..MC-18
    title: "Förslag", waiting: (n: number) => (n === 1 ? "1 förslag väntar" : `${n} förslag väntar`), made: (at: string) => `Gjort ${at}`,
    show: "Visa i planen", hide: "Sluta visa i planen", approve: "Godkänn", reject: "Avvisa", rejectAsk: "Avvisa förslaget? Det går inte att ångra.",
    stale: "Resan har ändrats sedan förslaget gjordes. Avvisa det och be om ett nytt.", problems: "Förslaget går inte att godkänna:", none: "Förslaget ändrar ingenting.",
    pin: (title: string) => `Rubbar en nål: ${title}`,
    other: "Övrigt", added: "Ny", changed: "Ändrad", removed: "Tas bort", preview: "Så här blir planen med förslaget. Inget är sparat än.",
    kinds: { title: "Namn", stops: "Tidslinje", activity: "Aktivitet", days: "Dag", places: "Plats", bookings: "Bokning", budget: "Budgetpost", tasks: "Att göra", info: "Praktiskt", travelers: "Resenär", dreams: "Önskan", expenses: "Utlägg", payments: "Betalning" },
  },
  pin: { on: "Nåla fast", off: "Ta bort nålen", mark: "Nålad", ask: (title: string) => `Ta bort nålen för ${title}? Då kan den flyttas, tidsändras och tas bort.`, locked: "Aktiviteten är nålad: tid och längd ändras inte, och den flyttas eller tas inte bort förrän nålen tas bort." }, // ED-24, ED-25
  undo: { button: "Ångra", failed: "Kunde inte ångra. Resan har ändrats sedan dess.", kinds: { add: "Lade till", change: "Ändrade", remove: "Tog bort" } }, // ED-22
  wish: { // DB-05..DB-14
    fromMail: (name?: string) => (name ? `Mejl från ${name}` : "Mejl"), // DB-23
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
    addWhat: "Lägg till", needsNet: "Kräver nätverk", // UP-51
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
  aiReview: { // AI-83..AI-85
    title: "Nytt från AI", keepAll: "Behåll allt", kept: "Behållet, AI-märket är borttaget", keep: (n: string) => `Behåll: ${n}`, remove: (n: string) => `Ta bort: ${n}`,
    removeDay: "Ta bort AI-förslagen för dagen",
    kinds: { activities: ["aktivitet", "aktiviteter"], tasks: ["uppgift", "uppgifter"], bookings: ["bokning", "bokningar"], wishes: ["önskan", "önskningar"],
      info: ["kort i Praktisk info", "kort i Praktisk info"], packing: ["sak i packlistorna", "saker i packlistorna"] }, // AI-87, AI-89
  },
  people: { traveler: "Resenär", planner: "Planerare", noShare: "delar inte på kostnader", // AU-40
    login: { none: "Inte inbjuden", invited: "Inbjuden, har inte loggat in", active: "Har konto", disabled: "Kontot är avstängt" } }, // US-36
  mailIn: { // BK-26, BK-27
    open: "Mejla in till resan", copy: "Kopiera adressen", copied: "Kopierad.", failed: "Kunde inte hämta adressen just nu.",
    hint: "Vidarebefordra bokningsbekräftelser hit, så blir de förslag under Bokningar i Nåla. Andra mejl, som en delad sida, blir önskningar i Önska. Skriv Bokning: eller Önskan: först i ämnet för att bestämma själv.",
  },
  emergency: { // PI-06
    title: "Nödnummer", eu: "112 fungerar i hela EU.", call: (label: string, n: string) => `${label}: ring ${n}`,
    kinds: { all: "Larm", police: "Polis", ambulance: "Ambulans", fire: "Brand", policeLow: "Polis, ej akut", advice: "Sjukvårdsrådgivning" },
  },
  showWay: "Visa resvägen", // TR-21
  transit: { // TR-23
    show: "Visa linjer", hide: "Dölj linjer", asking: "Söker resa…", locating: "Söker var du är…",
    noPosition: "Ingen plats före den här på dagen, och telefonen gav inte sin position. Tillåt platsen, eller använd Visa resvägen.", none: "Hittade ingen resa med kollektivtrafik. Använd Visa resvägen.", off: "Linjer är inte påslagna i det här Basläger än. Använd Visa resvägen.", // TR-25
    from: (place: string) => `Från ${place}`, fromHere: "Från där du är nu", // TR-27
    noFrom: "Ingen plats före den här på dagen. Lägg till hotellets adress, så räknas resan därifrån.",
    far: "Google har ingen tidtabell så långt fram än. Försök igen närmare resan, eller använd Visa resvägen.", // TR-24
    example: (day: string) => `Google har ingen tidtabell för resdagen än. Så här går det samma tid ${day}:`, failed: "Kunde inte hämta linjerna just nu.",
    walk: (min: number) => `Gå ${min} min`, toward: (h: string) => `mot ${h}`, stops: (n: number) => (n === 1 ? "1 hållplats" : `${n} hållplatser`),
    kinds: { bus: "Buss", tram: "Spårvagn", metro: "Tunnelbana", train: "Tåg", ferry: "Färja", other: "Linje" } as Record<string, string>,
    label: "Resan med kollektivtrafik",
  },
  travelHere: "Resväg hit", noTravel: "Ingen", travelMin: "Restid (minuter)", // TR-20
  travelVehicles: { walk: "Till fots", transit: "Kollektivt", car: "Bil", train: "Tåg", ferry: "Färja" } as Record<string, string>,
  travelRow: (vehicle: string, time: string) => `${vehicle}, ${time}`,
  addPerson: "Lägg till person", newPerson: "Ny person", renamePerson: "Byt namn", renameTraveler: (n: string) => `Byt namn på ${n}`, name: "Namn", noPeople: "Lägg till personerna som delar på kostnaderna.",
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
  beta: { // US-26..US-29: the beta
    tag: "Beta", feedback: "Tyck till (beta)", title: "Tyck till", lead: "Basläger är i beta. Skriv vad som var krångligt, vad du saknar eller vad du gillar.",
    label: "Din synpunkt", send: "Skicka", sent: "Tack! Synpunkten är skickad.", failed: "Det gick inte att skicka. Försök igen.",
    goes: "Det du skriver går till den som driver Basläger, tillsammans med ditt namn och vilken sida du var på.",
    consentTitle: "Basläger är i beta", consentLead: "Tack för att du testar Basläger. Innan du börjar:",
    consentPoints: [
      "Dina resor, önskningar och utlägg sparas i Basläger, på servrar i EU.",
      "Den som driver Basläger kan se allt som finns i appen och kan läsa era planer för att göra appen bättre.",
      "Under betan sparas också vilka av sidorna Önska, Nåla, Uppleva och Minnas du öppnar och vilken dag, för att se vad som används. Inget av detta lämnas till någon annan.",
      "Du kan när som helst be om att ditt konto och dina resor tas bort.",
    ],
    consentCheck: "Jag har läst detta och godkänner det.", consentGo: "Godkänn och fortsätt",
    notes: "Synpunkter (beta)", noNotes: "Inga synpunkter än.", page: (p: string) => `från ${p}`,
    mine: "Dina synpunkter", answer: "Svar", answerLabel: (n: string) => `Svar till ${n}`, answerSave: "Spara svar", answerSaved: "Svaret är sparat.", answerFailed: "Svaret gick inte att spara.", // US-34
    newAnswer: "Tyck till (beta), nytt svar",
    usage: "Användning (beta)", usageLead: "Per resa: vilka som är aktiva, hur många dagar de öppnat varje sida, Uppleva under resans dagar och antal ändringar. Bara konton som godkänt betan räknas.",
    noUsage: "Ingen användning än.", upDuring: "Uppleva under resan", changes: "ändringar", memories: (n: number) => `${n} betyg i Minnas`, days: "dagar",
  },
  roles: { owner: "Skapare", planner: "Planerare", traveler: "Resenär", by: (n: string) => `Skapad av ${n}` }, // US-23, US-24
  fullApp: "Öppna hela appen i Safari", pagesLabel: "Sidor", // PW-24
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
    removeAsk: "Ta bort utlägget? Det har inte kommit fram.", noRate: (c: string) => `Väntar på växelkursen för ${c}.`, /* UP-49 */ forbidden: "Behörigheten har ändrats.", rejected: (status: number) => `Servern tog inte emot det (${status}).`,
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
  newTripAi: { // AI-10
    title: "Ny resa", label: "Beskriv din dröm",
    example: "Vi vill åka till Hamburg på höstlovet med barnen, som är 7 och 10 år. Vi tar bilen och vill inte köra mer än fyra timmar om dagen. Barnen älskar djur och båtar, och vi vuxna vill äta gott och hinna med något museum. Gärna ett hotell med pool.",
    aiNote: "Texten sparas som resans syfte. Den skickas som den är till AI-tjänsten Claude från Anthropic, som lägger in namn, datum, resenärer och dagar och sedan föreslår aktiviteter och sånt som är bra att veta. Utkastet kan ångras, och förslagen tar du med eller avvisar.",
    note: "Texten sparas som resans syfte och hjälper till med förslag senare.",
    makeAi: "Skapa med AI", make: "Skapa resa", makeEmpty: "Skapa utan AI", howTo: "Se filmen om hur det går till.", // UI-23
    working: "Skapar din resa…", busy: "AI-tjänsten gör ett utkast utifrån din beskrivning. Det tar upp till en minut.", seconds: (n: number) => `${n} s`, // AI-76
    steps: { draft: "Skapar resa och rutt", prep: "Letar upp bra att veta inför resan", wishes: "Föreslår aktiviteter som passar", packing: "Skriver packlistor" } as Record<string, string>,
    stepState: { wait: "väntar", run: "pågår", done: "klart", failed: "misslyckades" },
    background: "Resan är klar att öppna. Resten läggs in medan du tittar, i Nåla och Önska.", goTrip: "Gå till resan",
    drafted: "Utkastet är inlagt", // AI-78: with Ångra
    addedCount: (n: number) => (n ? `${n} inlagda` : "inget nytt"), // AI-80
    done: { // AI-82
      activities: ["aktivitet", "aktiviteter"], tasks: ["uppgift", "uppgifter"], bookings: ["bokning att boka", "bokningar att boka"],
      info: ["kort i Praktisk info", "kort i Praktisk info"], // AI-87
      packing: ["sak i packlistorna", "saker i packlistorna"], // AI-89
      text: (list: string, one: boolean, neuter = false) => `AI är klar: ${list} är ${one ? (neuter ? "inlagt" : "inlagd") : "inlagda"}. Ta bort det du inte vill ha.`,
      nothing: "AI är klar men hittade inget mer att lägga in.",
    },
    draftLater: "Utkastet ligger kvar under Förslag i Nåla.", nothing: "AI-tjänsten hittade inget att föreslå. Resan är skapad med din beskrivning.",
  },
  aiRun: { // AI-03, AI-64, AI-65
    consentAsk: "Skicka resan till AI-tjänsten?", consentOk: "Godkänn och skicka",
    consentDetails: [
      "Resans syfte, dagar, rutt, platser, bokningar utan nummer, uppgifter och önskningar skickas till AI-tjänsten Claude från Anthropic.",
      "Namn byts mot ålder, till exempel \"barn, 9 år\". Bokningsnummer, telefonnummer, mejladresser, betaluppgifter, utlägg och biljetter skickas inte.",
      "Det AI-tjänsten föreslår blir ett förslag. Inget ändras förrän en Planerare godkänner det. Undantaget är utkastet till en ny, tom resa, som läggs in direkt och kan ångras.",
      "Du godkänner för hela resan. AI stängs av för resan under Resans inställningar.",
    ],
    consentBy: (by: string, date: string) => `${by} godkände att resan skickas till AI-tjänsten ${date}.`, admin: "Administratören",
    errors: {
      capInstance: "AI-budgeten för den här månaden är slut. AI fungerar igen nästa månad.",
      capAccount: "Din AI-budget för den här månaden är slut. Den fylls på nästa månad.",
      off: "AI är avstängt för den här resan eller för den här sortens hjälp.",
      refusal: "AI-tjänsten kunde inte hjälpa till med det här.",
      forbidden: "Bara den som planerar resan kan använda AI här.",
      network: "Det gick inte att nå servern. Försök igen.",
      failed: "AI-tjänsten gav inget användbart förslag. Försök igen.",
    },
    capUsd: "Tak per månad för hela appen (USD)", capAccountUsd: "Tak per månad och person (USD)",
    capHint: (all: number, one: number) => `När ett tak nås slutar appen fråga AI-tjänsten till nästa månad. Tomt fält: ${all} USD för appen, ${one} USD per person.`,
    capInvalid: "Skriv ett belopp, till exempel 5 eller 2,5.",
    cost: (name: string, calls: number, usd: string) => `${name}: ${calls} AI-anrop, ${usd} USD`, costTitle: "AI",
    auto: "AI-hjälpen", // AI-69: who an automatic run is made by
    helpersTitle: "AI-hjälp",
    helpers: {
      prep: ["Bra att veta inför resan", "Föreslår regler och dokument längs hela resvägen som uppgifter i Att göra, och det som måste bokas under Bokningar."],
      wishes: ["Förslag på önskningar", "Föreslår riktiga platser som passar resan, var och en med en aktivitet på en dag där den passar."], // AI-71, AI-77
      packing: ["Packlistor", "Skriver en gemensam packlista och en för varje resenär efter resans väder, aktiviteter och åldrar."], // AI-89
    } as Record<string, [string, string]>,
    info: (name: string) => `Om ${name}`, // AI-74
    about: { prep: [
      "Letar upp sånt som är lätt att missa inför resan: regler längs hela resvägen som miljödekaler, vägtullar och vinjetter, dokument som pass och EU-kort, och sånt som måste bokas eller beställas i förväg.",
      "Hjälpen körs av sig själv tio minuter efter att resans datum, platser, rutt, resenärer eller syfte ändrats. Med Kör nu körs den direkt.",
      "Förslagen hamnar under Att göra i Nåla, och det som måste bokas under Bokningar med statusen Att boka. De är märkta AI-förslag och har en källa. Inget läggs till förrän du tar med det, och det du avvisar föreslås inte igen.",
      "Kontrollera reglerna via källan, de kan ha ändrats. Varje körning kostar en liten summa, därför visas ungefär hur många körningar som är kvar i månaden.",
    ], wishes: [
      "Letar på webben upp 5 till 8 riktiga platser och aktiviteter som passar det ni skrivit i syftet, platserna på resan och resenärernas åldrar.",
      "Varje förslag blir en önskan under Förslag i Önska och en aktivitet på en dag där den passar, märkt med AI-stjärnan i Nålas dagkort. Tar du med förslaget kommer båda in, avvisar du det försvinner båda.",
      "Hjälpen körs av sig själv tio minuter efter att resans syfte, platser eller resenärer ändrats. Med Kör nu körs den direkt. Varje körning kostar en liten summa.",
    ], packing: [
      "Skriver en gemensam packlista och en för varje resenär, efter årstiden och vädret som brukar vara där, hur ni reser, vad ni ska göra och resenärernas åldrar.",
      "Hjälpen körs av sig själv tio minuter efter att resans datum, platser, färdsätt, aktiviteter, resenärer eller syfte ändrats. Med Kör nu körs den direkt.",
      "Förslagen hamnar under Packlista i Nåla, ett per lista, märkta AI-förslag. Inget läggs till förrän du tar med det, och det som redan står på listan föreslås inte igen. Varje körning kostar en liten summa.",
    ] } as Record<string, string[]>,
    runNow: (name: string) => `Kör nu: ${name}`, ran: (n: number) => (n ? `${n} nya förslag.` : "Inget nytt att föreslå."),
    never: "Har inte körts än", last: (when: string) => `Senast ${when}`, nothing: ", inget nytt", failed: (when: string) => `Misslyckades ${when}`,
    left: (n: number) => `ca ${n} ${n === 1 ? "körning" : "körningar"} kvar`, capped: "Taket för månaden är nått",
    suggestion: "AI-förslag", take: (text: string) => `Lägg till: ${text}`, reject: (text: string) => `Avvisa: ${text}`,
    aiMade: "Föreslagen av AI", checkSource: "Kolla källan", dayGone: "Dagen finns inte längre, så förslaget passar inte. Det är borttaget.", // AI-77
    wishRow: "Förslag", wishRowHint: "Förslag från AI-hjälpen. Tar du med ett kommer önskan och en aktivitet på dagen in.", onDay: (d: string) => `Förslag för ${d}`, // AI-71 // AI-70: check the rule at its source (PI-04)
  },
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
  replacePurposeAsk: "Ersätta det som står i Syfte med förslaget?", replacePurpose: "Ersätt",
  newDay: "Ny dag", emptyDay: "Inget planerat än.", editDay: "Ändra dag",
  login: {
    title: "Logga in", password: "Lösenord", submit: "Logga in", logout: "Logga ut", logoutAsk: "Logga ut?", // PW-23
    noLink: "Logga in med ditt konto, eller öppna resan med länken du fått.",
    expired: "Länken gäller inte längre. Be om en ny länk, eller logga in med ditt konto.",
    email: "Mejladress", google: "Logga in med Google", // US-07, US-09
    googleInstalled: "Google-inloggning fungerar inte i appen på hemskärmen. Logga in med mejladress och lösenord här, eller med Google i Safari.", // US-19
    about: "Om Basläger", // UI-13
    noAccount: "Det finns inget konto för den här adressen.", googleFailed: "Inloggningen med Google gick inte. Försök igen.",
    setTitle: "Välj lösenord", setFor: (name: string, email: string) => `Kontot för ${name}, ${email}.`, min: "Minst 10 tecken.", // US-05
    setSave: "Spara och logga in", setGone: "Länken gäller inte längre. Be den som skapade kontot om en ny.", setShort: "Lösenordet behöver minst 10 tecken.",
    pasteLink: "Klistra in länken du fått", openLink: "Öppna resan", badLink: "Det där är ingen länk till en resa.", // PW-02
    wrong: "Fel mejladress eller lösenord.", tooMany: "För många försök. Vänta en kvart och försök igen.", off: "Inloggningen är inte påslagen på servern.",
    forgot: "Glömt lösenordet?", // US-35
    forgotAsk: "Skriv din mejladress, så skickar vi en länk där du väljer ett nytt lösenord.", forgotSend: "Skicka länk",
    forgotSent: (email: string) => `Finns det ett konto för ${email} kommer ett mejl med en länk om en liten stund. Länken gäller en timme. Titta i skräpposten om det dröjer.`,
    forgotFailed: "Det gick inte att skicka. Försök igen om en stund.",
    forgotHelp: "Be den som sköter Basläger om en ny lösenordslänk. Har du fått en inbjudan men aldrig loggat in kan den som bjöd in dig göra en ny under resans inställningar, Resenärer.",
    forgotGoogle: "Har du ett Google-konto med samma mejladress kan du också logga in med Google.",
  },
  resetMail: { // US-35: the mail the server sends for a forgotten password; the name in html is already escaped
    subject: "Nytt lösenord till Basläger",
    text: (name: string, url: string) =>
      `Hej ${name}!\n\nDu har bett om ett nytt lösenord till Basläger. Öppna länken inom en timme och välj ett nytt lösenord:\n\n${url}\n\nHar du inte bett om det kan du strunta i det här mejlet. Ditt lösenord är kvar som förut.`,
    html: (name: string, url: string) =>
      `<p>Hej ${name}!</p><p>Du har bett om ett nytt lösenord till Basläger. Öppna länken inom en timme och välj ett nytt lösenord:</p><p><a href="${url}">${url}</a></p><p>Har du inte bett om det kan du strunta i det här mejlet. Ditt lösenord är kvar som förut.</p>`,
  },
  invite: { // US-31: the mail the phone's own mail app sends
    subject: (trip: string) => `Inbjudan till ${trip} i Basläger`,
    body: (name: string, trip: string, url: string, until: string) =>
      `Hej ${name}!\n\nDu är inbjuden till ${trip} i Basläger. Öppna länken, välj ett lösenord och logga in, så ser du resan:\n\n${url}\n\nLänken gäller till ${until}. Lägg gärna till Basläger på hemskärmen efteråt, så har du resan i telefonen även utan nät.`,
    addedSubject: (trip: string) => `Du är med i ${trip} i Basläger`, // US-37: an account that can already log in
    addedBody: (name: string, trip: string, url: string) =>
      `Hej ${name}!\n\nDu är med i ${trip} i Basläger. Logga in som vanligt, så ser du resan:\n\n${url}\n\nHar du glömt lösenordet finns "Glömt lösenordet?" på inloggningen.`,
  },
  prevDay: "Föregående dag", nextDay: "Nästa dag",
  gap: "Lucka", clash: "Krock", moveActivity: "Flytta", moveHint: "Dra för att flytta, eller använd piltangenterna", dropHere: "Släpp en aktivitet här",
  missing: { label: "Saknar", time: "tid", duration: "uppskattad tid", category: "kategori" },
  duration: "Uppskattad tid", chooseDuration: "Välj…",
  addActivity: "Lägg till aktivitet", newActivity: "Ny aktivitet", editActivity: "Ändra aktivitet", moreDetails: "Fler detaljer", newWishOption: "Ny önskan", // ED-27, ED-29
  addBooking: "Lägg till bokning", newBooking: "Ny bokning", editBooking: "Ändra bokning",
  addCost: "Lägg till kostnad", newCost: "Ny kostnad", editCost: "Ändra kostnad",
  date: "Datum", summaryLabel: "Sammanfattning (en mening, utan klockslag)", icons: "Egna ikoner, en eller två (visas när aktiviteterna saknar kategori)",
  start: "Start", end: "Slut", estimate: "ca", location: "Ort (för vädret)", time: "Tid", what: "Vad",
  placeLabel: "Plats", noPlace: "Ingen plats", newPlace: "Ny plats…", placeName: "Platsens namn", address: "Adress",
  firstDate: "Första datum", lastDate: "Sista datum", status: "Status", reference: "Bokningsnummer",
  statuses: { tobook: "Att boka", paid: "Betald", ready: "Klar", cancelled: "Avbokad" }, paidMark: "Betald", owner: "Ansvarig",
  noCategory: "Ingen kategori", notChecked: "ej kollat", noTime: "tid ej beräknad",
  marks: { suggestions: (n: number) => `${n} AI-förslag väntar`, toBook: (n: number) => `${n} ${n === 1 ? "bokning" : "bokningar"} att boka` }, // UI-22
  badge: { tobook: "att boka", paid: "betald", ready: "klar", cancelled: "avbokad" }, bookIt: "Boka", // BK-20
  tickets: { // BK-09, BK-10
    title: "Biljetter", show: "Visa biljett", add: "Lägg till biljett", remove: (n: string) => `Ta bort ${n}`, confirmRemove: "Ta bort biljetten?",
    uploading: "Laddar upp…", tooBig: "PDF:en är större än 2 MB.", badType: "Bara PDF, PNG eller JPEG går att lägga till.", badImage: "Bilden gick inte att göra mindre än 2 MB.",
    failed: "Kunde inte ladda upp filen.", loading: "Hämtar biljetten…", error: "Kunde inte visa biljetten.", page: (name: string, n: number) => `${name}, sida ${n}`,
  },
  crash: { title: "Något gick fel", text: "Appen stötte på ett fel. Det du har sparat finns kvar. Ladda om för att fortsätta.", reload: "Ladda om" }, // CP-07
  fromMemories: (list: string) => `Bygger på era omdömen från ${list}.`, // AI-91
  aiRead: { // AI-60, AI-42
    mail: "Läs med AI", mailBusy: "AI läser mejlet…", mailDone: (fields: string) => `AI fyllde i ${fields}. Kontrollera innan du sparar.`, mailNothing: "AI hittade inget mer i mejlet.",
    fields: { kind: "typ", name: "namn", from: "första dag", to: "sista dag", checkIn: "incheckning", checkOut: "utcheckning", start: "starttid", address: "adress", price: "pris" } as Record<string, string>,
    receipt: "Läs kvitto", receiptBusy: "AI läser kvittot…", receiptDone: "Ifyllt från kvittot med AI. Kontrollera innan du sparar.", receiptNothing: "AI kunde inte läsa kvittot. Fyll i själv.",
    badPhoto: "Det där gick inte att läsa som foto.",
  },
  mail: { // BK-17, BK-18
    review: "Bokning från mejl", from: (subject: string, from: string) => `Från mejl: ${subject}${from ? ` (${from})` : ""}`,
    waiting: (n: number) => (n === 1 ? "1 bokning från mejl att granska" : `${n} bokningar från mejl att granska`), open: (s: string) => `Granska ${s}`,
    reject: "Ta bort förslaget", confirmReject: "Ta bort bokningen från mejlet? Dess filer raderas.", checkFilled: "Ifyllt från mejlet. Kontrollera innan du sparar.",
    paste: "Fyll i från bekräftelse", pasteLabel: "Klistra in texten från bokningsbekräftelsen", read: "Fyll i",
    filled: "Fälten är ifyllda från texten. Kontrollera dem innan du sparar.", nothing: "Hittade inget att fylla i.", noSubject: "(utan ämne)",
    twin: (name: string) => `Finns kanske redan: ${name}`, wishExists: "Önskan finns redan i Önska.", // BK-30, DB-27
    toWish: "Gör till önskan", confirmToWish: "Göra mejlet till en önskan i Önska i stället för en bokning? Bifogade filer utom en bild tas bort.", // BK-29
    price: "Pris", priceHint: "Priset läggs i budgeten som en egen post.", // BK-25
    target: "Gäller", newBooking: "Ny bokning", targetHint: "Bokningen som stod som Att boka fylls i och blir klar.", // BK-22
  },
  bookingKinds: { // BK-07, BK-08
    label: "Typ", stay: "Boende", ticket: "Biljett", other: "Övrigt", transport: "Resa", in: "in", out: "ut",
    checkIn: "Incheckning", checkOut: "Utcheckning", start: "Starttid", activity: "Gäller aktiviteten", noActivity: "Ingen särskild",
  },
  noTasks: "Inga uppgifter ännu.", tasksShared: "Bockarna sparas i resan och syns för alla som har tillgång till den.", overdue: "försenad",
  addTask: "Lägg till uppgift", newTask: "Ny uppgift", editTask: "Ändra uppgift", due: "Klart senast",
  info: "Praktiskt", addInfo: "Lägg till praktisk info", newInfo: "Ny praktisk info", editInfo: "Ändra praktisk info", noInfo: "Ingen praktisk info ännu.",
  unsuitable: "Passar inte", unsuitableLabel: "Passar inte, därför (lämna tomt om den passar)", verify: "Uppgiften kan vara inaktuell, kontrollera den innan.", verifyLabel: "Källan kan vara inaktuell",
  packSuggestion: (who: string, items: string[]) => `Packlista ${who}: ${items.slice(0, 4).join(", ")}${items.length > 4 ? ` och ${items.length - 4} till` : ""}`, /* AI-89 */
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
    name: "Ange ett namn.", person: "Personen finns inte längre.", travel: "Ange restiden i hela minuter.", dates: "Ange första och sista datum.", toBeforeFrom: "Sista datum kan inte vara före första.",
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
