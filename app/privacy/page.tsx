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
          Your resume and transcript are sent to our AI providers (Anthropic for reading your resume and writing feedback, Deepgram for live speech) only to run your practice session. During the beta, your resume, transcript and feedback are kept in your own browser tab and are not stored on our servers. Closing the tab clears them.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Your interview audio</h2>
        <p className="muted">
          During the interview, your microphone audio is streamed to Deepgram to run the live conversation. A recording of the interview is kept in your browser tab so you can replay or download it on the feedback page. It isn&apos;t uploaded to us, and it&apos;s cleared when you refresh or leave the page.
        </p>
        <h2 style={{ fontSize: "1.125rem", marginTop: 24 }}>Usage counts</h2>
        <p className="muted">
          We count anonymous page views with Vercel Web Analytics, which uses no cookies, and keep daily totals of a few steps, like how many interviews were started or finished. These are counts only. They aren&apos;t tied to you, your email or your resume.
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
