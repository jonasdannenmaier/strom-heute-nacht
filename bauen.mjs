// "Strom heute Nacht": baut aus den Day-Ahead-Preisen (boerse.json des Ampena-Datendienstes, Quelle und Lizenz aus der Datei)
// ein Bild 1080 x 1350 (PNG + JPEG), den Beitragstext und eine Kennzahlen-Datei. Postet nichts.
// Gleiches Muster wie umsetzung/social/strom-heute-nacht/bauen.mjs (Gründer „passt“ am 18.11.2026), hier lauffähig auf dem Server.
//
// Aufruf:  node bauen.mjs              (heute Abend bis morgen früh, deutsche Zeit)
//          node bauen.mjs 2026-11-18   (Abend dieses Tages)
// Umgebung: BROWSER = Pfad zu Chrome/Edge (sonst Edge unter Windows, google-chrome sonst)
//
// Rückgabe: 0 gebaut · 2 Preise noch nicht vollständig (später noch einmal) · 3 Auffälligkeit (nicht posten, melden)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const BROWSER = process.env.BROWSER || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'google-chrome');
const BOERSE = 'https://rfbllozwzvzteliquhbs.supabase.co/storage/v1/object/public/ladepunkte/boerse.json';

const berlin = (ms, opt) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opt }).format(ms);
const stunde = (ms) => Number(berlin(ms, { hour: 'numeric', hourCycle: 'h23' }).replace(/\D/g, ''));
const komma = (x, n = 1) => x.toFixed(n).replace('.', ',');
const istTag = (ms) => berlin(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('.').reverse().join('-');
const auffaellig = (grund) => { console.error(`AUFFÄLLIG: ${grund}`); process.exit(3); };

const tag = process.argv[2] ?? istTag(Date.now());

const antwort = await fetch(BOERSE, { cache: 'no-store' });
if (!antwort.ok) { console.error(`boerse.json nicht erreichbar (${antwort.status}).`); process.exit(2); }
const datei = await antwort.json();
if (!datei.an || datei.zone !== 'DE-LU') auffaellig('boerse.json ist aus oder nicht für DE-LU.');
if (datei.einheit !== 'EUR/MWh') auffaellig(`unerwartete Einheit ${datei.einheit}`);
if (!/SMARD|Energy-Charts/i.test(datei.quelle ?? '') || !datei.lizenz) auffaellig(`unbekannte Quelle/Lizenz: ${datei.quelle} / ${datei.lizenz}`);
const QUELLE = `${datei.quelle} (${datei.lizenz})`;

// Viertelstunden zu Stunden mitteln (nur volle Stunden mit 4 Werten)
const proStunde = new Map();
for (const [ms, eurMwh] of datei.punkte) { if (eurMwh == null) continue; const h = ms - (ms % 3600000); const e = proStunde.get(h) ?? []; e.push(eurMwh); proStunde.set(h, e); }
const reihe = [...proStunde].filter(([, v]) => v.length === 4).sort((a, b) => a[0] - b[0]).map(([ms, v]) => ({ ms, ct: v.reduce((a, x) => a + x, 0) / 4 / 10 }));

// Fenster: 18 Uhr am Tag bis 8 Uhr am Folgetag (Ortszeit), 14 Stunden am Stück
const start = reihe.findIndex((r) => istTag(r.ms) === tag && stunde(r.ms) === 18);
if (start < 0 || reihe.length < start + 14) { console.error(`Für den Abend ${tag} liegen die Preise noch nicht vollständig vor.`); process.exit(2); }
const nacht = reihe.slice(start, start + 14);
for (let i = 1; i < nacht.length; i++) if (nacht[i].ms - nacht[i - 1].ms !== 3600000) auffaellig('Lücke in den Stunden der Nacht.');

// Plausibel? Stundenmittel an der Börse liegen fast immer zwischen −20 und 60 ct/kWh.
for (const r of nacht) if (!Number.isFinite(r.ct) || r.ct < -20 || r.ct > 60) auffaellig(`ungewöhnlicher Preis ${r.ct.toFixed(2)} ct/kWh um ${stunde(r.ms)} Uhr`);

// günstigste drei Stunden am Stück
let best = 0, bestSum = Infinity;
for (let i = 0; i + 3 <= nacht.length; i++) { const s = nacht[i].ct + nacht[i + 1].ct + nacht[i + 2].ct; if (s < bestSum) { bestSum = s; best = i; } }
const guenstig = bestSum / 3;
const sofort = nacht[0].ct;
const von = stunde(nacht[best].ms), bis = (stunde(nacht[best + 2].ms) + 1) % 24;
const unterschied = sofort - guenstig;
const kwh = 40;
const euro = (unterschied * kwh) / 100;
if (euro > 25) auffaellig(`Ersparnis ${euro.toFixed(2)} € für 40 kWh ist ungewöhnlich hoch`);

const max = Math.max(...nacht.map((r) => r.ct)), min = Math.min(0, ...nacht.map((r) => r.ct));
const balken = nacht.map((r, i) => {
  const h = Math.max(6, Math.round(((r.ct - min) / (max - min || 1)) * 330));
  const an = i >= best && i < best + 3;
  return `<div class="b"><i style="height:${h}px;background:${an ? '#1b4fe0' : 'rgba(11,18,32,.13)'}"></i><span${an ? ' class="an"' : ''}>${stunde(r.ms)}</span></div>`;
}).join('');

const datum = `${berlin(nacht[0].ms, { weekday: 'long', day: 'numeric', month: 'long' })}`;
const satz = unterschied >= 0.5
  ? `Mit dynamischem Tarif kosten ${kwh} kWh ab ${von} Uhr rund ${komma(euro, 2)} € weniger als um 18 Uhr.`
  : `Heute macht die Uhrzeit kaum einen Unterschied.`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="40" viewBox="0 0 51 60"><path d="M0 0 H15 V34 A8.5 8.5 0 0 0 23.5 42.5 H28 V57.5 H23.5 A23.5 23.5 0 0 1 0 34 Z" fill="#0b1220"/><path d="M51 60 H36 V26 A8.5 8.5 0 0 0 27.5 17.5 H23 V2.5 H27.5 A23.5 23.5 0 0 1 51 26 Z" fill="#0b1220"/></svg>`;
const schrift = pathToFileURL(join(hier, 'schrift')).href;

const html = `<!doctype html><html lang="de"><meta charset="utf-8"><style>
@font-face{font-family:AHead;src:url(${schrift}/ArchivoHeadline.ttf)}@font-face{font-family:ASemi;src:url(${schrift}/ArchivoSemi.ttf)}
@font-face{font-family:AText;src:url(${schrift}/ArchivoText.ttf)}@font-face{font-family:ALight;src:url(${schrift}/ArchivoLight.ttf)}
@font-face{font-family:AKicker;src:url(${schrift}/ArchivoKicker.ttf)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:linear-gradient(180deg,#eef1f5 0%,#e4e9f0 100%);color:#0b1220;font-family:AText,sans-serif;-webkit-font-smoothing:antialiased;padding:84px 84px 0}
.kicker{font-family:AKicker;font-size:25px;letter-spacing:.16em;color:#5a6478;text-transform:uppercase}
h1{font-family:AHead;font-weight:normal;font-size:104px;line-height:108px;letter-spacing:-3.2px;margin-top:26px}
h1 b{font-weight:normal;color:#1b4fe0}
.preis{margin-top:34px;display:flex;align-items:baseline;gap:18px}
.preis strong{font-family:ALight;font-weight:normal;font-size:150px;line-height:150px;letter-spacing:-5px}
.preis span{font-family:ASemi;font-size:38px;color:#434d61}
.karte{margin-top:40px;background:#fff;border-radius:44px;padding:44px 40px 30px;box-shadow:0 30px 80px rgba(11,18,32,.09),0 6px 18px rgba(11,18,32,.05)}
.reihe{display:flex;align-items:flex-end;gap:12px;height:376px}
.b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.b i{display:block;width:100%;border-radius:12px}
.b span{font-family:ASemi;font-size:24px;color:#5a6478;margin-top:12px}.b span.an{color:#1b4fe0}
.satz{margin-top:38px;font-family:ASemi;font-size:40px;line-height:50px;letter-spacing:-.5px}
.fuss{position:absolute;left:84px;right:84px;bottom:64px;display:flex;align-items:center;justify-content:space-between}
.marke{display:flex;align-items:center;gap:16px;font-family:ASemi;font-size:36px;letter-spacing:-.6px}
.quelle{font-size:21px;line-height:28px;color:#5a6478;text-align:right}
</style><body>
<div class="kicker">Strom heute Nacht · ${datum}</div>
<h1>Am günstigsten<br>von <b>${von} bis ${bis} Uhr</b></h1>
<div class="preis"><strong>${komma(guenstig)}</strong><span>Cent je kWh an der Börse</span></div>
<div class="karte"><div class="reihe">${balken}</div></div>
<p class="satz">${satz}</p>
<div class="fuss"><div class="marke">${mark}Ampena</div><div class="quelle">Börsenpreis Deutschland, ohne Netzentgelt, Steuern, Abgaben<br>Daten: ${QUELLE}</div></div>
</body></html>`;

const aus = join(hier, 'ausgabe'); mkdirSync(aus, { recursive: true });
const bilder = join(hier, 'bilder'); mkdirSync(bilder, { recursive: true });
const htmlPfad = join(aus, `strom-${tag}.html`), pngPfad = join(aus, `strom-${tag}.png`), jpgPfad = join(bilder, `strom-${tag}.jpg`);
writeFileSync(htmlPfad, html, 'utf8');
execFileSync(BROWSER, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1350', '--virtual-time-budget=3000', `--screenshot=${pngPfad}`, pathToFileURL(htmlPfad).href], { stdio: 'ignore' });

// Instagram nimmt über die Schnittstelle nur JPEG an.
const sharp = (await import('sharp')).default;
const meta = await sharp(pngPfad).metadata();
if (meta.width !== 1080 || meta.height !== 1350) auffaellig(`Bild hat ${meta.width} x ${meta.height} statt 1080 x 1350`);
await sharp(pngPfad).flatten({ background: '#eef1f5' }).jpeg({ quality: 92, mozjpeg: true }).toFile(jpgPfad);

const text = `Strom heute Nacht: am günstigsten ${von}–${bis} Uhr, ${komma(guenstig)} ct/kWh an der Börse. ${satz}\n\nBörsenpreis ohne Netzentgelt, Steuern, Abgaben. Daten: ${datei.quelle.replace('.info (Fraunhofer ISE), Daten', ',')}`;
if ([...text].length > 280) auffaellig(`Text hat ${[...text].length} Zeichen, X erlaubt 280`);
writeFileSync(join(aus, `strom-${tag}.txt`), text, 'utf8');

const kennzahlen = { tag, von, bis, guenstig: +guenstig.toFixed(2), sofort18: +sofort.toFixed(2), unterschied_ct: +unterschied.toFixed(2), euro_40kwh: +euro.toFixed(2), quelle: datei.quelle, stand: datei.stand, bild: `bilder/strom-${tag}.jpg`, text };
writeFileSync(join(aus, `strom-${tag}.json`), JSON.stringify(kennzahlen, null, 1), 'utf8');
console.log(JSON.stringify(kennzahlen, null, 1));
