# WITHROOM — the ghost's voice

Every line the ghost speaks, numbered, with the audio filename the game looks for.

## How the game uses these files

Drop a file at **`public/games/with-room/assets/audio/voice/ghost/en/<id>.wav`** (or `.mp3` / `.ogg` — the loader tries mp3, ogg, then wav) and that line is spoken from the recording. Tamil goes in the `ta/` folder beside it. Any line with no file falls back to the browser speech synthesiser, so a half-finished set still plays.

The tone is **not** baked into the files. `audio.voiceClip()` in [js/audio/manager.js](public/games/with-room/js/audio/manager.js) puts every clip through the same chain, and `GHOST_VOICE` at the top of it is the whole tuning table:

- **pitch and speed** — played at 0.82, which drops the voice about three semitones and lengthens it to match
- **wobble** — 20 cents of slow pitch drift, so it never quite holds a note
- **ring modulation** — a carrier falling from 30 Hz to 21 Hz across the line, mixed at 0.3 *under* the clean voice rather than replacing it. This is the possessed artefact, and the mix is the trick: at 1.0 it is a broken speaker, at 0.3 it is a voice with a second thing inside it
- **an octave-down growl** — a half-speed copy, lowpassed to 700 Hz: weight, not words
- **a second mouth** — 50 ms late, detuned a quarter tone, bandpassed into the whisper register
- **darkness** — highpass 140 Hz, lowpass 3.4 kHz, a 7 dB dip at 2.2 kHz where synthetic hiss lives, a lift at 420 Hz
- then the ghost bus: permanent long-reverb send, sub-bass bed, whisper grains, ambience duck

That is what makes separately generated files sound like one voice: generate them clean and let the game do all of this to them.

Audition them with the game's processing applied at **/games/with-room/voice-preview.html** — every line, a green dot where the file loaded, **play** for the processed sound and **raw** for the file as it is on disk. Flip between the two to tell a bad file from a merely dry one.

That page also has a **slider for every number in the chain**. The sound of the ghost is a matter of taste, and taste is faster found by dragging a slider than by editing a constant and reloading: tune it there, then paste the values it prints into `GHOST_VOICE`. (The page lives in `public/`, so delete it before a release if you would rather it were not online.)

So when generating: **same voice, same settings, no effects, no reverb, no pitch shift.** Mono, dry, trimmed close at both ends. The game adds the rest.

To shrink the set afterwards — no code change needed, the loader prefers mp3. The placeholder set is about 3 MB of wav; at 96 kbps it is a few hundred KB:

```bash
cd public/games/with-room/assets/audio/voice/ghost/en
for f in *.wav; do ffmpeg -i "$f" -ac 1 -b:a 96k "${f%.wav}.mp3"; done
```

Numbering is derived in [js/story/voiceClips.js](public/games/with-room/js/story/voiceClips.js) by walking the script in story order, so **ids shift if a ghost line is inserted mid-sequence** — append rather than insert, or regenerate this list.

`{name}` is the name the player typed at the start. It is only known at runtime, so those five lines cannot be recorded as written — see the note under the tables.

Tone: **whisper** = close, breathy, almost touching the ear · **cold** = flat, unhurried, no feeling in it at all.


## GHOST_INTRO — the ghost's first words

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g01 | ✅ `g01.wav` | whisper | You want to know where you are? | நீ எங்க இருக்கேன்னு தெரியணுமா? |
| g02 | ✅ `g02.wav` | whisper | Then solve the puzzles. | அப்ப புதிர்களைத் தீர். |
| g03 | ✅ `g03.wav` | cold | Four doors. | நான்கு கதவுகள். |
| g04 | ✅ `g04.wav` | cold | Four answers. | நான்கு பதில்கள். |
| g05 | ✅ `g05.wav` | cold | Only then will you remember. | அப்போதுதான் உனக்கு நினைவு வரும். |
| g06 | — | laugh | _(wordless laugh — built procedurally in audio/manager.js, no file needed)_ | — |

## REVEAL — the rules are laid out

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g07 | — `g07.wav` | whisper | {name}... | {name}... |
| g08 | ✅ `g08.wav` | whisper | Are you still wondering how you got here? | எப்படி இங்க வந்தேன்னு இன்னும் யோசிக்கிறியா? |
| g09 | ✅ `g09.wav` | cold | You want your wife back? | உன் மனைவி திரும்ப வேணுமா? |
| g10 | ✅ `g10.wav` | whisper | Then listen carefully. | அப்ப கவனமா கேளு. |
| g11 | ✅ `g11.wav` | whisper | She is waiting for you. | அவ உனக்காகக் காத்திருக்கா. |
| g12 | ✅ `g12.wav` | cold | But you cannot reach her yet. | ஆனா இன்னும் நீ அவகிட்ட போக முடியாது. |
| g13 | ✅ `g13.wav` | whisper | Every door in this place has a lock. | இந்த இடத்துல ஒவ்வொரு கதவுக்கும் ஒரு பூட்டு. |
| g14 | ✅ `g14.wav` | whisper | Every lock has a puzzle. | ஒவ்வொரு பூட்டுக்கும் ஒரு புதிர். |
| g15 | ✅ `g15.wav` | cold | Solve them. | அவங்களைத் தீர். |
| g16 | ✅ `g16.wav` | cold | Open the doors. | கதவுகளைத் திற. |
| g17 | ✅ `g17.wav` | whisper | Find her. | அவளைக் கண்டுபிடி. |
| g18 | — | laughSoft | _(wordless laugh — built procedurally in audio/manager.js, no file needed)_ | — |
| g19 | ✅ `g19.wav` | whisper | Good. Angry ones last longer. | நல்லது. கோபக்காரங்க ரொம்ப நாள் தாங்குவாங்க. |

## SOLVED_1 — after the clocks

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g20 | ✅ `g20.wav` | whisper | Four o'clock. That is when you stopped. | நாலு மணி. அப்பதான் நீ நின்னுட்ட. |
| g21 | ✅ `g21.wav` | cold | Breathing. | மூச்சு. |
| g22 | — | laugh | _(wordless laugh — built procedurally in audio/manager.js, no file needed)_ | — |
| g23 | ✅ `g23.wav` | whisper | Not for long. Don't look so frightened. | ரொம்ப நேரம் இல்ல. அப்படிப் பயப்படாத. |

## SOLVED_2 — after the shapes

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g24 | ✅ `g24.wav` | whisper | You knew the shapes without being told. You have been here before. | யாரும் சொல்லாமலே வடிவங்கள் தெரிஞ்சது. நீ முன்னமே இங்க வந்திருக்க. |
| g25 | ✅ `g25.wav` | cold | Inside. No. | உள்ள. இல்ல. |

## SOLVED_3 — after the lights

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g26 | ✅ `g26.wav` | whisper | Somebody has to keep the lights on for the guests. | விருந்தாளிகளுக்கு விளக்கு எரிய வேண்டாமா. |
| g27 | ✅ `g27.wav` | whisper | You are not the first one I have woken up in that bed. | அந்தக் கட்டில்ல நான் எழுப்பின முதல் ஆள் நீ இல்ல. |

## SOLVED_4 — before the last lock

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g28 | ✅ `g28.wav` | cold | The last lock. Go on. | கடைசிப் பூட்டு. போ. |
| g29 | ✅ `g29.wav` | whisper | Open the door and remember what you did. | கதவைத் திற. நீ என்ன செஞ்சேன்னு நினைவுக்கு வரும். |

## SOLVED_5 — her voice

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g30 | ✅ `g30.wav` | cold | She cannot hear you. That is the arrangement. | அவளுக்கு உன் குரல் கேக்காது. அதுதான் ஏற்பாடு. |

## SOLVED_6 — the mirror

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g31 | ✅ `g31.wav` | whisper | Most of this place is in the mirror, {name}. | இந்த இடத்துல பாதி கண்ணாடிக்குள்ளேயே இருக்கு, {name}. |

## FLASHBACK — the memory

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g32 | ✅ `g32.wav` | whisper | You let go. | நீ விட்டுட்ட. |

## ENDLESS — the ending

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g33 | ✅ `g33.wav` | whisper | You thought this would be easy, {name}? | இது சுலபமா இருக்கும்னு நினைச்சியா, {name}? |
| g34 | — | laugh | _(wordless laugh — built procedurally in audio/manager.js, no file needed)_ | — |
| g35 | ✅ `g35.wav` | cold | The game has only just begun. | விளையாட்டு இப்பதான் ஆரம்பம். |
| g36 | — | laughLong | _(wordless laugh — built procedurally in audio/manager.js, no file needed)_ | — |

## WHISPERS — ambient, one picked at random by horror.js

| id | file | emotion | English | Tamil |
|----|------|---------|---------|-------|
| g37 | — `g37.wav` | whisper | {name}... | {name}... |
| g38 | ✅ `g38.wav` | whisper | Behind you. | உன் பின்னாடி. |
| g39 | ✅ `g39.wav` | whisper | She stopped crying an hour ago. | ஒரு மணி நேரம் முன்னாடியே அழுகை நின்னுது. |
| g40 | ✅ `g40.wav` | whisper | You are being slow, {name}. | ரொம்ப மெதுவா இருக்க, {name}. |
| g41 | ✅ `g41.wav` | whisper | Don't look at the mirror yet. | இன்னும் கண்ணாடியைப் பாக்காத. |
| g42 | ✅ `g42.wav` | whisper | Count the doors again. | கதவுகளை மறுபடி எண்ணு. |
| g43 | ✅ `g43.wav` | whisper | I kept your hand warm. | உன் கையை நான் சூடா வெச்சிருந்தேன். |
| g44 | ✅ `g44.wav` | whisper | The bed is still warm. Someone else is coming. | கட்டில் இன்னும் சூடா இருக்கு. இன்னொருத்தர் வருவாங்க. |

## Spoken outside script.js

| id | file | emotion | where | English | Tamil |
|----|------|---------|-------|---------|-------|
| g45 | ✅ `g45.wav` | cold | `js/world/puzzles/clocks.js` — the ghost resets one clock | Three seventeen. That one is mine. | மூணு பதினேழு. அது என்னுடையது. |
| g46 | ✅ `g46.wav` | whisper | `js/world/puzzles/herdoor.js` — 3rd wrong door | You do not know which one she is behind. | அவ எந்தக் கதவுக்குப் பின்னால இருக்கான்னு உனக்குத் தெரியாது. |
| g47 | ✅ `g47.wav` | cold | `js/world/puzzles/herdoor.js` — 5th wrong door | You were holding the answer. You put it on a bed. | பதில் உன் கையிலேயே இருந்துச்சு. அதை நீ கட்டில்ல வெச்சுட்ட. |

**47 ids, 42 need a file, 40 on disk.** The other 5 are wordless laughs, built from oscillators at play time. ✅ in the table means the file exists.

### The set that is there now

A **placeholder** set, built by `node tools/ghost-voice/build.mjs` with the Windows voice Microsoft Zira Desktop — rate -2, SSML prosody pitch -40%, every clip trimmed to its words and normalised to the same −1 dBFS peak.

The pitch is baked in rather than left to the chain because SSML lowers the fundamental *without* changing the duration, which resampling cannot do. Measured: the voice goes from about 176 Hz to about 138 Hz before the game touches it, and the chain's 0.82 playback takes it to roughly 113 Hz — a drop of seven or eight semitones in total from where the voice started.

It is there so the whole game can be played through in one consistent tone, and so a real set has something to be compared against.

To replace it, generate your own and overwrite the files — same ids, any of the three extensions. Nothing in the code changes.

`g01.source.wav` beside them is the first clip as it was originally supplied, kept for reference. The loader never asks for it (it only ever requests `g01.wav` / `.mp3` / `.ogg`), so it is inert — delete it whenever.

### The five `{name}` lines

g07, g31, g33, g37, g40 contain the player's own name, which does not exist until they type it, so no recording can contain it. They split two ways, and both ways have a cost:

- **g07 and g37** are nothing BUT the name (`"{name}..."`), so there is no file for them at all. They fall back to the synthesiser, which does say the name — in whatever voice the device has. Two lines out of forty-seven in a different voice.
- **g31, g33 and g40** have other words, so they are recorded with the name dropped (`"You are being slow, {name}."` → `"You are being slow."`). The voice is right; the subtitle still shows the name the audio does not say.

That mismatch is worth fixing one of two ways: drop `{name}` from those three lines in `js/story/script.js` so the subtitle matches the audio, or have the game speak the name through the synthesiser straight after the clip — a small change to `voice.js`, not yet wired.

## English — filename, tone, line

```
g01.wav	[whisper]	You want to know where you are?
g02.wav	[whisper]	Then solve the puzzles.
g03.wav	[cold]	Four doors.
g04.wav	[cold]	Four answers.
g05.wav	[cold]	Only then will you remember.
g07.wav	[whisper]	{name}...
g08.wav	[whisper]	Are you still wondering how you got here?
g09.wav	[cold]	You want your wife back?
g10.wav	[whisper]	Then listen carefully.
g11.wav	[whisper]	She is waiting for you.
g12.wav	[cold]	But you cannot reach her yet.
g13.wav	[whisper]	Every door in this place has a lock.
g14.wav	[whisper]	Every lock has a puzzle.
g15.wav	[cold]	Solve them.
g16.wav	[cold]	Open the doors.
g17.wav	[whisper]	Find her.
g19.wav	[whisper]	Good. Angry ones last longer.
g20.wav	[whisper]	Four o'clock. That is when you stopped.
g21.wav	[cold]	Breathing.
g23.wav	[whisper]	Not for long. Don't look so frightened.
g24.wav	[whisper]	You knew the shapes without being told. You have been here before.
g25.wav	[cold]	Inside. No.
g26.wav	[whisper]	Somebody has to keep the lights on for the guests.
g27.wav	[whisper]	You are not the first one I have woken up in that bed.
g28.wav	[cold]	The last lock. Go on.
g29.wav	[whisper]	Open the door and remember what you did.
g30.wav	[cold]	She cannot hear you. That is the arrangement.
g31.wav	[whisper]	Most of this place is in the mirror, {name}.
g32.wav	[whisper]	You let go.
g33.wav	[whisper]	You thought this would be easy, {name}?
g35.wav	[cold]	The game has only just begun.
g37.wav	[whisper]	{name}...
g38.wav	[whisper]	Behind you.
g39.wav	[whisper]	She stopped crying an hour ago.
g40.wav	[whisper]	You are being slow, {name}.
g41.wav	[whisper]	Don't look at the mirror yet.
g42.wav	[whisper]	Count the doors again.
g43.wav	[whisper]	I kept your hand warm.
g44.wav	[whisper]	The bed is still warm. Someone else is coming.
g45.wav	[cold]	Three seventeen. That one is mine.
g46.wav	[whisper]	You do not know which one she is behind.
g47.wav	[cold]	You were holding the answer. You put it on a bed.
```

## Tamil — filename, tone, line

```
g01.wav	[whisper]	நீ எங்க இருக்கேன்னு தெரியணுமா?
g02.wav	[whisper]	அப்ப புதிர்களைத் தீர்.
g03.wav	[cold]	நான்கு கதவுகள்.
g04.wav	[cold]	நான்கு பதில்கள்.
g05.wav	[cold]	அப்போதுதான் உனக்கு நினைவு வரும்.
g07.wav	[whisper]	{name}...
g08.wav	[whisper]	எப்படி இங்க வந்தேன்னு இன்னும் யோசிக்கிறியா?
g09.wav	[cold]	உன் மனைவி திரும்ப வேணுமா?
g10.wav	[whisper]	அப்ப கவனமா கேளு.
g11.wav	[whisper]	அவ உனக்காகக் காத்திருக்கா.
g12.wav	[cold]	ஆனா இன்னும் நீ அவகிட்ட போக முடியாது.
g13.wav	[whisper]	இந்த இடத்துல ஒவ்வொரு கதவுக்கும் ஒரு பூட்டு.
g14.wav	[whisper]	ஒவ்வொரு பூட்டுக்கும் ஒரு புதிர்.
g15.wav	[cold]	அவங்களைத் தீர்.
g16.wav	[cold]	கதவுகளைத் திற.
g17.wav	[whisper]	அவளைக் கண்டுபிடி.
g19.wav	[whisper]	நல்லது. கோபக்காரங்க ரொம்ப நாள் தாங்குவாங்க.
g20.wav	[whisper]	நாலு மணி. அப்பதான் நீ நின்னுட்ட.
g21.wav	[cold]	மூச்சு.
g23.wav	[whisper]	ரொம்ப நேரம் இல்ல. அப்படிப் பயப்படாத.
g24.wav	[whisper]	யாரும் சொல்லாமலே வடிவங்கள் தெரிஞ்சது. நீ முன்னமே இங்க வந்திருக்க.
g25.wav	[cold]	உள்ள. இல்ல.
g26.wav	[whisper]	விருந்தாளிகளுக்கு விளக்கு எரிய வேண்டாமா.
g27.wav	[whisper]	அந்தக் கட்டில்ல நான் எழுப்பின முதல் ஆள் நீ இல்ல.
g28.wav	[cold]	கடைசிப் பூட்டு. போ.
g29.wav	[whisper]	கதவைத் திற. நீ என்ன செஞ்சேன்னு நினைவுக்கு வரும்.
g30.wav	[cold]	அவளுக்கு உன் குரல் கேக்காது. அதுதான் ஏற்பாடு.
g31.wav	[whisper]	இந்த இடத்துல பாதி கண்ணாடிக்குள்ளேயே இருக்கு, {name}.
g32.wav	[whisper]	நீ விட்டுட்ட.
g33.wav	[whisper]	இது சுலபமா இருக்கும்னு நினைச்சியா, {name}?
g35.wav	[cold]	விளையாட்டு இப்பதான் ஆரம்பம்.
g37.wav	[whisper]	{name}...
g38.wav	[whisper]	உன் பின்னாடி.
g39.wav	[whisper]	ஒரு மணி நேரம் முன்னாடியே அழுகை நின்னுது.
g40.wav	[whisper]	ரொம்ப மெதுவா இருக்க, {name}.
g41.wav	[whisper]	இன்னும் கண்ணாடியைப் பாக்காத.
g42.wav	[whisper]	கதவுகளை மறுபடி எண்ணு.
g43.wav	[whisper]	உன் கையை நான் சூடா வெச்சிருந்தேன்.
g44.wav	[whisper]	கட்டில் இன்னும் சூடா இருக்கு. இன்னொருத்தர் வருவாங்க.
g45.wav	[cold]	மூணு பதினேழு. அது என்னுடையது.
g46.wav	[whisper]	அவ எந்தக் கதவுக்குப் பின்னால இருக்கான்னு உனக்குத் தெரியாது.
g47.wav	[cold]	பதில் உன் கையிலேயே இருந்துச்சு. அதை நீ கட்டில்ல வெச்சுட்ட.
```
