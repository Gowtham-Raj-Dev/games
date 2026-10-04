/**
 * Strings, in English and Tamil.
 *
 * Conventions, matching the other games on this site:
 *   - `data-i18n="key"` on the element whose entire textContent is the
 *     string, never on a parent. The English text stays in index.html as the
 *     literal content, so the page reads correctly before this module runs
 *     and if a lookup ever fails.
 *   - `data-i18n-touch="key"` is an INPUT MODALITY override, not a language
 *     one. Same key space; chosen when the device is touch. It exists so
 *     "Press any key" can become "Tap to begin" without a second dictionary.
 *   - `data-i18n-placeholder="key"` sets an input's placeholder.
 *   - A value may be a function, for anything that interpolates.
 *   - A missing key renders as the key itself rather than as blank, so a
 *     gap is obvious in testing instead of invisible.
 *
 * TWO NAMESPACES THAT MUST NOT COLLIDE:
 *   `obj*`   the NAME of an interactable object, as it appears in the prompt:
 *            "Take  book". Always a noun phrase, always lower case.
 *   `goal*`  an objective line, as it appears across the top of the screen.
 *            Always a sentence.
 * They were briefly the same namespace, and the objective for stage one read
 * "wall clock".
 *
 * The spoken dialogue is NOT here - it is in story/script.js, with the Tamil
 * written to be read aloud rather than to gloss the English. This file is the
 * interface; that one is the screenplay.
 */

import { EV, emit } from "../core/bus.js";
import { get as getPlatform } from "../core/platform.js";

export const STRINGS = {
  en: {
    /* ----- studio card ----- */
    presents: "PRESENTS",
    spGo: "Click or press any key to begin",
    spGoTouch: "Tap to begin",

    /* ----- boot steps ----- */
    stMeasure: "Measuring the room",
    stSurfaces: "Pouring concrete",
    stLight: "Hanging the bulb",
    stProps: "Moving the furniture",
    stCast: "Finding the cast",
    stShaders: "Warming the glass",
    stReady: "Ready",

    /* ----- title screen ----- */
    titleSub: "A Horror Mystery Puzzle Experience",
    playGame: "PLAY GAME",
    settingsBtn: "SETTINGS",
    exitGame: "EXIT",
    titleFoot: "Headphones on. Lights off. It is better that way.",
    titleFootTouch: "Headphones on. Turn the lights off.",
    savedBeat: (where) => `continue · ${where}`,

    /* ----- name gate ----- */
    nameAsk: "What should we call you?",
    namePlaceholder: "Enter your name",
    continueBtn: "CONTINUE",
    nameNote: "It will hear you say it.",

    /* ----- the cinematic layer ----- */
    skipLine: "skip line",
    skipScene: "hold to skip scene",
    tapGlyph: "TAP",
    holdGlyph: "HOLD",
    whoHer: "Meera",
    whoGhost: "???",
    cardFlashback: "Flashback",
    cardFlashbackSub: "Four hours earlier",
    cardContinued: "To be continued",
    cardContinuedSub: "WITHROOM · Chapter one of ?",
    cardContinuedTime: (time) => `You were in there ${time}`,
    timeLbl: "Time",

    /* ----- where a save is, for the CONTINUE button ----- */
    beat_TITLE: "the beginning",
    beat_NAME: "the beginning",
    beat_CAR_SCENE: "the road",
    beat_ROOM_WAKEUP: "waking up",
    beat_GHOST_INTRO: "the first voice",
    beat_PUZZLE_1: "the hour",
    beat_PUZZLE_2: "the marks",
    beat_PUZZLE_3: "the mechanism",
    beat_PUZZLE_4: "the lock",
    beat_FLASHBACK: "what happened",
    beat_ROOM_REVEAL: "her name",
    beat_PUZZLE_5: "her things",
    beat_PUZZLE_6: "the voices",
    beat_PUZZLE_7: "the clocks",
    beat_PUZZLE_8: "the mirror",
    beat_PUZZLE_9: "her door",
    beat_FINAL_DOOR: "the last door",
    beat_ENDLESS_DOORS: "the corridor",
    beat_ENDING: "the end",

    /* ----- HUD ----- */
    chapterLbl: "Chapter one",
    stabilityLbl: "Room stability",
    sizeLbl: "Current size",
    checkpointLbl: "Checkpoint",
    reachedLbl: "Largest reached",

    /* ----- interaction verbs ----- */
    inspect: "Examine",
    takeItem: "Take",
    placeItem: "Place",
    openDoor: "Open",
    lockedDoor: "Locked",
    pressSwitch: "Press",
    turnDial: "Turn",
    readIt: "Read",
    dropItem: "Drop",
    openDrawer: "Open",
    toggleLamp: "Switch",
    pushObject: "Push",
    fitFuse: "Fit fuse",
    pullLever: "Throw",
    listen: "Listen",
    reachFor: "Reach in",
    unlockDoor: "Unlock",

    /* ----- object names ----- */
    objTable: "table",
    objChair: "chair",
    objCube: "cube",
    objClock: "wall clock",
    objDoor: "door",
    objWindow: "window",
    objLamp: "lamp",
    objCrate: "crate",
    crateOpened: "Packing straw, and something heavy wrapped in it.",
    objBook: "book",
    objMug: "mug",
    objKey: "key",
    objWriting: "writing on the wall",
    objTile: "stone tile",
    objScratches: "scratches on the wall",
    objFusebox: "fuse box",
    objLever: "switch",
    objFuse: "fuse",
    objPainting: "painting",
    objKeypad: "keypad",
    objBurnMarks: "burn marks",
    objScratch: "scratch in the floor",
    objPhone: "her phone",
    objScarf: "her scarf",
    objRing: "her ring",
    objGrille: "iron grille",
    objMirror: "mirror",
    objNail: "nail hole",
    objKeyBrass: "brass key",
    objOneDoor: "door",

    /* ----- objectives ----- */
    objFirst: "Four doors. Four answers.",
    objFindClue: "Something in this room is a number.",
    goalClock: "The clock is wrong. Make it right.",
    goalSymbols: "Four marks. Four recesses. Get the order right.",
    goalMechanism: "Three fuses are in this room. Find them.",
    goalCode: "Four digits open the main door.",
    goalFindWife: "FIND YOUR WIFE — start with what she left here.",
    goalFollowVoice: "Answer her before the grille goes quiet.",
    goalTheHour: "Every clock in this room. The same hour.",
    goalFinalKey: "The key is in the mirror. Not in the room.",
    goalHerDoor: "One of these doors is hers.",

    /* ----- puzzle feedback ----- */
    bookLine: "It stopped at 3:17. It should say 4:00.",
    sigilClue: "Four marks, and a number scratched under each one.",
    fuseboxEmpty: "Three empty sockets. You are not carrying a fuse.",
    fuseAlready: "That socket is already filled.",
    fuseSeated: (left) =>
      left === 1 ? "It seats with a click. One socket still empty." : `It seats with a click. ${left} sockets still empty.`,
    fusesDone: "All three in. There is a switch under the box.",
    leverDead: (left) =>
      left === 1 ? "The switch throws and nothing happens. One socket is still empty." : `The switch throws and nothing happens. ${left} sockets are still empty.`,
    paintingBehind: "There is something on the wall behind it.",
    marksEmpty: "Four burn marks on the frame, and nothing in them yet.",
    marksRead: (digits, left) =>
      left === 0 ? `Burned into the frame: ${digits}` : `Burned into the frame: ${digits} — and ${left} still blank.`,
    floorDigit: (d) => `Scratched into the concrete, over and over: ${d}`,
    codeShort: "Four digits.",
    codeWrong: "The keypad buzzes and clears itself.",
    codeWrongAgain: "It buzzes. Whatever is listening finds this funny.",
    codeRight: "Something heavy moves inside the door.",
    found_phone: "Her phone. Still lit. Thirty-one missed calls.",
    found_scarf: "Her scarf. It still smells of her.",
    found_ring: "Her wedding ring. On the floor, under a table, in this place.",
    voiceCalling: "A grille crackles somewhere in the room.",
    voiceDead: "Cold iron. Nothing behind it.",
    voiceAnswered: (a, b) => `She heard you. ${a} of ${b}.`,
    voiceLost: "It goes quiet. You were not fast enough.",
    voiceDone: "She says there are clocks. All of them wrong.",
    clocksLeft: (n) => (n === 1 ? "It chimes once. One clock left." : `It chimes once. ${n} clocks left.`),
    clocksAll: "Every clock in the room reads the same hour.",
    mirrorKey: "In the reflection, a key hangs on a hook on the far wall.",
    mirrorEmpty: "The hook in the reflection is empty now.",
    nailNothing: "A nail hole, and a rust stain under it. Nothing hanging there.",
    nailEmpty: "Nothing there now.",
    keyTaken: "Your hand closes on something the room says is not there.",
    ringEngraving: "There is a mark engraved inside the band.",
    needKey: "Locked. This one takes a key.",
    wrongDoor: (tried, total) => `The key does not turn. ${tried} of ${total} tried.`,
    herDoorOpens: "The key turns. This one is hers.",

    /* ----- hints ----- */
    hintAffordance: "hint",
    hintLabel: "Hint",
    hintGoal: "What this place wants",
    hintStep: (n) => `Step ${n}`,
    hintLast: "Last hint",
    hintUnbuilt: "This stage is designed but not built yet. Nothing here to solve.",
    hintNudge: "Stuck? Press H.",

    solvedMsg: "CORRECT",
    solvedSub: "The room agrees",

    /* ----- stages ----- */
    stagesTitle: "Stages",
    stagesHeading: "Nine doors. Nine answers. One of them is a lie.",
    stagesCount: (n) => `${n} stages`,
    stagesOf: (a, b) => `Stage ${a} of ${b}`,
    stagesLede: (playable, total) =>
      `${total} stages, each one a bigger room than the last, and all ${playable} are playable. The steps below describe how each mechanism works - never the answer.`,
    stageGoal: "Goal",
    stageHow: "How to finish it",
    stageReward: "On success",
    statusPlayable: "Playable now",
    statusPlanned: "Not built yet",

    /* ----- room events ----- */
    expandMsg: "THE ROOM EXPANDS",
    shrinkMsg: "THE ROOM CLOSES",
    expandSub: (w, d) => `${w} × ${d} metres`,
    shrinkSub: (w, d) => `${w} × ${d} metres`,
    stabilityUp: (n) => `Stability +${n}`,
    stabilityDown: (n) => `Stability −${n}`,
    checkpointReached: "Checkpoint",

    /* ----- pause ----- */
    paused: "Paused",
    pausedTitle: "The room waits",
    resume: "Resume",
    quitToMenu: "Quit to title",
    mainMenu: "Title screen",
    continue: "Continue",
    loadCheckpoint: "Load checkpoint",
    howToPlay: "How to play",
    settings: "Settings",

    /* ----- settings ----- */
    settingsTitle: "Calibration",
    secDisplay: "Display",
    secAudio: "Audio",
    secControls: "Controls",
    quality: "Quality",
    low: "Low",
    medium: "Medium",
    high: "High",
    ultra: "Ultra",
    auto: "Auto",
    fov: "Field of view",
    cameraShake: "Camera shake",
    headBob: "Head bob",
    crosshairLbl: "Crosshair",
    master: "Master",
    sfx: "Effects",
    music: "Atmosphere",
    voices: "Voices",
    voiceVol: "Voice volume",
    subtitles: "Subtitles",
    sensitivity: "Sensitivity",
    invertY: "Invert look",
    toggleCrouch: "Crouch",
    hold: "Hold",
    toggle: "Toggle",
    language: "Language",
    on: "On",
    off: "Off",
    done: "Done",
    resetDefaults: "Reset to defaults",

    /* ----- how to play ----- */
    howTitle: "The room is your health",
    howLede:
      "Every puzzle you solve pushes the walls outward and opens new space. Every major failure brings them in. If the room runs out of space, so do you. Wrong answers to a lock cost nothing — only the big mistakes move the walls.",
    understood: "Understood",
    kMove: "Move",
    kLook: "Look",
    kInteract: "Interact / pick up",
    kDrop: "Drop",
    kSprint: "Sprint",
    kCrouch: "Crouch — needed twice",
    kPause: "Pause",
    kMoveTouch: "Left thumb — anywhere",
    kLookTouch: "Right thumb — drag",
    kInteractTouch: "The large button",

    /* ----- game over ----- */
    collapse: "Collapse",
    goTitle: "The room has no more space for you",
    goBody: "The walls met. You were between them.",
    retry: "Retry",

    /* ----- interruptions ----- */
    rotateTitle: "Turn your phone",
    rotateBody: "This one needs landscape.",
    errTitle: "WITHROOM did not load",
    reload: "Reload",
  },

  ta: {
    presents: "வழங்குகிறது",
    spGo: "தொடங்க கிளிக் செய்யுங்கள் அல்லது எந்த விசையையும் அழுத்துங்கள்",
    spGoTouch: "தொடங்க தட்டுங்கள்",

    stMeasure: "அறையை அளக்கிறோம்",
    stSurfaces: "சுவர்களை அமைக்கிறோம்",
    stLight: "விளக்கைத் தொங்கவிடுகிறோம்",
    stProps: "பொருட்களை வைக்கிறோம்",
    stCast: "கதாபாத்திரங்களைத் தேடுகிறோம்",
    stShaders: "கண்ணாடியைத் தயார் செய்கிறோம்",
    stReady: "தயார்",

    titleSub: "ஒரு திகில் மர்மப் புதிர் அனுபவம்",
    playGame: "விளையாடு",
    settingsBtn: "அமைப்புகள்",
    exitGame: "வெளியேறு",
    titleFoot: "ஹெட்ஃபோன் போட்டு, விளக்கை அணைத்து விளையாடுங்கள்.",
    titleFootTouch: "ஹெட்ஃபோன் போடுங்கள். விளக்கை அணையுங்கள்.",
    savedBeat: (where) => `தொடரவும் · ${where}`,

    nameAsk: "உங்களை என்ன அழைக்கலாம்?",
    namePlaceholder: "உங்கள் பெயரை எழுதுங்கள்",
    continueBtn: "தொடரவும்",
    nameNote: "அது உங்கள் பெயரைச் சொல்லும்.",

    skipLine: "வரியைத் தாண்டு",
    skipScene: "காட்சியைத் தாண்ட அழுத்திப் பிடி",
    tapGlyph: "தட்டு",
    holdGlyph: "பிடி",
    whoHer: "மீரா",
    whoGhost: "???",
    cardFlashback: "பின்னோட்டம்",
    cardFlashbackSub: "நான்கு மணி நேரம் முன்பு",
    cardContinued: "தொடரும்",
    cardContinuedSub: "WITHROOM · அத்தியாயம் ஒன்று / ?",
    cardContinuedTime: (time) => `நீங்கள் உள்ளே இருந்த நேரம் ${time}`,
    timeLbl: "நேரம்",

    beat_TITLE: "ஆரம்பம்",
    beat_NAME: "ஆரம்பம்",
    beat_CAR_SCENE: "சாலை",
    beat_ROOM_WAKEUP: "விழிப்பு",
    beat_GHOST_INTRO: "முதல் குரல்",
    beat_PUZZLE_1: "அந்த நேரம்",
    beat_PUZZLE_2: "குறிகள்",
    beat_PUZZLE_3: "மின் பெட்டி",
    beat_PUZZLE_4: "பூட்டு",
    beat_FLASHBACK: "நடந்தது",
    beat_ROOM_REVEAL: "அவள் பெயர்",
    beat_PUZZLE_5: "அவளின் பொருட்கள்",
    beat_PUZZLE_6: "குரல்கள்",
    beat_PUZZLE_7: "கடிகாரங்கள்",
    beat_PUZZLE_8: "கண்ணாடி",
    beat_PUZZLE_9: "அவளின் கதவு",
    beat_FINAL_DOOR: "கடைசிக் கதவு",
    beat_ENDLESS_DOORS: "நடைபாதை",
    beat_ENDING: "முடிவு",

    chapterLbl: "அத்தியாயம் ஒன்று",
    stabilityLbl: "அறை நிலைத்தன்மை",
    sizeLbl: "தற்போதைய அளவு",
    checkpointLbl: "சோதனைப் புள்ளி",
    reachedLbl: "அடைந்த பெரிய அளவு",

    inspect: "பார்க்க",
    takeItem: "எடுக்க",
    placeItem: "வைக்க",
    openDoor: "திறக்க",
    lockedDoor: "பூட்டியுள்ளது",
    pressSwitch: "அழுத்த",
    turnDial: "திருப்ப",
    readIt: "படிக்க",
    dropItem: "கீழே வைக்க",
    openDrawer: "திறக்க",
    toggleLamp: "போட/அணைக்க",
    pushObject: "தள்ள",
    fitFuse: "ஃப்யூஸ் பொருத்த",
    pullLever: "போட",
    listen: "கேட்க",
    reachFor: "கை நீட்ட",
    unlockDoor: "திறக்க",

    objTable: "மேசை",
    objChair: "நாற்காலி",
    objCube: "கனசதுரம்",
    objClock: "சுவர் கடிகாரம்",
    objDoor: "கதவு",
    objWindow: "ஜன்னல்",
    objLamp: "விளக்கு",
    objCrate: "மரப்பெட்டி",
    crateOpened: "பேக்கிங் வைக்கோல், அதில் சுற்றப்பட்ட கனமான ஏதோ ஒன்று.",
    objBook: "புத்தகம்",
    objMug: "கோப்பை",
    objKey: "சாவி",
    objWriting: "சுவர் எழுத்து",
    objTile: "கற்தட்டு",
    objScratches: "சுவரில் கீறல்கள்",
    objFusebox: "ஃப்யூஸ் பெட்டி",
    objLever: "சுவிட்ச்",
    objFuse: "ஃப்யூஸ்",
    objPainting: "ஓவியம்",
    objKeypad: "எண் பலகை",
    objBurnMarks: "எரிந்த குறிகள்",
    objScratch: "தரையில் கீறல்",
    objPhone: "அவளின் தொலைபேசி",
    objScarf: "அவளின் துப்பட்டா",
    objRing: "அவளின் மோதிரம்",
    objGrille: "இரும்பு அடைப்பு",
    objMirror: "கண்ணாடி",
    objNail: "ஆணித் துளை",
    objKeyBrass: "பித்தளை சாவி",
    objOneDoor: "கதவு",

    objFirst: "நான்கு கதவுகள். நான்கு பதில்கள்.",
    objFindClue: "இந்த அறையில் ஏதோ ஒன்று ஒரு எண்.",
    goalClock: "கடிகாரம் தவறாக உள்ளது. சரி செய்யுங்கள்.",
    goalSymbols: "நான்கு குறிகள். நான்கு குழிகள். வரிசை சரியாக இருக்க வேண்டும்.",
    goalMechanism: "இந்த அறையில் மூன்று ஃப்யூஸ்கள். கண்டுபிடியுங்கள்.",
    goalCode: "நான்கு எண்கள் பிரதான கதவைத் திறக்கும்.",
    goalFindWife: "உங்கள் மனைவியைக் கண்டுபிடியுங்கள் — அவள் விட்டுச் சென்றதில் தொடங்குங்கள்.",
    goalFollowVoice: "அடைப்பு அமைதியாகும் முன் அவளுக்குப் பதில் சொல்லுங்கள்.",
    goalTheHour: "இந்த அறையின் ஒவ்வொரு கடிகாரமும். ஒரே நேரம்.",
    goalFinalKey: "சாவி கண்ணாடியில் இருக்கிறது. அறையில் இல்லை.",
    goalHerDoor: "இந்தக் கதவுகளில் ஒன்று அவளுடையது.",

    bookLine: "3:17-ல் நின்றுவிட்டது. 4:00 காட்ட வேண்டும்.",
    sigilClue: "நான்கு குறிகள், ஒவ்வொன்றின் கீழும் ஒரு எண் கீறப்பட்டுள்ளது.",
    fuseboxEmpty: "மூன்று காலி இடங்கள். உங்கள் கையில் ஃப்யூஸ் இல்லை.",
    fuseAlready: "அந்த இடம் ஏற்கெனவே நிரம்பிவிட்டது.",
    fuseSeated: (left) => `கிளிக் என்று பொருந்துகிறது. இன்னும் ${left} இடம் காலி.`,
    fusesDone: "மூன்றும் பொருந்திவிட்டன. பெட்டிக்குக் கீழே ஒரு சுவிட்ச் இருக்கிறது.",
    leverDead: (left) => `சுவிட்ச் விழுகிறது, ஒன்றும் நடக்கவில்லை. இன்னும் ${left} இடம் காலி.`,
    paintingBehind: "அதன் பின்னால் சுவரில் ஏதோ இருக்கிறது.",
    marksEmpty: "சட்டத்தில் நான்கு எரிந்த குறிகள், இன்னும் எதுவும் இல்லை.",
    marksRead: (digits, left) =>
      left === 0 ? `சட்டத்தில் எரிந்திருப்பது: ${digits}` : `சட்டத்தில் எரிந்திருப்பது: ${digits} — இன்னும் ${left} காலி.`,
    floorDigit: (d) => `கான்கிரீட்டில் மீண்டும் மீண்டும் கீறப்பட்டுள்ளது: ${d}`,
    codeShort: "நான்கு எண்கள் வேண்டும்.",
    codeWrong: "பலகை ஒலித்து தானே அழித்துக்கொள்கிறது.",
    codeWrongAgain: "ஒலிக்கிறது. கேட்டுக்கொண்டிருப்பதற்கு இது வேடிக்கையாக இருக்கிறது.",
    codeRight: "கதவுக்குள் ஏதோ கனமானது நகர்கிறது.",
    found_phone: "அவளின் தொலைபேசி. இன்னும் எரிகிறது. முப்பத்தொரு அழைப்புகள்.",
    found_scarf: "அவளின் துப்பட்டா. இன்னும் அவள் வாசம் இருக்கிறது.",
    found_ring: "அவளின் திருமண மோதிரம். இந்த இடத்தில், மேசைக்கு அடியில், தரையில்.",
    voiceCalling: "அறையில் எங்கோ ஒரு அடைப்பு சிதறுகிறது.",
    voiceDead: "குளிர்ந்த இரும்பு. பின்னால் ஒன்றுமில்லை.",
    voiceAnswered: (a, b) => `அவள் கேட்டாள். ${b}-ல் ${a}.`,
    voiceLost: "அமைதியாகிவிட்டது. நீங்கள் போதுமான வேகத்தில் இல்லை.",
    voiceDone: "கடிகாரங்களைப் பற்றி அவள் சொல்கிறாள். எல்லாம் தவறு.",
    clocksLeft: (n) => `ஒரு முறை ஒலிக்கிறது. இன்னும் ${n} கடிகாரம்.`,
    clocksAll: "அறையின் எல்லா கடிகாரமும் ஒரே நேரம் காட்டுகின்றன.",
    mirrorKey: "பிம்பத்தில், எதிர்ச் சுவரில் ஒரு கொக்கியில் சாவி தொங்குகிறது.",
    mirrorEmpty: "பிம்பத்தில் கொக்கி இப்போது காலியாக இருக்கிறது.",
    nailNothing: "ஒரு ஆணித் துளை, கீழே துரு கறை. அங்கே எதுவும் தொங்கவில்லை.",
    nailEmpty: "இப்போது அங்கே ஒன்றுமில்லை.",
    keyTaken: "அறை இல்லை என்று சொல்லும் ஒன்றை உங்கள் கை பிடிக்கிறது.",
    ringEngraving: "வளையத்தின் உள்ளே ஒரு குறி பொறிக்கப்பட்டுள்ளது.",
    needKey: "பூட்டியுள்ளது. இதற்கு ஒரு சாவி வேண்டும்.",
    wrongDoor: (tried, total) => `சாவி திரும்பவில்லை. ${total}-ல் ${tried} முயற்சி.`,
    herDoorOpens: "சாவி திரும்புகிறது. இது அவளுடையது.",

    hintAffordance: "உதவி",
    hintLabel: "உதவி",
    hintGoal: "இந்த இடம் என்ன கேட்கிறது",
    hintStep: (n) => `படி ${n}`,
    hintLast: "கடைசி உதவி",
    hintUnbuilt: "இந்த நிலை வடிவமைக்கப்பட்டுள்ளது, இன்னும் உருவாகவில்லை.",
    hintNudge: "சிக்கலா? H அழுத்துங்கள்.",

    solvedMsg: "சரி",
    solvedSub: "அறை ஒப்புக்கொள்கிறது",

    stagesTitle: "நிலைகள்",
    stagesHeading: "ஒன்பது கதவுகள். ஒன்பது பதில்கள். ஒன்று பொய்.",
    stagesCount: (n) => `${n} நிலைகள்`,
    stagesOf: (a, b) => `நிலை ${a} / ${b}`,
    stagesLede: (playable, total) =>
      `${total} நிலைகள், ஒவ்வொன்றும் முந்தையதைவிடப் பெரிய அறை, ${playable} நிலைகளும் விளையாடக்கூடியவை. கீழே உள்ள படிகள் ஒவ்வொரு அமைப்பு எப்படி வேலை செய்கிறது என்பதைச் சொல்கின்றன - பதிலை அல்ல.`,
    stageGoal: "இலக்கு",
    stageHow: "எப்படி முடிப்பது",
    stageReward: "வெற்றியில்",
    statusPlayable: "இப்போது விளையாடலாம்",
    statusPlanned: "இன்னும் உருவாகவில்லை",

    expandMsg: "அறை விரிகிறது",
    shrinkMsg: "அறை நெருங்குகிறது",
    expandSub: (w, d) => `${w} × ${d} மீட்டர்`,
    shrinkSub: (w, d) => `${w} × ${d} மீட்டர்`,
    stabilityUp: (n) => `நிலைத்தன்மை +${n}`,
    stabilityDown: (n) => `நிலைத்தன்மை −${n}`,
    checkpointReached: "சோதனைப் புள்ளி",

    paused: "இடைநிறுத்தம்",
    pausedTitle: "அறை காத்திருக்கிறது",
    resume: "தொடரவும்",
    quitToMenu: "தலைப்புத் திரைக்கு",
    mainMenu: "தலைப்புத் திரை",
    continue: "தொடரவும்",
    loadCheckpoint: "சோதனைப் புள்ளியிலிருந்து",
    howToPlay: "எப்படி விளையாடுவது",
    settings: "அமைப்புகள்",

    settingsTitle: "அளவீடு",
    secDisplay: "காட்சி",
    secAudio: "ஒலி",
    secControls: "கட்டுப்பாடுகள்",
    quality: "தரம்",
    low: "குறைவு",
    medium: "நடுத்தரம்",
    high: "அதிகம்",
    ultra: "மிக அதிகம்",
    auto: "தானியங்கி",
    fov: "பார்வைக் கோணம்",
    cameraShake: "கேமரா அதிர்வு",
    headBob: "தலை அசைவு",
    crosshairLbl: "குறி",
    master: "முதன்மை",
    sfx: "ஒலி விளைவு",
    music: "சூழல் ஒலி",
    voices: "குரல்கள்",
    voiceVol: "குரல் ஒலி அளவு",
    subtitles: "வசனம்",
    sensitivity: "உணர்திறன்",
    invertY: "பார்வையை மாற்று",
    toggleCrouch: "குனிதல்",
    hold: "அழுத்திப் பிடி",
    toggle: "மாற்று",
    language: "மொழி",
    on: "இயக்கு",
    off: "நிறுத்து",
    done: "முடிந்தது",
    resetDefaults: "இயல்புநிலைக்கு",

    howTitle: "அறையே உங்கள் உயிர்",
    howLede:
      "நீங்கள் தீர்க்கும் ஒவ்வொரு புதிரும் சுவர்களை வெளியே தள்ளி புதிய இடத்தைத் திறக்கிறது. ஒவ்வொரு பெரிய தோல்வியும் அவற்றை உள்ளே கொண்டுவருகிறது. அறைக்கு இடம் தீர்ந்தால், உங்களுக்கும் தான். பூட்டில் தவறான பதில் எதையும் இழக்காது - பெரிய தவறுகள் மட்டுமே சுவர்களை நகர்த்தும்.",
    understood: "புரிந்தது",
    kMove: "நகர",
    kLook: "பார்க்க",
    kInteract: "செயல்பட / எடுக்க",
    kDrop: "கீழே வைக்க",
    kSprint: "ஓட",
    kCrouch: "குனிய — இரு முறை தேவை",
    kPause: "இடைநிறுத்த",
    kMoveTouch: "இடது கட்டை விரல் — எங்கும்",
    kLookTouch: "வலது கட்டை விரல் — இழுக்க",
    kInteractTouch: "பெரிய பொத்தான்",

    collapse: "சரிவு",
    goTitle: "அறையில் உங்களுக்கு இடமில்லை",
    goBody: "சுவர்கள் சந்தித்தன. நீங்கள் இடையில் இருந்தீர்கள்.",
    retry: "மீண்டும்",

    rotateTitle: "தொலைபேசியைத் திருப்புங்கள்",
    rotateBody: "இதற்கு அகலக் காட்சி தேவை.",
    errTitle: "WITHROOM ஏற்றப்படவில்லை",
    reload: "மீண்டும் ஏற்று",
  },
};

/* -------------------------------------------------------------------------- *
 * Runtime
 * -------------------------------------------------------------------------- */

let lang = "en";

/** Pick a starting language from the browser, as the other games here do. */
export function detectLanguage() {
  const nav = (navigator.language || "").toLowerCase();
  return nav.startsWith("ta") ? "ta" : "en";
}

export const getLanguage = () => lang;

/**
 * Translate. Extra arguments are passed through to a function value.
 *
 * Falls back to English, then to the key itself. A missing Tamil string shows
 * the English rather than a blank, which is always the better failure.
 */
export function t(key, ...args) {
  const dict = STRINGS[lang] ?? STRINGS.en;
  let value = dict[key];
  if (value === undefined) value = STRINGS.en[key];
  if (value === undefined) return key;
  return typeof value === "function" ? value(...args) : value;
}

/** Walk the DOM and write every tagged string. */
export function apply(root = document) {
  const touch = getPlatform().touch;

  for (const el of root.querySelectorAll("[data-i18n]")) {
    const key =
      touch && el.dataset.i18nTouch ? el.dataset.i18nTouch : el.dataset.i18n;
    el.textContent = t(key);
  }

  for (const el of root.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  }

  // Placeholders, for the name field. A placeholder is not textContent and is
  // the one string on the page that cannot be written by the loop above.
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  }

  for (const btn of root.querySelectorAll(".langpill button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  }
}

/**
 * Switch language.
 *
 * Sets `<html lang>` so a screen reader changes voice, and `body.ta` so the
 * stylesheet can drop the wide letter-spacing - Tamil conjuncts break apart
 * under the tracking the Latin display type wants.
 */
export function setLanguage(next) {
  if (next !== "en" && next !== "ta") return;
  lang = next;
  document.documentElement.lang = next;
  document.body.classList.toggle("ta", next === "ta");
  apply();
  emit(EV.LANGUAGE_CHANGED, { lang: next });
}
