import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Brand({ light }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <span className="font-display font-extrabold tracking-tight text-2xl"
        style={{ color: light ? "#fff" : "#0F1115" }}>ASK</span>
      <span className="font-display font-light text-2xl"
        style={{ color: light ? "#cfe0ff" : "#6B7280" }}>Kiosk</span>
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
    ["Scan", "Scan the QR on the kiosk with your phone camera."],
    ["Upload", "Pick your PDF or photo and choose color, copies and sides."],
    ["Pay", "Pay securely by UPI, card or wallet. You get a 6 digit code."],
    ["Print", "Type the code on the kiosk and collect your prints."],
  ];

  const features = [
    ["No queue, no staff", "Walk up any time. The kiosk runs itself, day or night."],
    ["Pay online, instantly", "UPI, cards and wallets. A code is issued the moment you pay."],
    ["Private by design", "Files are deleted right after printing. Passwords are never stored."],
    ["Auto refund", "If you do not use your code in time, your money comes back automatically."],
    ["Print anywhere", "Your code works at any of that operator's kiosks, not just one."],
    ["Color or B&W", "Single or double sided, multiple copies, page ranges. Your choice."],
  ];

  return (
    <div className="lp">
      {/* nav */}
      <header className={"lp-nav" + (scrolled ? " lp-nav-on" : "")}>
        <div className="lp-nav-inner">
          <Brand />
          <button className="lp-login" onClick={() => nav("/login")}>
            Login
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="lp-hero">
        <div className="lp-hero-bg" />
        <div className="lp-hero-inner">
          <div className="lp-badge fade-up">Self service print stations</div>
          <h1 className="lp-h1 fade-up" style={{ animationDelay: ".05s" }}>
            Print your documents
            <br />
            <span className="lp-h1-accent">without the queue.</span>
          </h1>
          <p className="lp-sub fade-up" style={{ animationDelay: ".12s" }}>
            Scan, upload, pay and print in under a minute. ASK Kiosk turns any
            spot into an unattended, self service printing point.
          </p>
          <div className="lp-cta fade-up" style={{ animationDelay: ".18s" }}>
            <button className="lp-btn-primary" onClick={() => nav("/login")}>
              Operator login
            </button>
            <a className="lp-btn-ghost" href="#how">See how it works</a>
          </div>

          {/* faux kiosk visual */}
          <div className="lp-visual fade-up" style={{ animationDelay: ".24s" }}>
            <div className="lp-screen">
              <div className="lp-screen-top">
                <Brand light />
              </div>
              <div className="lp-screen-body">
                <div className="lp-qr">
                  <div className="lp-qr-grid">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <span key={i} className={Math.random() > 0.45 ? "on" : ""} />
                    ))}
                  </div>
                  <p>Scan to start</p>
                </div>
                <div className="lp-divider"><span>or</span></div>
                <div className="lp-pad">
                  {[1,2,3,4,5,6,7,8,9].map((n) => (<div key={n} className="lp-key">{n}</div>))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="lp-section" id="how">
        <div className="lp-section-inner">
          <h2 className="lp-h2">How it works</h2>
          <p className="lp-lead">Four simple steps. No app to install.</p>
          <div className="lp-steps">
            {steps.map(([t, d], i) => (
              <div className="lp-step" key={t}>
                <div className="lp-step-num">{i + 1}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <h2 className="lp-h2">Why ASK Kiosk</h2>
          <p className="lp-lead">Built to run on its own, and to be pleasant to use.</p>
          <div className="lp-features">
            {features.map(([t, d]) => (
              <div className="lp-feature" key={t}>
                <div className="lp-feature-dot" />
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* operator CTA */}
      <section className="lp-cta-band">
        <div className="lp-cta-band-inner">
          <h2 className="lp-h2" style={{ color: "#fff" }}>
            Run your own print kiosk
          </h2>
          <p className="lp-cta-band-sub">
            Become an ASK Kiosk operator. Place a machine, set your prices, and
            let it earn while you do other things.
          </p>
          <button className="lp-btn-light" onClick={() => nav("/login")}>
            Operator login
          </button>
        </div>
      </section>

      {/* footer */}
      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <Brand />
          <p>Self service print stations.</p>
          <p className="lp-foot-copy">
            &copy; {new Date().getFullYear()} ASK Kiosk. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
