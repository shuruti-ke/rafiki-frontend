import { useState } from 'react';
import { Link } from 'react-router-dom';
import LandingNav from '../components/LandingNav';
import './Landing.css';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: 'AI Wellbeing Chat',
    desc: '24/7 culturally adapted AI companion. English, Swahili, and Sheng.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Crisis Detection & Safety',
    desc: 'Real-time safety screening with helpline connections across 7 East African countries.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: 'Wellbeing Analytics',
    desc: 'Anonymized stress tracking, sentiment analysis, and mental health topic trends for HR.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Payroll Management',
    desc: 'Payslip uploads, templates, and employee self-service document vault.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: 'Objectives & OKRs',
    desc: 'Set, track, and manage employee objectives and key results.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Calendar & Scheduling',
    desc: 'Shared team calendar with event management and meeting scheduling.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: 'Leave Management',
    desc: 'Digital leave applications with approval workflows and balance tracking.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Timesheets',
    desc: 'Time tracking with manager and HR approval workflows.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Manager Toolkit',
    desc: 'Coaching AI, team analytics, and HR toolkit for people managers.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    title: 'Knowledge Base',
    desc: 'Organization-specific policies, guides, and resources.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: 'Guided Learning Paths',
    desc: 'Structured wellbeing and professional development modules.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Privacy & Compliance',
    desc: 'Kenya DPA 2019 compliant. Encrypted, anonymous, n\u226520 cohort gating.',
  },
];

const PORTALS = [
  {
    title: 'Employee Portal',
    items: ['AI Chat', 'My Documents', 'Objectives', 'Calendar', 'Leave', 'Timesheets', 'Meetings'],
  },
  {
    title: 'HR Admin Portal',
    items: ['Dashboard', 'Analytics', 'Payroll', 'Employees', 'Knowledge Base', 'Wellbeing', 'Leave Mgmt'],
  },
  {
    title: 'Manager Portal',
    items: ['Team Overview', 'Coaching AI', 'HR Toolkit', 'Calendar', 'Team Timesheets'],
  },
];

const STEPS = [
  {
    num: '1',
    title: 'Deploy for Your Org',
    desc: 'Sign up your organization and customize Rafiki for your workplace culture.',
  },
  {
    num: '2',
    title: 'Employees Connect Anonymously',
    desc: 'Team members join with a simple org code \u2014 no personal data required.',
  },
  {
    num: '3',
    title: 'Wellbeing Insights Flow',
    desc: 'Get anonymized workforce wellbeing trends while employees get 24/7 support.',
  },
];

const PRICING = [
  {
    tier: 'Standard',
    price: '$10',
    period: '/user/month',
    features: [
      'Full platform access',
      'AI chat & crisis detection',
      'Wellbeing analytics',
      'Payroll & objectives',
      'Calendar, leave & timesheets',
      'Manager toolkit',
      'Knowledge base & guided paths',
    ],
    note: 'For teams up to 50 employees',
    cta: 'Get Started',
    highlighted: true,
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    features: [
      'Everything in Standard',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'API access',
    ],
    note: '50+ employees',
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const TESTIMONIALS = [
  {
    quote:
      'Rafiki transformed how we approach employee wellbeing. The anonymous-first design means employees actually use it.',
    name: 'Sarah M.',
    role: 'HR Director, Financial Services',
  },
  {
    quote:
      'Finally, a wellbeing tool built for our context. The cultural adaptation makes all the difference.',
    name: 'James K.',
    role: 'People & Culture Lead, Tech',
  },
  {
    quote:
      "The HR analytics give us real insight into team wellbeing without compromising anyone's privacy.",
    name: 'Amina W.',
    role: 'CEO, Mid-size Enterprise',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does Rafiki protect employee privacy?',
    a: 'All conversations are encrypted and anonymous. HR teams only see aggregate insights with a minimum cohort size of 20 \u2014 no individual data is ever exposed.',
  },
  {
    q: 'What languages does Rafiki support?',
    a: 'Rafiki communicates in English, Swahili, and Sheng, adapting naturally to how your employees speak.',
  },
  {
    q: 'How long does deployment take?',
    a: 'Most organizations are up and running within a day. Just configure your org settings and share the access code with your team.',
  },
  {
    q: 'Is Rafiki a replacement for therapy?',
    a: "No. Rafiki is a daily wellbeing companion for the 80% of employees who aren't in therapy but need support. For clinical needs, Rafiki connects employees to your EAP and professional resources.",
  },
  {
    q: "What's the minimum organization size?",
    a: 'Rafiki works for organizations of any size, with HR analytics available for teams of 20 or more employees.',
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (i) => {
    setOpenFaq(openFaq === i ? null : i);
  };

  return (
    <div className="landing">
      <LandingNav />

      {/* ===== Hero ===== */}
      <section className="landing-hero">
        <div className="landing-hero__content">
          <h1 className="landing-hero__heading">Your Workplace Wellbeing Companion</h1>
          <p className="landing-hero__subtitle">
            Culturally adapted, always-on AI support for your employees. Built for East African
            organizations &mdash; private, anonymous, and available 24/7.
          </p>
          <div className="landing-hero__ctas">
            <Link to="/login" className="landing-hero__btn-primary">
              Get Started
            </Link>
            <Link to="/login" className="landing-hero__btn-outline">
              Login
            </Link>
            <Link to="/demo/employee" className="landing-hero__btn-admin">
              Try Demo
            </Link>
          </div>
        </div>
        <div className="landing-hero__visual">
          <img src="/hero-meeting.png" alt="Team collaborating in a meeting" className="landing-hero__img" />
        </div>
      </section>

      {/* ===== Trusted By ===== */}
      <section className="landing-trusted">
        <p className="landing-trusted__text">
          Trusted by forward-thinking organizations across East Africa
        </p>
        <div className="landing-trusted__logos">
          <span className="landing-trusted__logo">Acme Corp</span>
          <span className="landing-trusted__logo">TechVentures</span>
          <span className="landing-trusted__logo">SafariBank</span>
          <span className="landing-trusted__logo">GreenEnergy Co</span>
          <span className="landing-trusted__logo">NairobiTech</span>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="landing-features">
        <h2 className="landing-section__heading">Everything Your Workplace Needs</h2>
        <div className="landing-features__grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-card__icon">{f.icon}</div>
              <h3 className="landing-feature-card__title">{f.title}</h3>
              <p className="landing-feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Platform Overview ===== */}
      <section className="landing-portals">
        <h2 className="landing-section__heading">Platform Overview</h2>
        <p className="landing-section__subtitle">
          Three integrated portals for employees, HR admins, and managers
        </p>
        <div className="landing-portals__grid">
          {PORTALS.map((p) => (
            <div key={p.title} className="landing-portal-card">
              <h3 className="landing-portal-card__title">{p.title}</h3>
              <ul className="landing-portal-card__list">
                {p.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section id="how-it-works" className="landing-steps">
        <h2 className="landing-section__heading">Get Started in Three Simple Steps</h2>
        <div className="landing-steps__row">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step-card">
              <div className="landing-step-card__num">{s.num}</div>
              <h3 className="landing-step-card__title">{s.title}</h3>
              <p className="landing-step-card__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Metrics ===== */}
      <section className="landing-metrics">
        <div className="landing-metrics__row">
          <div className="landing-metric">
            <span className="landing-metric__value">24/7</span>
            <span className="landing-metric__label">Always Available</span>
          </div>
          <div className="landing-metric">
            <span className="landing-metric__value">12+</span>
            <span className="landing-metric__label">HR Modules</span>
          </div>
          <div className="landing-metric">
            <span className="landing-metric__value">3</span>
            <span className="landing-metric__label">Languages</span>
          </div>
          <div className="landing-metric">
            <span className="landing-metric__value">7</span>
            <span className="landing-metric__label">Countries</span>
          </div>
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="pricing" className="landing-pricing">
        <h2 className="landing-section__heading">Simple, Transparent Pricing</h2>
        <p className="landing-section__subtitle">
          Full platform access at one flat rate
        </p>
        <div className="landing-pricing__row">
          {PRICING.map((p) => (
            <div
              key={p.tier}
              className={`landing-pricing-card${p.highlighted ? ' landing-pricing-card--highlighted' : ''}`}
            >
              {p.highlighted && <span className="landing-pricing-card__badge">Recommended</span>}
              <h3 className="landing-pricing-card__tier">{p.tier}</h3>
              <div className="landing-pricing-card__price">
                <span className="landing-pricing-card__amount">{p.price}</span>
                <span className="landing-pricing-card__period">{p.period}</span>
              </div>
              <ul className="landing-pricing-card__features">
                {p.features.map((feat) => (
                  <li key={feat}>{feat}</li>
                ))}
              </ul>
              {p.note && (
                <p className="landing-pricing-card__note">{p.note}</p>
              )}
              {p.tier === 'Enterprise' ? (
                <a
                  href="mailto:sales@rafikihr.com"
                  className="landing-pricing-card__cta"
                >
                  {p.cta}
                </a>
              ) : (
                <Link
                  to="/login"
                  className="landing-pricing-card__cta landing-pricing-card__cta--primary"
                >
                  {p.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== Testimonials ===== */}
      <section className="landing-testimonials">
        <h2 className="landing-section__heading">What HR Leaders Are Saying</h2>
        <div className="landing-testimonials__row">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="landing-testimonial-card">
              <p className="landing-testimonial-card__quote">&ldquo;{t.quote}&rdquo;</p>
              <div className="landing-testimonial-card__author">
                <div className="landing-testimonial-card__avatar">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <strong className="landing-testimonial-card__name">{t.name}</strong>
                  <span className="landing-testimonial-card__role">{t.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="landing-faq">
        <h2 className="landing-section__heading">Frequently Asked Questions</h2>
        <div className="landing-faq__list">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`landing-faq-item${openFaq === i ? ' landing-faq-item--open' : ''}`}
            >
              <button className="landing-faq-item__question" onClick={() => toggleFaq(i)}>
                <span>{item.q}</span>
                <svg
                  className="landing-faq-item__chevron"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="landing-faq-item__answer">
                <p>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA Banner ===== */}
      <section className="landing-cta-banner">
        <h2 className="landing-cta-banner__heading">
          Ready to Support Your Team&rsquo;s Wellbeing?
        </h2>
        <p className="landing-cta-banner__subtitle">
          Join organizations across East Africa who are investing in their people.
        </p>
        <div className="landing-cta-banner__btns">
          <Link to="/login" className="landing-cta-banner__btn">
            Get Started
          </Link>
          <Link to="/demo/employee" className="landing-cta-banner__btn landing-cta-banner__btn--outline">
            Try Demo
          </Link>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__col">
            <div className="landing-footer__brand">
              <img src="/rafiki-logo.png" alt="Rafiki" className="landing-footer__logo" />
              <span className="landing-footer__brand-name">Rafiki@Work</span>
            </div>
            <p className="landing-footer__tagline">
              Your workplace wellbeing companion. Built for East Africa.
            </p>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Product</h4>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Features
            </a>
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Pricing
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              How It Works
            </a>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Company</h4>
            <span>About Shoulder2LeanOn</span>
            <span>Contact</span>
            <Link to="/login" className="landing-footer__admin-link">Login</Link>
            <Link to="/super-admin/login" className="landing-footer__platform-link">Platform Admin</Link>
          </div>
          <div className="landing-footer__col">
            <h4 className="landing-footer__col-title">Legal</h4>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
        <div className="landing-footer__bottom">
          &copy; 2026 Shoulder2LeanOn. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
