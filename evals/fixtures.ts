import type { ResumeProfile } from "@/lib/types";

// Fictional resumes, already parsed into interview topics, so evals test the
// interviewer and not the resume step. `facts` is what the simulated candidate
// actually knows about each claim; whether they share it depends on their style.

export type Fixture = {
  id: string;
  profile: ResumeProfile;
  facts: string;
};

export const FIXTURES: Fixture[] = [
  {
    id: "engineering",
    profile: {
      fileName: "alex_rivera.pdf",
      name: "Alex Rivera",
      headline: "CS junior; software engineering intern at a fintech startup",
      topics: [
        { id: "c1", title: "Checkout speed", claim: "Cut checkout page load time by 40%", probe: "Baseline, how it was measured, what they changed first" },
        { id: "c2", title: "Payments dashboard", claim: "Built a payments dashboard in React used by the support team", probe: "Who used it, what it replaced, their part vs the team's" },
        { id: "c3", title: "Billing tests", claim: "Improved test coverage across the billing service", probe: "Coverage before and after, what they wrote personally" },
        { id: "c4", title: "Campus Eats", claim: "Food ordering app with 1,200 weekly users", probe: "How users were counted, their role, hardest technical problem" },
        { id: "c5", title: "Teaching assistant", claim: "Ran weekly labs for 40 students in Intro to Programming", probe: "A struggling student they helped, what changed" },
      ],
      flags: ["The internship and the TA role overlap in summer 2026"],
    },
    facts: `- Checkout: mobile load was about 3.1 s (Lighthouse + real-user timing). You found three payment scripts loading up front, deferred two, lazy-loaded the card form. It went to about 1.8 s. Your manager suggested looking at scripts; you did the profiling and the change.
- Dashboard: replaced a spreadsheet the 6-person support team exported daily. You built the React front end; a senior engineer built the API. Refund lookups went from about 5 minutes to under 1.
- Billing tests: coverage went from 38% to 61%. You wrote the tests for the invoice proration module (about 40 tests); two teammates did the rest.
- Campus Eats: 1,200 weekly users is distinct accounts placing at least one order per week, from the database, measured in October. You were one of three builders; you did the ordering backend. Hardest problem: double charges when users double-tapped "Pay"; you added idempotency keys.
- TA: one student kept failing loops; you drew traces on paper with them for 3 weeks and they passed the midterm.
- The overlap: the TA role was 4 hours a week, remote, in the evenings.`,
  },
  {
    id: "sales",
    profile: {
      fileName: "jordan_lee.pdf",
      name: "Jordan Lee",
      headline: "Business major; retail sales associate and campus club treasurer",
      topics: [
        { id: "c1", title: "Top seller", claim: "Top seller at an outdoor gear store three months in a row", probe: "What they did differently, how it was measured" },
        { id: "c2", title: "Training new hires", claim: "Trained four new hires on the sales floor", probe: "How they trained them, how they knew it worked" },
        { id: "c3", title: "Club budget", claim: "Managed a $12,000 annual budget as club treasurer", probe: "A hard tradeoff, what they cut or funded" },
        { id: "c4", title: "Sponsorships", claim: "Secured three local sponsors for the club's spring event", probe: "How they found and pitched them, what didn't work" },
        { id: "c5", title: "Customer complaint", claim: "Handled escalated customer returns", probe: "A specific difficult customer and the outcome" },
      ],
      flags: [],
    },
    facts: `- Top seller: ranked #1 of 9 associates by monthly sales June to August. Your trick: before showing products, ask what trip they're planning. Your add-on sales were about 1.9x the store average.
- Training: you shadowed each new hire for two shifts, then had them lead while you watched. Three of the four hit their first monthly target.
- Budget: the $12,000 came from student government. Hardest call: cut the end-of-year banquet from $3,000 to $1,200 to fund travel for a competition.
- Sponsors: emailed 25 local businesses, got 3 yeses (a bike shop, a cafe, a bank branch) worth $2,400 total. Cold emails mostly failed; walking in with a one-page flyer worked.
- Complaint: a customer wanted a refund on a used tent past the window. You offered a repair through the brand's warranty; they left a positive review.`,
  },
  {
    id: "marketing",
    profile: {
      fileName: "sam_patel.pdf",
      name: "Sam Patel",
      headline: "Marketing intern at a local coffee chain; communications major",
      topics: [
        { id: "c1", title: "Instagram growth", claim: "Grew Instagram engagement by 40%", probe: "40% of what, compared to when, what they changed" },
        { id: "c2", title: "Store launch event", claim: "Planned a store launch event for 200 guests", probe: "Budget, what went wrong, how attendance was counted" },
        { id: "c3", title: "Email newsletter", claim: "Relaunched the customer email newsletter", probe: "Open rates before and after, their part" },
        { id: "c4", title: "Survey", claim: "Ran a customer survey with 500 responses", probe: "What they learned and what changed because of it" },
        { id: "c5", title: "Team project", claim: "Led a team of four on a rebranding class project", probe: "A disagreement and how it was resolved" },
      ],
      flags: ["\"Led\" a class project and \"grew\" engagement may overstate an intern's role"],
    },
    facts: `- Instagram: average engagement rate per post went from about 2.0% to 2.8% over three months (that's the 40%). You switched from product photos to short customer videos; your manager approved the plan.
- Launch event: $1,500 budget, 214 people checked in at the door. The speaker cancelled the day before; you replaced it with a latte-art demo by a barista.
- Newsletter: open rate went from 18% to 27%. You rewrote subject lines and cut it to one topic per email; a designer did the template.
- Survey: 512 responses. Biggest finding: people wanted oat milk at no extra charge; two stores trialed it.
- Team project: two teammates disagreed on the logo; you had both test with 10 classmates and went with the data.`,
  },
];

export const PRACTICE_QUESTIONS = ["Tell me about a time you failed.", "Why do you want this kind of role?"];
