import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LandingNav from '../components/LandingNav';
import './Landing.css';

/* ── Data ── */
const PROOF_PILLS = [
  { icon: '⏱️', text: 'Reduce repetitive HR questions' },
  { icon: '💬', text: '24/7 employee support' },
  { icon: '📂', text: 'Secure document & policy access' },
  { icon: '🌍', text: 'Built for growing teams' },
];

const PROBLEM_POINTS = [
  { stat: '68%', label: 'of HR time', desc: 'spent answering the same questions repeatedly' },
  { stat: '3×', label: 'more likely', desc: 'employees disengage when support is slow or inaccessible' },
  { stat: '40%', label: 'of managers', desc: 'lack the tools to support their team\'s wellbeing effectively' },
];

const SOLUTION_FEATURES = [
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>), title: 'AI-Powered HR Chat', desc: 'Employees get instant, accurate answers to HR questions 24/7 — without a ticket.', accent: '#8b5cf6' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>), title: 'Policy & Knowledge Base', desc: 'Centralize company policies, guides, and resources. Always up to date, always findable.', accent: '#1fbfb8' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>), title: 'Wellbeing Analytics', desc: 'Anonymized sentiment trends give HR teams real insight without exposing individual data.', accent: '#3b82f6' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>), title: 'Manager Enablement', desc: 'Give managers coaching tools, team analytics, and HR guidance in one place.', accent: '#fbbf24' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>), title: 'Crisis Detection & Safety', desc: 'Real-time safety screening with professional resource routing, built into the support flow.', accent: '#f87171' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>), title: 'Privacy by Design', desc: 'End-to-end encryption, anonymous chat, n≥20 cohort gating. Employees trust it because it is trustworthy.', accent: '#34d399' },
];

const ALL_FEATURES = [
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>), title: 'Payroll Management', desc: 'Payslip uploads, templates, and employee self-service document vault.', accent: '#34d399' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>), title: 'Objectives & OKRs', desc: 'Set, track, and review employee objectives across the organisation.', accent: '#fbbf24' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>), title: 'Calendar & Scheduling', desc: 'Shared team calendar with event management and meeting scheduling.', accent: '#3b82f6' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg>), title: 'Leave Management', desc: 'Digital leave applications with approval workflows and balance tracking.', accent: '#f59e0b' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>), title: 'Timesheets', desc: 'Time tracking with manager and HR approval workflows.', accent: '#ec4899' },
  { icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>), title: 'Guided Learning Paths', desc: 'Structured wellbeing and professional development modules.', accent: '#8b5cf6' },
];

const PORTALS = [
  { title: 'Employees', emoji: '🧑‍💼', items: ['AI Chat support', 'Document vault', 'Objectives & goals', 'Calendar & leave', 'Timesheets', 'Wellbeing check-ins'] },
  { title: 'HR Teams', emoji: '⚙️', items: ['Analytics dashboard', 'Payroll management', 'Policy knowledge base', 'Wellbeing insights', 'Leave & headcount', 'Audit & compliance'] },
  { title: 'Managers', emoji: '📈', items: ['Team overview', 'Coaching AI', 'HR toolkit', 'Performance tracking', 'Team timesheets'] },
];

const TRUST_ITEMS = [
  { icon: '🔒', title: 'End-to-end encryption', desc: 'All conversations and documents are encrypted in transit and at rest.' },
  { icon: '🕵️', title: 'Anonymous by default', desc: 'Employee chat is fully anonymous. HR only sees aggregated, anonymized insights.' },
  { icon: '👥', title: 'Cohort gating', desc: 'Analytics only surface when group size is ≥20, preventing individual identification.' },
  { icon: '🛡️', title: 'Role-based access', desc: 'Granular permissions for employees, managers, HR admins, and super admins.' },
  { icon: '📋', title: 'Audit trails', desc: 'Full audit log of admin actions for compliance and accountability.' },
  { icon: '🌐', title: 'Data residency controls', desc: 'Control where your organisation\'s data is stored and processed.' },
];

const TESTIMONIALS = [
  { quote: 'Rafiki cut our HR ticket volume significantly. Employees get answers instantly and our team can focus on higher-value work.', name: 'Sarah M.', role: 'HR Director, Financial Services' },
  { quote: 'The anonymous wellbeing data finally gave us real signal on how our teams were doing. We acted on it within weeks.', name: 'James K.', role: 'People & Culture Lead, Technology' },
  { quote: "The privacy architecture was what sold our legal team. Employees trust it, and that trust shows up in the engagement data.", name: 'Amina W.', role: 'CEO, Mid-size Enterprise' },
];

const FAQ_ITEMS = [
  { q: 'How does Rafiki protect employee privacy?', a: 'All conversations are encrypted and anonymous. HR teams only see aggregate insights with a minimum cohort size of 20 — no individual data is ever exposed. Employees can speak freely knowing their identity is never linked to their messages.' },
  { q: 'How long does deployment take?', a: 'Most organisations are up and running within a day. Configure your org settings, upload your policies, and share the access code with your team.' },
  { q: 'Is Rafiki a replacement for therapy or an EAP?', a: 'No. Rafiki is a daily support layer for the majority of employees who need quick answers and a place to be heard. For clinical needs, Rafiki routes employees to your EAP and professional resources.' },
  { q: 'What languages does Rafiki support?', a: 'Rafiki currently supports English as the primary interface language, with multilingual support available for enterprise customers. Contact us to discuss your requirements.' },
  { q: 'Can we customise the knowledge base with our own policies?', a: 'Yes. HR admins can upload and manage company-specific documents, policies, and guides. The AI uses your content to answer employee questions accurately.' },
  { q: "What's the minimum team size?", a: 'Rafiki works for organisations of any size. Wellbeing analytics become available once your team reaches 20 members, ensuring individual anonymity.' },
];

function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.08 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function Reveal({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={`lp-reveal ${visible ? 'lp-reveal--in' : ''} ${className}`} style={{ '--lp-delay': delay + 'ms' }}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <div className="landing">
      <LandingNav />

      {/* ══════════════════════════════════════
          1. HERO
      ══════════════════════════════════════ */}
      <section className="landing-hero landing-hero--v2">
        <div className="landing-hero__content">
          <div className="lp-hero-badge">
            <span className="lp-hero-badge__dot" />
            AI-powered HR platform for modern teams
          </div>
          <h1 className="landing-hero__heading">
            AI-powered HR and<br />
            <span className="lp-gradient-text">employee support</span><br />
            for modern teams
          </h1>
          <p className="landing-hero__subtitle">
            Rafiki helps employees get instant answers, access company resources, and feel supported —
            while HR teams save time and scale care across the organisation.
          </p>
          <div className="landing-hero__ctas">
            <a href="mailto:hr@rafikihr.com?subject=Book a Demo — Rafiki@Work" className="landing-hero__btn-primary lp-btn-arrow">
              Book a demo
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
            <a href="#demo" className="landing-hero__btn-outline" onClick={e=>{e.preventDefault();document.querySelector('#demo')?.scrollIntoView({behavior:'smooth'});}}>
              See how it works
            </a>
          </div>
          <div className="lp-proof-pills">
            {PROOF_PILLS.map(p => (
              <div key={p.text} className="lp-proof-pill">
                <span>{p.icon}</span>
                <span>{p.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-hero__visual lp-hero-visual-v2">
          <img src="/hero-meeting.png" alt="Team collaborating" className="lp-hero-main-img" />
          <div className="lp-hero-card-wrap">
            <div className="lp-hero-card lp-hero-card--shadow" />
            <div className="lp-hero-card">
              <div className="lp-chat-header">
                <div className="lp-chat-avatar">R</div>
                <div className="lp-chat-info">
                  <span className="lp-chat-name">Rafiki AI</span>
                  <span className="lp-chat-status"><span className="lp-chat-dot" />Online now</span>
                </div>
              </div>
              <div className="lp-chat-msgs">
                <div className="lp-chat-bubble lp-chat-bubble--user">How many days of annual leave do I have left?</div>
                <div className="lp-chat-bubble lp-chat-bubble--ai">You have <strong>12 days</strong> remaining for this year. Would you like to submit a leave request?</div>
                <div className="lp-chat-bubble lp-chat-bubble--user">Yes, I need next Friday off</div>
                <div className="lp-chat-bubble lp-chat-bubble--ai">Done — leave request submitted for Friday 14 March. Your manager will be notified. ✓</div>
              </div>
            </div>
            <div className="lp-hero-chip">
              <div className="lp-hero-chip__label">HR time saved this week</div>
              <div className="lp-hero-chip__row">
                <span className="lp-hero-chip__val">14h</span>
                <span className="lp-hero-chip__delta">↑ 23% vs last week</span>
              </div>
              <div className="lp-hero-chip__bar"><div className="lp-hero-chip__fill" /></div>
            </div>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════
          DEMO SHOWCASE
      ══════════════════════════════════════ */}
      <section className="lp-demo-section" id="demo">
        <Reveal>
          <p className="lp-eyebrow-label">Live Demo</p>
          <h2 className="landing-section__heading">See how it works</h2>
          <p className="landing-section__subtitle">Explore the platform through the eyes of an employee, HR admin, or manager. No sign-up required.</p>
        </Reveal>
        <div className="lp-demo-tabs">
          <Link to="/demo/employee" className="lp-demo-tab">
            <span className="lp-demo-tab__emoji">🧑‍💼</span>
            <span className="lp-demo-tab__title">Employee Portal</span>
            <span className="lp-demo-tab__desc">AI chat, documents, leave, objectives, calendar</span>
            <span className="lp-demo-tab__cta">Try employee demo →</span>
          </Link>
          <Link to="/demo/hr" className="lp-demo-tab lp-demo-tab--hr">
            <span className="lp-demo-tab__emoji">⚙️</span>
            <span className="lp-demo-tab__title">HR Admin Portal</span>
            <span className="lp-demo-tab__desc">Analytics, payroll, employees, wellbeing insights</span>
            <span className="lp-demo-tab__cta">Try HR demo →</span>
          </Link>
          <Link to="/demo/manager" className="lp-demo-tab lp-demo-tab--mgr">
            <span className="lp-demo-tab__emoji">📈</span>
            <span className="lp-demo-tab__title">Manager Portal</span>
            <span className="lp-demo-tab__desc">Team overview, coaching AI, timesheets, HR toolkit</span>
            <span className="lp-demo-tab__cta">Try manager demo →</span>
          </Link>
        </div>
        <p className="lp-demo-note">All demo data is fictional. No account needed.</p>
      </section>

      {/* ══════════════════════════════════════
          2. TRUST BAR
      ══════════════════════════════════════ */}
      <section className="landing-trusted lp-trust-bar">
        <p className="landing-trusted__text">Trusted by HR teams at growing organisations worldwide</p>
        <div className="landing-trusted__logos">
          {['Series A · Fintech','Series B · SaaS','PE-backed · Retail','Growth · Healthcare','Enterprise · Logistics'].map(name => (
            <span key={name} className="landing-trusted__logo">{name}</span>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          3. PROBLEM
      ══════════════════════════════════════ */}
      <section className="lp-problem" id="problem">
        <div className="lp-problem__inner">
          <Reveal>
            <p className="lp-eyebrow-label">The Problem</p>
            <h2 className="landing-section__heading">HR teams are overwhelmed.<br />Employees are underserved.</h2>
            <p className="landing-section__subtitle">The same questions. The slow ticket queues. The managers who don't have the tools. Rafiki fixes that.</p>
          </Reveal>
          <div className="lp-problem__stats">
            {PROBLEM_POINTS.map((p, i) => (
              <Reveal key={p.stat} delay={i * 80} className="lp-problem-stat">
                <span className="lp-problem-stat__num">{p.stat}</span>
                <span className="lp-problem-stat__label">{p.label}</span>
                <p className="lp-problem-stat__desc">{p.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          4. SOLUTION
      ══════════════════════════════════════ */}
      <section className="lp-solution" id="features">
        <div className="lp-solution__inner">
          <Reveal>
            <p className="lp-eyebrow-label">The Solution</p>
            <h2 className="landing-section__heading">One platform. Every touchpoint.</h2>
            <p className="landing-section__subtitle">Rafiki connects employees, managers, and HR teams in a single intelligent workspace.</p>
          </Reveal>
          <div className="lp-solution__grid">
            {SOLUTION_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 50} className="landing-feature-card lp-feature-card--v2">
                <div className="landing-feature-card__icon" style={{ '--card-accent': f.accent, color: f.accent, background: f.accent + '18' }}>
                  {f.icon}
                </div>
                <h3 className="landing-feature-card__title">{f.title}</h3>
                <p className="landing-feature-card__desc">{f.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          5. PLATFORM / PORTALS
      ══════════════════════════════════════ */}
      <section className="landing-portals" id="platform">
        <Reveal>
          <p className="lp-eyebrow-label">Platform Overview</p>
          <h2 className="landing-section__heading">Built for every role in your organisation</h2>
          <p className="landing-section__subtitle">Three integrated portals — employees, HR admins, and managers all get purpose-built experiences</p>
        </Reveal>
        <div className="landing-portals__grid">
          {PORTALS.map((p, i) => (
            <Reveal key={p.title} delay={i * 80} className="landing-portal-card lp-portal-card--v2">
              <div className="lp-portal-card-top">
                <span className="lp-portal-emoji">{p.emoji}</span>
                <h3 className="landing-portal-card__title">{p.title}</h3>
              </div>
              <ul className="landing-portal-card__list">
                {p.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          6. ADDITIONAL MODULES
      ══════════════════════════════════════ */}
      <section className="landing-features lp-modules">
        <Reveal>
          <p className="lp-eyebrow-label">Everything Included</p>
          <h2 className="landing-section__heading">All the HR tools your team needs</h2>
          <p className="landing-section__subtitle">No integrations to stitch together. No extra subscriptions.</p>
        </Reveal>
        <div className="landing-features__grid">
          {ALL_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 40} className="landing-feature-card lp-feature-card--v2">
              <div className="landing-feature-card__icon" style={{ '--card-accent': f.accent, color: f.accent, background: f.accent + '18' }}>
                {f.icon}
              </div>
              <h3 className="landing-feature-card__title">{f.title}</h3>
              <p className="landing-feature-card__desc">{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          7. HOW IT WORKS
      ══════════════════════════════════════ */}
      <section id="how-it-works" className="landing-steps">
        <Reveal>
          <p className="lp-eyebrow-label">Getting Started</p>
          <h2 className="landing-section__heading">Up and running in a day</h2>
        </Reveal>
        <div className="landing-steps__row">
          {[
            { num:'1', title:'Configure your workspace', desc:'Set up your org, upload your policies and documents, and configure your HR settings.' },
            { num:'2', title:'Invite your team', desc:'Employees join with a simple link or org code. No personal data required to get started.' },
            { num:'3', title:'HR saves time from day one', desc:'Employees self-serve answers, managers get insights, and HR focuses on what matters.' },
          ].map((s, i) => (
            <Reveal key={s.num} delay={i * 100} className="landing-step-card">
              <div className="landing-step-card__num">{s.num}</div>
              <h3 className="landing-step-card__title">{s.title}</h3>
              <p className="landing-step-card__desc">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          8. METRICS STRIP
      ══════════════════════════════════════ */}
      <section className="landing-metrics">
        <div className="landing-metrics__row">
          {[['24/7','Employee support'],['12+','HR modules'],['<1 day','Time to deploy'],['100%','Data encrypted']].map(([v,l]) => (
            <div key={l} className="landing-metric">
              <span className="landing-metric__value">{v}</span>
              <span className="landing-metric__label">{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          9. SECURITY & TRUST
      ══════════════════════════════════════ */}
      <section className="lp-security" id="security">
        <div className="lp-security__inner">
          <Reveal>
            <p className="lp-eyebrow-label">Security & Compliance</p>
            <h2 className="landing-section__heading">Enterprise-ready from day one</h2>
            <p className="landing-section__subtitle">HR software handles sensitive data. Rafiki is built with that responsibility at its core.</p>
          </Reveal>
          <div className="lp-security__grid">
            {TRUST_ITEMS.map((t, i) => (
              <Reveal key={t.title} delay={i * 50} className="lp-trust-card">
                <span className="lp-trust-card__icon">{t.icon}</span>
                <h3 className="lp-trust-card__title">{t.title}</h3>
                <p className="lp-trust-card__desc">{t.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          10. TESTIMONIALS
      ══════════════════════════════════════ */}
      <section className="landing-testimonials">
        <Reveal>
          <p className="lp-eyebrow-label">Social Proof</p>
          <h2 className="landing-section__heading">Trusted by HR leaders</h2>
        </Reveal>
        <div className="landing-testimonials__row">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 80} className="landing-testimonial-card lp-testimonial-card--v2">
              <div className="lp-testimonial-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
              <p className="landing-testimonial-card__quote">&ldquo;{t.quote}&rdquo;</p>
              <div className="landing-testimonial-card__author">
                <div className="landing-testimonial-card__avatar">{t.name.charAt(0)}</div>
                <div>
                  <strong className="landing-testimonial-card__name">{t.name}</strong>
                  <span className="landing-testimonial-card__role">{t.role}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          11. PRICING (gated)
      ══════════════════════════════════════ */}
      <section className="lp-pricing-gated" id="pricing">
        <Reveal>
          <p className="lp-eyebrow-label">Pricing</p>
          <h2 className="landing-section__heading">Simple, transparent pricing</h2>
          <p className="landing-section__subtitle">Full platform access. No per-module fees. No surprises.</p>
        </Reveal>
        <div className="lp-pricing-gated__cards">
          <Reveal className="lp-pg-card lp-pg-card--standard">
            <div className="lp-pg-card__badge">Most Popular</div>
            <h3 className="lp-pg-card__tier">Standard</h3>
            <div className="lp-pg-card__price">
              <span className="lp-pg-card__amount">$10</span>
              <span className="lp-pg-card__period">/user/month</span>
            </div>
            <p className="lp-pg-card__note">For teams up to 50 employees</p>
            <ul className="lp-pg-card__features">
              {['Full platform access','AI chat & crisis detection','Wellbeing analytics','Payroll & objectives','Calendar, leave & timesheets','Manager toolkit','Knowledge base & guided paths'].map(f => <li key={f}>{f}</li>)}
            </ul>
            <Link to="/login" className="lp-pg-card__cta lp-pg-card__cta--primary">Get started</Link>
          </Reveal>
          <Reveal delay={100} className="lp-pg-card lp-pg-card--enterprise">
            <h3 className="lp-pg-card__tier">Enterprise</h3>
            <div className="lp-pg-card__price">
              <span className="lp-pg-card__amount">Custom</span>
            </div>
            <p className="lp-pg-card__note">50+ employees · Custom contracts</p>
            <ul className="lp-pg-card__features">
              {['Everything in Standard','Dedicated onboarding','Custom integrations & API','SLA guarantee','Admin controls & audit logs','Data residency options','Priority support'].map(f => <li key={f}>{f}</li>)}
            </ul>
            <a href="mailto:sales@rafikihr.com" className="lp-pg-card__cta">Contact sales</a>
            <p className="lp-pg-card__contact-note">We typically respond within one business day.</p>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════
          12. FAQ
      ══════════════════════════════════════ */}
      <section id="faq" className="landing-faq">
        <Reveal>
          <p className="lp-eyebrow-label">FAQ</p>
          <h2 className="landing-section__heading">Frequently asked questions</h2>
        </Reveal>
        <div className="landing-faq__list">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className={'landing-faq-item' + (openFaq === i ? ' landing-faq-item--open' : '')}>
              <button className="landing-faq-item__question" onClick={() => toggleFaq(i)}>
                <span>{item.q}</span>
                <svg className="landing-faq-item__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className="landing-faq-item__answer"><p>{item.a}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          13. CTA FOOTER
      ══════════════════════════════════════ */}
      <section className="landing-cta-banner">
        <h2 className="landing-cta-banner__heading">Ready to transform how your team works?</h2>
        <p className="landing-cta-banner__subtitle">Book a 30-minute demo and see Rafiki in action with your own use cases.</p>
        <div className="landing-cta-banner__btns">
          <a href="mailto:hr@rafikihr.com?subject=Book a Demo — Rafiki@Work" className="landing-cta-banner__btn">Book a demo</a>
          <Link to="/login" className="landing-cta-banner__btn landing-cta-banner__btn--outline">Log in</Link>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER
      ══════════════════════════════════════ */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__col">
            <div className="landing-footer__brand">
              <img src="/rafiki-logo.png" alt="Rafiki" className="landing-footer__logo" onError={e=>{e.target.style.display='none';}} />
              <span className="landing-footer__brand-name">Rafiki@Work</span>
            </div>
            <p className="landing-footer__tagline">AI-powered HR and employee support for modern teams.</p>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Product</h4>
            <a href="#features" onClick={e=>{e.preventDefault();document.querySelector('#features')?.scrollIntoView({behavior:'smooth'});}}>Features</a>
            <a href="#platform" onClick={e=>{e.preventDefault();document.querySelector('#platform')?.scrollIntoView({behavior:'smooth'});}}>Platform</a>
            <a href="#pricing" onClick={e=>{e.preventDefault();document.querySelector('#pricing')?.scrollIntoView({behavior:'smooth'});}}>Pricing</a>
            <a href="#security" onClick={e=>{e.preventDefault();document.querySelector('#security')?.scrollIntoView({behavior:'smooth'});}}>Security</a>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Company</h4>
            <span>About Shoulder2LeanOn</span>
            <a href="mailto:hr@rafikihr.com?subject=Book a Demo — Rafiki@Work">Book a demo</a>
            <a href="mailto:sales@rafikihr.com">Contact sales</a>
            <Link to="/login">Login</Link>
            <Link to="/super-admin/login">Platform Admin</Link>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Legal</h4>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Data Processing Agreement</span>
          </div>
        </div>
        <div className="landing-footer__bottom">&copy; 2026 Shoulder2LeanOn. All rights reserved.</div>
      </footer>
    </div>
  );
}
