import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import kioskHero from "../assets/ask-kiosk-hero.png";

/* ---- tiny inline SVG icon set ---- */
const Icon = {
  qr: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M20 14v.01M14 20h3M20 17v4" />
    </svg>
  ),
  cloud: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.7 1.4A4 4 0 0 0 6 18h11Z" />
      <path d="M12 14v-4M9 12l3-3 3 3" />
    </svg>
  ),
  card: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 9.5h19M6 14.5h3M12 14.5h2" />
    </svg>
  ),
  printer: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 9V4h10v5" />
      <rect x="3.5" y="9" width="17" height="9" rx="2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
      <circle cx="17" cy="12" r="0.8" fill="currentColor" />
    </svg>
  ),
  clock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </svg>
  ),
  refresh: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  ),
  pin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  palette: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3a9 9 0 1 0 6 15.7c1.3-1.1.3-3-1.4-3H15a2 2 0 0 1-2-2 2 2 0 0 1 2-2h2c1.7 0 3-1.3 3-3 0-3.3-3.6-5.7-8-5.7Z" />
      <circle cx="7" cy="11" r="1" fill="currentColor" />
      <circle cx="9" cy="7" r="1" fill="currentColor" />
      <circle cx="14" cy="6.5" r="1" fill="currentColor" />
    </svg>
  ),
  phone: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  ),
  zap: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  play: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7-11-7Z" />
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
};

function Brand() {
  return (
    <div className="lp2-brand">
      <span className="lp2-brand-icon">
        <Icon.printer width={18} height={18} />
      </span>
      <span className="lp2-brand-text">
        <b>ASK</b> <span style={{ opacity: 0.75 }}>Kiosk</span>
      </span>
    </div>
  );
}

export default function LandingPage() {
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const steps = [
    { n: "01", title: "Scan", desc: "Scan the QR on the kiosk with your phone camera.", icon: <Icon.qr width={56} height={56} /> },
    { n: "02", title: "Upload", desc: "Pick your file and choose color, copies and sides.", icon: <Icon.cloud width={56} height={56} /> },
    { n: "03", title: "Pay", desc: "Pay securely via UPI, card or wallet. You get a 6-digit code.", icon: <Icon.card width={56} height={56} /> },
    { n: "04", title: "Print", desc: "Enter the code on the kiosk and collect your prints.", icon: <Icon.printer width={56} height={56} /> },
  ];

  const features = [
    { title: "24x7 Available", desc: "Print anytime, any day.", icon: <Icon.clock width={28} height={28} /> },
    { title: "Secure & Private", desc: "Files deleted after print.", icon: <Icon.shield width={28} height={28} /> },
    { title: "Auto Refund", desc: "Refund if not printed in time.", icon: <Icon.refresh width={28} height={28} /> },
    { title: "Print Anywhere", desc: "Use your code at any kiosk.", icon: <Icon.pin width={28} height={28} /> },
    { title: "Color or B&W", desc: "Single/Double sided, copies & more.", icon: <Icon.palette width={28} height={28} /> },
  ];

  const flow = [
    { label: "Scan", icon: <Icon.qr width={18} height={18} /> },
    { label: "Upload", icon: <Icon.cloud width={18} height={18} /> },
    { label: "Pay", icon: <Icon.card width={18} height={18} /> },
    { label: "Print", icon: <Icon.printer width={18} height={18} /> },
  ];

  return (
    <div className="lp2">
      {/* nav */}
      <header className={"lp2-nav" + (scrolled ? " on" : "")}>
        <div className="lp2-nav-inner">
          <Brand />
          <nav className="lp2-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#operators">For Operators</a>
            <a href="#faq">FAQ</a>
          </nav>
          <button className="lp2-login" onClick={() => nav("/login")}>
            Operator Login <Icon.arrow width={14} height={14} />
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="lp2-hero">
        <div className="lp2-grid-bg" />
        <div className="lp2-glow lp2-glow-1" />
        <div className="lp2-glow lp2-glow-2" />

        <div className="lp2-hero-inner">
          <div className="lp2-hero-text">
            <div className="lp2-badge">
              <Icon.zap width={14} height={14} />
              <span>Self-Service Print Stations</span>
            </div>
            <h1 className="lp2-h1">
              Print Smarter. <br />
              <span className="lp2-h1-grad">Skip the Queue.</span>
            </h1>
            <p className="lp2-sub">
              Scan, upload, pay and print in less than a minute.
              Any document. Any time. Any kiosk.
            </p>

            <div className="lp2-chips">
              <span className="lp2-chip"><Icon.phone width={14} height={14} /> No App</span>
              <span className="lp2-chip"><Icon.zap width={14} height={14} /> No Signup</span>
              <span className="lp2-chip"><Icon.shield width={14} height={14} /> 100% Secure</span>
            </div>

            <div className="lp2-cta">
              <button className="lp2-btn-primary" onClick={() => nav("/login")}>
                Operator Login <Icon.arrow width={16} height={16} />
              </button>
              <a className="lp2-btn-play" href="#how">
                <span className="lp2-play"><Icon.play width={14} height={14} /></span>
                See How It Works
              </a>
            </div>
          </div>

          <div className="lp2-hero-visual">
            <img src={kioskHero} alt="ASK Kiosk" className="lp2-hero-img" />
            <div className="lp2-flow">
              {flow.map((s, i) => (
                <React.Fragment key={s.label}>
                  <div className="lp2-flow-item">
                    <span className="lp2-flow-icon">{s.icon}</span>
                    <span>{s.label}</span>
                  </div>
                  {i < flow.length - 1 && <div className="lp2-flow-sep" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* features strip */}
        <div className="lp2-features-strip">
          {features.map((f) => (
            <div className="lp2-feat" key={f.title}>
              <span className="lp2-feat-icon">{f.icon}</span>
              <div>
                <div className="lp2-feat-title">{f.title}</div>
                <div className="lp2-feat-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="lp2-section" id="how">
        <div className="lp2-section-inner">
          <h2 className="lp2-h2">How It Works</h2>
          <div className="lp2-h2-line" />
          <div className="lp2-steps">
            {steps.map((s, i) => (
              <React.Fragment key={s.n}>
                <div className="lp2-step">
                  <div className="lp2-step-num">{s.n}</div>
                  <div className="lp2-step-icon">{s.icon}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
                {i < steps.length - 1 && <div className="lp2-step-arrow"><Icon.arrow width={18} height={18} /></div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* trust strip (honest, neutral statements; no fake numbers) */}
      <section className="lp2-section" id="features">
        <div className="lp2-section-inner lp2-trust-strip">
          <TrustItem title="Self-Service" desc="No staff needed. The kiosk runs itself." />
          <TrustItem title="Documents Made Easy" desc="PDF or image. Single or multiple files." />
          <TrustItem title="Pay Securely" desc="UPI, cards, wallets, all via Razorpay." />
          <TrustItem title="24x7 Available" desc="Always on. Day or night." />
        </div>
      </section>

      {/* operator cta */}
      <section className="lp2-op" id="operators">
        <div className="lp2-op-inner">
          <div className="lp2-op-visual">
            <img src={kioskHero} alt="ASK Kiosk" />
          </div>
          <div className="lp2-op-text">
            <div className="lp2-badge dark">FOR OPERATORS</div>
            <h2 className="lp2-h2 lp2-h2-left">
              Own. Place. <span className="lp2-h1-grad">Earn.</span>
            </h2>
            <p className="lp2-sub lp2-sub-left">
              Place an ASK Kiosk at high-traffic locations, set your prices and start earning passively.
              We handle the technology.
            </p>
            <button className="lp2-btn-primary mt-4" onClick={() => nav("/login")}>
              Operator Login <Icon.arrow width={16} height={16} />
            </button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="lp2-foot">
        <div className="lp2-foot-inner">
          <Brand />
          <p className="lp2-foot-tag">Self service print stations.</p>
          <p className="lp2-foot-copy">© {new Date().getFullYear()} ASK Kiosk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function TrustItem({ title, desc }) {
  return (
    <div className="lp2-trust">
      <div className="lp2-trust-title">{title}</div>
      <div className="lp2-trust-desc">{desc}</div>
    </div>
  );
}
