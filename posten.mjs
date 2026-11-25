// "Strom heute Nacht" posten: X täglich, Instagram Mo/Mi/Fr (Muster vom Gründer am 18.11.2026 mit „passt“ freigegeben).
// Über die Buffer-Schnittstelle (Gratis-Tarif), Bild über eine öffentliche, feste Adresse.
//
// Aufruf:  node posten.mjs [JJJJ-MM-TT]
// Umgebung:
//   BUFFER_API_KEY   persönlicher Buffer-Schlüssel (nie ausgeben)
//   BILD_BASIS       öffentliche Adresse, unter der bilder/ liegt, z. B. https://raw.githubusercontent.com/<konto>/<projekt>/main
//   X_KONTO          erwarteter X-Name (Standard jonas_ampena)
//   IG_KONTO         erwarteter Instagram-Name (Standard getampena)
//   TROCKEN=1        nur zeigen, was gepostet würde (kein Schreibzugriff auf Buffer)
//
// Rückgabe: 0 gepostet oder schon erledigt · 3 Auffälligkeit (nichts gepostet) · 1 Fehler
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const berlin = (ms, opt) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opt }).format(ms);
const istTag = (ms) => berlin(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('.').reverse().join('-');
const auffaellig = (grund) => { console.error(`AUFFÄLLIG: ${grund}`); process.exit(3); };

const jetzt = process.env.PRUEF_JETZT ? Date.parse(process.env.PRUEF_JETZT) : Date.now(); // PRUEF_JETZT nur für Probeläufe
const tag = process.argv[2] ?? istTag(jetzt);
const TROCKEN = process.env.TROCKEN === '1';
const X_KONTO = (process.env.X_KONTO || 'jonas_ampena').toLowerCase();
const IG_KONTO = (process.env.IG_KONTO || 'getampena').toLowerCase();
const BILD_BASIS = (process.env.BILD_BASIS || '').replace(/\/$/, '');
const SCHLUESSEL = process.env.BUFFER_API_KEY || '';

const marke = join(hier, 'gepostet', `${tag}.json`);
if (existsSync(marke)) { console.log(`${tag}: schon gepostet (${marke}).`); process.exit(0); }

const kz = JSON.parse(readFileSync(join(hier, 'ausgabe', `strom-${tag}.json`), 'utf8'));
if (kz.tag !== tag) auffaellig(`Kennzahlen gehören zu ${kz.tag}, nicht zu ${tag}`);
if (tag !== istTag(jetzt)) auffaellig(`${tag} ist nicht heute (${istTag(jetzt)}); alte Tage werden nicht nachgepostet`);
const stundeJetzt = Number(berlin(jetzt, { hour: 'numeric', hourCycle: 'h23' }).replace(/\D/g, ''));
if (stundeJetzt >= 18) auffaellig(`schon ${stundeJetzt} Uhr; nach 18 Uhr ist der Beitrag zu spät`);

const wochentag = berlin(jetzt, { weekday: 'short' }); // Mo., Di., Mi., …
const mitInstagram = /^(Mo|Mi|Fr)/.test(wochentag);

if (!BILD_BASIS.startsWith('https://')) auffaellig('BILD_BASIS fehlt oder ist nicht https');
const bildUrl = `${BILD_BASIS}/${kz.bild}`;

// Das Bild muss öffentlich erreichbar sein, bevor Buffer es holt (nach dem Hochladen kann das einen Moment dauern).
async function bildPruefen() {
  for (let versuch = 1; versuch <= 12; versuch++) {
    try {
      const r = await fetch(bildUrl, { method: 'GET', cache: 'no-store' });
      const art = r.headers.get('content-type') || '';
      if (r.ok && /image\/jpeg/.test(art)) { const n = (await r.arrayBuffer()).byteLength; if (n > 20000) return n; }
    } catch { /* noch einmal */ }
    await new Promise((f) => setTimeout(f, 10000));
  }
  return 0;
}

async function buffer(query, variables = {}) {
  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SCHLUESSEL}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Buffer ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 400)}`);
  return j.data;
}

const KANAELE = `query { account { organizations { id name } } }`;
const KANAL_LISTE = `query K($organizationId: OrganizationId!) { channels(input: { organizationId: $organizationId }) { id name displayName service type isDisconnected isLocked } }`;
const ERSTELLEN = `mutation P($input: CreatePostInput!) { createPost(input: $input) {
  ... on PostActionSuccess { post { id dueAt status } }
  ... on MutationError { message } } }`;

async function kanalSuchen() {
  const orgs = (await buffer(KANAELE)).account.organizations;
  if (orgs.length !== 1) auffaellig(`Buffer hat ${orgs.length} Organisationen; erwartet ist genau eine`);
  const liste = (await buffer(KANAL_LISTE, { organizationId: orgs[0].id })).channels;
  const finde = (dienste, konto) => {
    const k = liste.filter((c) => dienste.includes(String(c.service).toLowerCase()));
    const treffer = k.filter((c) => String(c.name).toLowerCase().replace(/^@/, '') === konto);
    if (treffer.length !== 1) auffaellig(`${dienste[0]}-Konto „${konto}“ nicht eindeutig in Buffer (gefunden: ${k.map((c) => c.name).join(', ') || 'keins'})`);
    if (treffer[0].isDisconnected || treffer[0].isLocked) auffaellig(`${dienste[0]}-Konto „${konto}“ ist in Buffer getrennt oder gesperrt`);
    return treffer[0];
  };
  return { x: finde(['twitter', 'x'], X_KONTO), ig: mitInstagram ? finde(['instagram'], IG_KONTO) : null };
}

// 18:05 deutscher Zeit heute als UTC-Zeitpunkt (Instagram wie bisher am frühen Abend)
function heute1805() {
  for (const versatz of [1, 2]) {
    const ms = Date.parse(`${tag}T${String(18 - versatz).padStart(2, '0')}:05:00Z`);
    if (berlin(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) === '18:05') return new Date(ms).toISOString();
  }
  auffaellig('18:05 deutscher Zeit nicht bestimmbar');
}

console.log(`${tag} (${wochentag}): X${mitInstagram ? ' + Instagram' : ''}. Bild ${bildUrl}`);
console.log(kz.text);

if (TROCKEN && !SCHLUESSEL) { console.log('TROCKEN ohne Schlüssel: Buffer nicht gefragt, nichts gepostet.'); process.exit(0); }
if (!SCHLUESSEL) auffaellig('BUFFER_API_KEY fehlt');

const groesse = await bildPruefen();
if (!groesse) auffaellig(`Bild nicht öffentlich als JPEG erreichbar: ${bildUrl}`);
const { x, ig } = await kanalSuchen();
console.log(`Konten: X ${x.name} (${x.type})${ig ? `, Instagram ${ig.name} (${ig.type})` : ''}. Bild ${groesse} Bytes.`);

const bild = [{ image: { url: bildUrl } }];
const auftraege = [{ wo: 'x', input: { channelId: x.id, text: kz.text, assets: bild, schedulingType: 'automatic', mode: 'shareNow', aiAssisted: false } }];
if (ig) {
  if (String(ig.type).toLowerCase() === 'profile') auffaellig('Instagram ist ein privates Profil; Buffer kann dort nicht automatisch posten');
  const um = heute1805();
  const spaeter = Date.parse(um) - jetzt > 5 * 60000;
  auftraege.push({ wo: 'instagram', input: { channelId: ig.id, text: kz.text, assets: bild, schedulingType: 'automatic', mode: spaeter ? 'customScheduled' : 'shareNow', ...(spaeter ? { dueAt: um } : {}), metadata: { instagram: { type: 'post', shouldShareToFeed: true } }, aiAssisted: false } });
}

if (TROCKEN) { console.log('TROCKEN, würde senden:'); for (const a of auftraege) console.log(a.wo, JSON.stringify({ ...a.input, text: '…' })); process.exit(0); }

const ergebnis = { tag, bild: bildUrl, kennzahlen: { von: kz.von, bis: kz.bis, guenstig: kz.guenstig, euro_40kwh: kz.euro_40kwh, quelle: kz.quelle }, beitraege: [] };
let fehler = 0;
for (const a of auftraege) {
  try {
    const d = (await buffer(ERSTELLEN, { input: a.input })).createPost;
    if (d?.post) { ergebnis.beitraege.push({ wo: a.wo, id: d.post.id, dueAt: d.post.dueAt, status: d.post.status }); console.log(`${a.wo}: ${d.post.status} ${d.post.dueAt ?? ''}`); }
    else { fehler++; console.error(`${a.wo}: Buffer lehnt ab: ${d?.message ?? 'ohne Grund'}`); }
  } catch (e) { fehler++; console.error(`${a.wo}: ${e.message}`); }
  if (a.wo === 'x' && fehler) break; // ohne X auch kein Instagram, sonst stünde es beim nächsten Versuch doppelt da
}
// Marke nur, wenn X geklappt hat (sonst versucht der nächste Lauf es noch einmal; Instagram-Fehler werden gemeldet, nicht wiederholt).
if (ergebnis.beitraege.some((b) => b.wo === 'x')) { mkdirSync(dirname(marke), { recursive: true }); writeFileSync(marke, JSON.stringify(ergebnis, null, 1), 'utf8'); }
process.exit(fehler ? 1 : 0);
