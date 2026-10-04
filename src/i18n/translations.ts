/**
 * Centralised translation source.
 *
 * `Dictionary` is an explicit interface, so TypeScript fails the build if the
 * Tamil object is missing a key the English one has. To add copy:
 *   1. add the field to `Dictionary`
 *   2. fill it in `en` and in `ta`
 *
 * The brand name and genre words commonly used as Tamil loanwords are left
 * untranslated or transliterated on purpose.
 */

export const LANGS = ["en", "ta"] as const;
export type Lang = (typeof LANGS)[number];

export const CATEGORY_IDS = [
  "action",
  "adventure",
  "arcade",
  "puzzle",
  "racing",
  "casual",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const FEATURE_IDS = [
  "instant",
  "tamil",
  "discover",
  "genres",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const FACT_IDS = ["games", "categories", "languages"] as const;
export type FactId = (typeof FACT_IDS)[number];

export const ORIGINAL_POINT_IDS = ["inhouse", "worlds", "bilingual"] as const;
export type OriginalPointId = (typeof ORIGINAL_POINT_IDS)[number];

interface Titled {
  name: string;
  desc: string;
}

export interface Dictionary {
  /** Native language label shown in the switcher. */
  langName: string;
  meta: {
    title: string;
    description: string;
  };
  nav: {
    home: string;
    games: string;
    categories: string;
    experience: string;
    about: string;
    play: string;
    openMenu: string;
    closeMenu: string;
    language: string;
    primaryNav: string;
    skipToContent: string;
  };
  brand: {
    message: string;
  };
  hero: {
    label: string;
    headline: string[];
    sub: string;
    primary: string;
    secondary: string;
    bilingual: string;
    /** Sits above the two game cards in the hero. */
    playableNow: string;
  };
  /**
   * Chrome for the featured slot. The title, tagline and tags shown there come
   * from the game itself in `src/lib/games.ts`, so this block can never go
   * stale when the flagship changes.
   */
  featured: {
    label: string;
    button: string;
    more: string;
    /** Takes the game's version, e.g. "Version 2.0". */
    version: (value: string) => string;
  };
  /** The real-screenshot strip. */
  showcase: {
    label: string;
    heading: string;
    sub: string;
  };
  originals: {
    badge: string;
    heading: string;
    sub: string;
    points: Record<OriginalPointId, string>;
    disclaimer: string;
  };
  categories: {
    label: string;
    heading: string;
    sub: string;
    items: Record<CategoryId, Titled>;
    cta: string;
    /** Published titles in a category, e.g. "2 games". */
    count: (n: number) => string;
    /** Shown instead of a count where we have not shipped a title yet. */
    soon: string;
  };
  games: {
    label: string;
    heading: string;
    sub: string;
    filteredBy: string;
    clearFilter: string;
    /** Shown when the chosen category has no title in it yet. */
    noMatchTitle: string;
    noMatchBody: string;
    /** Card call to action. */
    open: string;
    /** Card badge. */
    playable: string;
  };
  /**
   * Chrome for a game page: the player controls, the download block and the
   * section headings. The games themselves live in `src/lib/games.ts`.
   */
  game: {
    back: string;
    free: string;
    version: string;
    playInBrowser: string;
    playHere: string;
    /** Takes the build size, e.g. "First load downloads 57 MB". */
    firstLoad: (size: string) => string;
    loadHint: string;
    fullscreen: string;
    restart: string;
    stop: string;
    stopHint: string;
    /** Shown on the poster after the game stopped itself. */
    autoStopped: string;
    noWebgl: string;
    rotate: string;
    rotateHint: string;
    downloadsLabel: string;
    downloadsHeading: string;
    downloadsSub: string;
    browser: string;
    browserRequires: string;
    browserSteps: string[];
    desktop: string;
    android: string;
    download: string;
    requires: string;
    installSteps: string;
    aboutLabel: string;
    aboutHeading: string;
    featuresLabel: string;
    featuresHeading: string;
    vehiclesLabel: string;
    vehiclesHeading: string;
    vehiclesSub: string;
    stagesLabel: string;
    stagesHeading: string;
    stagesSub: string;
    galleryLabel: string;
    galleryHeading: string;
    controlsLabel: string;
    controlsHeading: string;
    controlsSub: string;
    dialogueHeading: string;
    dialogueSub: string;
    faqLabel: string;
    faqHeading: string;
    /* ---- Phone-first chrome, used by titles that ship a touch control rig. ---- */
    touchLabel: string;
    touchHeading: string;
    touchSteerHeading: string;
    touchLayoutLabel: string;
    /** Badge on the install card that matches the device the visitor is holding. */
    bestOnPhone: string;
    /** One-line lead above the three ways to play, on a phone. */
    phoneLead: string;
    /** Label on the meta chips in the compact hero. */
    sizeLabel: string;
  };
  why: {
    label: string;
    heading: string;
    sub: string;
    features: Record<FeatureId, Titled>;
    /**
     * Only the labels live here. Every value is counted from real data in
     * `Experience`, so no figure on the page can drift from the catalogue.
     */
    facts: Record<FactId, { label: string }>;
    factsNote: string;
  };
  cta: {
    heading: string;
    sub: string;
    button: string;
    note: string;
  };
  footer: {
    desc: string;
    colExplore: string;
    colCategories: string;
    colConnect: string;
    contactCta: string;
    rights: string;
    backToTop: string;
  };
}

const en: Dictionary = {
  langName: "English",
  meta: {
    title: "Original browser games in English and Tamil",
    description:
      "An independent studio publishing its own browser games. Play original titles instantly in English or Tamil - no downloads, no installs.",
  },
  nav: {
    home: "Home",
    games: "Games",
    categories: "Categories",
    experience: "Features",
    about: "About us",
    play: "Play games",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Language",
    primaryNav: "Primary",
    skipToContent: "Skip to content",
  },
  brand: {
    message: "Created with creativity. Built for players.",
  },
  hero: {
    label: "Independent game studio",
    headline: ["Our games.", "Your next adventure."],
    sub: "Discover original games crafted by us. Explore unique gaming experiences in English and Tamil.",
    primary: "Explore our games",
    secondary: "Made by us",
    bilingual: "Every game playable in Tamil and English",
    playableNow: "Playable now",
  },
  featured: {
    label: "Featured game",
    button: "Play now",
    more: "All games",
    version: (value) => `Version ${value}`,
  },
  showcase: {
    label: "Screenshots",
    heading: "Straight from the games",
    sub: "Real captures from both titles - the city, the circuits and the cars you actually drive.",
  },
  originals: {
    badge: "Our games. Our creation.",
    heading: "Original games, created by us",
    sub: "Every title on this platform is developed in-house by our own studio.",
    points: {
      inhouse: "Designed and built in-house",
      worlds: "Original characters and worlds",
      bilingual: "Playable in Tamil and English",
    },
    disclaimer: "No third-party or licensed games are published here.",
  },
  categories: {
    label: "Categories",
    heading: "Browse by category",
    sub: "Six ways to play. Choose a category to line up the collection below.",
    items: {
      action: { name: "Action", desc: "Fast reflexes and constant pressure." },
      adventure: { name: "Adventure", desc: "Worlds to explore, stories to unlock." },
      arcade: { name: "Arcade", desc: "Short runs, high scores, one more try." },
      puzzle: { name: "Puzzle", desc: "Think it through and win smarter." },
      racing: { name: "Racing", desc: "Speed, control and clean lines." },
      casual: { name: "Casual", desc: "Easy to start, hard to put down." },
    },
    cta: "View games",
    count: (n) => (n === 1 ? "1 game" : `${n} games`),
    soon: "Coming soon",
  },
  games: {
    label: "The collection",
    heading: "Your next obsession",
    sub: "Our original titles are published here, each one playable straight in your browser in English or Tamil.",
    filteredBy: "Filtered by",
    clearFilter: "Clear filter",
    noMatchTitle: "Nothing in this category yet",
    noMatchBody:
      "Clear the filter to see everything we have released so far.",
    open: "Open game",
    playable: "Playable now",
  },
  game: {
    back: "All games",
    free: "Free to play",
    version: "Version",
    playInBrowser: "Play in your browser",
    playHere: "Play right here",
    firstLoad: (size) => `First load downloads ${size}, about 10 to 30 seconds`,
    loadHint:
      "The game loads only when you press play, so the page stays light until then.",
    fullscreen: "Fullscreen",
    restart: "Restart",
    stop: "Stop",
    stopHint:
      "Scroll away and the game stops by itself, so reading the page below stays smooth.",
    autoStopped:
      "The game stopped itself when you scrolled away, to keep the page smooth. Your wallet and upgrades are saved - press play to start a new shift.",
    noWebgl:
      "This browser does not report WebGL2. If the game will not start, open this page in Chrome, Edge or Firefox.",
    rotate: "Turn your phone sideways",
    rotateHint: "This game plays in landscape.",
    downloadsLabel: "Get the game",
    downloadsHeading: "Play in the browser, or install it",
    downloadsSub:
      "The browser build needs nothing installed. The desktop and Android builds run offline once you have them.",
    browser: "Browser",
    browserRequires: "Chrome, Edge or Firefox, on desktop or mobile",
    browserSteps: [
      "Press play in the player above",
      "The first load takes a few seconds",
      "On a phone, turn the screen sideways",
    ],
    desktop: "Desktop",
    android: "Android",
    download: "Download",
    requires: "Needs",
    installSteps: "Install steps",
    aboutLabel: "About",
    aboutHeading: "What you do",
    featuresLabel: "Inside the game",
    featuresHeading: "What is in it",
    vehiclesLabel: "Vehicles",
    vehiclesHeading: "Pick your ride",
    vehiclesSub: "Every ride handles differently - pick the one that suits the route.",
    stagesLabel: "Circuits",
    stagesHeading: "Where you race",
    stagesSub: "Each one has its own weather, light and gravity.",
    galleryLabel: "Screens",
    galleryHeading: "A look at the game",
    controlsLabel: "Controls",
    controlsHeading: "Keyboard controls",
    controlsSub:
      "Phones and tablets use on-screen touch controls instead - no keyboard needed.",
    dialogueHeading: "At the doorstep",
    dialogueSub:
      "Every line is voiced in Tamil and in English, written by us.",
    faqLabel: "Questions",
    faqHeading: "Before you start",
    touchLabel: "On a phone",
    touchHeading: "Built for your thumbs",
    touchSteerHeading: "Three ways to steer",
    touchLayoutLabel: "Move anything",
    bestOnPhone: "Best on this phone",
    phoneLead: "Play it right here, or install it and race offline.",
    sizeLabel: "Size",
  },
  why: {
    label: "The experience",
    heading: "Built for players",
    sub: "No installers, no launchers and no account to create before the fun starts. Open the page and play.",
    features: {
      instant: {
        name: "Instant browser play",
        desc: "Every game runs on the page you are already on. Nothing to download and nothing to set up.",
      },
      tamil: {
        name: "Plays in Tamil",
        desc: "Menus, instructions and in-game text in natural Tamil, written by us rather than machine-translated.",
      },
      discover: {
        name: "Easy to browse",
        desc: "Filter by category and find something that fits the time you have.",
      },
      genres: {
        name: "A range of genres",
        desc: "A city delivery adventure and a lap racer, between them covering five of our six categories.",
      },
    },
    facts: {
      games: { label: "Games published" },
      categories: { label: "Categories to browse" },
      languages: { label: "Languages in our games" },
    },
    factsNote:
      "Counted from our own catalogue. These are not player or download numbers.",
  },
  cta: {
    heading: "Ready player one?",
    sub: "Our collection is just getting started. Pick a category, look around, and come back for each new release.",
    button: "Start exploring",
    note: "Works on phone, tablet and desktop.",
  },
  footer: {
    desc: "An independent game studio publishing its own browser games, with original art, original code and native Tamil and English support.",
    colExplore: "Explore",
    colCategories: "Categories",
    colConnect: "Connect",
    contactCta: "Get in touch",
    rights: "All rights reserved.",
    backToTop: "Back to top",
  },
};

const ta: Dictionary = {
  langName: "தமிழ்",
  meta: {
    title: "தமிழ் மற்றும் ஆங்கிலத்தில் எங்கள் சொந்த கேம்கள்",
    description:
      "சொந்த பிரவுசர் கேம்களை வெளியிடும் ஒரு சுதந்திர ஸ்டுடியோ. பதிவிறக்கம் இல்லாமல், ஆங்கிலத்திலோ தமிழிலோ எங்கள் கேம்களை உடனே விளையாடுங்கள்.",
  },
  nav: {
    home: "முகப்பு",
    games: "கேம்கள்",
    categories: "வகைகள்",
    experience: "சிறப்புகள்",
    about: "எங்களைப் பற்றி",
    play: "விளையாடுங்கள்",
    openMenu: "மெனுவைத் திற",
    closeMenu: "மெனுவை மூடு",
    language: "மொழி",
    primaryNav: "முக்கிய",
    skipToContent: "உள்ளடக்கத்திற்குச் செல்ல",
  },
  brand: {
    message:
      "படைப்பாற்றலுடன் உருவாக்கப்பட்டது. விளையாடுபவர்களுக்காக வடிவமைக்கப்பட்டது.",
  },
  hero: {
    label: "சுதந்திர கேம் ஸ்டுடியோ",
    headline: ["எங்கள் கேம்கள்.", "உங்கள் அடுத்த சாகசம்!"],
    sub: "நாங்களே உருவாக்கிய தனித்துவமான கேம்களை அனுபவியுங்கள். தமிழ் மற்றும் ஆங்கிலத்தில் விளையாடுங்கள்.",
    primary: "எங்கள் கேம்களைப் பாருங்கள்",
    secondary: "எங்களின் உருவாக்கம்",
    bilingual: "ஒவ்வொரு கேமையும் தமிழிலும் ஆங்கிலத்திலும் விளையாடலாம்",
    playableNow: "இப்போது விளையாடலாம்",
  },
  featured: {
    label: "சிறப்பு கேம்",
    button: "இப்போது விளையாடு",
    more: "எல்லா கேம்களும்",
    version: (value) => `பதிப்பு ${value}`,
  },
  showcase: {
    label: "திரைக்காட்சிகள்",
    heading: "கேம்களுக்கு உள்ளே",
    sub: "இரண்டு கேம்களிலிருந்தும் நேரடி ஸ்கிரீன்ஷாட்கள் — சிட்டி, சர்க்யூட், நீங்கள் ஓட்டும் வண்டிகள்.",
  },
  originals: {
    badge: "எங்கள் கேம்கள். எங்கள் படைப்பு.",
    heading: "எங்களால் உருவாக்கப்பட்ட சொந்த கேம்கள்",
    sub: "இந்த தளத்தில் உள்ள ஒவ்வொரு கேமும் எங்கள் ஸ்டுடியோவிலேயே உருவாக்கப்பட்டது.",
    points: {
      inhouse: "எங்கள் குழுவால் வடிவமைத்து உருவாக்கப்பட்டது",
      worlds: "சொந்த கதாபாத்திரங்கள், சொந்த உலகங்கள்",
      bilingual: "தமிழிலும் ஆங்கிலத்திலும் விளையாடலாம்",
    },
    disclaimer: "பிற நிறுவனங்களின் கேம்கள் இங்கே வெளியிடப்படுவதில்லை.",
  },
  categories: {
    label: "வகைகள்",
    heading: "வகைகளின் வழியே பாருங்கள்",
    sub: "விளையாட ஆறு வழிகள். கீழே உள்ள தொகுப்பை வரிசைப்படுத்த ஒரு வகையைத் தேர்ந்தெடுங்கள்.",
    items: {
      action: { name: "ஆக்‌ஷன்", desc: "விரைவான எதிர்வினையும் இடைவிடாத பிரஷரும்." },
      adventure: { name: "சாகசம்", desc: "ஆராய உலகங்கள், திறக்கக் காத்திருக்கும் கதைகள்." },
      arcade: { name: "ஆர்கேட்", desc: "சிறிய ஆட்டங்கள், அதிக மதிப்பெண், இன்னொரு முயற்சி." },
      puzzle: { name: "புதிர்", desc: "யோசித்துப் பாருங்கள், புத்திசாலியாக வெல்லுங்கள்." },
      racing: { name: "பந்தயம்", desc: "வேகம், கட்டுப்பாடு, நேரான பாதை." },
      casual: { name: "சாதாரணம்", desc: "தொடங்குவது எளிது, நிறுத்துவது கடினம்." },
    },
    cta: "கேம்களைப் பார்",
    count: (n) => (n === 1 ? "1 கேம்" : `${n} கேம்கள்`),
    soon: "விரைவில்",
  },
  games: {
    label: "தொகுப்பு",
    heading: "உங்கள் அடுத்த ஆர்வம்",
    sub: "எங்கள் சொந்த கேம்கள் இங்கே வெளியிடப்படும் — ஒவ்வொன்றையும் உங்கள் பிரவுசரிலேயே தமிழிலோ ஆங்கிலத்திலோ விளையாடலாம்.",
    filteredBy: "வடிகட்டப்பட்டது",
    clearFilter: "வடிகட்டலை நீக்கு",
    noMatchTitle: "இந்த வகையில் இன்னும் கேம் இல்லை",
    noMatchBody:
      "இதுவரை வெளியான அனைத்தையும் பார்க்க வடிகட்டலை நீக்குங்கள்.",
    open: "கேமைத் திற",
    playable: "இப்போது விளையாடலாம்",
  },
  game: {
    back: "எல்லா கேம்களும்",
    free: "இலவசம்",
    version: "பதிப்பு",
    playInBrowser: "பிரவுசரில் விளையாடுங்கள்",
    playHere: "இங்கேயே விளையாடுங்கள்",
    firstLoad: (size) => `முதல் முறை ${size} லோட் ஆகும் - சுமார் 10 முதல் 30 வினாடி`,
    loadHint:
      "பிளே அழுத்தினால் மட்டுமே கேம் லோட் ஆகும் - அதுவரை பக்கம் லேசாக இருக்கும்.",
    fullscreen: "முழுத்திரை",
    restart: "மறுதொடக்கம்",
    stop: "நிறுத்து",
    stopHint:
      "கீழே ஸ்க்ரோல் செய்தால் கேம் தானாக நிற்கும், அதனால் படிக்கும்போது பக்கம் வேகமாக இருக்கும்.",
    autoStopped:
      "நீங்கள் கீழே ஸ்க்ரோல் செய்ததால் பக்கம் வேகமாக இருக்க கேம் தானாக நின்றது. உங்க வாலட் மற்றும் அப்கிரேட்ஸ் சேவ் ஆகியிருக்கு - புது ஷிஃப்ட் ஆரம்பிக்க பிளே அழுத்துங்க.",
    noWebgl:
      "இந்த பிரவுசரில் WebGL2 தெரியவில்லை. கேம் ஆரம்பிக்கவில்லை என்றால் Chrome, Edge அல்லது Firefox-ல் இந்தப் பக்கத்தைத் திறங்கள்.",
    rotate: "போனைப் படுக்கைவாட்டில் திருப்புங்கள்",
    rotateHint: "இந்த கேம் லேண்ட்ஸ்கேப்பில் மட்டும் இயங்கும்.",
    downloadsLabel: "கேமைப் பெறுங்கள்",
    downloadsHeading: "பிரவுசரில் விளையாடுங்கள், அல்லது இன்ஸ்டால் பண்ணுங்கள்",
    downloadsSub:
      "பிரவுசர் பதிப்புக்கு எதுவும் இன்ஸ்டால் தேவையில்லை. டெஸ்க்டாப் மற்றும் Android பதிப்புகள் ஒருமுறை பெற்றுவிட்டால் இணையம் இல்லாமலும் இயங்கும்.",
    browser: "பிரவுசர்",
    browserRequires: "Chrome, Edge அல்லது Firefox - டெஸ்க்டாப் அல்லது மொபைல்",
    browserSteps: [
      "மேலே உள்ள பிளேயரில் பிளே அழுத்துங்கள்",
      "முதல் முறை லோட் ஆக சில வினாடி ஆகும்",
      "போனில் திரையைப் படுக்கைவாட்டில் திருப்புங்கள்",
    ],
    desktop: "டெஸ்க்டாப்",
    android: "Android",
    download: "டவுன்லோட்",
    requires: "தேவை",
    installSteps: "இன்ஸ்டால் படிகள்",
    aboutLabel: "பற்றி",
    aboutHeading: "நீங்கள் செய்வது",
    featuresLabel: "கேமுக்கு உள்ளே",
    featuresHeading: "என்னென்ன இருக்கு",
    vehiclesLabel: "வண்டிகள்",
    vehiclesHeading: "உங்க வண்டியைத் தேர்ந்தெடுங்கள்",
    vehiclesSub:
      "ஒவ்வொரு வண்டியும் வேறு விதமா கையாளும் - வழிக்கு ஏற்றதை தேர்ந்தெடுங்க.",
    stagesLabel: "சர்க்யூட்",
    stagesHeading: "எங்கே ரேஸ் பண்ணுறீங்க",
    stagesSub: "ஒவ்வொன்றுக்கும் தனி வானிலை, வெளிச்சம், ஈர்ப்பு.",
    galleryLabel: "திரைக் காட்சிகள்",
    galleryHeading: "கேமை ஒரு பார்வை",
    controlsLabel: "கண்ட்ரோல்ஸ்",
    controlsHeading: "கீபோர்டு கண்ட்ரோல்ஸ்",
    controlsSub:
      "போன் மற்றும் டேப்லெட்டில் திரையிலேயே டச் கண்ட்ரோல்ஸ் வரும் - கீபோர்டு தேவையில்லை.",
    dialogueHeading: "வாசல்படியில்",
    dialogueSub:
      "ஒவ்வொரு வசனமும் தமிழிலும் ஆங்கிலத்திலும் குரல் கொடுக்கப்பட்டது - நாங்களே எழுதியவை.",
    faqLabel: "கேள்விகள்",
    faqHeading: "ஆரம்பிக்கும் முன்",
    touchLabel: "ஃபோனில்",
    touchHeading: "உங்க கட்டைவிரலுக்காகவே",
    touchSteerHeading: "ஸ்டீயர் பண்ண மூணு வழி",
    touchLayoutLabel: "எதையும் நகர்த்தலாம்",
    bestOnPhone: "இந்த ஃபோனுக்கு ஏற்றது",
    phoneLead: "இங்கேயே விளையாடுங்க, அல்லது இன்ஸ்டால் பண்ணி ஆஃப்லைனில் ரேஸ் பண்ணுங்க.",
    sizeLabel: "அளவு",
  },
  why: {
    label: "அனுபவம்",
    heading: "விளையாடுபவர்களுக்காக உருவாக்கப்பட்டது",
    sub: "நிறுவல் இல்லை, லாஞ்சர் இல்லை, கணக்கு உருவாக்கும் தொந்தரவும் இல்லை. பக்கத்தைத் திறந்து விளையாடத் தொடங்குங்கள்.",
    features: {
      instant: {
        name: "பிரவுசரில் உடனே விளையாடு",
        desc: "ஒவ்வொரு கேமும் நீங்கள் இருக்கும் பக்கத்திலேயே இயங்கும். பதிவிறக்கமும் இல்லை, அமைப்பு வேலையும் இல்லை.",
      },
      tamil: {
        name: "தமிழில் விளையாடலாம்",
        desc: "மெனுக்கள், வழிமுறைகள், கேமில் வரும் வாசகங்கள் அனைத்தும் இயல்பான தமிழில் — நாங்களே எழுதியவை, இயந்திர மொழிபெயர்ப்பு அல்ல.",
      },
      discover: {
        name: "எளிதாகத் தேடலாம்",
        desc: "வகைகளின் வழியே வடிகட்டி, உங்கள் நேரத்திற்குப் பொருத்தமான கேமைக் கண்டுபிடியுங்கள்.",
      },
      genres: {
        name: "பலவகையான கேம்கள்",
        desc: "ஒரு சிட்டி டெலிவரி அட்வென்ச்சர், ஒரு லேப் ரேசர் — ஆறு வகைகளில் ஐந்தை இவை நிரப்புகின்றன.",
      },
    },
    facts: {
      games: { label: "வெளியான கேம்கள்" },
      categories: { label: "பார்க்கக்கூடிய வகைகள்" },
      languages: { label: "கேம்களில் உள்ள மொழிகள்" },
    },
    factsNote:
      "எங்கள் தொகுப்பிலிருந்தே கணக்கிடப்பட்டது. இவை விளையாடுபவர் அல்லது பதிவிறக்க எண்ணிக்கை அல்ல.",
  },
  cta: {
    heading: "தயாரா, ப்ளேயர் ஒன்?",
    sub: "எங்கள் தொகுப்பு இப்போதுதான் தொடங்குகிறது. ஒரு வகையைத் தேர்ந்தெடுத்துப் பாருங்கள், புதிய கேம் ஒவ்வொன்றுக்கும் திரும்பி வாருங்கள்.",
    button: "ஆராய ஆரம்பியுங்கள்",
    note: "மொபைல், டேப்லெட், டெஸ்க்டாப் — எல்லாவற்றிலும் இயங்கும்.",
  },
  footer: {
    desc: "சொந்த கலை, சொந்த நிரல், மற்றும் இயல்பான தமிழ் & ஆங்கில ஆதரவுடன் தனது சொந்த பிரவுசர் கேம்களை வெளியிடும் ஒரு சுதந்திர கேம் ஸ்டுடியோ.",
    colExplore: "ஆராயுங்கள்",
    colCategories: "வகைகள்",
    colConnect: "இணைந்திருங்கள்",
    contactCta: "தொடர்பு கொள்ளுங்கள்",
    rights: "அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",
    backToTop: "மேலே செல்ல",
  },
};

export const translations: Record<Lang, Dictionary> = { en, ta };

export const DEFAULT_LANG: Lang = "en";

export function isLang(value: unknown): value is Lang {
  return (
    typeof value === "string" && (LANGS as readonly string[]).includes(value)
  );
}
