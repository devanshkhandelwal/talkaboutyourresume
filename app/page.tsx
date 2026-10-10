import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { RoleExamples } from "@/components/RoleExamples";
import { UploadButton } from "@/components/UploadButton";
import { BETA, FREE_MINUTES, PRO_MINUTES, PRO_PRICE } from "@/lib/config";

export default function Home() {
  return (
    <>
      <SiteHeader
        right={
          <nav className="nav" aria-label="Main">
            <a href="#pricing">Pricing</a>
          </nav>
        }
      />

      <main id="top" className="wrap page-main" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 56 }}>
        <section style={{ flex: "1 1 440px", minWidth: 0 }}>
          <h1 className="display h1">
            Can you <span style={{ color: "var(--accent)" }}>talk</span> about your resume?
          </h1>
          <p className="muted" style={{ margin: "24px 0 36px", fontSize: "1.25rem", maxWidth: 500 }}>
            The first question is easy. The follow-up is where interviews are won or lost. Practice the follow-ups on your own resume, out loud, for any role.
          </p>
          <UploadButton />
        </section>
        <RoleExamples part="card" />
      </main>

      <section className="wrap" aria-labelledby="change-title" style={{ paddingBottom: 96 }}>
        <h2 id="change-title" className="display h2" style={{ marginBottom: 8 }}>
          Same experience. Different answer.
        </h2>
        <RoleExamples part="compare" />
      </section>

      <section id="pricing" className="narrow" aria-labelledby="pricing-title" style={{ paddingBottom: 72 }}>
        <h2 id="pricing-title" className="display h2" style={{ textAlign: "center", marginBottom: 24 }}>
          Pricing
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: 0, fontSize: "1.125rem" }}>Free</h3>
            <p style={{ margin: "8px 0 20px" }}>
              <span className="display" style={{ fontSize: "2.5rem" }}>$0</span>
            </p>
            <ul style={{ margin: "0 0 28px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, color: "var(--ink-2)" }}>
              <li>One practice interview with any interviewer</li>
              <li>Up to {FREE_MINUTES} minutes</li>
              <li>Full feedback and transcript</li>
              <li>Retry your weakest answer</li>
            </ul>
            <a href="#top" className="btn btn-light btn-sm" style={{ marginTop: "auto" }}>
              Start free
            </a>
          </div>
          <div style={{ padding: 28, borderRadius: 20, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: 0, fontSize: "1.125rem" }}>Pro</h3>
            <p style={{ margin: "8px 0 4px" }}>
              <span className="display" style={{ fontSize: "2.5rem" }}>${PRO_PRICE}</span>
              <span style={{ color: "#c4c4cc" }}> / month</span>
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#c4c4cc" }}>Cancel anytime.</p>
            <ul style={{ margin: "0 0 28px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, color: "#e6e6ea" }}>
              <li>{PRO_MINUTES} minutes of practice</li>
              <li>Questions tailored to a specific job</li>
              <li>All 6 interviewers, every session</li>
              <li>See your progress session to session</li>
            </ul>
            <button className="btn btn-accent btn-sm" style={{ marginTop: "auto" }} disabled={BETA}>
              {BETA ? "Coming soon" : "Get Pro"}
            </button>
          </div>
        </div>
      </section>

      <section className="wrap" aria-labelledby="final-title" style={{ paddingBottom: 96 }}>
        <div style={{ padding: "56px 24px", borderRadius: 28, background: "var(--ink)", color: "#fff", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
          <h2 id="final-title" className="display" style={{ maxWidth: 640, fontSize: "clamp(1.8rem, 4vw, 2.5rem)", lineHeight: 1.1 }}>
            Your next interviewer will ask a follow-up. Hear it here first.
          </h2>
          <UploadButton variant="light" />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
