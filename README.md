# Strom heute Nacht

Täglicher Beitrag von [Ampena](https://ampena.com): Wann ist Strom an der Börse heute Nacht am günstigsten?

Jeden Nachmittag baut ein GitHub-Ablauf aus den Day-Ahead-Börsenpreisen für Deutschland ein Bild und einen kurzen Text
und postet beides über Buffer: auf X täglich, auf Instagram montags, mittwochs und freitags.

- **Daten:** Day-Ahead-Preise DE-LU aus der öffentlichen Datei des Ampena-Datendienstes. Quelle und Lizenz stehen in der Datei
  und auf jedem Bild (derzeit Bundesnetzagentur | SMARD.de, CC BY 4.0).
- **Prüfung vor dem Posten:** volle 14 Stunden (18 bis 8 Uhr), Preise zwischen −20 und 60 ct/kWh, Ersparnis plausibel,
  Bild 1080 × 1350, Text höchstens 280 Zeichen, richtiger Tag, vor 18 Uhr, richtige Konten in Buffer. Stimmt etwas nicht,
  wird nichts gepostet und der Lauf endet rot.
- **Einmal am Tag:** `gepostet/<Tag>.json` verhindert doppelte Beiträge.
- **Bilder:** `bilder/` (öffentlich, weil Buffer das Bild über eine feste Adresse abholt).

Lokal ausprobieren (postet nichts):

```
npm ci
node bauen.mjs
TROCKEN=1 BILD_BASIS=https://example.com node posten.mjs
```

Schrift: Archivo (SIL Open Font License 1.1, siehe `schrift/OFL-Archivo.txt`).
