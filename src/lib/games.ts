import type { CategoryId, Lang } from "@/i18n/translations";

/**
 * The game catalogue.
 *
 * Game copy lives here rather than in `src/i18n/translations.ts` because it is
 * per-title content, not site chrome: one game is one object carrying both
 * languages, so adding a title never touches the shared dictionary.
 *
 * To add a game:
 *   1. export the web build into  public/games/<id>/web/
 *      Re-releasing an existing game needs a NEW folder (web2, web3, ...) and a
 *      matching `webPath`: next.config.ts serves .pck/.wasm as `immutable` for a
 *      year, so a build dropped over the old one never reaches a repeat visitor.
 *   2. put the installers in      public/downloads/
 *   3. add the object to `games` below
 *   4. create  src/app/<slug>/page.tsx  (copy src/app/deliveryhero/page.tsx)
 * The collection grid on the home page picks it up from step 3 alone.
 */

/** A string in both site languages. TypeScript fails the build if one is missing. */
export type Bi = Record<Lang, string>;

export interface Download {
  /** Path under /public. */
  href: string;
  /** Human-readable size, shown before the visitor commits to the download. */
  size: string;
  file: string;
  /** What the platform needs, in one line. */
  requires: Bi;
  /** Install steps, in order. */
  steps: Bi[];
}

export type FeatureIcon =
  | "mic"
  | "map"
  | "navigation"
  | "bike"
  | "user"
  | "rain"
  | "wrench"
  | "devices"
  | "flag"
  | "car"
  | "online"
  | "offline"
  | "gravity"
  | "nitro"
  | "gamepad"
  | "puzzle"
  | "scaling"
  | "box"
  | "lock"
  | "eye";

export interface Feature {
  /** Key into the icon map in `GameFeatures`. */
  icon: FeatureIcon;
  title: Bi;
  text: Bi;
}

export interface Shot {
  src: string;
  caption: Bi;
}

export interface Control {
  /** Key or key pair, printed as-is. */
  keys: string;
  action: Bi;
}

/** One bar on a vehicle card. `value` is a percentage. */
export interface Stat {
  label: Bi;
  value: number;
}

export interface Vehicle {
  id: string;
  name: Bi;
  note: Bi;
  stats: Stat[];
}

export interface Line {
  who: Bi;
  text: Bi;
  /** "them" renders on the left, "you" on the right. */
  side: "them" | "you";
}

export interface Faq {
  q: Bi;
  a: Bi;
}

/** A circuit or area the game is set in. */
export interface Stage {
  name: Bi;
  note: Bi;
}

/** Key into the icon map in the touch-controls section. */
export type TouchIcon = "steer" | "gas" | "brake" | "drift" | "nitro" | "pause";

/** One control on the on-screen rig. */
export interface TouchControl {
  icon: TouchIcon;
  label: Bi;
  note: Bi;
}

/** One way of steering with a thumb, offered in the game's own settings. */
export interface SteerMode {
  name: Bi;
  note: Bi;
}

/**
 * The phone control scheme, for titles built to be played with a thumb.
 *
 * A visitor on a phone is about to play with no keyboard at all, so the page
 * says what the on-screen rig is before they commit to loading the game. It is
 * per-title - the two games here do not share a control scheme - so it lives
 * with the game rather than in the shared dictionary.
 */
export interface TouchScheme {
  intro: Bi;
  controls: TouchControl[];
  modes: SteerMode[];
  /** How the arrangement itself can be changed, in one line. */
  layout: Bi;
}

export interface Game {
  /** URL segment: the game page lives at /<slug>. */
  slug: string;
  /** Folder name under public/games/<id>/web/. */
  id: string;
  version: string;

  title: Bi;
  tagline: Bi;
  about: Bi;
  /** Categories this title appears under when the collection is filtered. */
  categories: CategoryId[];
  /** Short labels shown on the card and in the game hero. */
  tags: Bi[];

  /** Card artwork in the collection grid. */
  cover: string;
  /** Wide still used as the player poster. */
  poster: string;

  /** Entry point of the browser build. */
  webPath: string;
  /** Download weight of the browser build, stated before play starts. */
  webSize: string;
  /**
   * Installers, where they exist. A title can ship browser-only, or gain a
   * platform later: the download block renders whatever is here and the page
   * says nothing about the rest.
   */
  downloads?: { windows?: Download; android?: Download };

  features: Feature[];
  /** Playable vehicles, shown as stat cards. */
  vehicles?: Vehicle[];
  /** Circuits or districts, shown as a plain list. */
  stages?: Stage[];
  gallery?: Shot[];
  controls?: Control[];
  /** On-screen controls, for titles meant to be played on a phone. */
  touch?: TouchScheme;
  /** Sample of the voiced dialogue, for titles that have any. */
  dialogue?: Line[];
  faq?: Faq[];
}

const deliveryHero: Game = {
  slug: "deliveryhero",
  id: "delivery-hero",
  version: "2.0",

  title: { en: "Delivery Hero", ta: "டெலிவரி ஹீரோ" },
  tagline: {
    en: "A city food-delivery adventure. Five districts, five vehicles, Tamil voices.",
    ta: "நம்ம சிட்டி ஃபுட் டெலிவரி அட்வென்ச்சர். 5 ஏரியா, 5 வண்டிகள், தமிழ் குரல்கள்.",
  },
  about: {
    en: "Your shift starts at 8 AM. Accept orders, follow the GPS to the restaurant, then race to the customer's door. Dodge traffic, potholes and rain - earn ₹1500 before 10 PM and you are the hero.",
    ta: "காலை 8 மணி ஷிஃப்ட் ஆரம்பம். ஆர்டர் வந்ததும் ஏற்றுக்கொண்டு, GPS வழியில் கடைக்குப் போய், பேக் ஆனதும் கஸ்டமர் வீட்டுக்குப் பறங்க. டிராஃபிக், பள்ளம், மழை எல்லாத்தையும் தாண்டி இரவு 10 மணிக்குள்ள ₹1500 சம்பாதிச்சா நீங்கதான் ஹீரோ.",
  },
  categories: ["adventure", "racing", "casual"],
  tags: [
    { en: "3D", ta: "3D" },
    { en: "Open city", ta: "ஓபன் சிட்டி" },
    { en: "Tamil voices", ta: "தமிழ் குரல்கள்" },
  ],

  cover: "/images/delivery-hero/cine_street.webp",
  poster: "/images/delivery-hero/handover.webp",

  webPath: "/games/delivery-hero/web2/index.html",
  webSize: "57 MB",
  downloads: {
    windows: {
      href: "/downloads/DeliveryHero-Windows.zip",
      size: "44 MB",
      file: "DeliveryHero-Windows.zip",
      requires: {
        en: "Windows 10 or 11, 64-bit",
        ta: "Windows 10 / 11, 64-bit",
      },
      steps: [
        {
          en: "Download the ZIP and extract it",
          ta: "ZIP டவுன்லோட் பண்ணி Extract பண்ணுங்க",
        },
        {
          en: "Double-click DeliveryHero.exe",
          ta: "DeliveryHero.exe டபுள் கிளிக் பண்ணுங்க",
        },
        {
          en: "If SmartScreen appears: More info, then Run anyway",
          ta: "SmartScreen வந்தா: More info, அப்புறம் Run anyway",
        },
      ],
    },
    android: {
      href: "/downloads/DeliveryHero.apk",
      size: "62 MB",
      file: "DeliveryHero.apk",
      requires: {
        en: "Android 5.0 and up, landscape, touch controls",
        ta: "Android 5.0+, லேண்ட்ஸ்கேப், டச் கண்ட்ரோல்ஸ்",
      },
      steps: [
        { en: "Download the APK", ta: "APK டவுன்லோட் பண்ணுங்க" },
        {
          en: "Allow “Install unknown apps” for your browser",
          ta: "உங்க பிரவுசருக்கு Install unknown apps - Allow பண்ணுங்க",
        },
        {
          en: "Install it and open the game",
          ta: "இன்ஸ்டால் பண்ணி கேமை ஓப்பன் பண்ணுங்க",
        },
      ],
    },
  },

  features: [
    {
      icon: "mic",
      title: { en: "Tamil and English voices", ta: "தமிழ் & ஆங்கில குரல்கள்" },
      text: {
        en: "Customers, shop staff and your rider all speak. They tip you - and scold you when you are late.",
        ta: "கஸ்டமர், கடைக்காரர், ரைடர் - எல்லாரும் பேசுவாங்க. டிப்ஸ் கொடுப்பாங்க, லேட் ஆனா திட்டுவாங்க.",
      },
    },
    {
      icon: "map",
      title: { en: "A five-district city", ta: "5 ஏரியா சிட்டி" },
      text: {
        en: "Downtown, Bazaar Street, Anna Colony, IT Park and Beach Road.",
        ta: "டவுன்டவுன், பஜார் வீதி, அண்ணா காலனி, ஐடி பார்க், கடற்கரை சாலை.",
      },
    },
    {
      icon: "navigation",
      title: { en: "Live GPS routing", ta: "GPS வழிகாட்டி" },
      text: {
        en: "Arrows on the road, a rotating minimap and a full city map.",
        ta: "ரோட்டுல அம்புக்குறி, சுழலும் மினிமேப், முழு நகர வரைபடம்.",
      },
    },
    {
      icon: "bike",
      title: { en: "Five vehicles", ta: "5 வண்டிகள்" },
      text: {
        en: "Cycle, scooter, bike, car and bus - in the colour you pick.",
        ta: "சைக்கிள், ஸ்கூட்டர், பைக், கார், பஸ் - நீங்க தேர்ந்தெடுக்கும் கலர்ல.",
      },
    },
    {
      icon: "user",
      title: { en: "Your own rider", ta: "உங்க ரைடர்" },
      text: {
        en: "Name, male or female rider, shirt, helmet and skin tone are all yours to set.",
        ta: "பெயர், ஆண்/பெண், சட்டை, ஹெல்மெட், ஸ்கின் - எல்லாம் நீங்களே மாத்தலாம்.",
      },
    },
    {
      icon: "rain",
      title: { en: "Rain, day and night", ta: "மழை, பகல் & இரவு" },
      text: {
        en: "An 8 AM to 10 PM shift. Roads turn slippery once it rains.",
        ta: "காலை 8 முதல் இரவு 10 வரை ஷிஃப்ட். மழையில் ரோடு வழுக்கும்.",
      },
    },
    {
      icon: "wrench",
      title: { en: "Garage upgrades", ta: "கேரேஜ் அப்கிரேட்" },
      text: {
        en: "Engine, tyre grip and fuel tank - earn first, then upgrade.",
        ta: "இன்ஜின், டயர் கிரிப், பெட்ரோல் டேங்க் - சம்பாதிச்சு அப்கிரேட் பண்ணுங்க.",
      },
    },
    {
      icon: "devices",
      title: { en: "On every device", ta: "எல்லா டிவைஸ்லயும்" },
      text: {
        en: "Browser, Windows and Android, with touch controls on phones.",
        ta: "பிரவுசர், Windows, Android - போன்ல டச் கண்ட்ரோல்ஸோட.",
      },
    },
  ],

  vehicles: [
    {
      id: "cycle",
      name: { en: "Cycle", ta: "சைக்கிள்" },
      note: { en: "No fuel, eco tips", ta: "பெட்ரோல் வேண்டாம், ஈகோ டிப்ஸ்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 45 },
        { label: { en: "Mileage", ta: "மைலேஜ்" }, value: 100 },
        { label: { en: "Control", ta: "கண்ட்ரோல்" }, value: 85 },
      ],
    },
    {
      id: "scooter",
      name: { en: "Scooter", ta: "ஸ்கூட்டர்" },
      note: { en: "Great mileage", ta: "நல்ல மைலேஜ்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 70 },
        { label: { en: "Mileage", ta: "மைலேஜ்" }, value: 75 },
        { label: { en: "Control", ta: "கண்ட்ரோல்" }, value: 80 },
      ],
    },
    {
      id: "bike",
      name: { en: "Bike", ta: "பைக்" },
      note: { en: "The fastest ride", ta: "அதிவேகம்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 95 },
        { label: { en: "Mileage", ta: "மைலேஜ்" }, value: 55 },
        { label: { en: "Control", ta: "கண்ட்ரோல்" }, value: 75 },
      ],
    },
    {
      id: "car",
      name: { en: "Car", ta: "கார்" },
      note: { en: "No food spills", ta: "சாப்பாடு கொட்டாது" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 80 },
        { label: { en: "Mileage", ta: "மைலேஜ்" }, value: 35 },
        { label: { en: "Control", ta: "கண்ட்ரோல்" }, value: 90 },
      ],
    },
    {
      id: "bus",
      name: { en: "Bus", ta: "பஸ்" },
      note: { en: "Carries a ₹25 bonus", ta: "₹25 போனஸ்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 55 },
        { label: { en: "Mileage", ta: "மைலேஜ்" }, value: 15 },
        { label: { en: "Control", ta: "கண்ட்ரோல்" }, value: 70 },
      ],
    },
  ],

  gallery: [
    {
      src: "/images/delivery-hero/handover.webp",
      caption: {
        en: "Here is your delivery, madam",
        ta: "வணக்கம் மேடம், இந்தாங்க உங்க டெலிவரி",
      },
    },
    {
      src: "/images/delivery-hero/customer.webp",
      caption: {
        en: "Customers wait at the gate",
        ta: "கஸ்டமர் வாசல்ல காத்திருக்காங்க",
      },
    },
    {
      src: "/images/delivery-hero/gps.webp",
      caption: { en: "GPS route and delivery card", ta: "GPS வழி & டெலிவரி கார்டு" },
    },
    {
      src: "/images/delivery-hero/night.webp",
      caption: { en: "Night deliveries in the rain", ta: "இரவு மழையில் டெலிவரி" },
    },
    {
      src: "/images/delivery-hero/map.webp",
      caption: { en: "The full city map", ta: "முழு நகர வரைபடம்" },
    },
    {
      src: "/images/delivery-hero/sunset.webp",
      caption: { en: "Sunset on Beach Road", ta: "கடற்கரை சாலையில் மாலை" },
    },
    {
      src: "/images/delivery-hero/setup_vehicle.webp",
      caption: { en: "Pick your ride and its colour", ta: "உங்க வண்டி & கலர்" },
    },
    {
      src: "/images/delivery-hero/garage.webp",
      caption: { en: "Garage upgrades", ta: "கேரேஜ் அப்கிரேட்" },
    },
  ],

  controls: [
    { keys: "W / ↑", action: { en: "Accelerate", ta: "வேகம்" } },
    { keys: "S / ↓", action: { en: "Brake, reverse", ta: "பிரேக், ரிவர்ஸ்" } },
    { keys: "A · D", action: { en: "Steer", ta: "திருப்பு" } },
    { keys: "Space", action: { en: "Handbrake", ta: "ஹேண்ட்பிரேக்" } },
    {
      keys: "E / Q",
      action: { en: "Accept, reject order", ta: "ஆர்டர் ஏற்க, வேண்டாம்" },
    },
    { keys: "F", action: { en: "Refuel", ta: "பெட்ரோல் போடு" } },
    { keys: "H", action: { en: "Horn", ta: "ஹாரன்" } },
    { keys: "Tab", action: { en: "City map", ta: "நகர வரைபடம்" } },
    { keys: "C", action: { en: "Camera", ta: "கேமரா" } },
    { keys: "M", action: { en: "Music", ta: "மியூசிக்" } },
    { keys: "Esc", action: { en: "Pause", ta: "இடைநிறுத்தம்" } },
  ],

  dialogue: [
    {
      who: { en: "You", ta: "நீங்க" },
      side: "you",
      text: {
        en: "Good day madam, here is your delivery!",
        ta: "வணக்கம் மேடம், இந்தாங்க உங்க டெலிவரி!",
      },
    },
    {
      who: { en: "Priya", ta: "பிரியா" },
      side: "them",
      text: {
        en: "Super, you came so fast! Thanks!",
        ta: "சூப்பர், சீக்கிரம் வந்துட்டீங்க! நன்றி!",
      },
    },
    {
      who: { en: "Priya", ta: "பிரியா" },
      side: "them",
      text: {
        en: "Here, please keep this tip.",
        ta: "இந்தாங்க, இது உங்களுக்கு டிப்ஸ்.",
      },
    },
    {
      who: { en: "You", ta: "நீங்க" },
      side: "you",
      text: {
        en: "Thank you so much madam! Enjoy your meal!",
        ta: "ரொம்ப நன்றி மேடம்! நல்லா சாப்பிடுங்க!",
      },
    },
  ],

  faq: [
    {
      q: { en: "Is it completely free?", ta: "இது முழுக்க இலவசமா?" },
      a: {
        en: "Yes. No ads and no in-app purchases.",
        ta: "ஆமா. விளம்பரம் இல்ல, இன்-ஆப் பர்சேஸ் இல்ல.",
      },
    },
    {
      q: {
        en: "Android says install blocked. What now?",
        ta: "Android-ல Install blocked வருது?",
      },
      a: {
        en: "Open Settings, Apps, your browser, Install unknown apps, Allow. Then open the APK again.",
        ta: "Settings, Apps, உங்க பிரவுசர், Install unknown apps, Allow. அப்புறம் APK-ஐ திரும்ப ஓப்பன் பண்ணுங்க.",
      },
    },
    {
      q: {
        en: "Windows shows “protected your PC”.",
        ta: "Windows protected your PC காட்டுது?",
      },
      a: {
        en: "That appears because the game is new and unsigned. Click More info, then Run anyway.",
        ta: "இது சைன் பண்ணாத புது கேம் என்பதால வருது. More info, அப்புறம் Run anyway அழுத்துங்க.",
      },
    },
    {
      q: { en: "Is my progress saved?", ta: "என் ப்ரோக்ரஸ் சேவ் ஆகுமா?" },
      a: {
        en: "Yes. Wallet, upgrades, rider and vehicle are all saved on your own device.",
        ta: "ஆமா. வாலட், அப்கிரேட்ஸ், ரைடர், வண்டி எல்லாம் உங்க டிவைஸ்லயே சேவ் ஆகும்.",
      },
    },
    {
      q: { en: "It runs slowly in the browser.", ta: "பிரவுசர்ல மெதுவா இருக்கு?" },
      a: {
        en: "Turn High graphics off in the game settings, or play the Windows or Android build instead.",
        ta: "கேம் செட்டிங்ஸ்ல High graphics OFF பண்ணுங்க. இல்லனா Windows / Android வெர்ஷன் ட்ரை பண்ணுங்க.",
      },
    },
  ],
};

const velocityRift: Game = {
  slug: "velocityrift",
  id: "velocity-rift",
  version: "1.0",

  title: { en: "Velocity Rift", ta: "வெலாசிட்டி ரிஃப்ட்" },
  tagline: {
    en: "3D lap racing across six circuits. Nine cars, five rivals, and online rooms for friends.",
    ta: "ஆறு சர்க்யூட்டுகளில் 3D லேப் ரேசிங். ஒன்பது கார்கள், ஐந்து போட்டியாளர்கள், நண்பர்களுடன் ஆன்லைன் ரூம்.",
  },
  about: {
    en: "Pick a car, pick a circuit and chase the clock. Drift the hairpins, take the shortcuts, save your nitro for the last lap, and hold off five AI rivals across three difficulties. Two of the circuits are off this planet: Lunar Leap drops the gravity so you fly off the dunes, and Saturn Ringway floats above the rings. Create a six-digit room code and up to six friends can race you from their own phones or computers.",
    ta: "ஒரு காரையும் சர்க்யூட்டையும் தேர்ந்தெடுத்து நேரத்தை துரத்துங்க. ஹேர்பின்ல டிரிஃப்ட் பண்ணி, ஷார்ட்கட் எடுத்து, கடைசி லேப்புக்கு நைட்ரோவை சேமித்து, மூன்று நிலைகளில் ஐந்து AI போட்டியாளர்களை பின்னுக்குத் தள்ளுங்க. இரண்டு சர்க்யூட் இந்த கிரகத்துக்கு வெளியே: Lunar Leap-ல ஈர்ப்பு குறைவு, மணல் மேட்டில் பறப்பீங்க; Saturn Ringway வளையங்களுக்கு மேல மிதக்கும். ஆறு இலக்க ரூம் கோடு உருவாக்கினா, ஆறு நண்பர்கள் வரை அவங்க போன் அல்லது கம்ப்யூட்டரில் உங்களோட ரேஸ் பண்ணலாம்.",
  },
  categories: ["racing", "action", "arcade"],
  tags: [
    { en: "3D racing", ta: "3D ரேசிங்" },
    { en: "Online rooms", ta: "ஆன்லைன் ரூம்" },
    { en: "Plays offline", ta: "ஆஃப்லைனிலும் இயங்கும்" },
  ],

  cover: "/images/velocity-rift/metro.jpg",
  poster: "/images/velocity-rift/coast.jpg",

  webPath: "/games/velocity-rift/index.html",
  webSize: "3 MB",
  downloads: {
    windows: {
      href: "/downloads/VelocityRift-Windows.zip",
      size: "2.9 MB",
      file: "VelocityRift-Windows.zip",
      requires: {
        en: "Windows 10 or 11, 64-bit",
        ta: "Windows 10 / 11, 64-bit",
      },
      steps: [
        {
          en: "Download the ZIP and extract the whole folder",
          ta: "ZIP டவுன்லோட் பண்ணி முழு ஃபோல்டரையும் Extract பண்ணுங்க",
        },
        {
          en: "Keep VelocityRift.exe and resources.neu together, then double-click the .exe",
          ta: "VelocityRift.exe மற்றும் resources.neu-வை ஒன்றாக வைத்து, .exe-ஐ டபுள் கிளிக் பண்ணுங்க",
        },
        {
          en: "If SmartScreen appears: More info, then Run anyway",
          ta: "SmartScreen வந்தா: More info, அப்புறம் Run anyway",
        },
      ],
    },
    android: {
      href: "/downloads/VelocityRift.apk",
      size: "4.9 MB",
      file: "VelocityRift.apk",
      requires: {
        en: "Android 7.0 and up, locks to landscape",
        ta: "Android 7.0+, லேண்ட்ஸ்கேப்பில் இயங்கும்",
      },
      steps: [
        { en: "Download the APK", ta: "APK டவுன்லோட் பண்ணுங்க" },
        {
          en: "Allow “Install unknown apps” for your browser",
          ta: "உங்க பிரவுசருக்கு Install unknown apps - Allow பண்ணுங்க",
        },
        {
          en: "Install it and open the game",
          ta: "இன்ஸ்டால் பண்ணி கேமை ஓப்பன் பண்ணுங்க",
        },
      ],
    },
  },

  features: [
    {
      icon: "flag",
      title: { en: "Six circuits", ta: "ஆறு சர்க்யூட்" },
      text: {
        en: "Seaside chicanes, a rainy city flyover, icy hairpins, a desert stone bridge, and two off-world tracks.",
        ta: "கடற்கரை சிகேன், மழை நகர ஃபிளைஓவர், பனி ஹேர்பின், பாலைவன கல் பாலம், மற்றும் இரண்டு வேற்றுலக ட்ராக்.",
      },
    },
    {
      icon: "car",
      title: { en: "Nine original cars", ta: "ஒன்பது சொந்த கார்கள்" },
      text: {
        en: "From a rally hatch to an electric hypercar, each built in code - with paints, finishes and a rotating showroom.",
        ta: "ரேலி ஹாட்ச் முதல் எலக்ட்ரிக் ஹைப்பர்கார் வரை, எல்லாமே கோடில் உருவானது - பெயிண்ட், ஃபினிஷ், சுழலும் ஷோரூம் உடன்.",
      },
    },
    {
      icon: "online",
      title: { en: "Race your friends", ta: "நண்பர்களுடன் ரேஸ்" },
      text: {
        en: "Create a six-digit room code and up to six players join from any device. Empty places can be filled with bots.",
        ta: "ஆறு இலக்க ரூம் கோடு உருவாக்குங்க, ஆறு பேர் வரை எந்த டிவைஸிலிருந்தும் சேரலாம். காலி இடங்களை பாட்களால் நிரப்பலாம்.",
      },
    },
    {
      icon: "nitro",
      title: { en: "Nitro and drift", ta: "நைட்ரோ & டிரிஃப்ட்" },
      text: {
        en: "Handbrake through the corners, bank your nitro, and hunt the shortcuts and jumps on every lap.",
        ta: "மூலைகளில் ஹேண்ட்பிரேக் டிரிஃப்ட், நைட்ரோவை சேமிங்க, ஒவ்வொரு லேப்பிலும் ஷார்ட்கட் மற்றும் ஜம்ப் தேடுங்க.",
      },
    },
    {
      icon: "gravity",
      title: { en: "Low-gravity tracks", ta: "குறைந்த ஈர்ப்பு ட்ராக்" },
      text: {
        en: "Lunar Leap cuts the gravity so the cars fly off the dunes. Saturn Ringway floats above the rings.",
        ta: "Lunar Leap-ல ஈர்ப்பு குறைந்து கார்கள் மணல் மேட்டில் பறக்கும். Saturn Ringway வளையங்களுக்கு மேல மிதக்கும்.",
      },
    },
    {
      icon: "mic",
      title: { en: "Tamil and English announcer", ta: "தமிழ் & ஆங்கில அறிவிப்பாளர்" },
      text: {
        en: "The whole interface and a recorded announcer, in both languages - best lap, final lap, every call.",
        ta: "முழு இடைமுகமும் பதிவு செய்த அறிவிப்பாளரும் இரு மொழியிலும் - பெஸ்ட் லேப், ஃபைனல் லேப், எல்லா அறிவிப்பும்.",
      },
    },
    {
      icon: "offline",
      title: { en: "Works offline", ta: "ஆஃப்லைனில் இயங்கும்" },
      text: {
        en: "After the first visit it runs with no connection, and installs to a phone home screen like an app.",
        ta: "முதல் முறைக்குப் பிறகு இணைப்பு இல்லாமல் இயங்கும், ஆப் போல போன் ஹோம் ஸ்கிரீனில் இன்ஸ்டால் ஆகும்.",
      },
    },
    {
      icon: "gamepad",
      title: { en: "Keyboard, gamepad or touch", ta: "கீபோர்டு, கேம்பேட் அல்லது டச்" },
      text: {
        en: "Plug in a controller, use the arrow keys, or drive with on-screen buttons on a phone.",
        ta: "கன்ட்ரோலர் இணைக்கலாம், ஆரோ கீ பயன்படுத்தலாம், அல்லது போனில் திரை பட்டன்களில் ஓட்டலாம்.",
      },
    },
  ],

  stages: [
    {
      name: { en: "Golden Coast", ta: "கோல்டன் கோஸ்ட்" },
      note: {
        en: "Seaside chicanes and hilltop esses",
        ta: "கடற்கரை சிகேன் மற்றும் மலை உச்சி எஸ்-வளைவுகள்",
      },
    },
    {
      name: { en: "Neon Metro", ta: "நியான் மெட்ரோ" },
      note: {
        en: "Rainy figure-eight with a flyover",
        ta: "ஃபிளைஓவர் கொண்ட மழை எட்டு-வடிவ ட்ராக்",
      },
    },
    {
      name: { en: "Aurora Pass", ta: "ஆரோரா பாஸ்" },
      note: { en: "Icy hairpins, 32 m of climb", ta: "பனி ஹேர்பின், 32 மீ ஏற்றம்" },
    },
    {
      name: { en: "Rift Canyon", ta: "ரிஃப்ட் கேன்யன்" },
      note: {
        en: "Desert figure-eight over a stone bridge",
        ta: "கல் பாலத்தின் மேல் பாலைவன எட்டு-வடிவ ட்ராக்",
      },
    },
    {
      name: { en: "Lunar Leap", ta: "லூனார் லீப்" },
      note: {
        en: "Low gravity: crest the dunes and fly",
        ta: "குறைந்த ஈர்ப்பு: மணல் மேட்டில் ஏறி பறங்க",
      },
    },
    {
      name: { en: "Saturn Ringway", ta: "சாட்டர்ன் ரிங்வே" },
      note: {
        en: "Floating figure-eight above the rings",
        ta: "வளையங்களுக்கு மேல் மிதக்கும் எட்டு-வடிவ ட்ராக்",
      },
    },
  ],

  vehicles: [
    {
      id: "kestrel-gt",
      name: { en: "Kestrel GT", ta: "கெஸ்ட்ரல் GT" },
      note: { en: "Front-engine grand tourer", ta: "முன்-இன்ஜின் கிராண்ட் டூரர்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 82 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 78 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 80 },
      ],
    },
    {
      id: "mako-rs",
      name: { en: "Mako RS", ta: "மாகோ RS" },
      note: { en: "Mid-engine supercar", ta: "மிட்-இன்ஜின் சூப்பர்கார்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 97 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 70 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 72 },
      ],
    },
    {
      id: "solaris-x",
      name: { en: "Solaris X", ta: "சொலாரிஸ் X" },
      note: { en: "Rally hatch", ta: "ரேலி ஹாட்ச்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 76 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 97 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 84 },
      ],
    },
    {
      id: "nova-drift",
      name: { en: "Nova Drift", ta: "நோவா டிரிஃப்ட்" },
      note: { en: "Widebody drift coupe", ta: "வைட்பாடி டிரிஃப்ட் கூபே" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 80 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 83 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 97 },
      ],
    },
    {
      id: "umbra-phantom",
      name: { en: "Umbra Phantom", ta: "அம்ப்ரா ஃபாண்டம்" },
      note: { en: "Endurance prototype", ta: "என்டூரன்ஸ் ப்ரோட்டோடைப்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 93 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 90 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 88 },
      ],
    },
    {
      id: "ronin-v8",
      name: { en: "Ronin V8", ta: "ரோனின் V8" },
      note: { en: "Classic muscle coupe", ta: "கிளாசிக் மஸில் கூபே" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 88 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 86 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 66 },
      ],
    },
    {
      id: "pulse-e1",
      name: { en: "Pulse E-1", ta: "பல்ஸ் E-1" },
      note: { en: "Electric hypercar", ta: "எலக்ட்ரிக் ஹைப்பர்கார்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 90 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 100 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 82 },
      ],
    },
    {
      id: "dune-raider",
      name: { en: "Dune Raider", ta: "டூன் ரெய்டர்" },
      note: { en: "Off-road buggy", ta: "ஆஃப்-ரோட் பக்கி" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 72 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 88 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 78 },
      ],
    },
    {
      id: "comet-lm",
      name: { en: "Comet LM", ta: "காமெட் LM" },
      note: { en: "Retro endurance racer", ta: "ரெட்ரோ என்டூரன்ஸ் ரேசர்" },
      stats: [
        { label: { en: "Speed", ta: "வேகம்" }, value: 84 },
        { label: { en: "Acceleration", ta: "முடுக்கம்" }, value: 80 },
        { label: { en: "Handling", ta: "கையாளுதல்" }, value: 90 },
      ],
    },
  ],

  gallery: [
    {
      src: "/images/velocity-rift/coast.jpg",
      caption: { en: "Golden Coast", ta: "கோல்டன் கோஸ்ட்" },
    },
    {
      src: "/images/velocity-rift/metro.jpg",
      caption: { en: "Neon Metro", ta: "நியான் மெட்ரோ" },
    },
    {
      src: "/images/velocity-rift/aurora.jpg",
      caption: { en: "Aurora Pass", ta: "ஆரோரா பாஸ்" },
    },
    {
      src: "/images/velocity-rift/canyon.jpg",
      caption: { en: "Rift Canyon", ta: "ரிஃப்ட் கேன்யன்" },
    },
    {
      src: "/images/velocity-rift/moon.jpg",
      caption: { en: "Lunar Leap", ta: "லூனார் லீப்" },
    },
    {
      src: "/images/velocity-rift/saturn.jpg",
      caption: { en: "Saturn Ringway", ta: "சாட்டர்ன் ரிங்வே" },
    },
  ],

  controls: [
    {
      keys: "← → / A · D",
      action: { en: "Steer", ta: "திருப்பு" },
    },
    {
      keys: "↑ ↓ / W · S",
      action: { en: "Throttle, brake", ta: "ஆக்சிலரேட்டர், பிரேக்" },
    },
    { keys: "Shift", action: { en: "Nitro", ta: "நைட்ரோ" } },
    { keys: "Space", action: { en: "Handbrake drift", ta: "ஹேண்ட்பிரேக் டிரிஃப்ட்" } },
    { keys: "C", action: { en: "Change camera", ta: "கேமரா மாற்று" } },
    { keys: "R", action: { en: "Reset car to track", ta: "காரை ட்ராக்கில் மீட்டமை" } },
    { keys: "M / L", action: { en: "Music, language", ta: "மியூசிக், மொழி" } },
    { keys: "Esc / P", action: { en: "Pause", ta: "இடைநிறுத்தம்" } },
  ],

  touch: {
    intro: {
      en: "On a phone the game builds its own control rig: steering under your left thumb, throttle and brake under your right, and nothing across the middle where the road is.",
      ta: "ஃபோனில் கேம் தனக்கான கன்ட்ரோல் செட்டை உருவாக்குகிறது: இடது கட்டைவிரலுக்கு கீழே ஸ்டீயரிங், வலது கட்டைவிரலுக்கு கீழே ஆக்சிலரேட்டர் மற்றும் பிரேக், ரோடு இருக்கும் நடுப்பகுதியில் எதுவும் இல்லை.",
    },
    controls: [
      {
        icon: "steer",
        label: { en: "Steer", ta: "ஸ்டீயர்" },
        note: {
          en: "Left thumb. Slide between the two halves without lifting off.",
          ta: "இடது கட்டைவிரல். விரலை எடுக்காமல் இரு பக்கமும் நகர்த்தலாம்.",
        },
      },
      {
        icon: "gas",
        label: { en: "Gas", ta: "கேஸ்" },
        note: {
          en: "The biggest pad on the rig, bottom right, where the thumb rests.",
          ta: "கட்டைவிரல் இயல்பாக இருக்கும் கீழ் வலது மூலையில், மிகப்பெரிய பட்டன்.",
        },
      },
      {
        icon: "brake",
        label: { en: "Brake", ta: "பிரேக்" },
        note: {
          en: "Beside the gas. Hold it at a standstill to reverse.",
          ta: "கேஸ் அருகில். கார் நின்றிருக்கும்போது அழுத்திப் பிடித்தால் பின்னோக்கி.",
        },
      },
      {
        icon: "drift",
        label: { en: "Drift", ta: "டிரிஃப்ட்" },
        note: {
          en: "Handbrake. Hold it into a hairpin and the back end comes round.",
          ta: "ஹேண்ட்பிரேக். ஹேர்பின்ல அழுத்திப் பிடித்தால் பின்பக்கம் சுற்றும்.",
        },
      },
      {
        icon: "nitro",
        label: { en: "Nitro", ta: "நைட்ரோ" },
        note: {
          en: "Fills as you drift. The phone buzzes when you fire it.",
          ta: "டிரிஃப்ட் பண்ணும்போது நிரம்பும். அழுத்தினால் ஃபோன் வைப்ரேட் ஆகும்.",
        },
      },
      {
        icon: "pause",
        label: { en: "Pause", ta: "இடைநிறுத்தம்" },
        note: {
          en: "Top right, clear of the readouts. Restart or change music from there.",
          ta: "வலது மேலே, மற்ற எண்களுக்கு இடையூறு இல்லாமல். அங்கிருந்து மறுதொடக்கம் அல்லது மியூசிக் மாற்றம்.",
        },
      },
    ],
    modes: [
      {
        name: { en: "Buttons", ta: "பட்டன்" },
        note: {
          en: "Two arrow pads, the default. Full lock either way, eased in by the car itself.",
          ta: "இரண்டு அம்பு பட்டன்கள், இயல்பு நிலை. இரு பக்கமும் முழு திருப்பம், காரே மென்மையாக்கும்.",
        },
      },
      {
        name: { en: "Slider", ta: "ஸ்லைடர்" },
        note: {
          en: "One strip. How far you slide is how far the wheels turn, and it springs back to centre.",
          ta: "ஒரே பட்டை. எவ்வளவு நகர்த்துறீங்களோ அவ்வளவு சக்கரம் திரும்பும், விரலை எடுத்தால் நடுவுக்கு வரும்.",
        },
      },
      {
        name: { en: "Tilt", ta: "சாய்வு" },
        note: {
          en: "The phone is the wheel. It zeroes on however you are holding it when the race starts.",
          ta: "ஃபோனே ஸ்டீயரிங். ரேஸ் தொடங்கும்போது நீங்க பிடிச்சிருக்கும் நிலையே நடுவாகும்.",
        },
      },
    ],
    layout: {
      en: "Every control can be dragged, resized and faded from Settings, and the arrangement is remembered on that phone.",
      ta: "ஒவ்வொரு கன்ட்ரோலையும் அமைப்புகளில் இழுத்து நகர்த்தலாம், அளவு மாற்றலாம், வெளிப்படையாக்கலாம் - அந்த ஃபோனில் அது நினைவில் இருக்கும்.",
    },
  },

  faq: [
    {
      q: { en: "Is it free?", ta: "இது இலவசமா?" },
      a: {
        en: "Yes. No ads and no in-app purchases, in the browser and in both apps.",
        ta: "ஆமா. பிரவுசரிலும் இரு ஆப்களிலும் விளம்பரம் இல்ல, இன்-ஆப் பர்சேஸ் இல்ல.",
      },
    },
    {
      q: { en: "How do I race a friend?", ta: "நண்பருடன் எப்படி ரேஸ் பண்ணுவது?" },
      a: {
        en: "Pick Create room and read out the six-digit code. Your friend taps Join room and types it. Up to six players, and you can fill the empty places with bots.",
        ta: "Create room தேர்ந்தெடுத்து ஆறு இலக்க கோடைச் சொல்லுங்க. நண்பர் Join room அழுத்தி அதை டைப் பண்ணுவாங்க. ஆறு பேர் வரை, காலி இடங்களை பாட்களால் நிரப்பலாம்.",
      },
    },
    {
      q: {
        en: "Can phone and computer players race together?",
        ta: "போன் மற்றும் கம்ப்யூட்டர் பிளேயர்கள் சேர்ந்து ரேஸ் பண்ணலாமா?",
      },
      a: {
        en: "Yes. The website, the phone home-screen app and the desktop app all join the same room code.",
        ta: "ஆமா. இணையதளம், போன் ஹோம்-ஸ்கிரீன் ஆப், டெஸ்க்டாப் ஆப் - எல்லாமே ஒரே ரூம் கோடில் சேரும்.",
      },
    },
    {
      q: { en: "Do I need to install anything?", ta: "எதுவும் இன்ஸ்டால் பண்ணனுமா?" },
      a: {
        en: "No. It runs in the browser and keeps working offline afterwards. The desktop download is there if you prefer a real window.",
        ta: "இல்ல. பிரவுசரில் இயங்கும், அதுக்கு அப்புறம் ஆஃப்லைனிலும் வேலை செய்யும். தனி சாளரம் வேண்டுமென்றால் டெஸ்க்டாப் டவுன்லோட் இருக்கு.",
      },
    },
    {
      q: { en: "It runs slowly on my phone.", ta: "என் போனில் மெதுவா இருக்கு?" },
      a: {
        en: "Quality drops automatically on slower phones, and you can lower it yourself in Settings. The game needs WebGL 2 and plays in landscape.",
        ta: "மெதுவான போன்களில் கிராபிக்ஸ் தானாக குறையும், Settings-ல நீங்களே குறைக்கலாம். இந்த கேமுக்கு WebGL 2 தேவை, லேண்ட்ஸ்கேப்பில் இயங்கும்.",
      },
    },
  ],
};

/**
 * WITHROOM.
 *
 * Renamed from "The Room That Gets Bigger" when the build grew a story: the
 * expansion mechanic is still the engine underneath it, but what the game is
 * ABOUT is now a man who wakes in a room he did not walk into, with his wife
 * gone. The slug, the asset folder and the save key all changed with the name,
 * so an old save is not left shadowing a new one.
 */
const withRoom: Game = {
  slug: "withroom",
  id: "with-room",
  version: "1.0",

  title: {
    en: "WITHROOM",
    ta: "WITHROOM",
  },
  tagline: {
    en: "A horror mystery puzzle experience. You wake in a room you did not walk into. Your wife is gone, and something in the dark wants you to solve its doors.",
    ta: "ஒரு திகில் மர்மப் புதிர் அனுபவம். நீங்கள் நடந்து செல்லாத ஒரு அறையில் விழித்தெழுகிறீர்கள். உங்கள் மனைவி காணவில்லை, இருட்டில் இருக்கும் ஏதோ ஒன்று அதன் கதவுகளைத் தீர்க்கச் சொல்கிறது.",
  },
  about: {
    en: "You and your wife are driving to an abandoned building at night, in fog, on a road nobody lives on any more. Something is standing in the road. Then you wake up alone, on an iron bed, in a four-metre room with one door that does not open - and a voice that says there are four doors, four answers, and only then will you remember. Nine puzzles across nine rooms, each one physically larger than the last: a stopped clock, four marks and four recesses, three fuses and a dead switch, a code burned into a door frame, her things scattered in the dark, her voice through iron grilles, six clocks all wrong, a key that exists only in a mirror, and seven doors of which one is hers. The whole game is generated in code - every texture, every sound, both voices and the thing that is not a voice - and the ghost says your name out loud.",
    ta: "நீங்களும் உங்கள் மனைவியும் இரவில், மூடுபடலத்தில், இப்போது யாரும் வாழாத சாலையில் ஒரு பாழடைந்த கட்டிடத்துக்குச் செல்கிறீர்கள். சாலையில் ஏதோ நிற்கிறது. பிறகு நீங்கள் தனியாக, ஒரு இரும்புக் கட்டிலில், திறக்காத ஒரே கதவு உள்ள நான்கு மீட்டர் அறையில் விழிக்கிறீர்கள் - நான்கு கதவுகள், நான்கு பதில்கள், அப்போதுதான் உனக்கு நினைவு வரும் என்று ஒரு குரல் சொல்கிறது. ஒன்பது அறைகளில் ஒன்பது புதிர்கள், ஒவ்வொன்றும் முந்தையதைவிடப் பெரியது: நின்றுவிட்ட கடிகாரம், நான்கு குறிகளும் நான்கு குழிகளும், மூன்று ஃப்யூஸ்களும் செயலற்ற சுவிட்சும், கதவுச் சட்டத்தில் எரிந்த எண், இருட்டில் சிதறிய அவளின் பொருட்கள், இரும்பு அடைப்புகள் வழியாக அவளின் குரல், தவறான ஆறு கடிகாரங்கள், கண்ணாடியில் மட்டும் இருக்கும் சாவி, மற்றும் ஏழு கதவுகளில் ஒன்று அவளுடையது. முழு விளையாட்டும் கோடில் உருவாக்கப்படுகிறது - ஒவ்வொரு டெக்ஸ்சரும், ஒலியும், இரு குரல்களும், குரல் அல்லாத அந்த ஒன்றும் - மேலும் அந்த ஆவி உங்கள் பெயரை வாய்விட்டுச் சொல்லும்.",
  },
  categories: ["puzzle", "adventure"],
  tags: [
    { en: "Horror", ta: "திகில்" },
    { en: "First person", ta: "முதல் நபர்" },
    { en: "Story driven", ta: "கதை சார்ந்தது" },
    { en: "Plays offline", ta: "ஆஃப்லைனிலும் இயங்கும்" },
  ],

  cover: "/images/with-room/cell.png",
  poster: "/images/with-room/expansion.png",

  webPath: "/games/with-room/index.html",
  webSize: "4 MB",

  gallery: [
    {
      src: "/images/with-room/cell.png",
      caption: {
        en: "Where you wake up. Four metres across, one bulb, an iron bed, and an instruction nobody signed.",
        ta: "நீங்கள் விழிக்கும் இடம். நான்கு மீட்டர், ஒரு விளக்கு, ஒரு இரும்புக் கட்டில், யாரும் கையெழுத்திடாத ஒரு கட்டளை.",
      },
    },
    {
      src: "/images/with-room/expansion.png",
      caption: {
        en: "The walls travel outward while you stand in the middle of it. Same room, same furniture, ten metres of it.",
        ta: "நீங்கள் நடுவில் நிற்கும்போதே சுவர்கள் வெளியே நகர்கின்றன. அதே அறை, அதே பொருட்கள், பத்து மீட்டர்.",
      },
    },
    {
      src: "/images/with-room/hall.png",
      caption: {
        en: "Act two. The furniture stays against the walls it started on, so it travels out with them.",
        ta: "இரண்டாம் பகுதி. பொருட்கள் தொடங்கிய சுவர்களோடேயே இருப்பதால், அவற்றுடன் சேர்ந்து வெளியே நகர்கின்றன.",
      },
    },
    {
      src: "/images/with-room/cube.png",
      caption: {
        en: "Everything can be picked up, carried and put somewhere it matters. Four of the nine puzzles are built on it.",
        ta: "எல்லாவற்றையும் எடுத்து, எடுத்துச் சென்று, முக்கியமான இடத்தில் வைக்கலாம். ஒன்பதில் நான்கு புதிர்கள் இதன் மேல் கட்டப்பட்டவை.",
      },
    },
  ],

  features: [
    {
      icon: "user",
      title: { en: "It says your name", ta: "அது உங்கள் பெயரைச் சொல்லும்" },
      text: {
        en: "You type a name before the game starts, and the ghost speaks it - out loud, not as text on screen. Three voices are cast from your own device at runtime: a husband, a wife, and something using a woman's voice at half speed under a bed of breath and sub-bass.",
        ta: "விளையாட்டு தொடங்கும் முன் ஒரு பெயரை எழுதுகிறீர்கள், அந்த ஆவி அதைச் சொல்லும் - திரையில் எழுத்தாக அல்ல, வாய்விட்டு. மூன்று குரல்கள் உங்கள் சாதனத்திலேயே தேர்ந்தெடுக்கப்படுகின்றன: கணவன், மனைவி, மற்றும் ஒரு பெண் குரலை பாதி வேகத்தில் பயன்படுத்தும் ஏதோ ஒன்று.",
      },
    },
    {
      icon: "scaling",
      title: { en: "The room is the health bar", ta: "அறையே உயிர் அளவு" },
      text: {
        en: "Nine authored room states, from a four-metre cell to a city block. Solving pushes you up one. Failing badly pushes you down one. There is no other health, and wrong answers to a lock cost nothing on purpose.",
        ta: "நான்கு மீட்டர் அறையிலிருந்து நகரப் பகுதி வரை ஒன்பது நிலைகள். தீர்த்தால் ஒன்று மேலே, பெரிதாகத் தவறினால் ஒன்று கீழே. வேறு உயிர் அளவே இல்லை; பூட்டில் தவறான பதில் வேண்டுமென்றே இலவசம்.",
      },
    },
    {
      icon: "eye",
      title: { en: "You watch it happen", ta: "நீங்களே பார்க்கிறீர்கள்" },
      text: {
        en: "No cut, no loading screen. The lights stutter, the floor trembles, and then the walls travel outward for seven seconds while you stand in the middle of it.",
        ta: "கட் இல்லை, லோடிங் திரை இல்லை. விளக்கு கண்சிமிட்டும், தரை நடுங்கும், பிறகு நீங்கள் நடுவில் நிற்கும்போதே சுவர்கள் ஏழு வினாடிகள் வெளியே நகரும்.",
      },
    },
    {
      icon: "map",
      title: { en: "Nine real puzzles", ta: "ஒன்பது உண்மையான புதிர்கள்" },
      text: {
        en: "A clock, an order of marks, three fuses and a switch, a four-digit code, three things of hers, her voice through five grilles, six clocks, a key in a mirror, and seven doors. Every one of them is finished by the world being in a particular state - never by a button that says continue.",
        ta: "ஒரு கடிகாரம், குறிகளின் வரிசை, மூன்று ஃப்யூஸ்கள், நான்கு எண் குறியீடு, அவளின் மூன்று பொருட்கள், ஐந்து அடைப்புகள் வழியாக அவளின் குரல், ஆறு கடிகாரங்கள், கண்ணாடியில் ஒரு சாவி, ஏழு கதவுகள். ஒவ்வொன்றும் உலகம் ஒரு குறிப்பிட்ட நிலையில் இருப்பதால் முடிகிறது - தொடரவும் என்ற பொத்தானால் அல்ல.",
      },
    },
    {
      icon: "rain",
      title: { en: "Two cutscenes and an ending", ta: "இரு காட்சிகளும் ஒரு முடிவும்" },
      text: {
        en: "A drive through fog with a camera on a crane, a flashback at the door of the building, and a corridor that does not end. The husband and wife are built from anatomy at runtime - proportion, breath, blinking, saccades - not posed by a model file.",
        ta: "மூடுபடலத்தில் ஒரு பயணம், கட்டிடத்தின் கதவில் ஒரு பின்னோட்டம், முடிவில்லாத ஒரு நடைபாதை. கணவனும் மனைவியும் ஓட்ட நேரத்தில் உடற்கூறு அளவுகளில் கட்டப்படுகிறார்கள் - விகிதம், மூச்சு, கண் சிமிட்டல், கண் அசைவு.",
      },
    },
    {
      icon: "offline",
      title: { en: "No downloads, no account", ta: "டவுன்லோட் இல்லை, கணக்கு இல்லை" },
      text: {
        en: "Every texture and every sound is generated in code at load time - there is not one image or audio file in the build. It caches itself and then plays offline.",
        ta: "ஒவ்வொரு டெக்ஸ்சரும் ஒலியும் ஏற்றும் நேரத்தில் கோடில் உருவாக்கப்படுகிறது - பில்டில் ஒரு படமோ ஒலிக்கோப்போ இல்லை. தானே கேச் செய்து ஆஃப்லைனில் இயங்கும்.",
      },
    },
  ],

  stages: [
    {
      name: { en: "Act one - Four doors, four answers", ta: "பகுதி ஒன்று - நான்கு கதவுகள், நான்கு பதில்கள்" },
      note: {
        en: "4 x 4 to 15 x 12. The clock, the marks, the fuse box and the code on the main door. Opening it tells you what happened on the road.",
        ta: "4 x 4 முதல் 15 x 12 வரை. கடிகாரம், குறிகள், ஃப்யூஸ் பெட்டி, பிரதான கதவின் குறியீடு. அதைத் திறந்தால் சாலையில் நடந்தது தெரியும்.",
      },
    },
    {
      name: { en: "Act two - Find her", ta: "பகுதி இரண்டு - அவளைக் கண்டுபிடி" },
      note: {
        en: "25 x 18 to 250 x 150. Her things, her voice, every clock in the room, a key that is only in the mirror, and seven doors of which one is hers.",
        ta: "25 x 18 முதல் 250 x 150 வரை. அவளின் பொருட்கள், அவளின் குரல், அறையின் ஒவ்வொரு கடிகாரம், கண்ணாடியில் மட்டும் இருக்கும் சாவி, ஏழு கதவுகளில் ஒன்று அவளுடையது.",
      },
    },
    {
      name: { en: "Chapter two - ?", ta: "அத்தியாயம் இரண்டு - ?" },
      note: {
        en: "The corridor at the end of this one has more doors in it than the whole game had. That is not a metaphor.",
        ta: "இதன் முடிவில் வரும் நடைபாதையில் முழு விளையாட்டிலும் இருந்ததைவிட அதிக கதவுகள் உள்ளன. இது உருவகம் அல்ல.",
      },
    },
  ],

  controls: [
    { keys: "W A S D", action: { en: "Move", ta: "நகர" } },
    { keys: "Mouse", action: { en: "Look around", ta: "சுற்றிப் பார்க்க" } },
    { keys: "E / Click", action: { en: "Interact, pick up", ta: "செயல்பட, எடுக்க" } },
    { keys: "Right click", action: { en: "Throw what you are holding", ta: "பிடித்ததை வீச" } },
    { keys: "Q", action: { en: "Drop", ta: "கீழே வைக்க" } },
    { keys: "Shift", action: { en: "Sprint", ta: "ஓட" } },
    { keys: "C", action: { en: "Crouch - two puzzles need it", ta: "குனிய - இரு புதிர்களுக்குத் தேவை" } },
    { keys: "H", action: { en: "Hint, escalating", ta: "உதவி, படிப்படியாக" } },
    { keys: "Space", action: { en: "Skip a line of dialogue", ta: "ஒரு வசனத்தைத் தாண்ட" } },
    { keys: "Esc", action: { en: "Pause - hold in a cutscene to skip it", ta: "இடைநிறுத்தம் - காட்சியில் அழுத்திப் பிடித்தால் தாண்டும்" } },
    { keys: "F8", action: { en: "Developer overlay", ta: "டெவலப்பர் தகவல்" } },
  ],

  faq: [
    {
      q: { en: "How much of it can I play?", ta: "எவ்வளவு விளையாடலாம்?" },
      a: {
        en: "All nine stages, both acts, both cutscenes and the ending. It runs about an hour the first time, less once you know where the fourth digit is.",
        ta: "ஒன்பது நிலைகளும், இரு பகுதிகளும், இரு காட்சிகளும், முடிவும். முதல் முறை ஏறக்குறைய ஒரு மணி நேரம்; நான்காவது எண் எங்கே என்று தெரிந்தபின் குறைவு.",
      },
    },
    {
      q: { en: "Is it actually frightening?", ta: "உண்மையிலேயே பயமாக இருக்குமா?" },
      a: {
        en: "It is built to be unsettling rather than startling. There are no jumpscares with a loud noise attached - what there is instead is a room that creaks, a door handle that turns from the other side, a figure that is only ever behind you, and a voice that knows your name. Headphones make a large difference.",
        ta: "திடுக்கிடுவதை விட அசௌகரியமாக உணர வைக்கும்படி கட்டப்பட்டது. சத்தமாக மிரட்டும் காட்சிகள் இல்லை - சத்தமிடும் அறை, மறுபக்கத்திலிருந்து திரும்பும் கதவுக் கைப்பிடி, எப்போதும் உங்கள் பின்னால் மட்டுமே இருக்கும் ஓர் உருவம், உங்கள் பெயரை அறிந்த ஒரு குரல். ஹெட்ஃபோன் பெரிய வித்தியாசம் செய்யும்.",
      },
    },
    {
      q: { en: "Why does the ghost sound robotic sometimes?", ta: "சில சமயம் ஆவியின் குரல் ஏன் யந்திரமாக இருக்கிறது?" },
      a: {
        en: "Because the words come from your own browser's speech engine - that is the only way a game can say a name you typed thirty seconds ago. Which voices exist differs by device, so the game picks the best it can find and then layers breath, sub-bass and whisper grains under it. Voices can be switched off in Settings; subtitles carry the whole story either way.",
        ta: "வார்த்தைகள் உங்கள் பிரவுசரின் பேச்சு எந்திரத்திலிருந்து வருகின்றன - முப்பது வினாடிகள் முன்பு நீங்கள் எழுதிய பெயரை ஒரு விளையாட்டு சொல்ல இதுவே ஒரே வழி. எந்தக் குரல்கள் உள்ளன என்பது சாதனத்துக்கு சாதனம் மாறும்; கிடைக்கும் சிறந்ததை எடுத்து, அதன் கீழே மூச்சும் சப்-பாஸும் சேர்க்கப்படுகிறது. அமைப்புகளில் குரல்களை நிறுத்தலாம்; வசனங்கள் கதையை முழுமையாகச் சொல்லும்.",
      },
    },
    {
      q: { en: "Does it work on a phone?", ta: "ஃபோனில் வேலை செய்யுமா?" },
      a: {
        en: "Yes, in landscape. The phone gets its own control scheme rather than shrunken desktop controls: a thumbstick that appears wherever your left thumb lands, and the whole right half of the screen as a look area.",
        ta: "ஆம், அகலக் காட்சியில். ஃபோனுக்கு தனி கட்டுப்பாட்டு முறை - டெஸ்க்டாப் கட்டுப்பாடுகளைச் சுருக்கியது அல்ல: இடது கட்டைவிரல் படும் இடத்தில் தோன்றும் ஸ்டிக், மற்றும் திரையின் வலது பாதி முழுவதும் பார்வைக்கான பகுதி.",
      },
    },
    {
      q: { en: "My machine is old. Will it run?", ta: "என் கணினி பழையது. இயங்குமா?" },
      a: {
        en: "It measures how long your frames actually take and lowers the rendering resolution to keep up, over two-and-a-half-second windows so one slow moment never makes it panic. It needs WebGL2; everything else it works out itself.",
        ta: "உங்கள் ஃபிரேம்கள் எடுக்கும் நேரத்தை அளந்து, வேகத்தைத் தக்கவைக்க தெளிவைக் குறைக்கிறது - இரண்டரை வினாடி சாளரங்களில், ஒரு மெதுவான கணம் பதற்றம் ஏற்படுத்தாதபடி. WebGL2 தேவை; மற்றதை அது தானே கணக்கிடும்.",
      },
    },
    {
      q: { en: "Is my progress saved?", ta: "என் முன்னேற்றம் சேமிக்கப்படுமா?" },
      a: {
        en: "To this browser, every thirty seconds and at every checkpoint, and again the moment you switch tabs. Your name is saved with it. A save made during a cutscene resumes at the stage after it rather than replaying it.",
        ta: "இந்த பிரவுசரில், ஒவ்வொரு முப்பது வினாடிக்கும், ஒவ்வொரு சோதனைப் புள்ளியிலும், நீங்கள் டேப் மாறும் தருணத்திலும். உங்கள் பெயரும் சேமிக்கப்படும். ஒரு காட்சியின் நடுவில் சேமித்தால், அதை மீண்டும் காட்டாமல் அடுத்த நிலையிலிருந்து தொடரும்.",
      },
    },
  ],
};

export const games: Game[] = [deliveryHero, velocityRift, withRoom];

export const getGame = (slug: string): Game | undefined =>
  games.find((game) => game.slug === slug);

/**
 * The title the home page leads with. Named rather than indexed so changing the
 * flagship is a one-line edit here instead of a reshuffle of `games`.
 */
export const featuredGame: Game = deliveryHero;

/** How many published titles appear under a category. */
export const countInCategory = (id: CategoryId): number =>
  games.filter((game) => game.categories.includes(id)).length;

/**
 * Real screenshots from every title, interleaved so the home page strip
 * alternates between games instead of showing one in a block. Captions come
 * from each game's own gallery, so nothing here is written twice.
 */
export const showcaseShots: Shot[] = (() => {
  const lists = games.map((game) => game.gallery ?? []);
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const out: Shot[] = [];
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      if (list[i]) out.push(list[i]);
    }
  }
  return out;
})();

/** Convenience exports for the pages that render these titles. */
export { deliveryHero, velocityRift, withRoom };
