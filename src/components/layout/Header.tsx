"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useLanguage } from "@/i18n/LanguageProvider";
import { idFromHref } from "@/lib/scroll";
import { navLinks } from "@/lib/site";

import { SectionLink } from "./SectionLink";
import styles from "./Header.module.css";

const SPY_IDS = navLinks.map((link) => idFromHref(link.href));

/**
 * Marks the nav item whose section is crossing the middle of the viewport.
 * Purely decorative - if it fails, links simply stay in their default colour.
 */
function useActiveSection(): string {
  const [active, setActive] = useState("");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const elements = SPY_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return active;
}

export function Header() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const active = useActiveSection();

  // Show the bottom hairline only once the page has moved.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page behind the mobile panel and wire up Escape.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`${styles.header} ${scrolled ? styles.bordered : ""}`}>
      <div className={`shell ${styles.bar}`}>
        <SectionLink
          href="#top"
          className={styles.brand}
          onActivate={() => setOpen(false)}
        >
          <Logo />
          <span className="srOnly">{t.nav.home}</span>
        </SectionLink>

        <nav className={styles.nav} aria-label={t.nav.primaryNav}>
          <ul className={styles.navList}>
            {navLinks.map((link) => {
              const isActive = active === idFromHref(link.href);
              return (
                <li key={link.key}>
                  <SectionLink
                    href={link.href}
                    className={`${styles.navLink} ${isActive ? styles.navOn : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    onActivate={() => setOpen(false)}
                  >
                    {t.nav[link.key]}
                  </SectionLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.actions}>
          <div className={styles.playBtn}>
            <Button href="/games" size="sm">
              {t.nav.play}
            </Button>
          </div>

          <button
            ref={toggleRef}
            type="button"
            className={styles.burger}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {/* --------------------------- Mobile panel -------------------------- */}
      {open && (
        <div id="mobile-menu" className={styles.panel}>
          <nav aria-label={t.nav.primaryNav}>
            <ul className={styles.panelList}>
              {navLinks.map((link) => (
                <li key={link.key}>
                  <SectionLink
                    href={link.href}
                    className={styles.panelLink}
                    onActivate={() => setOpen(false)}
                  >
                    {t.nav[link.key]}
                  </SectionLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.panelFoot}>
            <Button href="/games" block onClick={() => setOpen(false)}>
              {t.nav.play}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
