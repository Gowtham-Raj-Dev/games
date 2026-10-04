import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { CallToAction } from "@/components/sections/CallToAction";
import { Categories } from "@/components/sections/Categories";
import { Experience } from "@/components/sections/Experience";
import { Featured } from "@/components/sections/Featured";
import { Games } from "@/components/sections/Games";
import { Hero } from "@/components/sections/Hero";
import { Originals } from "@/components/sections/Originals";
import { Showcase } from "@/components/sections/Showcase";
import { translations } from "@/i18n/translations";
import { site } from "@/lib/site";

/**
 * Landing page composition.
 *
 * hero -> featured game -> screenshot band -> our-own-games (About) ->
 * categories -> collection -> why play here -> closing CTA
 */
export default function Home() {
  // Structured data limited to what is verifiably true about the studio.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    description: translations.en.footer.desc,
    knowsLanguage: ["en", "ta"],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <Header />

      <main id="main">
        <Hero />
        <Featured />
        <Showcase />
        <Originals />
        <Categories />
        <Games />
        <Experience />
        <CallToAction />
      </main>

      <Footer />
    </>
  );
}
