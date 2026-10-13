import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { AnswerExample, ResumeExample } from "@/components/RoleExamples";
import { UploadButton } from "@/components/UploadButton";
import { FREE_MINUTES, PRO_MINUTES, PRO_PRICE } from "@/lib/config";
import "./home.css";

export default function Home() {
  return (
    <div className="home">
      <SiteHeader
        right={
          <nav className="nav" aria-label="Main">
            <a href="#pricing">Pricing</a>
          </nav>
        }
      />

      <main id="top">
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-copy">
            <h1 id="hero-title" className="home-h1">
              Every line on your resume has a <span className="nowrap">follow-up</span> question.
            </h1>
            <p className="home-lede">
              Upload your resume and an AI interviewer asks about what you wrote, out loud. It keeps digging until each answer is specific, then shows you which ones held up.
            </p>
            <UploadButton />
          </div>
          <div className="home-hero-panel">
            <ResumeExample />
          </div>
        </section>

        <section className="wrap home-section" aria-labelledby="answers-title">
          <h2 id="answers-title" className="home-h2">
            Same experience, two answers
          </h2>
          <AnswerExample />
        </section>

        <section id="pricing" className="wrap home-section" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="home-h2" style={{ marginBottom: 32 }}>
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
              <h3 className="plan-name">Pro</h3>
              <p className="plan-price">
                ${PRO_PRICE} <small>a month</small>
              </p>
              <ul>
                <li>{PRO_MINUTES} minutes of practice a month</li>
                <li>Questions tailored to a specific job</li>
                <li>All six interviewers</li>
                <li>Your progress from one session to the next</li>
              </ul>
              <p className="plan-soon">Coming soon</p>
            </div>
          </div>
        </section>

        <section className="wrap home-section home-close" aria-labelledby="close-title">
          <h2 id="close-title" className="home-h2" style={{ margin: 0 }}>
            Your next interviewer will ask a <span className="nowrap">follow-up</span>. Hear it here first.
          </h2>
          <UploadButton />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
