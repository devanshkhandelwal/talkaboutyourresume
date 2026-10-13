import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { PixelScene } from "@/components/PixelScene";
import { AnswerExample } from "@/components/RoleExamples";
import { UploadButton } from "@/components/UploadButton";
import { FREE_MINUTES, PRO_MINUTES, PRO_PRICE } from "@/lib/config";
import "./home.css";

export default function Home() {
  return (
    <div className="home">
      <SiteHeader
        right={
          <nav className="nav" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
        }
      />

      <main id="top">
        {/* Full-screen illustrated scene with the headline over the sky, like a window onto your desk. */}
        <section className="home-hero" aria-labelledby="hero-title">
          <PixelScene />
          <div className="home-hero-shade" aria-hidden />
          <div className="home-hero-copy">
            <h1 id="hero-title" className="home-h1">
              Practice the <span className="nowrap">follow-up</span> questions on your own resume
            </h1>
            <p className="home-lede">
              Upload your resume and talk with an AI interviewer that asks about what you actually wrote. Then see which answers held up.
            </p>
            <div className="home-cta-row">
              <UploadButton />
              <a href="#how" className="glass-btn">
                See an example
              </a>
            </div>
          </div>

          {/* Glassy pieces of the product floating over the scene. Decorative; the real flow is below. */}
          <div className="hero-float" aria-hidden>
            <div className="glass float-q">
              <span className="float-label">The Hiring Manager asks</span>
              &ldquo;What was it before, and what did you change first?&rdquo;
            </div>
            <div className="glass float-status">
              <span className="live-dot" />
              Listening
              <span className="bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="float-chips">
              <span className="chip-tag tag-strong">Strong</span>
              <span className="chip-tag tag-detail">Needs detail</span>
              <span className="chip-tag tag-vague">Vague</span>
            </div>
          </div>
        </section>

        <section id="how" className="wrap home-section" aria-labelledby="answers-title">
          <h2 id="answers-title" className="home-h2">
            Same experience, two answers
          </h2>
          <p className="home-sub">The interviewer digs into one line of your resume. Practice turns a vague answer into one with a starting point, what you did, and the result.</p>
          <AnswerExample />
        </section>

        <section id="pricing" className="wrap home-section" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="home-h2">
            Pricing
          </h2>
          <div className="pricing">
            <div className="plan">
              <h3 className="plan-name">Free</h3>
              <p className="plan-price">$0</p>
              <ul>
                <li>One practice interview with any interviewer</li>
                <li>Up to {FREE_MINUTES} minutes</li>
                <li>Feedback on every answer, plus the transcript</li>
                <li>A retry of your weakest answer</li>
              </ul>
            </div>
            <div className="plan">
              <h3 className="plan-name">
                Pro <span className="chip-tag tag-soon">Coming soon</span>
              </h3>
              <p className="plan-price">
                ${PRO_PRICE} <small>a month</small>
              </p>
              <ul>
                <li>{PRO_MINUTES} minutes of practice a month</li>
                <li>Questions tailored to a specific job</li>
                <li>All six interviewers</li>
                <li>Your progress from one session to the next</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="home-close" aria-labelledby="close-title">
          <div className="home-close-inner">
            <h2 id="close-title" className="home-h2 on-scene">
              Your next interviewer will ask a <span className="nowrap">follow-up</span>. Hear it here first.
            </h2>
            <UploadButton />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
