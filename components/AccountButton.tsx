"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { authEnabled } from "@/lib/authConfig";

/** Header control: "Sign in" when signed out, your avatar (with a Profile link) when signed in. */
export function AccountButton() {
  return authEnabled ? <ClerkAccountButton /> : null;
}

function ClerkAccountButton() {
  const { isLoaded, isSignedIn } = useAuth();
  // Hold the space while Clerk loads, so the header doesn't jump.
  if (!isLoaded) return <span aria-hidden style={{ display: "inline-block", width: 40, height: 40 }} />;
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button type="button" className="btn btn-sm account-btn">
          Sign in
        </button>
      </SignInButton>
    );
  }
  return (
    <UserButton appearance={{ elements: { avatarBox: { width: 36, height: 36, border: "2px solid var(--ink)" } } }}>
      <UserButton.MenuItems>
        <UserButton.Link label="Your profile" href="/profile" labelIcon={<ProfileIcon />} />
      </UserButton.MenuItems>
    </UserButton>
  );
}

function ProfileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
