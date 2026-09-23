# Dizident 86 — Noaptea în bloc (three.js)

Joacă online: https://iliemihai.github.io/dizident-86/

```sh
npm install
npm run dev
```

- **Mouse:** click pe un obiect: omul merge până la el și face acțiunea. Click pe podea: merge acolo. Dublu-click: se grăbește.
- **WASD / săgeți:** mers prin cameră, inclusiv în adâncime. **Shift:** grăbit.
- **E:** interacțiune cu obiectul din apropiere (lampă, radio, aragaz, geam, ușă / uși, scară, lăzi).
- **M:** sunet. **H:** ascunde interfața. **1 / 2:** cameră / hol. **L F N B:** lampă, aragaz, ninsoare, neon.

## Cum e făcut

- Decorul sunt aceleași imagini ca în Godot (`public/assets/apartment.png`, `corridor.png`). Shaderul `atmosphere.gdshader` e portat 1:1 în `src/backdrop.js`, deci lumina, flacăra, aburul, ninsoarea și neonul arată identic.
- `src/world.js`: o cameră 3D potrivită pe perspectiva pozelor (ochi la 1,15 m, focală 772 px). Tot aici sunt zonele de mers, lămpile și obiectele.
- `src/character.js`: personajul 3D, cu animații motion-capture (Mixamo) retargetate pe corp. Viteza de redare urmează viteza reală, ca să nu alunece picioarele. Tălpile sunt lipite de podea. Brațul drept face IK spre obiect, capul se uită spre obiect.
- Personajul e luminat de lumini 3D reale, sincronizate cu pâlpâirea din shader: lampă, aragaz, geam, bec, neon. Umbrele cad pe podea prin suprafețe invizibile.

`anim.html` arată clipurile pe personaj, separat de joc.

**Resurse provizorii:** corpul (`readyplayer.glb`, avatar Ready Player Me) și mișcările (`Soldier.glb`, Mixamo) sunt modelele de exemplu din repo-ul three.js. Pentru versiunea finală trebuie înlocuite cu modele proprii (MakeHuman + Mixamo sau mocap propriu).

## Radio

Fiecare folosire a radioului trece pe postul următor, „Trei culori” → „Te slăvim, Românie” → „Zdrobite cătușe” → „E scris pe tricolor Unire” → Radio Europa Liberă (bruiat) → oprit. Între posturi se aude cadranul: fâșâit și frânturi din alte posturi.

- „Trei culori”: [`Trei culori.ogg`](https://commons.wikimedia.org/wiki/File:Trei_culori.ogg), domeniu public, Wikimedia Commons.
- „Te slăvim, Românie” (1953–1975), „Zdrobite cătușe” (1948–1953), „E scris pe tricolor Unire” (1975–1977): înregistrările vocale din domeniul public de pe Wikimedia Commons.
- Europa Liberă: text fictiv citit cu vocea macOS „Ioana”, plus bruiaj sintetizat.

Sunetul de radio vechi (bandă îngustă, saturație, wow/flutter, fâșâit, pârâituri, fading pe unde scurte) e generat cu `tools/age_radio.py` din fișierele curate.
