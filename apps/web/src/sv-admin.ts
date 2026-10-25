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
  people: { // AU-11
    title: "Personliga länkar", role: "Behörighet", roles: { traveler: "Resenär", planner: "Planerare" }, follower: "Följare",
    hint: "Varje resenär har en egen länk. Resenär: läsa, bocka av och lägga till egna utgifter. Planerare: dessutom ändra allt för resan.",
    copy: (n: string) => `Kopiera länken för ${n}`, replace: (n: string) => `Byt länk för ${n}`,
    copied: (n: string) => `Länken för ${n} är kopierad.`, noTravelers: "Inga resenärer än. Lägg till dem med plusknappen.",
  },
  perms: { // AU-20
    title: "Behörigheter", hint: "Vad varje roll får se och ändra i den här resan. Du som administratör kan alltid allt.",
    roles: { follower: "Följare", traveler: "Resenär", planner: "Planerare" }, shown: "Synlig", page: "Sidan", off: "Sidan är dold",
    part: {
      dr: { dreams: "Önskningar" },
      nala: { plan: "Dagar och aktiviteter", bookings: "Bokningar", budget: "Budget", tasks: "Att göra", info: "Praktiskt", packing: "Packlista" },
      up: { budget: "Budgetläge", bookings: "Biljetter och bokningar", expenses: "Lägga till utgift" },
      mi: { expenses: "Utgifter", budget: "Budget mot utfall" },
    } as Record<string, Record<string, string>>,
    level: { hidden: "Dold", read: "Läsa", check: "Bocka av", add: "Lägga till", write: "Ändra" },
    reset: (role: string) => `Återställ standard för ${role}`, fixed: "Resans inställningar och länkar kan bara Planerare och du ändra.",
  },
};
