# Dino Ranger: Jungle Run — v3.4 (3D)

An original dinosaur ride game in the arcade light-gun style, now in real 3D. Ride an open jeep along a winding, hilly jungle track through three missions. Dinosaurs walk, sprint and charge out of the jungle, and some leap or lunge at the jeep and bite (the screen shakes and the jeep bumps). You **tap to fire darts** from a big first-person rifle. Each mission ends with a giant: Triceratops, Spinosaurus, then T. rex.

## Put it on the iPad (works offline, full screen)
1. Publish once to GitHub Pages: `bash deploy.sh "v3"`. Do this **only with Satoshi's OK**. It needs an empty public repo `dino-ranger` cloned to `C:\Users\satos\dev\dino-ranger`, with Pages turned on.
2. On the iPad, open `https://satoshitoyoda-ai.github.io/dino-ranger/` in **Safari** → Share → **Add to Home Screen**.
3. Open it once from the Home Screen while online. The service worker caches the game, three.js and any 3D models; after that it works offline.
4. Optional: Settings → Accessibility → **Guided Access** → On. In the game, triple-click the top button → Options → Time Limit.

**Test on the PC:** v3 uses JavaScript modules, so double-clicking `index.html` no longer works. In this folder run `python -m http.server 8771`, then open `http://localhost:8771` in Edge or Chrome and play with the mouse.

## Grown-ups menu (hold ⚙︎ on the title screen for 2 s)
- **Intensity:** *Action* (default) — dinosaurs charge, leap and bite at the jeep, bosses lunge and roar. *Gentle* — dinosaurs stop at a distance, look, and walk away; roars are quieter; no bites.
- **Blood splash on hits:** on by default (Satoshi's call, 2026-11-05): blood spray, wound marks, a blood pool under fallen dinosaurs, a red flash on bites. Switch it off and darts only put dinosaurs to sleep (they lie down and snore, with floating Z's).
- **Difficulty:** Easy (ages 3–5) or Normal (5+). See aiming below.
- **Sound, music, ranger-radio voice**, **missions per day** (default 2), **child's name** (spoken only, stored on the iPad).
- The version line at the bottom shows which models are in use and the current frame rate.

## How it plays
- **Aiming is exact.** The dart goes where you tap: the game casts a ray from the tap into the 3D scene and hits the dinosaur's actual body. *Normal* has no aim assist. *Easy* only adds a small helper ring (34 px) around a tap that just misses. v2.1's forgiving 100–150 px assist is gone.
- **Head shots count double** (and give a bonus star). Small dinosaurs need 1 dart, Triceratops and Stegosaurus 3 (2 on Easy), the giants 8–16.
- Holding a finger down keeps firing and the gun follows the finger.
- **Six missions (v3.4)** in two rides of three. Each ride plays three missions; the next ride plays the other three, then it starts over.
  - Ride A: Fern Valley (giant Triceratops), River Gorge (Spinosaurus), Volcano Ridge (T. rex).
  - Ride B: Misty Marsh (causeway through swamp, giant Stegosaurus), Red Canyon (red cliffs and badlands, Alpha Raptor), Sunset Plains (golden grassland with big herds, King Rex).
- **Four weapons (v3.3)** — the round buttons bottom-left switch them any time:
  - 🎯 **Dart rifle:** one accurate dart (the default).
  - ⚡ **Rapid darts:** fast stream of small darts, each weaker.
  - ✴️ **Spread gun:** a double barrel firing 6 pellets in a cone. Strong up close, slow to reload.
  - 💥 **Sleepy cannon:** a slow, heavy shell that explodes (fireball, smoke, shake) and hits every dinosaur within about 5 m.
- **Weather (v3.3)** — each mission starts sunny, rainy, foggy or stormy and usually changes once on the way, with a ranger-radio warning. Rain brings streaks, a rain sound and wet ground. Fog cuts visibility to about 50 m. Thunderstorms add lightning flashes and thunder. Grown-ups can fix the weather in the menu (*Weather*).
- Every dinosaur moves at its own speed: raptors sprint (up to ~9 m/s), Triceratops trot or charge, Stegosaurus plod, Pteranodons dive along the road.
- **Jeep energy (v3.2, Satoshi's request):** each bite drains the green energy bar under the score (Easy 9, Normal 15; giants 14 or 22; a Pteranodon skimming the jeep takes a little). At zero it's **Game Over**: ▶ retries the same mission and doesn't use up a daily mission. Gentle mode has no bites, so no damage. Grown-ups can switch it off (*Jeep energy & game over*). The energy bar refills at the start of each mission.
- Fallen dinosaurs go into the **Field Guide** (binoculars button). Its 3D portraits show the species you have met; tap a card to hear its call and name.

## What's inside
| Path | What |
|---|---|
| `index.html` | Menus, styles, loading screen, import map |
| `js/game.js` | Game flow, jeep ride and camera, dinosaur AI, ray-cast hits, HUD, Field Guide, grown-ups menu |
| `js/world.js` | Spline track (curves + hills), terrain, sky dome, fog, sun + shadows, instanced jungle, river, volcano |
| `js/dinos.js` | 3D dinosaurs: built-in rigs (walk/run/bite/roar/fall animations) + loader for CC0 glTF models |
| `js/rifle.js` | First-person dart rifle (recoil, muzzle flash) and the jeep hood |
| `js/fx.js` | Blood, dust, blood pools, sleepy Z's |
| `js/audio.js` | Synthesized sound and music (no audio files) and the ranger-radio voice |
| `lib/` | three.js r187 + GLTF/FBX loaders (official npm package, MIT licence — `lib/LICENSE-three.txt`) |
| `models/` | Quaternius CC0 dinosaur models (FBX) + `models.json` |
| `sw.js` | Offline cache (bump `VERSION` on every release) |

## 3D models and licences
- **Quaternius "Animated LowPoly Dinosaurs" (CC0 1.0, public domain)** — <https://quaternius.itch.io/animated-lowpoly-dinosaurs>, downloaded by Satoshi on 2026-11-05 (zip "Dinosaur Animated Pack - Dec 2018"). **In use:** `models/Velociraptor.fbx`, `Triceratops.fbx`, `Stegosaurus.fbx`, `Trex.fbx`, `Apatosaurus.fbx` (skinned, with Idle / Walk / Run / Attack / Death / Jump clips). Licence text: `models/LICENSE-Quaternius.txt`. CC0 needs no attribution; credited anyway. The game loads them through three.js's FBXLoader, converts the flat colours to PBR with a fine bump, and smooths the normals. The pack has no glTF files, only FBX, OBJ and .blend. To swap or re-import: `python -I ../tools/import_models.py "<zip>"`.
- **Built-in dinosaurs:** Pteranodon and Spinosaurus, which are not in the pack, are modelled in code for this game. The code-built versions of the other species stay as a fallback: if `models/models.json` is empty or a model fails to load, the game still works. No third-party assets, so no licence terms apply.
- **three.js:** MIT licence, © three.js authors.

## Performance (iPad target: 60 fps)
Pixel ratio is capped at 1.5 on touch devices, with automatic step-down if frames drop below ~48 fps. The 1024² shadow map follows the jeep. Vegetation is instanced in 40 m chunks with frustum and distance culling, and fog hides the far edge. Static dinosaur parts are merged per joint to keep draw calls low. One render takes about 3 ms on the PC (Radeon 890M). **Real iPad speed has not been measured yet.**

## Privacy
There are no accounts, ads, analytics or network calls. Everything is stored on the device. The published files contain no personal names.

## Updating
Bump `VERSION` in `sw.js` and `js/game.js`, then run `deploy.sh` (only with Satoshi's OK). Open the app twice on the iPad to load the new version.
