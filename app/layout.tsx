import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, Schibsted_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { authEnabled } from "@/lib/authConfig";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted at build time with size-matched fallbacks, so text doesn't visibly
// swap fonts on load. Variable fonts keep optical sizing (opsz).
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], axes: ["opsz"], variable: "--font-body", display: "swap" });
// Home page: one grotesk family, heavy for headlines and plain for text.
const home = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-home", display: "swap" });

export const metadata: Metadata = {
  // Brand only, on every page.
  title: "Talk About Your Resume",
  description:
    "An AI interviewer reads your resume and asks the follow-up questions real interviewers ask. Practice out loud and get specific feedback.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Light by default; the theme toggle updates this when switching to dark.
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set before hydration by the init script, so React shouldn't warn about it.
    <html lang="en" className={`${display.variable} ${body.variable} ${home.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {/* Optional accounts. Inside <body>, so the theme script in <head> still runs first.
            Clerk's own UI follows the 1-bit look: ink buttons, square-ish corners, our font. */}
        {authEnabled ? (
          <ClerkProvider
            appearance={{
              variables: { colorPrimary: "#000000", borderRadius: "8px", fontFamily: "var(--font-home), system-ui, sans-serif" },
            }}
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
        {/* Vercel Web Analytics: anonymous page views, no cookies. */}
        <Analytics />
      </body>
    </html>
  );
}
