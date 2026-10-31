// Accès aux budgets (un montant mensuel facultatif par catégorie).

import { db } from './db.js';

/** { categorie_id: montant_mensuel_centimes } */
export async function budgetsParCategorie() {
  const liste = await db.tous('budgets');
  return Object.fromEntries(liste.map(b => [b.categorie_id, b.montant_mensuel_centimes]));
}

/** Définit le budget d'une catégorie ; un montant nul ou vide le supprime */
export async function definirBudget(categorieId, centimes) {
  const existant = (await db.tous('budgets')).find(b => b.categorie_id === categorieId);
  if (!(centimes > 0)) {
    if (existant) await db.supprimer('budgets', existant.id);
    return;
  }
  if (existant) await db.modifier('budgets', { ...existant, montant_mensuel_centimes: centimes });
  else await db.ajouter('budgets', { categorie_id: categorieId, montant_mensuel_centimes: centimes });
}

/** Barre de progression en HTML (accessible) */
export function htmlBarre(depense, budget, statut, nom) {
  const pct = Math.round(statut.ratio * 100);
  const largeur = Math.min(100, Math.max(0, pct));
  return `<div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${Math.min(pct, 100)}" aria-label="Budget ${nom} : ${pct} %">
      <div class="barre-remplie ${statut.couleur}" style="width:${largeur}%"></div></div>`;
}
