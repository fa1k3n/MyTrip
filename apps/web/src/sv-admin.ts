// Interface texts for the trip's settings only, kept out of the main page file (PF-01). Loaded with the settings page.
export const svAdmin = {
  hidden: {
    title: "Dold för", none: "Ingen", pickLabel: "Dölj för", dayTitle: "Dagens rubrik",
    hint: "De valda ser bara \u201dDold aktivitet\u201d. Följare ser den som dold så fort den är dold för någon.", like: (text: string) => `Liknar den dolda \u201d${text}\u201d`,
  }, // AU-18, AU-25
  share: {
    title: "Följarlänk", none: "Ingen länk än.", create: "Skapa länk", copy: "Kopiera länken", replace: "Byt länk", copied: "Kopierad.",
    hint: "För vänner som inte följer med: den som har länken är Följare och kan bara läsa resan. Bokningsnummer visas inte.",
    confirmReplace: "Byta länk? Den gamla länken slutar fungera direkt.",
  },
  shares: { title: "Delar på kostnader", toggle: (n: string) => `${n} delar på kostnader`,
    hint: "Ett utlägg som delas av alla delas bara av dem som delar. Intryckt knapp betyder att personen delar. Släpp den för till exempel barn. För ett enskilt utlägg kan du ändå välja vem som delar, under Pengar." }, // MI-38
  people: { // AU-11
    title: "Personliga länkar", role: "Behörighet", roles: { traveler: "Resenär", planner: "Planerare" }, follower: "Följare",
    roleOf: (role: string, n: string) => `${role}: ${n}`, // AU-33
    hint: "Varje resenär har en egen länk. Välj behörighet med knapparna: resväskan är Resenär (läsa, bocka av och lägga till egna utlägg), kompassen är Planerare (dessutom ändra allt för resan). Pennan byter namn.",
    copy: (n: string) => `Kopiera länken för ${n}`, replace: (n: string) => `Byt länk för ${n}`,
    copied: (n: string) => `Länken för ${n} är kopierad.`, noTravelers: "Inga resenärer än. Lägg till dem med plusknappen.",
    account: (n: string) => `Konto för ${n} (mejladress)`, accountPlaceholder: "Konto (mejladress)", // US-21
    accountHint: "Skriv in mejladressen till en resenärs konto, så ser hen resan när hen loggar in. Saknar adressen konto kopplas det när kontot skapas.",
    accountTaken: "Adressen används redan av en annan resenär i resan.", accountBad: "Det där är ingen mejladress.",
  },
  inbox: { // BK-26
    title: "Resans inkorg", replace: "Byt adress", copy: "Kopiera adressen", copied: "Kopierad.",
    hint: "Planerare och resenärer som ser önskningar kan mejla hit. Bokningsbekräftelser blir förslag under Bokningar i Nåla, andra mejl blir önskningar i Önska. Den som har adressen kan skicka, så byt den om den har spridits.",
    off: "Mejlimport är inte inställd på servern: den behöver en egen domän (INBOX_DOMAIN).",
    confirmReplace: "Byta adress? Mejl till den gamla adressen kommer inte längre fram, och alla behöver den nya.",
  },
  users: { // US-02..US-04, US-12, US-16
    title: "Användare", name: "Namn", email: "Mejladress", add: "Lägg till användare",
    hint: "Bara du ser listan. En ny användare får en lösenordslänk som gäller i 7 dagar: ge den till personen, kopiera den eller visa QR-koden. Har personen ett Google-konto med samma adress kan hen också logga in med Google.",
    how: { both: "Lösenord och Google", password: "Lösenord", google: "Google", none: "Inte inloggad än" },
    last: (d: string) => `senast ${d}`, superuser: (n: string) => `${n} är superanvändare`, ai: (n: string) => `${n} får använda AI`,
    disabled: (n: string) => `${n} är avstängd`, newLink: (n: string) => `Ny lösenordslänk för ${n}`, remove: (n: string) => `Ta bort ${n}`,
    confirmRemove: (n: string) => `Ta bort ${n}? Resor som ${n} har skapat blir dina.`, confirmLink: "Göra en ny lösenordslänk? Den förra slutar fungera.",
    link: (n: string) => `Lösenordslänk för ${n}`, expires: (d: string) => `Gäller till ${d}.`, copy: (n: string) => `Kopiera lösenordslänken för ${n}`, copied: "Kopierad.",
    taken: "Adressen har redan ett konto.", bad: "Skriv ett namn och en giltig mejladress.", self: "Du kan inte stänga av, ta bort eller ta superflaggan från dig själv.",
  },
  qr: { // AU-31
    show: (n: string) => `Visa QR-kod för ${n}`, title: (n: string) => `Länk för ${n}`, label: (n: string) => `QR-kod med länken för ${n}`,
    hint: "Låt den andra skanna koden med kameran i sin telefon.",
  },
  perms: { // AU-20
    title: "Behörigheter", hint: "Vad varje roll får se och ändra i den här resan.",
    roles: { follower: "Följare", traveler: "Resenär", planner: "Planerare" }, shown: "Synlig",
    legend: { follower: "Följare", traveler: "Resenär", planner: "Planerare", admin: "Du som administratör kan alltid allt" }, page: "Sidan", off: "Sidan är dold", // AU-34: legend
    part: {
      dr: { dreams: "Önskningar" },
      nala: { plan: "Dagar och aktiviteter", bookings: "Bokningar", budget: "Budget", tasks: "Att göra", info: "Praktiskt", packing: "Packlista" },
      up: { budget: "Resans budget", bookings: "Biljetter och bokningar", expenses: "Lägga till utlägg" },
      mi: { expenses: "Utlägg", budget: "Budget", memories: "Upplevt" },
    } as Record<string, Record<string, string>>,
    level: { hidden: "Dold", read: "Läsa", check: "Bocka av", add: "Lägga till", write: "Ändra" },
    cell: (part: string, role: string, level: string) => `${part}, ${role}: ${level}. Tryck för att byta.`, // AU-35
    reset: (role: string) => `Återställ standard för ${role}`, fixed: "Resans inställningar och länkar kan bara Planerare och du ändra.",
  },
};
