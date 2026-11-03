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
  people: { // AU-38
    title: "Resenärer", role: "Behörighet", roles: { traveler: "Resenär", planner: "Planerare" }, follower: "Följare",
    roleOf: (role: string, n: string) => `${role}: ${n}`,
    hint: "Tryck på en resenär för att ändra namn, behörighet och om hen delar på kostnader, eller för att bjuda in hen med mejl.",
    roleHint: "Resenär läser, bockar av och lägger till egna utlägg. Planerare kan dessutom ändra allt för resan.",
    open: (n: string) => `Ändra ${n}`, edit: (n: string) => `Ändra ${n}`, share: (n: string) => `Dela länk för ${n}`,
    copy: (n: string) => `Kopiera länken för ${n}`, replace: (n: string) => `Ny länk för ${n}`,
    copied: (n: string) => `Länken för ${n} är kopierad.`, noTravelers: "Inga resenärer än. Lägg till dem med plusknappen.",
    shares: "Delar på kostnader", // MI-38
    sharesHint: "Ett utlägg som delas av alla delas bara av dem som delar på kostnader. Stäng av för till exempel barn. För ett enskilt utlägg kan du ändå välja vem som delar, under Pengar.",
    account: "Konto (mejladress)", accountPlaceholder: "namn@exempel.se", // US-21
    accountHint: "Med en mejladress ser resenären resan när hen loggar in. Saknar adressen konto kopplas det när kontot skapas.",
    accountTaken: "Adressen används redan av en annan resenär i resan.", accountBad: "Det där är ingen mejladress.",
    invite: (n: string) => `Bjud in ${n}`, // US-30, US-31
    inviteHint: "Skriv mejladressen ovan och tryck här. Det ger ett konto och en lösenordslänk som du skickar med din mejlapp, kopierar eller visar som QR-kod.",
    invited: (n: string, d: string) => `Inbjudan för ${n} är klar. Länken gäller till ${d}.`,
    mail: (n: string) => `Mejla inbjudan till ${n}`, copyInvite: (n: string) => `Kopiera inbjudningslänken för ${n}`, copied2: "Kopierad.",
    hasAccount: (n: string) => `${n} har redan ett konto och ser resan när hen loggar in. Har hen glömt lösenordet finns "Glömt lösenordet?" på inloggningen.`,
    inviteFailed: "Inbjudan gick inte att göra. Försök igen.",
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
  perms: { // AU-36, AU-37
    title: "Behörigheter", hint: "Vad resenärer och följare får se och göra i den här resan. Det som gäller ett innehåll gäller på alla flikar.",
    roles: { follower: "Följare", traveler: "Resenär", planner: "Planerare" }, shown: "Synlig",
    legend: { follower: "Följare", traveler: "Resenär" }, tab: "Fliken", tabs: "Flikar", contents: "Innehåll",
    content: { plan: "Planen", dreams: "Önskningar", bookings: "Bokningar och biljetter", money: "Pengar", todo: "Att göra och packning", info: "Praktiskt", memories: "Minnen" },
    contentHint: { money: "Budget och utlägg", todo: "Uppgifter och packlistor" } as Record<string, string>,
    level: { hidden: "Dold", read: "Läsa", check: "Bocka av", add: "Lägga till utlägg", write: "Ändra" },
    cell: (part: string, role: string, level: string) => `${part}, ${role}: ${level}. Tryck för att byta.`, // AU-35
    reset: (role: string) => `Återställ standard för ${role}`, fixed: "Planerare och du som administratör kan alltid allt. Resans inställningar och länkar kan bara ni ändra.",
  },
};
