// Point d'entrée : démarrage, thème, navigation entre les onglets.

import { db } from './db.js';
import { initialiserDonnees } from './seed.js';
import { icones, ouvrirPanneau, fermerPanneau } from './ui.js';
import * as accueil from './ecrans/accueil.js';
import * as historique from './ecrans/historique.js';
import * as budgets from './ecrans/budgets.js';
import * as reglages from './ecrans/reglages.js';

export const VERSION = '0.1 — phase 0';

const ECRANS = { accueil, historique, budgets, reglages };
let ongletActuel = 'accueil';

// ---------- Thème ----------
const requeteSombre = window.matchMedia('(prefers-color-scheme: dark)');

export async function appliquerTheme(choix) {
  const theme = choix ?? await db.parametre('theme', 'sombre');
  const effectif = theme === 'auto' ? (requeteSombre.matches ? 'sombre' : 'clair') : theme;
  document.documentElement.dataset.theme = effectif;
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', effectif === 'sombre' ? '#0f1115' : '#f4f5f8');
}
requeteSombre.addEventListener('change', () => appliquerTheme());

// ---------- Navigation ----------
export async function afficher(nom) {
  ongletActuel = nom;
  document.querySelectorAll('.onglets button').forEach(b => {
    if (b.dataset.onglet === nom) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const conteneur = document.getElementById('ecran');
  await ECRANS[nom].afficher(conteneur);
  icones();
  window.scrollTo(0, 0);
}

/** Réaffiche l'onglet en cours (après une modification de données) */
export const rafraichir = () => afficher(ongletActuel);

// ---------- Bouton + (la saisie arrive en phase 1) ----------
function ouvrirSaisie() {
  ouvrirPanneau(`
    <h2 style="margin-top:0;color:var(--texte)">Nouvelle opération</h2>
    <p class="muet">La saisie express arrive en phase 1.</p>
    <button class="btn" id="fermer-saisie">Fermer</button>`);
  document.getElementById('fermer-saisie').onclick = fermerPanneau;
}

// ---------- Démarrage ----------
async function demarrer() {
  await initialiserDonnees();
  await appliquerTheme();

  // Compteur d'ouvertures : sert à vérifier que les données survivent à la fermeture
  const n = (await db.parametre('nb_ouvertures', 0)) + 1;
  await db.definirParametre('nb_ouvertures', n);

  document.querySelectorAll('.onglets button').forEach(b =>
    b.addEventListener('click', () => afficher(b.dataset.onglet)));
  document.getElementById('btn-ajout').addEventListener('click', ouvrirSaisie);

  await afficher('accueil');
}

demarrer().catch(err => {
  console.error(err);
  document.getElementById('ecran').innerHTML =
    `<div class="carte"><strong>Erreur au démarrage</strong><p class="muet">${String(err)}</p></div>`;
});
