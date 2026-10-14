import { SiteFooter, SiteHeader } from "@/components/Chrome";

export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="narrow" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <h1 className="display h2">Privacy, in plain words</h1>
        <p className="subtle">Beta version. Have a lawyer review this before a public launch.</p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 32 }}>What we collect</h2>
        <p className="muted">
          Your resume text, what you say during a practice interview, and your email if you choose to give it.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Where it goes</h2>
        <p className="muted">
          Your resume and transcript are sent to our AI providers (Anthropic for reading your resume and writing feedback, Deepgram for live speech) only to run your practice session. During the beta, your resume and transcript are kept in your own browser tab and are not stored on our servers. Closing the tab clears them. Your feedback is only stored if you sign in, as described below.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Your interview audio</h2>
        <p className="muted">
          During the interview, your microphone audio is streamed to Deepgram to run the live conversation. A recording of the interview is kept in your browser tab so you can replay or download it on the feedback page. It isn&apos;t uploaded to us, and it&apos;s cleared when you refresh or leave the page.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>If you sign in</h2>
        <p className="muted">
          Accounts are optional. Sign-in is handled by Clerk with your Google account. When you&apos;re signed in, we save each finished interview&apos;s score, verdicts, tips, summary and best line to your profile, stored in a Neon Postgres database. We don&apos;t save transcripts, your resume or audio. You can delete your saved interviews from your profile at any time, and deleting your account deletes them too.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Usage counts</h2>
        <p className="muted">
          We count anonymous page views with Vercel Web Analytics, which uses no cookies, and keep daily totals of a few steps, like how many interviews were started or finished. We also note the type and size of each uploaded resume file (for example &ldquo;PDF, 180 KB&rdquo;), never its name or contents. None of this is tied to you, your email or your resume.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>What we never do</h2>
        <p className="muted">
          We don&apos;t sell your data, and nothing from your practice is shared with employers. If we ever offer shareable profiles, they will be opt-in only.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Questions or deletion requests</h2>
        <p className="muted">
          Email <a href="mailto:hello@talkaboutyourresume.com">hello@talkaboutyourresume.com</a>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
