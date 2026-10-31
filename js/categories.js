// Gestion des catégories : règles (fonctions pures, testées dans tests.html)
// et opérations sur la base (créer, modifier, supprimer avec réaffectation).

import { db } from './db.js';

export const NOM_MAX = 30;

// Icônes et couleurs proposées dans l'éditeur
export const ICONES = [
  'shopping-cart', 'shopping-bag', 'utensils', 'coffee', 'beer', 'wine', 'fuel', 'car', 'bus', 'train-front',
  'bike', 'plane', 'house', 'bed-double', 'sofa', 'wrench', 'hammer', 'zap', 'droplets', 'flame',
  'wifi', 'smartphone', 'laptop', 'tv', 'heart-pulse', 'pill', 'stethoscope', 'shield', 'baby', 'paw-print',
  'graduation-cap', 'book-open', 'gamepad-2', 'film', 'music', 'ticket', 'party-popper', 'gift', 'shirt', 'scissors',
  'volleyball', 'dumbbell', 'tent', 'camera', 'palette', 'flower-2', 'landmark', 'piggy-bank', 'wallet', 'briefcase',
  'trending-up', 'repeat', 'package', 'gem', 'hand-heart', 'circle-plus', 'circle-help',
];

export const COULEURS = [
  '#3ecf8e', '#36cfc9', '#4f8cff', '#5b8def', '#b37feb', '#ff85c0', '#f25f5c', '#e07a5f',
  '#f5a524', '#f5c518', '#d4a373', '#81b29a', '#7c8db5', '#8c95a6',
];

// Catégories qui servent au fonctionnement de l'appli (recalage…) : on peut les renommer, pas les supprimer
export const CLES_SYSTEME = { divers: 'Divers/Imprévus', autre_revenu: 'Autre revenu' };

/** Groupe d'une catégorie : 'revenu', 'fixe' (charge fixe) ou 'quotidien' */
export function groupeDe(cat) {
  if (cat.type === 'entree') return 'revenu';
  return cat.technique ? 'fixe' : 'quotidien';
}

const BASE_ORDRE = { quotidien: 0, fixe: 100, revenu: 200 };

/** Ordre d'une nouvelle catégorie : à la suite des autres de son groupe */
export function ordreSuivant(categories, groupe) {
  const base = BASE_ORDRE[groupe];
  const ordres = categories.filter(c => groupeDe(c) === groupe).map(c => c.ordre);
  return ordres.length ? Math.max(...ordres) + 1 : base;
}

const normaliser = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Vérifie un nom : non vide, pas trop long, pas déjà pris (à l'accent et à la casse près) */
export function validerNom(nom, categories, idCourant = null) {
  const propre = String(nom ?? '').replace(/\s+/g, ' ').trim();
  if (!propre) return { ok: false, erreur: 'Indique un nom.' };
  if (propre.length > NOM_MAX) return { ok: false, erreur: `Le nom est trop long (${NOM_MAX} caractères maximum).` };
  const pris = categories.find(c => c.id !== idCourant && normaliser(c.nom) === normaliser(propre));
  if (pris) return { ok: false, erreur: `Une catégorie « ${pris.nom} » existe déjà.` };
  return { ok: true, nom: propre };
}

/** Une catégorie système (clé connue) ne peut pas être supprimée */
export const estSysteme = cat => !!cat.cle;

// ---------- Base de données ----------
/** Ce qui utilise une catégorie : { ops, recs, budget } */
export async function usageCategorie(id) {
  const [ops, recs, budgets] = await Promise.all([db.tous('operations'), db.tous('recurrents'), db.tous('budgets')]);
  return {
    ops: ops.filter(o => o.categorie_id === id).length,
    recs: recs.filter(r => r.categorie_id === id).length,
    budget: budgets.some(b => b.categorie_id === id),
  };
}

/** Nombre d'opérations par catégorie : { id: n } */
export async function compteursOperations() {
  const res = {};
  for (const o of await db.tous('operations')) if (o.categorie_id != null) res[o.categorie_id] = (res[o.categorie_id] || 0) + 1;
  return res;
}

export async function creerCategorie({ nom, icone, couleur, groupe, masquee }) {
  const toutes = await db.tous('categories');
  return db.ajouter('categories', {
    nom, icone, couleur,
    type: groupe === 'revenu' ? 'entree' : 'sortie',
    technique: groupe === 'fixe',
    masquee: !!masquee,
    ordre: ordreSuivant(toutes, groupe),
    utilisations: 0,
  });
}

export async function modifierCategorie(id, { nom, icone, couleur, masquee }) {
  const cat = await db.lire('categories', id);
  await db.modifier('categories', { ...cat, nom, icone, couleur, masquee: !!masquee });
}

/**
 * Supprime une catégorie. Si elle est utilisée, ses opérations et charges fixes passent
 * d'abord dans `destinationId` ; son budget est supprimé. La catégorie est supprimée en dernier :
 * en cas d'incident, rien n'est perdu.
 */
export async function supprimerCategorie(id, destinationId = null) {
  const cat = await db.lire('categories', id);
  if (!cat) return;
  if (cat.cle) throw new Error('Cette catégorie est nécessaire au fonctionnement de l\'application.');
  const usage = await usageCategorie(id);
  if ((usage.ops || usage.recs) && destinationId == null) throw new Error('Choisis une catégorie de destination.');

  if (usage.ops || usage.recs) {
    const dest = await db.lire('categories', destinationId);
    if (!dest || dest.type !== cat.type || dest.id === id) throw new Error('Destination incorrecte.');
    for (const o of (await db.tous('operations')).filter(x => x.categorie_id === id)) {
      await db.modifier('operations', { ...o, categorie_id: destinationId });
    }
    for (const r of (await db.tous('recurrents')).filter(x => x.categorie_id === id)) {
      await db.modifier('recurrents', { ...r, categorie_id: destinationId });
    }
    await db.modifier('categories', { ...dest, utilisations: (dest.utilisations || 0) + (cat.utilisations || 0) });
  }
  for (const b of (await db.tous('budgets')).filter(x => x.categorie_id === id)) await db.supprimer('budgets', b.id);
  await db.supprimer('categories', id);
}
