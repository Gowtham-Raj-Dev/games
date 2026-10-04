/**
 * The script.
 *
 * Every spoken line in WITHROOM, in English and Tamil, in one file. Nothing
 * else in the codebase contains dialogue - a scene asks for a sequence by
 * name and plays it, which is what keeps the story readable as a story
 * instead of being scattered across the modules that happen to show it.
 *
 * A line is:
 *
 *   who    "him" | "her" | "ghost" | "none"
 *          Chooses the voice AND the subtitle's speaker label. "none" is for
 *          text that is not spoken by a person - a title card, a sound.
 *   emo    An emotion key the voice engine turns into rate, pitch and gain.
 *          See story/voice.js for the table. Nothing here needs to know how
 *          fear is synthesised, only that this line is afraid.
 *   en/ta  The line. `{name}` is replaced from story/profile.js and is the
 *          ONLY placeholder the script may use.
 *   after  Seconds of silence held after the line. This is the pacing, and
 *          it is authored rather than uniform: the ghost's pauses are the
 *          reason the ghost is frightening.
 *   cue    Optional. Emitted on the bus as the line starts, so the scene can
 *          hang an event off a word - the smoke appears on the line that
 *          mentions it, not two seconds later.
 *
 * TRANSLATION NOTE. The Tamil is written to be spoken, not to be a gloss of
 * the English. Where a literal translation would be stiff - "do you really
 * want to know what happened" - the Tamil says the same thing the way someone
 * would actually say it, because these lines are read aloud by a voice engine
 * and a stiff line sounds like a form being filled in.
 */

/* -------------------------------------------------------------------------- *
 * ACT ZERO - the car
 *
 * Two people in a car at night, talking about nothing, which is how every
 * horror story worth telling starts. The job of this sequence is to make the
 * player like them before anything happens to either of them, and to plant
 * three facts: they are going somewhere isolated, she does not want to be,
 * and he is going anyway.
 * -------------------------------------------------------------------------- */

export const CAR = [
  { who: "him", emo: "calm", after: 0.5, cue: "wipers",
    en: "The fog's getting worse.",
    ta: "மூடுபடலம் இன்னும் அதிகமாகுது." },

  { who: "her", emo: "calm", after: 0.4,
    en: "Slow down. Please.",
    ta: "கொஞ்சம் மெதுவா போ. ப்ளீஸ்." },

  { who: "him", emo: "calm", after: 0.9, cue: "lookAtHer",
    en: "I'm doing forty.",
    ta: "நாற்பதே போயிட்டு இருக்கேன்." },

  { who: "her", emo: "worried", after: 1.1,
    en: "I know. It still feels too fast.",
    ta: "தெரியும். இன்னும் வேகமா இருக்குற மாதிரி இருக்கு." },

  { who: "him", emo: "calm", after: 0.8, cue: "roadAhead",
    en: "Are you sure this is the place?",
    ta: "இது அந்த இடமா, நிச்சயமா?" },

  { who: "her", emo: "worried", after: 0.6,
    en: "The address was in her handwriting. So, yes.",
    ta: "அந்த முகவரி அவங்க கையெழுத்துல இருந்துச்சு. அப்படியே தான்." },

  { who: "him", emo: "calm", after: 1.0,
    en: "Eleven years and she writes once. To say come and look at a house.",
    ta: "பதினொரு வருஷம் கழிச்சு ஒரு கடிதம். ஒரு வீட்டைப் பார்க்க வாங்கன்னு." },

  { who: "her", emo: "worried", after: 1.2, cue: "treesPass",
    en: "Nobody has lived out here since the fire. Not one house.",
    ta: "அந்தத் தீ விபத்துக்கு அப்புறம் இங்க யாரும் குடியிருக்கல. ஒரு வீட்டுலயும் இல்ல." },

  { who: "him", emo: "calm", after: 0.7,
    en: "Then we look at it, we take the photographs, and we drive home.",
    ta: "சரி, பார்க்கிறோம், போட்டோ எடுக்கிறோம், வீட்டுக்குப் போயிடுவோம்." },

  { who: "her", emo: "afraid", after: 0.5,
    en: "I don't want to go inside.",
    ta: "எனக்கு உள்ள போக விருப்பமில்ல." },

  { who: "him", emo: "calm", after: 1.4,
    en: "Then don't. Stay in the car. I'll be ten minutes.",
    ta: "வேண்டாம். காருலயே இரு. பத்து நிமிஷத்துல வந்துடுவேன்." },

  { who: "her", emo: "worried", after: 1.2, cue: "sheLooksOut",
    en: "You always say ten minutes.",
    ta: "நீ எப்பவும் பத்து நிமிஷம்னே சொல்லுவ." },

  /* The smoke. It arrives on the line that notices it, and the line is cut
   * short on purpose - she does not get to finish the sentence. */
  { who: "her", emo: "shock", after: 0.15, cue: "smoke",
    en: "What is that — on the road —",
    ta: "அது என்ன — ரோட்டுல —" },

  { who: "him", emo: "shock", after: 0.1, cue: "swerve",
    en: "Hold on —",
    ta: "இறுக்கப் பிடி —" },
];

/* -------------------------------------------------------------------------- *
 * Waking up
 *
 * The three questions in the brief, in order, with the pauses doing the
 * acting. He is not narrating for the player's benefit; he is a man working
 * out how much trouble he is in.
 * -------------------------------------------------------------------------- */

export const WAKE = [
  { who: "him", emo: "confused", after: 1.6, cue: "openEyes",
    en: "Where am I?",
    ta: "நான் எங்க இருக்கேன்?" },

  { who: "him", emo: "confused", after: 1.8, cue: "lookAround",
    en: "How did I get here?",
    ta: "எப்படி இங்க வந்தேன்?" },

  { who: "him", emo: "afraid", after: 2.2, cue: "sitUp",
    en: "Where is my wife?",
    ta: "என் மனைவி எங்க?" },

  { who: "him", emo: "afraid", after: 1.0, cue: "callOut",
    en: "Meera?",
    ta: "மீரா?" },

  { who: "him", emo: "desperate", after: 2.0,
    en: "MEERA!",
    ta: "மீரா!" },
];

/* -------------------------------------------------------------------------- *
 * The ghost introduces the rules
 *
 * Exactly the brief's lines, exactly its pauses. This is the first time the
 * ghost speaks and it is the moment the game stops being about a locked room
 * and starts being about an arrangement.
 * -------------------------------------------------------------------------- */

export const GHOST_INTRO = [
  { who: "none", emo: "calm", after: 1.2, cue: "lightsOut",
    en: "", ta: "" },

  { who: "ghost", emo: "whisper", after: 2.0, cue: "ghostNear",
    en: "You want to know where you are?",
    ta: "நீ எங்க இருக்கேன்னு தெரியணுமா?" },

  { who: "ghost", emo: "whisper", after: 1.8,
    en: "Then solve the puzzles.",
    ta: "அப்ப புதிர்களைத் தீர்." },

  { who: "ghost", emo: "cold", after: 1.6, cue: "countOne",
    en: "Four doors.",
    ta: "நான்கு கதவுகள்." },

  { who: "ghost", emo: "cold", after: 1.8, cue: "countTwo",
    en: "Four answers.",
    ta: "நான்கு பதில்கள்." },

  { who: "ghost", emo: "cold", after: 2.2, cue: "countThree",
    en: "Only then will you remember.",
    ta: "அப்போதுதான் உனக்கு நினைவு வரும்." },

  { who: "ghost", emo: "laugh", after: 1.6, cue: "laugh",
    en: "", ta: "" },

  { who: "none", emo: "calm", after: 0.8, cue: "lightsBack",
    en: "", ta: "" },
];

/* -------------------------------------------------------------------------- *
 * Act one: what each door gives back
 *
 * One short reveal per stage, and each is a FACT rather than a feeling. The
 * player is assembling an account of the night, and the four of these put
 * together say: he arrived, he was expected, he was separated from her, and
 * he has been here longer than he thinks.
 * -------------------------------------------------------------------------- */

export const SOLVED_1 = [
  { who: "ghost", emo: "whisper", after: 1.4,
    en: "Four o'clock. That is when you stopped.",
    ta: "நாலு மணி. அப்பதான் நீ நின்னுட்ட." },
  { who: "him", emo: "confused", after: 1.2,
    en: "Stopped what?",
    ta: "எது நின்னுது?" },
  { who: "ghost", emo: "cold", after: 1.0,
    en: "Breathing.",
    ta: "மூச்சு." },
  { who: "ghost", emo: "laugh", after: 0.9, en: "", ta: "" },
  { who: "ghost", emo: "whisper", after: 0.8,
    en: "Not for long. Don't look so frightened.",
    ta: "ரொம்ப நேரம் இல்ல. அப்படிப் பயப்படாத." },
];

export const SOLVED_2 = [
  { who: "ghost", emo: "whisper", after: 1.3,
    en: "You knew the shapes without being told. You have been here before.",
    ta: "யாரும் சொல்லாமலே வடிவங்கள் தெரிஞ்சது. நீ முன்னமே இங்க வந்திருக்க." },
  { who: "him", emo: "afraid", after: 1.1,
    en: "No. I've never been inside this building.",
    ta: "இல்ல. இந்தக் கட்டிடத்துக்கு உள்ள நான் வந்ததே இல்ல." },
  { who: "ghost", emo: "cold", after: 1.0,
    en: "Inside. No.",
    ta: "உள்ள. இல்ல." },
];

export const SOLVED_3 = [
  { who: "him", emo: "shock", after: 1.2, cue: "powerBack",
    en: "There's power in the walls. Someone has been keeping this place alive.",
    ta: "சுவர்ல கரன்ட் இருக்கு. யாரோ இந்த இடத்தை உயிரோட வெச்சிருக்காங்க." },
  { who: "ghost", emo: "whisper", after: 1.4,
    en: "Somebody has to keep the lights on for the guests.",
    ta: "விருந்தாளிகளுக்கு விளக்கு எரிய வேண்டாமா." },
  { who: "ghost", emo: "whisper", after: 1.0,
    en: "You are not the first one I have woken up in that bed.",
    ta: "அந்தக் கட்டில்ல நான் எழுப்பின முதல் ஆள் நீ இல்ல." },
];

export const SOLVED_4 = [
  { who: "ghost", emo: "cold", after: 1.5,
    en: "The last lock. Go on.",
    ta: "கடைசிப் பூட்டு. போ." },
  { who: "ghost", emo: "whisper", after: 1.2,
    en: "Open the door and remember what you did.",
    ta: "கதவைத் திற. நீ என்ன செஞ்சேன்னு நினைவுக்கு வரும்." },
];

/* -------------------------------------------------------------------------- *
 * The flashback
 *
 * The one sequence in the game where the player is told the truth, and it is
 * told almost entirely in sound and silence. The dialogue is thin on purpose:
 * people who are being attacked do not talk, they make noises, and the two
 * lines she does get are the only two she has left.
 * -------------------------------------------------------------------------- */

export const FLASHBACK = [
  { who: "none", emo: "calm", after: 1.4, cue: "card", en: "", ta: "" },

  { who: "her", emo: "worried", after: 0.9, cue: "arrive",
    en: "There's no gate. There's no fence. It's just standing in a field.",
    ta: "கேட் இல்ல, வேலி இல்ல. வெளியில தனியா நிக்குது." },

  { who: "him", emo: "calm", after: 1.1, cue: "walk",
    en: "Stay behind me.",
    ta: "என் பின்னாடியே வா." },

  { who: "her", emo: "worried", after: 0.8,
    en: "The door's already open.",
    ta: "கதவு ஏற்கனவே திறந்திருக்கு." },

  { who: "him", emo: "calm", after: 1.3, cue: "atDoor",
    en: "It isn't. It's just not locked.",
    ta: "இல்ல. பூட்டியில்ல, அவ்ளோ தான்." },

  { who: "him", emo: "calm", after: 1.6, cue: "openDoor",
    en: "Hello? Anyone here?",
    ta: "ஹலோ? யாராவது இருக்கீங்களா?" },

  /* Everything from here is the attack. The cues are the sequence. */
  { who: "none", emo: "calm", after: 0.3, cue: "ghostAppears", en: "", ta: "" },

  { who: "her", emo: "scream", after: 0.2, cue: "grab",
    en: "AAH —",
    ta: "ஆ —" },

  { who: "him", emo: "shock", after: 0.2, cue: "reach",
    en: "MEERA —",
    ta: "மீரா —" },

  { who: "her", emo: "panic", after: 0.2, cue: "drag",
    en: "DON'T LET GO —",
    ta: "கையை விடாத —" },

  { who: "him", emo: "desperate", after: 0.3, cue: "lose",
    en: "I'VE GOT YOU — I'VE GOT —",
    ta: "பிடிச்சிருக்கேன் — பிடிச்சி —" },

  { who: "none", emo: "calm", after: 0.9, cue: "blackout", en: "", ta: "" },

  { who: "ghost", emo: "whisper", after: 1.6, cue: "whisperOut",
    en: "You let go.",
    ta: "நீ விட்டுட்ட." },
];

/* -------------------------------------------------------------------------- *
 * Back in the room - the ghost uses his name
 *
 * The brief's lines, with its pauses, and the first time the ghost says the
 * player's own name out loud. Everything in the voice engine exists for this
 * sequence.
 * -------------------------------------------------------------------------- */

export const REVEAL = [
  { who: "none", emo: "calm", after: 2.4, cue: "silence", en: "", ta: "" },

  { who: "ghost", emo: "whisper", after: 2.2, cue: "behind",
    en: "{name}...",
    ta: "{name}..." },

  { who: "ghost", emo: "whisper", after: 2.0,
    en: "Are you still wondering how you got here?",
    ta: "எப்படி இங்க வந்தேன்னு இன்னும் யோசிக்கிறியா?" },

  { who: "ghost", emo: "cold", after: 2.2, cue: "closer",
    en: "You want your wife back?",
    ta: "உன் மனைவி திரும்ப வேணுமா?" },

  { who: "ghost", emo: "whisper", after: 1.8,
    en: "Then listen carefully.",
    ta: "அப்ப கவனமா கேளு." },

  { who: "ghost", emo: "whisper", after: 2.4, cue: "herVoice",
    en: "She is waiting for you.",
    ta: "அவ உனக்காகக் காத்திருக்கா." },

  { who: "ghost", emo: "cold", after: 2.0,
    en: "But you cannot reach her yet.",
    ta: "ஆனா இன்னும் நீ அவகிட்ட போக முடியாது." },

  { who: "ghost", emo: "whisper", after: 1.6, cue: "doors",
    en: "Every door in this place has a lock.",
    ta: "இந்த இடத்துல ஒவ்வொரு கதவுக்கும் ஒரு பூட்டு." },

  { who: "ghost", emo: "whisper", after: 1.6,
    en: "Every lock has a puzzle.",
    ta: "ஒவ்வொரு பூட்டுக்கும் ஒரு புதிர்." },

  { who: "ghost", emo: "cold", after: 1.4,
    en: "Solve them.",
    ta: "அவங்களைத் தீர்." },

  { who: "ghost", emo: "cold", after: 1.4,
    en: "Open the doors.",
    ta: "கதவுகளைத் திற." },

  { who: "ghost", emo: "whisper", after: 2.0,
    en: "Find her.",
    ta: "அவளைக் கண்டுபிடி." },

  { who: "ghost", emo: "laughSoft", after: 1.8, cue: "laugh", en: "", ta: "" },

  { who: "him", emo: "anger", after: 1.2, cue: "stand",
    en: "If you've touched her, I will find a way to hurt you.",
    ta: "அவளைத் தொட்டிருந்தா, உனக்கு வலிக்க வைக்க நான் ஒரு வழி கண்டுபிடிப்பேன்." },

  { who: "ghost", emo: "whisper", after: 1.4,
    en: "Good. Angry ones last longer.",
    ta: "நல்லது. கோபக்காரங்க ரொம்ப நாள் தாங்குவாங்க." },
];

/* -------------------------------------------------------------------------- *
 * Act two
 * -------------------------------------------------------------------------- */

export const SOLVED_5 = [
  { who: "her", emo: "far", after: 1.6, cue: "herEcho",
    en: "{name}... I'm cold...",
    ta: "{name}... எனக்கு ரொம்ப குளிருது..." },
  { who: "him", emo: "desperate", after: 1.2,
    en: "I can hear you. I'm coming. Keep talking to me.",
    ta: "உன் குரல் கேக்குது. வந்துட்டேன். பேசிக்கிட்டே இரு." },
  { who: "ghost", emo: "cold", after: 1.2,
    en: "She cannot hear you. That is the arrangement.",
    ta: "அவளுக்கு உன் குரல் கேக்காது. அதுதான் ஏற்பாடு." },
];

export const SOLVED_6 = [
  { who: "him", emo: "shock", after: 1.3, cue: "keyInHand",
    en: "It was in the mirror the whole time. Not in the room. In the mirror.",
    ta: "இந்த நேரம் முழுக்க கண்ணாடியிலேயே இருந்துச்சு. அறையில இல்ல. கண்ணாடியில." },
  { who: "ghost", emo: "whisper", after: 1.4,
    en: "Most of this place is in the mirror, {name}.",
    ta: "இந்த இடத்துல பாதி கண்ணாடிக்குள்ளேயே இருக்கு, {name}." },
];

/* -------------------------------------------------------------------------- *
 * The final door
 * -------------------------------------------------------------------------- */

export const FINAL_DOOR = [
  { who: "him", emo: "afraid", after: 1.0, cue: "approach",
    en: "This is it.",
    ta: "இதுதான்." },
  { who: "none", emo: "calm", after: 0.9, cue: "insert", en: "", ta: "" },
  { who: "none", emo: "calm", after: 1.2, cue: "turn", en: "", ta: "" },
  { who: "none", emo: "calm", after: 1.4, cue: "open", en: "", ta: "" },
  { who: "him", emo: "afraid", after: 1.2, cue: "step",
    en: "Meera? I'm here.",
    ta: "மீரா? நான் வந்துட்டேன்." },
];

export const ENDLESS = [
  { who: "none", emo: "calm", after: 1.2, cue: "reveal", en: "", ta: "" },

  { who: "him", emo: "shock", after: 1.6, cue: "shock",
    en: "What...?",
    ta: "என்ன...?" },

  { who: "him", emo: "shock", after: 1.8, cue: "pullBack",
    en: "This isn't over?",
    ta: "இது முடியலையா?" },

  { who: "him", emo: "desperate", after: 2.0, cue: "wide",
    en: "How many doors are there?",
    ta: "எத்தனை கதவுகள் இருக்கு?" },

  { who: "ghost", emo: "whisper", after: 2.0, cue: "behindHim",
    en: "You thought this would be easy, {name}?",
    ta: "இது சுலபமா இருக்கும்னு நினைச்சியா, {name}?" },

  { who: "ghost", emo: "laugh", after: 1.4, cue: "laugh", en: "", ta: "" },

  { who: "ghost", emo: "cold", after: 2.4, cue: "final",
    en: "The game has only just begun.",
    ta: "விளையாட்டு இப்பதான் ஆரம்பம்." },

  { who: "ghost", emo: "laughLong", after: 2.0, cue: "laughLong", en: "", ta: "" },
];

/* -------------------------------------------------------------------------- *
 * Ambient horror
 *
 * Single lines, picked at random by story/horror.js. They are whispers rather
 * than sentences: the ghost commenting on the player is far more unsettling
 * than the ghost explaining itself, and these have to be able to land in the
 * middle of a puzzle without derailing it.
 * -------------------------------------------------------------------------- */

export const WHISPERS = [
  { who: "ghost", emo: "whisper", after: 0,
    en: "{name}...", ta: "{name}..." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "Behind you.", ta: "உன் பின்னாடி." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "She stopped crying an hour ago.", ta: "ஒரு மணி நேரம் முன்னாடியே அழுகை நின்னுது." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "You are being slow, {name}.", ta: "ரொம்ப மெதுவா இருக்க, {name}." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "Don't look at the mirror yet.", ta: "இன்னும் கண்ணாடியைப் பாக்காத." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "Count the doors again.", ta: "கதவுகளை மறுபடி எண்ணு." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "I kept your hand warm.", ta: "உன் கையை நான் சூடா வெச்சிருந்தேன்." },
  { who: "ghost", emo: "whisper", after: 0,
    en: "The bed is still warm. Someone else is coming.",
    ta: "கட்டில் இன்னும் சூடா இருக்கு. இன்னொருத்தர் வருவாங்க." },
];

/** Her voice, from a long way off. Used by the act-two search. */
export const HER_CALLS = [
  { who: "her", emo: "far", after: 0,
    en: "{name}...", ta: "{name}..." },
  { who: "her", emo: "far", after: 0,
    en: "...the door...", ta: "...கதவு..." },
  { who: "her", emo: "far", after: 0,
    en: "Don't come down here.", ta: "இங்க கீழ வராத." },
  { who: "her", emo: "far", after: 0,
    en: "It's wearing my voice.", ta: "அது என் குரல்ல பேசுது." },
];

/* -------------------------------------------------------------------------- *
 * Lookup
 * -------------------------------------------------------------------------- */

export const SEQUENCES = {
  CAR,
  WAKE,
  GHOST_INTRO,
  SOLVED_1,
  SOLVED_2,
  SOLVED_3,
  SOLVED_4,
  FLASHBACK,
  REVEAL,
  SOLVED_5,
  SOLVED_6,
  FINAL_DOOR,
  ENDLESS,
};

/** The reveal sequence played after stage `n` is solved, if there is one. */
export const solvedSequence = (n) => SEQUENCES[`SOLVED_${n}`] ?? null;
