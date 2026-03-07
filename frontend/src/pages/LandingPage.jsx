import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LandingNav from '../components/LandingNav';
import './Landing.css';

const FEATURES = [
  {
    icon: '💬',
    title: 'AI Wellbeing Chat',
    desc: '24/7 culturally adapted AI companion. English, Swahili, and Sheng.',
    color: '#1fbfb8',
  },
  {
    icon: '🛡️',
    title: 'Crisis Detection & Safety',
    desc: 'Real-time safety screening with helpline connections across 7 East African countries.',
    color: '#f87171',
  },
  {
    icon: '📊',
    title: 'Wellbeing Analytics',
    desc: 'Anonymized stress tracking, sentiment analysis, and mental health topic trends for HR.',
    color: '#fbbf24',
  },
  {
    icon: '💰',
    title: 'Payroll Management',
    desc: 'Payslip uploads, templates, and employee self-service document vault.',
    color: '#34d399',
  },
  {
    icon: '🎯',
    title: 'Objectives & OKRs',
    desc: 'Set, track, and manage employee objectives and key results.',
    color: '#8b5cf6',
  },
  {
    icon: '📅',
    title: 'Calendar & Scheduling',
    desc: 'Shared team calendar with event management and meeting scheduling.',
    color: '#3b82f6',
  },
  {
    icon: '🏖️',
    title: 'Leave Management',
    desc: 'Digital leave applications with approval workflows and balance tracking.',
    color: '#f59e0b',
  },
  {
    icon: '⏱️',
    title: 'Timesheets',
    desc: 'Time tracking with manager and HR approval workflows.',
    color: '#ec4899',
  },
  {
    icon: '👥',
    title: 'Manager Toolkit',
    desc: 'Coaching AI, team analytics, and HR toolkit for people managers.',
    color: '#1fbfb8',
  },
  {
    icon: '📚',
    title: 'Knowledge Base',
    desc: 'Organization-specific policies, guides, and resources.',
    color: '#8b5cf6',
  },
  {
    icon: '🌟',
    title: 'Guided Learning Paths',
    desc: 'Structured wellbeing and professional development modules.',
    color: '#fbbf24',
  },
  {
    icon: '🔒',
    title: 'Privacy & Compliance',
    desc: 'Kenya DPA 2019 compliant. Encrypted, anonymous, n≥20 cohort gating.',
    color: '#34d399',
  },
];

const PORTALS = [
  {
    title: 'Employee Portal',
    emoji: '🧑‍💼',
    items: ['AI Chat', 'My Documents', 'Objectives', 'Calendar', 'Leave', 'Timesheets', 'Meetings'],
    gradient: 'linear-gradient(135deg, #8b5cf6, #1fbfb8)',
  },
  {
    title: 'HR Admin Portal',
    emoji: '⚙️',
    items: ['Dashboard', 'Analytics', 'Payroll', 'Employees', 'Knowledge Base', 'Wellbeing', 'Leave Mgmt'],
    gradient: 'linear-gradient(135deg, #1fbfb8, #3b82f6)',
  },
  {
    title: 'Manager Portal',
    emoji: '📈',
    items: ['Team Overview', 'Coaching AI', 'HR Toolkit', 'Calendar', 'Team Timesheets'],
    gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  },
];

const METRICS = [
  { value: '24/7', label: 'Always Available', icon: '🌍' },
  { value: '12+', label: 'HR Modules', icon: '🧩' },
  { value: '3', label: 'Languages', icon: '🗣️' },
  { value: '7', label: 'Countries', icon: '🌍' },
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
    cta: 'Get Started Free',
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
    quote: 'Rafiki transformed how we approach employee wellbeing. The anonymous-first design means employees actually use it.',
    name: 'Sarah M.',
    role: 'HR Director, Financial Services',
    avatar: 'S',
    color: '#8b5cf6',
  },
  {
    quote: 'Finally, a wellbeing tool built for our context. The cultural adaptation makes all the difference.',
    name: 'James K.',
    role: 'People & Culture Lead, Tech',
    avatar: 'J',
    color: '#1fbfb8',
  },
  {
    quote: "The HR analytics give us real insight into team wellbeing without compromising anyone's privacy.",
    name: 'Amina W.',
    role: 'CEO, Mid-size Enterprise',
    avatar: 'A',
    color: '#fbbf24',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does Rafiki protect employee privacy?',
    a: 'All conversations are encrypted and anonymous. HR teams only see aggregate insights with a minimum cohort size of 20 — no individual data is ever exposed.',
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

function useIntersect(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15, ...options });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function AnimSection({ children, className = '', delay = 0 }) {
  const [ref, visible] = useIntersect();
  return (
    <div
      ref={ref}
      className={`anim-section ${visible ? 'anim-visible' : ''} ${className}`}
      style={{ '--delay': `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMouse = (e) => {
      setMousePos({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <div className="landing">
      <LandingNav />

      {/* ===== HERO ===== */}
      <section className="lp-hero">
        <div
          className="lp-hero__orb lp-hero__orb--1"
          style={{ transform: `translate(${mousePos.x * 0.03}px, ${mousePos.y * 0.03}px)` }}
        />
        <div
          className="lp-hero__orb lp-hero__orb--2"
          style={{ transform: `translate(${-mousePos.x * 0.02}px, ${-mousePos.y * 0.02}px)` }}
        />
        <div
          className="lp-hero__orb lp-hero__orb--3"
          style={{ transform: `translate(${mousePos.x * 0.015}px, ${mousePos.y * 0.04}px)` }}
        />
        <div className="lp-hero__noise" />

        <div className="lp-hero__inner">
          <div className="lp-hero__badge">
            <span className="lp-hero__badge-dot" />
            Built for East Africa · Kenya DPA 2019 Compliant
          </div>
          <h1 className="lp-hero__h1">
            <span className="lp-hero__h1-line">Your Workplace</span>
            <span className="lp-hero__h1-gradient">Wellbeing</span>
            <span className="lp-hero__h1-line">Companion</span>
          </h1>
          <p className="lp-hero__sub">
            Culturally adapted, always-on AI support for your employees.
            Private, anonymous, and available 24/7 in English, Swahili & Sheng.
          </p>
          <div className="lp-hero__ctas">
            <Link to="/login" className="lp-btn lp-btn--primary">
              <span>Get Started Free</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link to="/demo/employee" className="lp-btn lp-btn--ghost">
              Try Demo
            </Link>
          </div>
          <div className="lp-hero__stats">
            {METRICS.map((m) => (
              <div key={m.label} className="lp-hero__stat">
                <span className="lp-hero__stat-val">{m.value}</span>
                <span className="lp-hero__stat-label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-hero__visual">
          <div className="lp-hero__card-stack">
            <div className="lp-hero__chat-card lp-hero__chat-card--bg" />
            <div className="lp-hero__chat-card">
              <div className="lp-chat__header">
                <div className="lp-chat__avatar">R</div>
                <div>
                  <div className="lp-chat__name">Rafiki AI</div>
                  <div className="lp-chat__online"><span />Online</div>
                </div>
              </div>
              <div className="lp-chat__messages">
                <div className="lp-chat__bubble lp-chat__bubble--ai">
                  Habari! How are you feeling today? I'm here to listen. 🌟
                </div>
                <div className="lp-chat__bubble lp-chat__bubble--user">
                  Stressed about the project deadline...
                </div>
                <div className="lp-chat__bubble lp-chat__bubble--ai">
                  I hear you. Let's work through this together. What's weighing on you most right now?
                </div>
                <div className="lp-chat__typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
            <div className="lp-hero__metric-card">
              <div className="lp-metric-card__label">Team Wellbeing</div>
              <div className="lp-metric-card__val">82<span>%</span></div>
              <div className="lp-metric-card__bar">
                <div className="lp-metric-card__fill" style={{ width: '82%' }} />
              </div>
              <div className="lp-metric-card__sub">↑ 6% this month</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUSTED ===== */}
      <AnimSection className="lp-trusted">
        <p className="lp-trusted__text">Trusted by forward-thinking organizations across East Africa</p>
        <div className="lp-trusted__logos">
          {['Acme Corp', 'TechVentures', 'SafariBank', 'GreenEnergy Co', 'NairobiTech'].map((name) => (
            <span key={name} className="lp-trusted__logo">{name}</span>
          ))}
        </div>
      </AnimSection>

      {/* ===== FEATURES ===== */}
      <section id="features" className="lp-features">
        <AnimSection>
          <p className="lp-eyebrow">What's Included</p>
          <h2 className="lp-heading">Everything Your Workplace Needs</h2>
          <p className="lp-sub">One platform for wellbeing, HR operations, and people management.</p>
        </AnimSection>
        <div className="lp-features__grid">
          {FEATURES.map((f, i) => (
            <AnimSection key={f.title} delay={i * 40} className="lp-feature-card">
              <div className="lp-feature-card__icon" style={{ '--accent': f.color }}>
                {f.icon}
              </div>
              <h3 className="lp-feature-card__title">{f.title}</h3>
              <p className="lp-feature-card__desc">{f.desc}</p>
              <div className="lp-feature-card__line" style={{ background: f.color }} />
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== PORTALS ===== */}
      <section className="lp-portals">
        <AnimSection>
          <p className="lp-eyebrow">Platform Overview</p>
          <h2 className="lp-heading">Three Portals, One Platform</h2>
          <p className="lp-sub">Tailored experiences for employees, HR admins, and people managers</p>
        </AnimSection>
        <div className="lp-portals__grid">
          {PORTALS.map((p, i) => (
            <AnimSection key={p.title} delay={i * 80} className="lp-portal-card">
              <div className="lp-portal-card__top" style={{ background: p.gradient }}>
                <span className="lp-portal-card__emoji">{p.emoji}</span>
                <h3 className="lp-portal-card__title">{p.title}</h3>
              </div>
              <ul className="lp-portal-card__list">
                {p.items.map((item) => (
                  <li key={item}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="lp-steps">
        <AnimSection>
          <p className="lp-eyebrow">Getting Started</p>
          <h2 className="lp-heading">Up and Running in a Day</h2>
        </AnimSection>
        <div className="lp-steps__row">
          {[
            { num: '01', title: 'Deploy for Your Org', desc: 'Sign up your organization and customize Rafiki for your workplace culture.' },
            { num: '02', title: 'Employees Connect Anonymously', desc: 'Team members join with a simple org code — no personal data required.' },
            { num: '03', title: 'Wellbeing Insights Flow', desc: 'Get anonymized workforce wellbeing trends while employees get 24/7 support.' },
          ].map((s, i) => (
            <AnimSection key={s.num} delay={i * 100} className="lp-step-card">
              <div className="lp-step-card__num">{s.num}</div>
              <h3 className="lp-step-card__title">{s.title}</h3>
              <p className="lp-step-card__desc">{s.desc}</p>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="lp-pricing">
        <AnimSection>
          <p className="lp-eyebrow">Pricing</p>
          <h2 className="lp-heading">Simple, Transparent Pricing</h2>
          <p className="lp-sub">Full platform access at one flat rate — no hidden fees</p>
        </AnimSection>
        <div className="lp-pricing__row">
          {PRICING.map((p, i) => (
            <AnimSection key={p.tier} delay={i * 100} className={`lp-pricing-card${p.highlighted ? ' lp-pricing-card--hi' : ''}`}>
              {p.highlighted && <div className="lp-pricing-card__badge">Most Popular</div>}
              <h3 className="lp-pricing-card__tier">{p.tier}</h3>
              <div className="lp-pricing-card__price">
                <span className="lp-pricing-card__amount">{p.price}</span>
                <span className="lp-pricing-card__period">{p.period}</span>
              </div>
              <p className="lp-pricing-card__note">{p.note}</p>
              <ul className="lp-pricing-card__features">
                {p.features.map((feat) => (
                  <li key={feat}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {feat}
                  </li>
                ))}
              </ul>
              {p.tier === 'Enterprise' ? (
                <a href="mailto:sales@rafikihr.com" className="lp-pricing-card__cta">{p.cta}</a>
              ) : (
                <Link to="/login" className="lp-pricing-card__cta lp-pricing-card__cta--primary">{p.cta}</Link>
              )}
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="lp-testimonials">
        <AnimSection>
          <p className="lp-eyebrow">Social Proof</p>
          <h2 className="lp-heading">What HR Leaders Are Saying</h2>
        </AnimSection>
        <div className="lp-testimonials__grid">
          {TESTIMONIALS.map((t, i) => (
            <AnimSection key={t.name} delay={i * 80} className="lp-testimonial-card">
              <div className="lp-testimonial-card__stars">★★★★★</div>
              <p className="lp-testimonial-card__quote">"{t.quote}"</p>
              <div className="lp-testimonial-card__author">
                <div className="lp-testimonial-card__avatar" style={{ background: t.color }}>{t.avatar}</div>
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.role}</span>
                </div>
              </div>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="lp-faq">
        <AnimSection>
          <p className="lp-eyebrow">FAQ</p>
          <h2 className="lp-heading">Frequently Asked Questions</h2>
        </AnimSection>
        <div className="lp-faq__list">
          {FAQ_ITEMS.map((item, i) => (
            <AnimSection key={i} delay={i * 40} className={`lp-faq-item${openFaq === i ? ' lp-faq-item--open' : ''}`}>
              <button className="lp-faq-item__q" onClick={() => toggleFaq(i)}>
                <span>{item.q}</span>
                <svg className="lp-faq-item__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="lp-faq-item__a"><p>{item.a}</p></div>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <AnimSection className="lp-cta-banner">
        <div className="lp-cta-banner__orb lp-cta-banner__orb--1" />
        <div className="lp-cta-banner__orb lp-cta-banner__orb--2" />
        <p className="lp-eyebrow lp-eyebrow--light">Join Us</p>
        <h2 className="lp-cta-banner__h2">Ready to Support Your<br />Team's Wellbeing?</h2>
        <p className="lp-cta-banner__sub">
          Join organizations across East Africa who are investing in their people.
        </p>
        <div className="lp-cta-banner__btns">
          <Link to="/login" className="lp-btn lp-btn--white">
            <span>Get Started Free</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
          <Link to="/demo/employee" className="lp-btn lp-btn--outline-white">
            Try Demo
          </Link>
        </div>
      </AnimSection>

      {/* ===== FOOTER ===== */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand-col">
            <div className="lp-footer__brand">
              <img src="/rafiki-logo.png" alt="Rafiki" className="lp-footer__logo" onError={e => { e.target.style.display='none'; }} />
              <span className="lp-footer__brand-name">Rafiki@Work</span>
            </div>
            <p className="lp-footer__tagline">Your workplace wellbeing companion.<br />Built for East Africa.</p>
          </div>
          <div className="lp-footer__col">
            <h4>Product</h4>
            <a href="#features" onClick={e => { e.preventDefault(); document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' }); }}>Features</a>
            <a href="#pricing" onClick={e => { e.preventDefault(); document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' }); }}>Pricing</a>
            <a href="#how-it-works" onClick={e => { e.preventDefault(); document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }}>How It Works</a>
          </div>
          <div className="lp-footer__col">
            <h4>Company</h4>
            <span>About Shoulder2LeanOn</span>
            <span>Contact</span>
            <Link to="/login">Login</Link>
            <Link to="/super-admin/login">Platform Admin</Link>
          </div>
          <div className="lp-footer__col">
            <h4>Legal</h4>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
        <div className="lp-footer__bottom">
          <span>© 2026 Shoulder2LeanOn. All rights reserved.</span>
          <span className="lp-footer__badge">🔒 Kenya DPA 2019 Compliant</span>
        </div>
      </footer>
    </div>
  );
}
