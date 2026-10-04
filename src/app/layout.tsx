import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { LanguageProvider } from "@/i18n/LanguageProvider";
import {
  SCROLL_BOOTSTRAP_SCRIPT,
  ScrollReset,
} from "@/components/layout/ScrollReset";
import { CategoryFilterProvider } from "@/lib/CategoryFilterProvider";
import { translations } from "@/i18n/translations";
import { site } from "@/lib/site";

import "./globals.css";

/** Headings: tighter and more confident than the body face. */
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/** Body and UI. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const en = translations.en;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} - ${en.meta.title}`,
    template: `%s | ${site.name}`,
  },
  description: en.meta.description,
  applicationName: site.name,
  alternates: {
    canonical: "/",
    languages: { en: "/" },
  },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} - ${en.meta.title}`,
    description: en.meta.description,
    locale: "en",
    url: "/",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${inter.variable}`}>
      <head>
        {/* Runs synchronously while the document is parsed, so a reload starts
            at the top instead of where the visitor last was. */}
        <script dangerouslySetInnerHTML={{ __html: SCROLL_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <LanguageProvider>
          <CategoryFilterProvider>
            <ScrollReset />
            {children}
          </CategoryFilterProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
