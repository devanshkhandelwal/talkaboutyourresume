// Flip to false once payments are live. During beta every interviewer
// is unlocked and the Pro card shows "Coming soon".
export const BETA = true;

export const FREE_MINUTES = 15;
export const PRO_PRICE = 20;
export const PRO_MINUTES = 100;

// Rough Deepgram spend per interview, used only for the "about N interviews"
// estimate in the beta credits badge. A full 15-minute Voice Agent session at the
// Standard tier is about $1.13, but most practice runs end sooner, so tune this
// against real usage in the Deepgram console.
export const DEEPGRAM_COST_PER_INTERVIEW = 0.6;
