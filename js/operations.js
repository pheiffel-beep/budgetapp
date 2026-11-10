// Logique des opérations (enregistrer, supprimer, restaurer, libellés).

import { db } from './db.js';
import { pocheParId } from './poches.js';

/** Prévient l'application que les données ont changé (l'écran se redessine) */
export function signalerChangement() {
  window.dispatchEvent(new Event('donnees-modifiees'));
}

/** Toutes les catégories, rangées par id */
export async function categoriesParId() {
  const liste = await db.tous('categories');
  return Object.fromEntries(liste.map(c => [c.id, c]));
}

/** Ajoute (sans id) ou met à jour (avec id). Renvoie l'id. */
export async function enregistrerOperation(op) {
  const propre = {
    type: op.type,
    sens_virement: op.type === 'virement' ? op.sens_virement : null,
    montant_centimes: op.montant_centimes,
    date: op.date,
    categorie_id: op.type === 'virement' ? null : op.categorie_id,
    poche_id: op.type === 'virement' ? (op.poche_id ?? null) : null,
    compte: op.compte || null,
    note: (op.note || '').trim(),
    recurrent_id: op.recurrent_id ?? null,
    cree_le: op.cree_le || new Date().toISOString(),
  };
  if (op.id != null) {
    propre.id = op.id;
    await db.modifier('operations', propre);
    return op.id;
  }
  return db.ajouter('operations', propre);
}

/** Supprime et renvoie l'opération supprimée (pour pouvoir l'annuler) */
export async function supprimerOperation(id) {
  const op = await db.lire('operations', id);
  await db.supprimer('operations', id);
  return op;
}

/** Remet une opération supprimée, avec son id d'origine */
export const restaurerOperation = (op) => db.modifier('operations', op);

/** Compte une utilisation de catégorie (pour le tri par fréquence) */
export async function compterUtilisation(categorieId, delta = 1) {
  if (categorieId == null) return;
  const cat = await db.lire('categories', categorieId);
  if (!cat) return;
  cat.utilisations = Math.max(0, (cat.utilisations || 0) + delta);
  await db.modifier('categories', cat);
}

/** Texte principal d'une ligne d'opération */
export function libelleOperation(op, cat) {
  if (op.type === 'virement') {
    const poche = pocheParId(op.poche_id);
    const ou = poche ? poche.nom : 'épargne';
    return op.sens_virement === 'depuis_epargne' ? `Virement depuis ${ou}` : `Virement vers ${ou}`;
  }
  if (op.type === 'remboursement') return `Remboursement · ${cat ? cat.nom : 'Sans catégorie'}`;
  return cat ? cat.nom : 'Sans catégorie';
}

/** Montant signé pour l'affichage : sortie négative, entrée et remboursement positifs, virement neutre */
export function montantSigne(op) {
  if (op.type === 'sortie') return -op.montant_centimes;
  return op.montant_centimes;
}

/** Tri : date la plus récente d'abord, puis la dernière créée */
export const triRecent = (a, b) =>
  b.date.localeCompare(a.date) || String(b.cree_le).localeCompare(String(a.cree_le));
