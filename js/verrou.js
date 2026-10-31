// Verrouillage par code à 4 chiffres.
//
// Honnêteté sur la protection : le code empêche quelqu'un de regarder l'appli par-dessus ton épaule
// ou sur ton téléphone déverrouillé. Il ne chiffre pas les données. Le code n'est jamais stocké en clair
// (empreinte PBKDF2 + sel aléatoire) et n'est jamais inclus dans les sauvegardes.

import { db } from './db.js';
import { journal } from './journal.js';
import { esc, icones } from './ui.js';

export const LONGUEUR_CODE = 4;
const ITERATIONS = 100000;
const enc = new TextEncoder();

// ---------- Règles pures (testées dans tests.html) ----------
/** Durée de blocage (ms) à partir du nombre d'échecs : 5 → 30 s, 10 → 5 min, 15 et plus → 30 min */
export function dureeBlocage(echecs) {
  if (echecs >= 15) return 30 * 60000;
  if (echecs >= 10) return 5 * 60000;
  if (echecs >= 5) return 30000;
  return 0;
}

/** Fin du blocage après un échec : on bloque tous les 5 échecs, sinon 0 */
export function blocageApresEchec(echecs, maintenant) {
  return echecs > 0 && echecs % 5 === 0 ? maintenant + dureeBlocage(echecs) : 0;
}

/** Faut-il redemander le code au retour dans l'appli ? */
export function doitVerrouiller(masqueDepuis, maintenant, delaiSecondes) {
  if (masqueDepuis == null) return false;
  return delaiSecondes === 0 || maintenant - masqueDepuis >= delaiSecondes * 1000;
}

export const codeValide = code => new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(String(code));

// ---------- Empreinte du code ----------
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const verrouDisponible = () => !!(window.crypto && crypto.subtle && crypto.getRandomValues);

async function empreinte(code, sel, iterations) {
  const cle = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' }, cle, 256));
}

let actif = false;      // un code est défini
let delai = 60;         // secondes avant de redemander le code

export async function codeActif() { return !!(await db.parametre('code_verrouillage', null)); }

export async function definirCode(code) {
  if (!codeValide(code)) throw new Error('Code invalide');
  const sel = crypto.getRandomValues(new Uint8Array(16));
  await db.definirParametre('code_verrouillage', { sel: b64(sel), hash: await empreinte(code, sel, ITERATIONS), iterations: ITERATIONS });
  await db.definirParametre('verrou_echecs', { n: 0, jusqua: 0 });
  actif = true;
  journal.info('securite', 'Code de verrouillage défini');
}

export async function verifierCode(code) {
  const c = await db.parametre('code_verrouillage', null);
  if (!c) return true;
  return (await empreinte(code, deb64(c.sel), c.iterations)) === c.hash;
}

export async function retirerCode() {
  await db.definirParametre('code_verrouillage', null);
  await db.definirParametre('verrou_echecs', { n: 0, jusqua: 0 });
  actif = false;
  journal.info('securite', 'Code de verrouillage désactivé');
}

export async function definirDelai(secondes) {
  delai = secondes;
  await db.definirParametre('delai_verrou', secondes);
}

// ---------- Pavé de saisie du code (réutilisé par l'écran de verrouillage et les réglages) ----------
/**
 * Dessine titre, points, pavé numérique dans `conteneur`.
 * `surCode(code)` est appelée quand les 4 chiffres sont saisis.
 * Renvoie { reinitialiser, erreur, titre, bloquer }.
 */
export function pavePin(conteneur, { titre, sousTitre = '', surCode }) {
  let saisie = '';
  let occupe = false;
  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'eff'];
  conteneur.innerHTML = `
    <div class="pin">
      <h2 class="pin-titre">${esc(titre)}</h2>
      <p class="muet pin-sous">${esc(sousTitre)}</p>
      <div class="pin-points" role="img" aria-label="Aucun chiffre saisi sur ${LONGUEUR_CODE}">
        ${'<span></span>'.repeat(LONGUEUR_CODE)}
      </div>
      <p class="pin-erreur" role="alert"></p>
      <div class="pin-pave" role="group" aria-label="Pavé numérique">
        ${touches.map(t => t === '' ? '<span></span>' : `<button type="button" data-pin="${t}"
          aria-label="${t === 'eff' ? 'Effacer' : t}">${t === 'eff' ? '<i data-lucide="delete"></i>' : t}</button>`).join('')}
      </div>
    </div>`;
  icones();

  const q = s => conteneur.querySelector(s);
  const majPoints = () => {
    conteneur.querySelectorAll('.pin-points span').forEach((p, i) => p.classList.toggle('plein', i < saisie.length));
    q('.pin-points').setAttribute('aria-label', `${saisie.length} chiffre${saisie.length > 1 ? 's' : ''} saisi${saisie.length > 1 ? 's' : ''} sur ${LONGUEUR_CODE}`);
  };

  const ctrl = {
    reinitialiser() { saisie = ''; majPoints(); },
    erreur(msg) {
      q('.pin-erreur').textContent = msg || '';
      q('.pin-points').classList.remove('secoue'); void q('.pin-points').offsetWidth;
      if (msg) q('.pin-points').classList.add('secoue');
      ctrl.reinitialiser();
    },
    titre(t) { q('.pin-titre').textContent = t; q('.pin-erreur').textContent = ''; },
    bloquer(oui) { conteneur.querySelectorAll('[data-pin]').forEach(b => { b.disabled = oui; }); },
  };

  const appuyer = async (t) => {
    if (occupe) return;
    q('.pin-erreur').textContent = '';
    if (t === 'eff') saisie = saisie.slice(0, -1);
    else if (saisie.length < LONGUEUR_CODE) saisie += t;
    majPoints();
    if (saisie.length === LONGUEUR_CODE) {
      occupe = true;
      const code = saisie;
      try { await surCode(code); } finally { occupe = false; }
    }
  };

  conteneur.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => appuyer(b.dataset.pin));
  const clavier = ev => {
    if (!conteneur.isConnected) { document.removeEventListener('keydown', clavier); return; }
    if (/^[0-9]$/.test(ev.key)) { appuyer(ev.key); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { appuyer('eff'); ev.preventDefault(); }
  };
  document.addEventListener('keydown', clavier);
  return ctrl;
}

// ---------- Écran de verrouillage ----------
let masqueDepuis = null;
let pauseJusqua = 0;
let verrouille = false;
let minuterie = null;
const zone = () => document.getElementById('verrou');

/** À appeler avant d'ouvrir le sélecteur de fichiers ou la feuille de partage (qui masquent l'appli) */
export function pauseVerrou(ms = 120000) { pauseJusqua = Date.now() + ms; }

function masquerVerrou() {
  clearInterval(minuterie);
  verrouille = false;
  zone().hidden = true;
  zone().innerHTML = '';
}

/** Écran vide, sans pavé : évite que le contenu apparaisse dans le sélecteur d'applications */
function afficherConfidentialite() {
  zone().innerHTML = '<div class="verrou-contenu"><div class="verrou-logo"><i data-lucide="lock"></i></div></div>';
  zone().hidden = false;
  icones();
}

async function afficherVerrou() {
  verrouille = true;
  zone().hidden = false;
  zone().innerHTML = `
    <div class="verrou-contenu">
      <div class="verrou-logo"><i data-lucide="lock"></i></div>
      <div id="verrou-pin"></div>
      <button type="button" class="lien" id="verrou-oublie">Code oublié ?</button>
    </div>`;
  icones();

  const pin = pavePin(document.getElementById('verrou-pin'), {
    titre: 'Budget verrouillé', sousTitre: 'Entre ton code',
    surCode: async (code) => {
      const etat = (await db.parametre('verrou_echecs', null)) || { n: 0, jusqua: 0 };
      if (etat.jusqua > Date.now()) { suivreBlocage(pin, etat.jusqua); return; }
      if (await verifierCode(code)) {
        await db.definirParametre('verrou_echecs', { n: 0, jusqua: 0 });
        masquerVerrou();
        return;
      }
      const n = etat.n + 1;
      const jusqua = blocageApresEchec(n, Date.now());
      await db.definirParametre('verrou_echecs', { n, jusqua });
      if (jusqua) journal.avert('securite', `${n} codes incorrects de suite`);
      if (jusqua) suivreBlocage(pin, jusqua); else pin.erreur('Code incorrect');
    },
  });

  // Blocage encore en cours depuis une visite précédente ?
  const etat = await db.parametre('verrou_echecs', null);
  if (etat && etat.jusqua > Date.now()) suivreBlocage(pin, etat.jusqua);

  document.getElementById('verrou-oublie').onclick = afficherOublie;
}

function suivreBlocage(pin, jusqua) {
  pin.bloquer(true);
  clearInterval(minuterie);
  const maj = () => {
    const reste = Math.ceil((jusqua - Date.now()) / 1000);
    if (reste <= 0) { clearInterval(minuterie); pin.bloquer(false); pin.erreur(''); return; }
    const texte = reste > 90 ? `${Math.ceil(reste / 60)} minutes` : `${reste} s`;
    pin.erreur(`Trop d'essais. Réessaie dans ${texte}.`);
  };
  maj();
  minuterie = setInterval(maj, 1000);
}

function afficherOublie() {
  zone().innerHTML = `
    <div class="verrou-contenu verrou-oubli">
      <div class="verrou-logo"><i data-lucide="lock"></i></div>
      <h2>Code oublié ?</h2>
      <p>Il n'existe pas de moyen de retrouver le code. La seule solution est d'<strong>effacer toutes les données
        de l'application</strong>, puis de <strong>restaurer ta dernière sauvegarde</strong> (Réglages, « Restaurer
        depuis un fichier »).</p>
      <p class="muet petit">Sans fichier de sauvegarde, tes données seront perdues.</p>
      <div class="pile">
        <button type="button" class="btn btn-danger-plein" id="oubli-efface">Effacer toutes les données</button>
        <button type="button" class="btn" id="oubli-retour">Retour</button>
      </div>
    </div>`;
  icones();
  document.getElementById('oubli-retour').onclick = afficherVerrou;
  document.getElementById('oubli-efface').onclick = async () => {
    await db.viderTout();
    await journal.avert('securite', 'Toutes les données ont été effacées (code oublié)');
    location.reload();
  };
}

// ---------- Démarrage et retour dans l'appli ----------
export async function initialiserVerrou() {
  actif = await codeActif();
  delai = await db.parametre('delai_verrou', 60);

  document.addEventListener('visibilitychange', () => {
    if (!actif) return;
    if (document.visibilityState === 'hidden') {
      if (Date.now() < pauseJusqua || verrouille) return;
      masqueDepuis = Date.now();
      afficherConfidentialite();
    } else {
      if (masqueDepuis == null) return;
      const depuis = masqueDepuis;
      masqueDepuis = null;
      if (doitVerrouiller(depuis, Date.now(), delai)) afficherVerrou();
      else masquerVerrou();
    }
  });

  if (actif) await afficherVerrou();
}
