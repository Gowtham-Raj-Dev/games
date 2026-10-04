/**
 * The stage list.
 *
 * One stage per room state: finishing stage N is what makes the room expand
 * from state N to state N+1. That mapping is deliberate and is the reason the
 * game needs no separate level counter - the size of the room IS the progress
 * bar, and this file is only the readable version of it.
 *
 * Each entry carries what the player is trying to do and the exact steps to do
 * it, because the game shows this list in Settings. A horror game that hides its
 * goals behind "figure it out" loses most players in the first ten minutes; one
 * that states the goal plainly and still makes you work out the HOW keeps them.
 * The steps here describe the MECHANISM, never the answer - no code, no order of
 * marks, no which-door.
 *
 * All nine are built and playable. `flags` lines up one world flag per `how`
 * step, in the same order, which is what lets the hint system point at the first
 * step the player has NOT done instead of reciting the whole solution.
 */

export const STATUS = {
  PLAYABLE: "playable",
  PLANNED: "planned",
};

export const STAGES = [
  /* ======================================================================== *
   * ACT ONE - FOUR DOORS, FOUR ANSWERS
   * ======================================================================== */

  {
    n: 1,
    state: 0,
    status: STATUS.PLAYABLE,
    name: { en: "The Hour", ta: "அந்த நேரம்" },
    size: "4 × 4",
    goal: {
      en: "Set the clock to the right time.",
      ta: "கடிகாரத்தைச் சரியான நேரத்துக்கு வையுங்கள்.",
    },
    flags: ["readWriting", "readBook", "readClock", "stage1Solved"],
    how: [
      {
        en: "Read the writing on the wall above the bed. It tells you what this place wants.",
        ta: "கட்டிலுக்கு மேல் சுவரில் உள்ள எழுத்தைப் படியுங்கள். இந்த இடம் என்ன கேட்கிறது என்பதைச் சொல்கிறது.",
      },
      {
        en: "Pick up the book on the table and read it. A time is written inside.",
        ta: "மேசையில் உள்ள புத்தகத்தை எடுத்துப் படியுங்கள். உள்ளே ஒரு நேரம் எழுதியிருக்கும்.",
      },
      {
        en: "Look at the wall clock. It stopped, and the time it stopped at is wrong.",
        ta: "சுவர் கடிகாரத்தைப் பாருங்கள். அது நின்றுவிட்டது, நின்ற நேரம் தவறு.",
      },
      {
        en: "Press E on the clock to move the minute hand forward five minutes at a time, until it matches the book. The hour it lands on is also the first digit of the code on the main door.",
        ta: "கடிகாரத்தில் E அழுத்தினால் நிமிட முள் ஐந்து நிமிடம் முன்னேறும் - புத்தகத்தில் உள்ள நேரம் வரும் வரை செய்யுங்கள். அந்த மணி நேரமே பிரதான கதவின் முதல் எண்ணும்.",
      },
    ],
    reward: {
      en: "The room expands to 6 × 6, and a digit burns itself into the door frame.",
      ta: "அறை 6 × 6 ஆக விரிகிறது, கதவு சட்டத்தில் ஒரு எண் எரிந்து பதிகிறது.",
    },
  },

  {
    n: 2,
    state: 1,
    status: STATUS.PLAYABLE,
    name: { en: "The Marks", ta: "குறிகள்" },
    size: "6 × 6",
    goal: {
      en: "Put the four stone tiles in the right four recesses.",
      ta: "நான்கு கற்தட்டுகளையும் சரியான நான்கு குழிகளில் வையுங்கள்.",
    },
    flags: ["readSigilClue", "sawSigil", null, "stage2Solved"],
    how: [
      {
        en: "Four marks are scratched into the wall above the bed, each with a number under it. The number is the recess that mark belongs in.",
        ta: "கட்டிலுக்கு மேல் சுவரில் நான்கு குறிகள் கீறப்பட்டுள்ளன, ஒவ்வொன்றின் கீழும் ஒரு எண். அந்த எண் அந்தக் குறி செல்ல வேண்டிய குழி.",
      },
      {
        en: "Four tiles are lying around the room, each cut with one of the same marks.",
        ta: "அறையைச் சுற்றி நான்கு தட்டுகள் கிடக்கின்றன, ஒவ்வொன்றிலும் அதே குறிகளில் ஒன்று.",
      },
      {
        en: "Press E to pick a tile up, carry it to its recess, and press E again to set it down. A wrong tile is accepted and does nothing.",
        ta: "E அழுத்தி ஒரு தட்டை எடுங்கள், அதன் குழிக்குக் கொண்டு சென்று மீண்டும் E அழுத்தி வையுங்கள். தவறான தட்டு ஏற்கப்படும், ஆனால் எதுவும் நடக்காது.",
      },
      {
        en: "A recess lights up once the right mark is in it. Satisfy all four.",
        ta: "சரியான குறி விழுந்ததும் குழி ஒளிரும். நான்கையும் நிறைவு செய்யுங்கள்.",
      },
    ],
    reward: { en: "The room expands to 10 × 8. Second digit.", ta: "அறை 10 × 8 ஆக விரிகிறது. இரண்டாவது எண்." },
  },

  {
    n: 3,
    state: 2,
    status: STATUS.PLAYABLE,
    name: { en: "The Mechanism", ta: "மின் பெட்டி" },
    size: "10 × 8",
    goal: {
      en: "Find the three fuses, seat them, and throw the switch.",
      ta: "மூன்று ஃப்யூஸ்களைக் கண்டுபிடித்து, பொருத்தி, சுவிட்சைப் போடுங்கள்.",
    },
    flags: ["sawFusebox", "foundFuse", "seated:fuseBlue", "stage3Solved"],
    how: [
      {
        en: "There is a cast-iron fuse box on the wall with three empty sockets. Each socket has a coloured ring.",
        ta: "சுவரில் ஒரு இரும்பு ஃப்யூஸ் பெட்டி, மூன்று காலி இடங்கள். ஒவ்வொன்றுக்கும் ஒரு வண்ண வளையம்.",
      },
      {
        en: "Three fuses are hidden: one in something, one inside something, one behind something. Each has a band matching a socket.",
        ta: "மூன்று ஃப்யூஸ்கள் மறைந்துள்ளன: ஒன்று ஒரு பொருளுக்குள், ஒன்று ஒரு பெட்டிக்குள், ஒன்று ஒரு பொருளுக்குப் பின்னால். ஒவ்வொன்றின் பட்டையும் ஒரு இடத்துக்குப் பொருந்தும்.",
      },
      {
        en: "Carry a fuse to the box and press E on the box - it is taken out of your hands into its socket.",
        ta: "ஒரு ஃப்யூஸை பெட்டிக்குக் கொண்டு சென்று பெட்டியில் E அழுத்துங்கள் - அது உங்கள் கையிலிருந்து அதன் இடத்துக்குச் செல்லும்.",
      },
      {
        en: "With all three in, throw the knife switch under the box. Throwing it early costs nothing.",
        ta: "மூன்றும் பொருந்தியபின், பெட்டிக்குக் கீழே உள்ள சுவிட்சைப் போடுங்கள். முன்னதாகப் போட்டால் இழப்பு இல்லை.",
      },
    ],
    reward: { en: "The building has power. The room expands to 15 × 12. Third digit.", ta: "கட்டிடத்துக்கு மின்சாரம். அறை 15 × 12 ஆக விரிகிறது. மூன்றாவது எண்." },
  },

  {
    n: 4,
    state: 3,
    status: STATUS.PLAYABLE,
    name: { en: "The Lock", ta: "பூட்டு" },
    size: "15 × 12",
    goal: {
      en: "Open the main door.",
      ta: "பிரதான கதவைத் திறங்கள்.",
    },
    flags: ["usedKeypad", "foundFloorDigit", "stage4Solved", "mainDoorOpened"],
    how: [
      {
        en: "There is a four-digit keypad beside the door, and four burn marks on the frame. Press the marks to read the digits you have earned.",
        ta: "கதவுக்குப் பக்கத்தில் நான்கு எண் பலகை, சட்டத்தில் நான்கு எரிந்த குறிகள். நீங்கள் பெற்ற எண்களைப் படிக்க குறிகளை அழுத்துங்கள்.",
      },
      {
        en: "The first three digits came from the first three stages. The fourth is scratched into the floor UNDER the bed - crouch with C and look.",
        ta: "முதல் மூன்று எண்கள் முதல் மூன்று நிலைகளில் கிடைத்தவை. நான்காவது கட்டிலுக்கு அடியில் தரையில் கீறப்பட்டுள்ளது - C அழுத்தி குனிந்து பாருங்கள்.",
      },
      {
        en: "Enter the four digits in order on the keypad. A wrong code costs nothing - the door simply stays shut.",
        ta: "நான்கு எண்களையும் வரிசையாக பலகையில் அழுத்துங்கள். தவறான எண்ணுக்கு இழப்பு இல்லை - கதவு மூடியே இருக்கும்.",
      },
      {
        en: "Then open the door.",
        ta: "பிறகு கதவைத் திறங்கள்.",
      },
    ],
    reward: {
      en: "You find out what happened at this building.",
      ta: "இந்தக் கட்டிடத்தில் என்ன நடந்தது என்பது தெரியும்.",
    },
  },

  /* ======================================================================== *
   * ACT TWO - FIND HER
   * ======================================================================== */

  {
    n: 5,
    state: 4,
    status: STATUS.PLAYABLE,
    name: { en: "Her Things", ta: "அவளின் பொருட்கள்" },
    size: "25 × 18",
    goal: {
      en: "Find the three things of hers in this room and put them on the bed.",
      ta: "இந்த அறையில் அவளுடைய மூன்று பொருட்களைக் கண்டுபிடித்து கட்டிலில் வையுங்கள்.",
    },
    flags: ["found:phone", "found:scarf", "found:ring", "stage5Solved"],
    how: [
      {
        en: "Her phone is still lit. Look for the only light in the room that is not the bulb.",
        ta: "அவளின் தொலைபேசி இன்னும் எரிகிறது. விளக்கு அல்லாத ஒரே ஒளியைத் தேடுங்கள்.",
      },
      {
        en: "Her scarf is over the back of a chair, in plain sight.",
        ta: "அவளின் துப்பட்டா நாற்காலியின் பின்பக்கத்தில், கண் முன்னேயே.",
      },
      {
        en: "Her ring is on the floor under the table. It is nine millimetres across - crouch, and watch for a glint.",
        ta: "அவளின் மோதிரம் மேசைக்கு அடியில் தரையில். ஒன்பது மில்லிமீட்டர் மட்டுமே - குனிந்து, ஒரு மின்னலைக் கவனியுங்கள்.",
      },
      {
        en: "Carry each one to the bed and set it down inside the light. She says something each time.",
        ta: "ஒவ்வொன்றையும் கட்டிலுக்குக் கொண்டு சென்று ஒளிக்குள் வையுங்கள். ஒவ்வொரு முறையும் அவள் ஏதோ சொல்வாள்.",
      },
    ],
    reward: { en: "You hear her. The room expands to 40 × 30.", ta: "அவள் குரல் கேட்கிறது. அறை 40 × 30 ஆக விரிகிறது." },
  },

  {
    n: 6,
    state: 5,
    status: STATUS.PLAYABLE,
    name: { en: "The Voices", ta: "குரல்கள்" },
    size: "40 × 30",
    goal: {
      en: "Answer her three times before the grille goes quiet.",
      ta: "கம்பி அடைப்பு அமைதியாகும் முன் மூன்று முறை அவளுக்குப் பதில் சொல்லுங்கள்.",
    },
    flags: ["usedGrille", null, null, "stage6Solved"],
    how: [
      {
        en: "Five iron grilles are set into the walls. One at a time, one of them crackles, glows, and she speaks through it.",
        ta: "சுவர்களில் ஐந்து இரும்புக் கம்பி அடைப்புகள். ஒரு நேரத்தில் ஒன்று சிதறி ஒளிர்ந்து, அதன் வழியாக அவள் பேசுவாள்.",
      },
      {
        en: "You have eight seconds. From the middle of the room you can reach any of them; from a corner you cannot reach the far one.",
        ta: "எட்டு வினாடிகள் மட்டுமே. அறையின் நடுவிலிருந்து எதையும் அடையலாம்; மூலையிலிருந்து தூரத்தில் உள்ளதை அடைய முடியாது.",
      },
      {
        en: "Press E on the grille while it is still lit.",
        ta: "அது ஒளிரும்போதே கம்பி அடைப்பில் E அழுத்துங்கள்.",
      },
      {
        en: "Three in a row. Missing one puts the count back to zero and costs nothing else.",
        ta: "தொடர்ந்து மூன்று. ஒன்றைத் தவறவிட்டால் எண்ணிக்கை பூஜ்ஜியம் ஆகும், வேறு இழப்பு இல்லை.",
      },
    ],
    reward: { en: "She tells you about the clocks. The room expands to 70 × 50.", ta: "கடிகாரங்களைப் பற்றி அவள் சொல்வாள். அறை 70 × 50 ஆக விரிகிறது." },
  },

  {
    n: 7,
    state: 6,
    status: STATUS.PLAYABLE,
    name: { en: "The Clocks", ta: "கடிகாரங்கள்" },
    size: "70 × 50",
    goal: {
      en: "Set every clock in the room to the hour.",
      ta: "அறையில் உள்ள ஒவ்வொரு கடிகாரத்தையும் அந்த மணி நேரத்துக்கு வையுங்கள்.",
    },
    flags: ["usedClocks", null, null, "stage7Solved"],
    how: [
      {
        en: "Six clocks, all stopped at different wrong times. Nothing in this room tells you the right one - you were told it in the first room, and again by the voice.",
        ta: "ஆறு கடிகாரங்கள், எல்லாம் வெவ்வேறு தவறான நேரங்களில் நின்றுவிட்டன. சரியான நேரத்தை இந்த அறை சொல்லாது - அது முதல் அறையிலும், பிறகு அந்தக் குரலிலும் சொல்லப்பட்டது.",
      },
      {
        en: "Press E on a clock to move its minute hand forward five minutes. The first press snaps it onto the five-minute marks.",
        ta: "கடிகாரத்தில் E அழுத்தினால் நிமிட முள் ஐந்து நிமிடம் முன்னேறும். முதல் அழுத்தல் அதை ஐந்து நிமிட குறிகளுக்குக் கொண்டு வரும்.",
      },
      {
        en: "A clock chimes once when it is right.",
        ta: "சரியானபோது கடிகாரம் ஒரு முறை ஒலிக்கும்.",
      },
      {
        en: "Something in the room will put one of them back, once. Listen for which.",
        ta: "அறையில் ஏதோ ஒன்று ஒரு கடிகாரத்தை ஒரே ஒரு முறை பின்னுக்குத் தள்ளும். எது என்று கேளுங்கள்.",
      },
    ],
    reward: { en: "The room expands to 120 × 80.", ta: "அறை 120 × 80 ஆக விரிகிறது." },
  },

  {
    n: 8,
    state: 7,
    status: STATUS.PLAYABLE,
    name: { en: "The Mirror", ta: "கண்ணாடி" },
    size: "120 × 80",
    goal: {
      en: "Take the key that is only in the reflection.",
      ta: "கண்ணாடியில் மட்டும் இருக்கும் சாவியை எடுங்கள்.",
    },
    flags: ["lookedInMirror", null, "hasFinalKey", "stage8Solved"],
    how: [
      {
        en: "There is a tall mirror leaning against the west wall. Look into it.",
        ta: "மேற்கு சுவரில் ஒரு உயரமான கண்ணாடி சாய்ந்திருக்கிறது. அதில் பாருங்கள்.",
      },
      {
        en: "In the reflection, a key hangs on a hook on the opposite wall. Turn around: that wall is bare.",
        ta: "பிம்பத்தில், எதிர்ச் சுவரில் ஒரு கொக்கியில் சாவி தொங்குகிறது. திரும்பிப் பாருங்கள்: அந்தச் சுவர் வெறுமையாக இருக்கும்.",
      },
      {
        en: "Once you have looked in the mirror, a nail hole appears on that wall at the mirrored spot. Go to it.",
        ta: "கண்ணாடியில் பார்த்தபின், அந்தச் சுவரில் பிம்பத்துக்கு நேர் எதிர் இடத்தில் ஒரு ஆணித் துளை தெரியும். அங்கு செல்லுங்கள்.",
      },
      {
        en: "Reach for the hook that is not there.",
        ta: "இல்லாத கொக்கியை நோக்கி கையை நீட்டுங்கள்.",
      },
    ],
    reward: { en: "The last key. The room expands to 250 × 150.", ta: "கடைசி சாவி. அறை 250 × 150 ஆக விரிகிறது." },
  },

  {
    n: 9,
    state: 8,
    status: STATUS.PLAYABLE,
    name: { en: "Her Door", ta: "அவளின் கதவு" },
    size: "250 × 150",
    goal: {
      en: "Find which of the seven doors is hers, and unlock it.",
      ta: "ஏழு கதவுகளில் அவளுடையது எது என்று கண்டுபிடித்து திறங்கள்.",
    },
    flags: ["readRing", null, "stage9Solved", "stage9Solved"],
    how: [
      {
        en: "Seven doors stand in the open, each cut with one of the four marks. They do not lead anywhere.",
        ta: "திறந்த வெளியில் ஏழு கதவுகள், ஒவ்வொன்றிலும் நான்கு குறிகளில் ஒன்று. அவை எங்கும் செல்லவில்லை.",
      },
      {
        en: "The mark on hers is engraved inside her wedding ring. You carried it to the bed in stage five - examine it again.",
        ta: "அவளுடைய கதவின் குறி அவளது திருமண மோதிரத்தின் உள்ளே பொறிக்கப்பட்டுள்ளது. ஐந்தாம் நிலையில் அதை கட்டிலுக்குக் கொண்டு சென்றீர்கள் - மீண்டும் பாருங்கள்.",
      },
      {
        en: "Use the key from the mirror on the door with that mark. Trying the wrong door costs nothing.",
        ta: "அந்தக் குறி உள்ள கதவில் கண்ணாடியிலிருந்து எடுத்த சாவியைப் பயன்படுத்துங்கள். தவறான கதவை முயன்றால் இழப்பு இல்லை.",
      },
      {
        en: "Then walk through it.",
        ta: "பிறகு அதன் வழியாக நடந்து செல்லுங்கள்.",
      },
    ],
    reward: {
      en: "You find out how many doors there are.",
      ta: "எத்தனை கதவுகள் இருக்கின்றன என்பது தெரியும்.",
    },
  },
];

/* -------------------------------------------------------------------------- *
 * Hints
 *
 * The brief: a player should be able to finish a stage from inside the game,
 * without opening the Settings guide. But a button that prints the answer makes
 * the puzzle pointless, so the hint escalates instead:
 *
 *   first press   the GOAL - what this place wants, no method
 *   after that    the first step you have not yet done
 *   and after     the step after that, and so on
 *
 * Because the steps are matched to world flags, a player who has already read
 * the book is never told to read the book. The hint meets them where they
 * actually are.
 * -------------------------------------------------------------------------- */

/**
 * The hint to show for a stage, given how many times help has been asked for
 * and a predicate that reports whether a world flag is set.
 */
export function hintFor(stateId, asked, hasFlag) {
  const stage = stageForState(stateId);

  if (stage.status !== STATUS.PLAYABLE) {
    return { kind: "unbuilt", stage, step: null, tier: 0, last: true };
  }

  // First ask is always the goal. It orients without method.
  if (asked <= 1) {
    return { kind: "goal", stage, step: stage.goal, tier: 1, last: false };
  }

  // After that, walk to the first step the player has not completed, then step
  // forward one per additional ask.
  const flags = stage.flags || [];
  let firstUndone = stage.how.findIndex((_, i) => !hasFlag(flags[i]));
  if (firstUndone < 0) firstUndone = stage.how.length - 1;

  const index = Math.min(firstUndone + (asked - 2), stage.how.length - 1);
  return {
    kind: "step",
    stage,
    step: stage.how[index],
    tier: index + 2,
    last: index >= stage.how.length - 1,
  };
}

/** How many stages the game has, for anywhere that needs to say so. */
export const STAGE_COUNT = STAGES.length;

/** How many are actually finished and playable today. */
export const PLAYABLE_COUNT = STAGES.filter(
  (s) => s.status === STATUS.PLAYABLE,
).length;

/** The stage the player is currently in, from the room state. */
export function stageForState(stateId) {
  return STAGES.find((s) => s.state === stateId) ?? STAGES[STAGES.length - 1];
}

/** 1-based stage number for a room state. */
export const stageNumber = (stateId) => stageForState(stateId).n;
