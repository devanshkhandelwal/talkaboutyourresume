// Accounts are optional, and so is Clerk itself: without its keys (local
// development, a fresh clone) the app runs exactly as before, just with no
// sign-in. NEXT_PUBLIC_ values are inlined, so this works in the browser too.
export const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
