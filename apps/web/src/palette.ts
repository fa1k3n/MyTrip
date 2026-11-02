// The category colours, as the tokens in index.css (UI-02, UI-26), shared by the budget donut and the category icons.
export const TERRACOTTA = "var(--acc)", SAGE = "var(--sage)", SAND = "var(--sand)", TAUPE = "var(--taupe)", TEAL = "var(--teal)", ROSE = "var(--rose)";

/** An expense category's colour in the donut and its legend (MI-30); Mat and Shopping as their icons (UI-26). */
export const EXPENSE_COLOUR: Record<string, string> = { Transport: TERRACOTTA, Boende: SAGE, Mat: SAND, Upplevelse: TEAL, Shopping: ROSE, "Mat/Fritid": SAND, "Övrigt": TAUPE };

/** The image area of a wish without a category colour, in turn (DB-01). */
export const WISH_BG = ["var(--wish1)", "var(--wish2)", "var(--wish3)"];
