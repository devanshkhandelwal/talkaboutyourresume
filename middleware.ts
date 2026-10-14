import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { authEnabled } from "@/lib/authConfig";

// Makes the signed-in user (if any) available to pages and API routes. Nothing is
// locked behind sign-in: accounts are optional, and routes check auth themselves.
// Without Clerk keys this is a pass-through.
export default authEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
