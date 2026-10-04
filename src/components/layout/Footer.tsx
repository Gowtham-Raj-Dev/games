"use client";

import { ArrowUp, Mail } from "lucide-react";

import { Logo } from "@/components/ui/Logo";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useCategoryFilter } from "@/lib/CategoryFilterProvider";
import { scrollToId } from "@/lib/scroll";
import { categoryOrder, navLinks, site, socialLinks } from "@/lib/site";

import { SectionLink } from "./SectionLink";
import styles from "./Footer.module.css";

export function Footer() {
  const { t } = useLanguage();
  const { setActiveCategory } = useCategoryFilter();

  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.inner}`}>
        <div className={styles.brandCol}>
          <Logo className={styles.logo} />
          <p className={styles.desc}>{t.footer.desc}</p>
        </div>

        <nav className={styles.col} aria-label={t.footer.colExplore}>
          <h2 className={styles.colTitle}>{t.footer.colExplore}</h2>
          <ul className={styles.list}>
            {navLinks.map((link) => (
              <li key={link.key}>
                <SectionLink href={link.href} className={styles.link}>
                  {t.nav[link.key]}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav className={styles.col} aria-label={t.footer.colCategories}>
          <h2 className={styles.colTitle}>{t.footer.colCategories}</h2>
          <ul className={styles.list}>
            {categoryOrder.map((id) => (
              <li key={id}>
                {/* Same behaviour as the category cards upstream. The filter
                    lives in a root-layout provider, so it survives the move
                    back to the home page from a game page. */}
                <SectionLink
                  href="#games"
                  className={styles.link}
                  onActivate={() => setActiveCategory(id)}
                >
                  {t.categories.items[id].name}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.col}>
          <h2 className={styles.colTitle}>{t.footer.colConnect}</h2>

          <ul className={styles.socials}>
            {socialLinks.map((link) => (
              <li key={link.key}>
                {link.href ? (
                  <a
                    href={link.href}
                    className={styles.social}
                    aria-label={link.label}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <SocialIcon name={link.key} />
                  </a>
                ) : (
                  /* No URL configured yet - rendered inert rather than linking
                     to an account that does not exist. */
                  <span
                    className={`${styles.social} ${styles.socialOff}`}
                    role="img"
                    aria-label={link.label}
                    title={link.label}
                  >
                    <SocialIcon name={link.key} />
                  </span>
                )}
              </li>
            ))}
          </ul>

          {site.contactEmail ? (
            <a href={`mailto:${site.contactEmail}`} className={styles.contact}>
              <Mail size={15} aria-hidden="true" />
              {t.footer.contactCta}
            </a>
          ) : null}
        </div>
      </div>

      <div className={`shell ${styles.bottom}`}>
        <p className={styles.copy}>
          &copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span>{" "}
          {site.name}. {t.footer.rights}
        </p>

        <p className={styles.tagline}>{t.brand.message}</p>

        <button
          type="button"
          className={styles.toTop}
          onClick={() => scrollToId("top")}
        >
          {t.footer.backToTop}
          <ArrowUp size={14} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
