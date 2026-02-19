import { useState } from 'react';
import { Link } from 'react-router-dom';
import LandingNav from '../components/LandingNav';
import './Landing.css';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: 'Culturally Adapted AI',
    desc: 'Rafiki understands Kenyan workplace culture, speaks English, Swahili, and Sheng.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Anonymous & Private',
    desc: 'No names, no emails required. Conversations are encrypted and confidential.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    title: 'Organization Customization',
    desc: "Tailored to your company's values, culture, EAP, and policies.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: '24/7 Availability',
    desc: 'Always-on support \u2014 no appointments, no waiting rooms, no business hours.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: 'HR Analytics Dashboard',
    desc: 'Anonymized workforce wellbeing insights with n\u226520 cohort privacy gating.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Kenya DPA Compliant',
    desc: 'Built from the ground up for Kenya Data Protection Act 2019 compliance.',
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
    tier: 'Starter',
    price: 'KES 200',
    period: '/employee/mo',
    features: [
      'AI chat support',
      'Daily check-ins',
      'Crisis detection',
      'Swahili + English',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    tier: 'Professional',
    price: 'KES 500',
    period: '/employee/mo',
    features: [
      'Everything in Starter',
      'HR analytics dashboard',
      'EAP integration',
      'Org customization',
    ],
    cta: 'Get Started',
    highlighted: true,
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    features: [
      'Everything in Professional',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
    cta: 'Contact Us',
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
              Employee Login
            </Link>
            <Link to="/admin/login" className="landing-hero__btn-admin">
              HR Admin Portal
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
        <h2 className="landing-section__heading">Powerful Features for Modern Workplaces</h2>
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
            <span className="landing-metric__value">100%</span>
            <span className="landing-metric__label">Anonymous & Private</span>
          </div>
          <div className="landing-metric">
            <span className="landing-metric__value">3</span>
            <span className="landing-metric__label">Languages Supported</span>
          </div>
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="pricing" className="landing-pricing">
        <h2 className="landing-section__heading">Simple, Transparent Pricing</h2>
        <p className="landing-section__subtitle">
          Designed to be accessible for organizations of all sizes
        </p>
        <div className="landing-pricing__row">
          {PRICING.map((p) => (
            <div
              key={p.tier}
              className={`landing-pricing-card${p.highlighted ? ' landing-pricing-card--highlighted' : ''}`}
            >
              {p.highlighted && <span className="landing-pricing-card__badge">Most Popular</span>}
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
              <Link
                to="/login"
                className={`landing-pricing-card__cta${p.highlighted ? ' landing-pricing-card__cta--primary' : ''}`}
              >
                {p.cta}
              </Link>
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
        <Link to="/login" className="landing-cta-banner__btn">
          Get Started Free
        </Link>
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
            <Link to="/admin/login" className="landing-footer__admin-link">HR Admin Login</Link>
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
