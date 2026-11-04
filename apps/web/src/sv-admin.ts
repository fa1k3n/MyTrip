// Interface texts for the trip's settings only, kept out of the main page file (PF-01). Loaded with the settings page.
export const svAdmin = {
  hidden: {
    title: "Dold för", none: "Ingen", pickLabel: "Dölj för", dayTitle: "Dagens rubrik",
    hint: "De valda ser bara \u201dDold aktivitet\u201d. Följare ser den som dold så fort den är dold för någon.", like: (text: string) => `Liknar den dolda \u201d${text}\u201d`,
  }, // AU-18, AU-25
  share: {
    title: "Följarlänk", create: "Skapa Följarlänk", open: "Dela Följarlänken", copy: "Kopiera länken", replace: "Byt länk", copied: "Kopierad.",
    line: "Alla med länken kan läsa resan", none: "Ingen länk än", hint: "Bokningsnummer visas aldrig för Följare.", // AU-40
    confirmReplace: "Byta länk? Den gamla länken slutar fungera direkt.",
  },
  people: { // AU-40
    title: "Vilka som är med", role: "Behörighet", roles: { traveler: "Resenär", planner: "Planerare" }, follower: "Följare",
    roleOf: (role: string, n: string) => `${role}: ${n}`,
    hint: "Tryck på en person för att ändra hen, eller på kuvertet för att bjuda in.",
    roleHint: "Planerare kan ändra allt i resan.",
    open: (n: string) => `Ändra ${n}`, edit: (n: string) => `Ändra ${n}`, share: (n: string) => `Dela länk för ${n}`,
    copy: (n: string) => `Kopiera länken för ${n}`, replace: (n: string) => `Ny länk för ${n}`,
    copied: (n: string) => `Länken för ${n} är kopierad.`, noTravelers: "Inga resenärer än. Lägg till dem med plusknappen.",
    shares: "Delar på kostnader", // MI-38
    sharesHint: "Stäng av för till exempel barn, så delar de inte på gemensamma utlägg.",
    login: "Inloggning", // AU-40, US-36
    account: "Mejladress", accountPlaceholder: "namn@exempel.se", // US-21
    accountHint: "Med ett konto ser hen resan när hen loggar in.",
    noAccount: "Utan konto: dela en personlig länk", // AU-11
    accountTaken: "Adressen används redan av en annan resenär i resan.", accountBad: "Det där är ingen mejladress.",
    invite: (n: string) => `Bjud in ${n}`, // US-30, US-31
    invited: (n: string, d: string) => `Inbjudan för ${n} är klar. Länken gäller till ${d}.`,
    mail: (n: string) => `Mejla inbjudan till ${n}`, copyInvite: (n: string) => `Kopiera inbjudningslänken för ${n}`, copied2: "Kopierad.",
    hasAccount: (n: string) => `${n} har redan ett konto och ser resan när hen loggar in. Skicka gärna ett meddelande om att hen är med.`,
    inviteFailed: "Inbjudan gick inte att göra. Försök igen.",
    mailAdded: (n: string) => `Mejla ${n} att hen är med`, copyLogin: "Kopiera länken till inloggningen", // US-37
    disabled: (n: string) => `Kontot för ${n} är avstängt. Den som sköter Basläger kan öppna det igen.`,
  },
  inbox: { // BK-26
    title: "Resans inkorg", replace: "Byt adress", copy: "Kopiera adressen", copied: "Kopierad.",
    hint: "Mejla bokningar och tips hit, så blir de förslag i resan.", // AU-39
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
  second: { // SP-13
    title: "Tvåstegsverifiering", ask: "Skriv koden som autentiseringsappen i telefonen visar.",
    code: "Kod", recoveryCode: "Reservkod", useRecovery: "Använd en reservkod", useCode: "Använd koden från appen",
    submit: "Logga in", restart: "Börja om",
    wrong: "Fel kod, eller så har mer än fem minuter gått. Försök igen eller börja om.",
    setupTitle: "Slå på tvåstegsverifiering",
    setupLead: "Som superanvändare loggar du in i två steg. Skanna QR-koden med en autentiseringsapp, till exempel Aegis, Google Authenticator eller 1Password, och skriv in koden som appen visar.",
    qr: "QR-kod för autentiseringsappen", openApp: "Öppna i autentiseringsappen", manual: "Eller skriv in nyckeln för hand:", confirm: "Slå på",
    savedTitle: "Spara dina reservkoder",
    savedLead: "Tappar du telefonen loggar du in med en av de här koderna i stället. Varje kod fungerar en gång. Spara dem på ett säkert ställe, till exempel i en lösenordshanterare: de visas bara nu.",
    copy: "Kopiera koderna", copied: "Kopierade.", done: "Jag har sparat koderna",
    left: (n: number) => (n === 0 ? "Det var din sista reservkod." : n === 1 ? "Du har 1 reservkod kvar." : `Du har ${n} reservkoder kvar.`), next: "Fortsätt",
    accountFirst: "Logga in med ditt superanvändarkonto först och slå på tvåstegsverifiering där.",
  },
  qr: { // AU-31
    show: (n: string) => `Visa QR-kod för ${n}`, title: (n: string) => `Länk för ${n}`, label: (n: string) => `QR-kod med länken för ${n}`,
    hint: "Låt den andra skanna koden med kameran i sin telefon.",
  },
  perms: { // AU-41
    title: "Behörigheter", fixed: "Planerare kan alltid allt.",
    switches: {
      money: ["Resenärer ser pengar och lägger till utlägg", "Av: budget och utlägg är dolda för resenärer, till exempel för barn."],
      wishes: ["Resenärer önskar och röstar", "På: resenärer lägger till önskningar och röstar i Önska. Av: de läser dem."],
      followerAll: ["Följare ser hela planen", "På: Följare ser också önskningar, bokningar utan bokningsnummer och praktisk info. Av: bara dagarna."],
    },
    custom: "Resan har anpassade behörigheter. Ändrar du ett reglage gäller reglagen i stället.",
  },

};
