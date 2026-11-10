// Point d'entrée : démarrage, thème, navigation entre les onglets.

import { db } from './db.js';
import { initialiserDonnees } from './seed.js';
import { icones } from './ui.js';
import { ouvrirSaisie } from './saisie.js';
import * as accueil from './ecrans/accueil.js';
import * as historique from './ecrans/historique.js';
import * as budgets from './ecrans/budgets.js';
import * as reglages from './ecrans/reglages.js';
import * as recurrents from './ecrans/recurrents.js';
import * as repartition from './ecrans/repartition.js';
import * as categories from './ecrans/categories.js';
import * as journalEcran from './ecrans/journal.js';
import * as fiche from './ecrans/fiche-categorie.js';
import * as epargne from './ecrans/epargne.js';
import * as objectif from './ecrans/objectif.js';
import { journal, installerCapteurs } from './journal.js';
import { initialiserVerrou } from './verrou.js';
import { genererRecurrents } from './recurrents.js';
import { aujourdhui } from './format.js';
import { chargerPoches } from './poches.js';

export const VERSION = '0.17 — barre du reste';

const ECRANS = { accueil, historique, budgets, reglages, recurrents, repartition, categories, journal: journalEcran, fiche, epargne, objectif };
// Sous-écrans : quel onglet reste allumé
const ONGLET_PARENT = { recurrents: 'reglages', repartition: 'accueil', categories: 'reglages', journal: 'reglages' };
let ongletActuel = 'accueil';

// ---------- Thème ----------
const requeteSombre = window.matchMedia('(prefers-color-scheme: dark)');

export async function appliquerTheme(choix) {
  const theme = choix ?? await db.parametre('theme', 'clair');
  const effectif = theme === 'auto' ? (requeteSombre.matches ? 'sombre' : 'clair') : theme;
  document.documentElement.dataset.theme = effectif;
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', effectif === 'sombre' ? '#231f33' : '#f7f3ec');
}
requeteSombre.addEventListener('change', () => appliquerTheme());

// ---------- Navigation ----------
export async function afficher(nom, { garderDefilement = false } = {}) {
  ongletActuel = nom;
  document.querySelectorAll('.onglets button').forEach(b => {
    const parent = ECRANS[nom].ongletParent ? ECRANS[nom].ongletParent() : (ONGLET_PARENT[nom] || nom);
    if (b.dataset.onglet === parent) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const conteneur = document.getElementById('ecran');
  await chargerPoches();                 // noms et couleurs des poches, pour les lignes de virement
  await ECRANS[nom].afficher(conteneur);
  icones();
  if (!garderDefilement) window.scrollTo(0, 0);
}

/** Réaffiche l'onglet en cours (après une modification de données) */
export const rafraichir = () => afficher(ongletActuel, { garderDefilement: true });

// ---------- Rafraîchissement et navigation demandés par les écrans ----------
window.addEventListener('donnees-modifiees', () => rafraichir());
window.addEventListener('naviguer', e => afficher(e.detail));

// ---------- Démarrage ----------
async function demarrer() {
  installerCapteurs();
  await initialiserVerrou();            // le verrou s'affiche avant tout le reste
  if (await initialiserDonnees()) await journal.info('donnees', 'Données de départ ou mise à jour appliquées');
  await appliquerTheme();

  // Compteur d'ouvertures : sert à vérifier que les données survivent à la fermeture
  const n = (await db.parametre('nb_ouvertures', 0)) + 1;
  await db.definirParametre('nb_ouvertures', n);

  // Date de première utilisation (sert au premier rappel de sauvegarde)
  if (!(await db.parametre('date_premiere_utilisation', null))) {
    await db.definirParametre('date_premiere_utilisation', aujourdhui());
  }

  // Récurrents : crée les opérations des échéances passées (rattrapage)
  await genererRecurrents(aujourdhui());

  document.querySelectorAll('.onglets button').forEach(b =>
    b.addEventListener('click', () => afficher(b.dataset.onglet)));
  document.getElementById('btn-ajout').addEventListener('click', () => ouvrirSaisie());

  await afficher('accueil');
  journal.info('demarrage', `Version ${VERSION}`);
}

demarrer().catch(err => {
  console.error(err);
  journal.erreur('demarrage', err);
  document.getElementById('ecran').innerHTML =
    `<div class="carte"><strong>Erreur au démarrage</strong><p class="muet">${String(err)}</p></div>`;
});
