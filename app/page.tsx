"use client";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const headerRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set());

  useEffect(() => {
    function closeMenusOnOutsideClick(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
        setOpenSubmenus(new Set());
      }
    }

    document.addEventListener("pointerdown", closeMenusOnOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOnOutsideClick);
    };
  }, []);

  function isMobileNav() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  const openMoreMenu = (
  event: React.MouseEvent<HTMLAnchorElement>
) => {
  event.preventDefault();

  if (!isMobileNav()) return;

  setMoreOpen((open) => !open);

  if (moreOpen) {
    setOpenSubmenus(new Set());
  }
};

  const openSubmenu = (
  name: string,
  event: React.MouseEvent<HTMLAnchorElement>
) => {
  event.preventDefault();

  if (!isMobileNav()) return;

  setMoreOpen(true);

  setOpenSubmenus((current) => {
    const next = new Set(current);

    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }

    return next;
  });
};

  return (
    <>
      <div id="site-preloader" className="">
        <div className="preloader-spinner-wrapper">
          <div className="custom-spinner">
            <div />
          </div>
          <Image
            src="/assets/logo.png"
            alt="RM Tutoring Services Logo"
            className="preloader-logo"
            width={90}
            height={90}
          />
        </div>
      </div>

      <header className="sticky" ref={headerRef}>
      <div
  className={`nav-overlay ${menuOpen ? "open" : ""}`}
  onClick={() => {
    setMenuOpen(false);
    setMoreOpen(false);
    setOpenSubmenus(new Set());
  }}
/>
        <a href="https://rmtutoringservices.com">
          <Image
            alt="RM Tutoring Services Logo"
            className="logo"
            src="/assets/logo.png"
            width={172}
            height={86}
            priority
          />
        </a>
        <button
          className="hamburger"
          onClick={() => {
  setMenuOpen((open) => {
    const next = !open;

    if (!next) {
      setMoreOpen(false);
      setOpenSubmenus(new Set());
    }

    return next;
  });
}}
          data-ignore-preloader
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          aria-controls="nav-menu"
        >
          ☰
        </button>
        <nav id="nav-menu" className={menuOpen ? "open" : undefined}>
          <ul>
            <li><a href="https://rmtutoringservices.com">Home</a></li>
            <li><a href="https://scheduling.rmtutoringservices.com">Scheduling</a></li>
            <li><a href="https://packages.rmtutoringservices.com">Packages</a></li>
            <li><a href="https://student.rmtutoringservices.com">Dashboard</a></li>
            <li><a href="https://rmtutoringservices.com/pages/about.html">About</a></li>
            <li><a href="https://rmtutoringservices.com/pages/contact.html">Contact</a></li>

            <li className={`dropdown ${moreOpen ? "is-open" : ""}`}>
              <a href="#" onClick={openMoreMenu}>More</a>

              <ul className="dropdown-menu">
                <li className={`dropdown-submenu ${openSubmenus.has("study-guides") ? "open" : ""}`}>
                  <a href="#" onClick={(event) => openSubmenu("study-guides", event)}>Study Guides</a>

                  <ul className="submenu">
                    <li><a href="https://cal3a.study.rmtutoringservices.com/">Calculus 3A</a></li>
                    <li><a href="https://cal3b.study.rmtutoringservices.com/">Calculus 3B</a></li>
                  </ul>
                </li>
                <li className={`dropdown-submenu ${openSubmenus.has("tools") ? "open" : ""}`}>
                  <a href="#" onClick={(event) => openSubmenu("tools", event)}>Tools</a>

                  <ul className="submenu">
                    <li><a href="https://mc.study.rmtutoringservices.com">Multiple Choice Study Tool</a></li>
                    <li><a href="https://projectile-motion.tools.rmtutoringservices.com/">Projectile Motion Tool</a></li>
                    <li><a href="https://riemann-sums.tools.rmtutoringservices.com/">Riemann Sums Tool</a></li>
                    <li><a href="https://stokes-theorem.tools.rmtutoringservices.com/">Stokes&apos; Theorem Tool</a></li>
                    <li><a href="https://newtons-law-of-cooling.tools.rmtutoringservices.com/">Newton&apos;s Law of Cooling Tool</a></li>
                    <li><a href="https://coupled-harmonic-osscilator.tools.rmtutoringservices.com/">Coupled Harmonic Oscillator Tool</a></li>
                    <li><a href="https://graph.tools.rmtutoringservices.com/">Graph Generator Tool</a></li>
                    <li><a href="https://jeopardy.rmtutoringservices.com/">Jeopardy Review Tool</a></li>
                    <li><a href="https://analysis.rmtutoringservices.com/">Item Analysis Tool</a></li>
                  </ul>
                </li>
                <li><a href="https://rmtutoringservices.com/pages/resource-center.html">Resource Center</a></li>
                <li><a href="https://rmtutoringservices.com/pages/articles.html">Articles</a></li>
                <li className={`dropdown-submenu ${openSubmenus.has("policies") ? "open" : ""}`}>
                  <a href="#" onClick={(event) => openSubmenu("policies", event)}>Policies</a>

                  <ul className="submenu">
                    <li><a href="https://rmtutoringservices.com/pages/privacy-policy.html">Privacy Policy</a></li>
                    <li><a href="https://rmtutoringservices.com/pages/terms-of-service.html">Terms of Service</a></li>
                    <li><a href="https://rmtutoringservices.com/pages/refund-policy.html">Refund Policy</a></li>
                  </ul>
                </li>
                <li><a href="https://video.rmtutoringservices.com/">RM Tutoring Video</a></li>
              </ul>
            </li>
          </ul>
        </nav>
      </header>

      <main className="home">
        <section className="home__hero" aria-labelledby="home-title">
          <div className="home__content">
            <p className="home__eyebrow">Secure tutoring video rooms</p>
            <h1 id="home-title">RM Tutoring Video</h1>
            <p>
              A focused, branded space for online sessions. Students join through
              their dashboard account, while the demo room stays open for quick
              equipment checks.
            </p>
            <div className="home__actions">
              <Link className="primary-button" href="/rmt_demo">
                Try demo room
              </Link>
              <a
                className="secondary-button"
                href={`${getDashboardUrl()}/login.html`}
              >
                Student dashboard
              </a>
            </div>
          </div>
          <div className="home__visual" aria-hidden="true">
            <div className="home__mock-window">
              <div className="home__mock-topbar">
                <span />
                <span />
                <span />
              </div>
              <div className="home__mock-grid">
                <div />
                <div />
                <div />
                <div />
              </div>
              <div className="home__mock-controls">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer-flex">
        <div className="footer-links">
          <p>© 2025 RM Tutoring Services.</p>
          <a href="https://rmtutoringservices.com">Home</a>
          <a href="https://rmtutoringservices.com/pages/about.html">About</a>
          <a href="https://rmtutoringservices.com/pages/terms-of-service.html">Terms Of Service</a>
          <a href="https://rmtutoringservices.com/pages/privacy-policy.html">Privacy Policy</a>
          <a href="https://rmtutoringservices.com/pages/refund-policy.html">Refund Policy</a>
          <a href="https://rmtutoringservices.com/pages/contact.html">Contact</a>
          <div className="footer-payment-icons">
            <i className="fab fa-cc-visa" />
            <i className="fab fa-cc-mastercard" />
            <i className="fab fa-cc-stripe" />
          </div>
        </div>
        <div className="footer-links">
          <p>Book and Pay for Sessions or Packages</p>
          <a className="calcom-button" data-cal-link="rleemiller/60min" data-cal-namespace="60min" data-cal-config='{"layout":"month_view"}'>60-min Sessions</a>
          <a className="calcom-button" data-cal-link="rleemiller/90min" data-cal-namespace="90min" data-cal-config='{"layout":"month_view"}'>90-min Sessions</a>
          <a className="calcom-button" data-cal-link="rleemiller/120min" data-cal-namespace="120min" data-cal-config='{"layout":"month_view"}'>120-min Sessions</a>
          <a href="https://packages.rmtutoringservices.com/">Packages</a>
          <a href="https://billing.stripe.com/p/login/00wcMY8NFcFE6qI5Zo9k400">Manage Subscription</a>
        </div>
        <div className="footer-links">
          <p>Contact Info</p>
          <a href="mailto:info@rmtutoringservices.com"><i className="fa-solid fa-envelope" />&nbsp;info@rmtutoringservices.com</a>
          <a href="tel:4035984840"><i className="fa-solid fa-phone" />&nbsp;+1 (780) 619-7200</a>
        </div>
        <div className="footer-links">
          <p>Find us on social media</p>
          <div className="footer-social-links">
            <a href="https://www.facebook.com/profile.php?id=61578325721591"><i className="fa-brands fa-facebook" /></a>
            <a href="https://www.instagram.com/rmtutoringservices/"><i className="fa-brands fa-instagram" /></a>
          </div>
        </div>
        <div className="footer-contact-form">
          <h3>Send Us a Message</h3>
          <form id="contact-form" name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field">
            <input type="hidden" name="form-name" value="contact" />
            <input type="hidden" name="bot-field" />
            <input name="name" placeholder="Your Name" required type="text" />
            <input name="email" placeholder="Your Email" required type="email" />
            <textarea name="message" placeholder="Your Message" required />
            <button type="submit" id="submit-btn">
              <span className="btn-text">Send Message</span>
              <span className="spinner" aria-hidden="true" />
            </button>
          </form>
        </div>
      </footer>

      <Script src="/scripts/preloader.js" strategy="afterInteractive" />
      <Script src="/scripts/calcom-60min.js" strategy="afterInteractive" />
      <Script src="/scripts/calcom-90min.js" strategy="afterInteractive" />
      <Script src="/scripts/calcom-120min.js" strategy="afterInteractive" />
      <Script src="/scripts/contact-form.js" strategy="afterInteractive" />
      <Script src="/scripts/submenu.js" strategy="afterInteractive" />
    </>
  );
}

function getDashboardUrl() {
  return (process.env.NEXT_PUBLIC_STUDENT_DASHBOARD_URL || "https://dashboard.rmtutoringservices.com").replace(
    /\/$/,
    ""
  );
}
