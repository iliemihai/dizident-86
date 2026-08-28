# Dizident 86

Un joc pixel-art audio-first plasat într-o garsonieră muncitorească din București, în iarna lui 1987.

## Joacă offline

Deschide `public/game/index.html` direct într-un browser modern. Nu este necesar un server, iar grafica și efectele sonore sunt locale.

## Controale

- Click pe radio / `F`: lovește radioul când pierde contactul.
- Trage de butonul din dreapta / săgeți stânga-dreapta: acord fin.
- Ține apăsat în zona copilului / `S`: liniștește copilul.
- `Esc`: oprește radioul și abandonează transmisia.
- `?fast=1`: mod rapid de verificare a întregii progresii.

## Proiect web

```sh
npm run dev
npm run build
```

Pagina principală încadrează aceeași versiune offline, astfel încât jocul să aibă o singură implementare.

## GitHub Pages

Workflow-ul `Publish Dizident 86` publică automat conținutul static din `public/game` după fiecare actualizare a ramurii `main`.
