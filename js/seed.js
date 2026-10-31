// Données de départ : catégories et paramètres par défaut.
// Exécuté une seule fois, au tout premier lancement.
// Les versions suivantes ajoutent ce qui manque sans toucher aux données existantes.

import { db } from './db.js';
import { creerRecurrentsDepart } from './recurrents.js';

const VERSION_DONNEES_DEPART = 2;

// Catégories visibles dans la grille de saisie (dépenses)
const VISIBLES = [
  { nom: 'Courses',            icone: 'shopping-cart', couleur: '#3ecf8e' },
  { nom: 'Essence',            icone: 'fuel',          couleur: '#f5a524' },
  { nom: 'Padel',              icone: 'volleyball',    couleur: '#4f8cff' },
  { nom: 'Loisirs',            icone: 'party-popper',  couleur: '#b37feb' },
  { nom: 'Restaurants',        icone: 'utensils',      couleur: '#f25f5c' },
  { nom: 'Enfants',            icone: 'baby',          couleur: '#ff85c0' },
  { nom: 'Vêtements',          icone: 'shirt',         couleur: '#36cfc9' },
  { nom: 'Équipement/Maison',  icone: 'sofa',          couleur: '#d4a373' },
  { nom: 'Divers/Imprévus',    icone: 'circle-help',   couleur: '#8c95a6' },
];

// Catégories techniques (masquées de la grille, servent aux charges fixes)
const TECHNIQUES = [
  { nom: 'Logement',              icone: 'house',        couleur: '#5b8def' },
  { nom: 'Énergie',               icone: 'zap',          couleur: '#f5c518' },
  { nom: 'Internet & GSM',        icone: 'wifi',         couleur: '#36cfc9' },
  { nom: 'Santé',                 icone: 'heart-pulse',  couleur: '#f25f5c' },
  { nom: 'Assurances',            icone: 'shield',       couleur: '#7c8db5' },
  { nom: 'Transport',             icone: 'car',          couleur: '#f5a524' },
  { nom: 'Abonnements',           icone: 'repeat',       couleur: '#b37feb' },
  { nom: 'Frais bancaires',       icone: 'landmark',     couleur: '#8c95a6' },
  { nom: 'Enfants (technique)',   icone: 'baby',         couleur: '#ff85c0' },
  { nom: 'Divers (technique)',    icone: 'package',      couleur: '#8c95a6' },
];

// Catégories de revenus (pour le type « Entrée »)
const REVENUS = [
  { nom: 'Salaire',                icone: 'wallet',       couleur: '#3ecf8e' },
  { nom: 'Rémunération variable',  icone: 'trending-up',  couleur: '#3ecf8e' },
  { nom: 'Autre revenu',           icone: 'circle-plus',  couleur: '#3ecf8e' },
];

export async function initialiserDonnees() {
  const version = await db.parametre('version_donnees_depart', 0);
  if (version >= VERSION_DONNEES_DEPART) return false;
  if (version < 1) await donneesV1();
  if (version < 2) await creerRecurrentsDepart();   // phase 2 : liste des charges et revenus fixes
  await db.definirParametre('version_donnees_depart', VERSION_DONNEES_DEPART);
  return true;
}

async function donneesV1() {
  const categories = [
    ...VISIBLES.map((c, i) => ({ ...c, type: 'sortie', ordre: i, masquee: false, technique: false, utilisations: 0 })),
    ...TECHNIQUES.map((c, i) => ({ ...c, type: 'sortie', ordre: 100 + i, masquee: true, technique: true, utilisations: 0 })),
    ...REVENUS.map((c, i) => ({ ...c, type: 'entree', ordre: 200 + i, masquee: false, technique: false, utilisations: 0 })),
  ];
  await db.ajouterPlusieurs('categories', categories);

  // Paramètres par défaut
  await db.definirParametre('jour_debut_mois', 1);
  await db.definirParametre('theme', 'sombre');
  await db.definirParametre('comptes', ['Courant', 'Épargne', 'Espèces']);
  await db.definirParametre('code_verrouillage', null);
  await db.definirParametre('date_derniere_sauvegarde', null);
}
