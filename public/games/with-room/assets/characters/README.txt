WITHROOM - character models
===========================

Drop three files in this folder and the game uses them instead of the
code-generated characters. All three are optional and independent: a file that
is missing simply means that character is generated, so you can add them one at
a time.

    him.glb     the husband (the player)
    her.glb     the wife
    ghost.glb   the thing in the building

TWO WAYS TO INSTALL ONE
-----------------------
A.  A single file:          assets/characters/ghost.glb
B.  An extracted folder:    assets/characters/ghost/scene.gltf
                            assets/characters/ghost/scene.bin
                            assets/characters/ghost/textures/...

B is what a Sketchfab download gives you. Choose "Download 3D model" and then
the glTF option, and you get a .zip - extract the WHOLE zip into a folder named
after the character and leave its insides alone. The game finds scene.gltf by
itself. No Blender, no conversion.

A is what Mixamo gives you once it has been through Blender, and what most
other exporters produce directly.


A WORD ABOUT WHAT YOU DOWNLOAD
------------------------------
Check the licence on the model page before you ship it. Two separate things can
go wrong and they are both easy to miss:

  THE UPLOADER'S LICENCE.  CC0 is free to use with no conditions. CC-BY is free
  but you must credit the author somewhere on the site. Some models are marked
  for editorial or personal use only and cannot go in a game at all.

  WHOSE CHARACTER IT IS.  A lot of the most appealing horror models on Sketchfab
  are rips of characters from other games - Granny, Lethal Company, Poppy
  Playtime and so on. The uploader cannot licence those to you, because they do
  not own them: the studio that made the game does. A model like that is fine to
  look at and risky to publish, and "I found it on Sketchfab" is not a defence
  anybody has ever won with.

Original models, or a character you build on Mixamo or Ready Player Me, avoid
the second problem entirely.


WHERE TO GET THEM - Mixamo, free, licensed for use in games
-----------------------------------------------------------
1. mixamo.com, sign in with a free Adobe account.
2. CHARACTERS tab: pick one. Realistic adult proportions read best here - the
   game lights faces from below with a lantern and a bare bulb, and a stylised
   character loses that entirely.
3. ANIMATIONS tab: search "Idle" and pick one. Any single looping idle is
   enough; the game adds its own head turns, breathing and talking motion on
   top. "Standing Idle", "Breathing Idle" and "Scared Idle" all work well.
4. DOWNLOAD:  Format = FBX Binary (.fbx),  Skin = With Skin,  Frames = 30
5. Convert to .glb, because this engine loads glTF and not FBX:
      Blender (free):  File > Import > FBX ... then File > Export > glTF 2.0
      Export settings: Format "glTF Binary (.glb)", Include "Selected Objects"
      off, and leave everything else at its default.
6. Rename to him.glb / her.glb / ghost.glb and put it in this folder.

WHAT THE GAME DOES WITH IT
--------------------------
  - Scales the model to the right height and stands it on the floor, so the
    source's units and origin do not matter.
  - Turns it to face +Z, which is the opposite of Mixamo's default.
  - Switches on shadows, damps the environment response so it does not glow in
    a room lit by one bulb, and converts fully-transparent hair materials to
    alpha-tested ones so they sort correctly in fog.
  - Plays the model's own animation clips, and picks one per pose by name.
  - Turns the head toward whatever the character is looking at, using the
    mixamorigHead bone.

WHAT IT CANNOT DO
-----------------
A Mixamo rig has no face bones and no blend shapes, so the mouth does not move
when the character speaks. The game compensates with head and chest motion
while a line is being spoken. If you want real lip-sync, the model needs
visemes or a jaw bone - say so and it can be driven from the same place.

OTHER SOURCES
-------------
Anything that exports a .glb works. If you download from Sketchfab, use the
"Download 3D model > glTF" option and CHECK THE LICENCE: many models are
CC-BY (fine, but you must credit the author somewhere on the site) and some are
editorial-use-only, which means they cannot ship in a game at all.
