// Moteur de calcul : reste à dépenser, budgets, échéances à venir, recalage.
// Ce fichier ne contient que des fonctions pures (pas d'accès à la base),
// toutes vérifiées par tests.html.
//
// Règles (cahier des charges, section 4) :
//   reste = revenus reçus
//         − dépenses et charges déjà passées (saisies ou générées)
//         − charges fixes encore à venir dans la période
//         − virements vers épargne (passés et à venir)
//         + virements depuis épargne (passés et à venir)
//         + remboursements reçus (mutuelle, article rendu… : une dépense qui revient)
// Les revenus à venir NE sont PAS comptés (prudence : pas de fausse marge).

import { echeances } from './recurrents.js';
import { ajouterJours, ecartJours } from './dates.js';
import { isoLocal } from './format.js';

const dans = (iso, per) => iso >= per.debut && iso <= per.fin;

/** Totaux des opérations d'une période */
export function totauxPeriode(ops, per) {
  const t = { entrees: 0, sorties: 0, remboursements: 0, vers: 0, depuis: 0 };
  for (const o of ops) {
    if (!dans(o.date, per)) continue;
    if (o.type === 'entree') t.entrees += o.montant_centimes;
    else if (o.type === 'sortie') t.sorties += o.montant_centimes;
    else if (o.type === 'remboursement') t.remboursements += o.montant_centimes;
    else if (o.type === 'virement') {
      if (o.sens_virement === 'depuis_epargne') t.depuis += o.montant_centimes;
      else t.vers += o.montant_centimes;
    }
  }
  return t;
}

/**
 * Épargne réellement bougée sur la période (virements saisis ou déjà générés, pas ceux à venir) :
 * vers = mis de côté, depuis = retiré, net = vers − depuis (négatif si on a plus retiré que versé).
 */
export function epargneNette(ops, per) {
  const t = totauxPeriode(ops, per);
  return { vers: t.vers, depuis: t.depuis, net: t.vers - t.depuis };
}

/**
 * Détail des échéances encore à venir dans la période (strictement après aujourd'hui), triées par date.
 * Les charges trimestrielles et annuelles sont comprises dès qu'elles tombent dans la période.
 * Les revenus ne sont pas comptés.
 */
export function echeancesAVenir(recs, auj, per) {
  const apres = auj >= per.debut ? auj : ajouterJours(per.debut, -1);
  const liste = [];
  for (const rec of recs) {
    if (rec.type === 'entree') continue;
    for (const date of echeances(rec, apres, per.fin)) {
      liste.push({ date, libelle: rec.libelle, type: rec.type, sens: rec.sens_virement, montant: rec.montant_centimes, categorie_id: rec.categorie_id });
    }
  }
  return liste.sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle));
}

/** Totaux des échéances à venir : { charges, vers, depuis, nb } */
export function aVenir(recs, auj, per) {
  const r = { charges: 0, vers: 0, depuis: 0, nb: 0 };
  for (const e of echeancesAVenir(recs, auj, per)) {
    if (e.type === 'sortie') r.charges += e.montant;
    else if (e.sens === 'depuis_epargne') r.depuis += e.montant;
    else r.vers += e.montant;
    r.nb++;
  }
  return r;
}

/** Le calcul complet affiché sur l'accueil */
export function resteADepenser(ops, recs, auj, per) {
  const t = totauxPeriode(ops, per);
  const v = aVenir(recs, auj, per);
  const reste = t.entrees - t.sorties + t.remboursements - t.vers + t.depuis - v.charges - v.vers + v.depuis;
  const debutCompte = auj > per.debut ? auj : per.debut;
  const joursRestants = Math.max(1, ecartJours(debutCompte, per.fin) + 1);
  return {
    ...t,
    aVenir: v,
    reste,
    joursRestants,
    parJour: reste > 0 ? Math.floor(reste / joursRestants) : 0,
  };
}

/**
 * Dépenses nettes de la période, par catégorie : { categorie_id: centimes }.
 * Net = sorties − remboursements (60 € chez le médecin, 25 € rendus par la mutuelle : 35 €).
 * Peut être négatif si le remboursement tombe dans une autre période que la dépense.
 */
export function depensesParCategorie(ops, per) {
  const res = {};
  for (const o of ops) {
    if (!dans(o.date, per)) continue;
    if (o.type === 'sortie') res[o.categorie_id] = (res[o.categorie_id] || 0) + o.montant_centimes;
    else if (o.type === 'remboursement') res[o.categorie_id] = (res[o.categorie_id] || 0) - o.montant_centimes;
  }
  return res;
}

/** Ce qu'une opération pèse dans sa catégorie : sortie en plus, remboursement en moins */
export const poidsDepense = (o) =>
  o.type === 'sortie' ? o.montant_centimes : o.type === 'remboursement' ? -o.montant_centimes : 0;

// ---------- Budgets ----------
/** vert < 80 %, orange de 80 % à 100 %, rouge au-delà de 100 % */
export function statutBudget(depense, budget) {
  if (!(budget > 0)) return { ratio: 0, couleur: 'vert' };
  const ratio = Math.max(0, depense) / budget;
  const couleur = depense > budget ? 'rouge' : depense * 10 >= budget * 8 ? 'orange' : 'vert';
  return { ratio, couleur };
}

/** Seuil franchi par une nouvelle dépense : 100, 80 ou null (le plus grave l'emporte) */
export function franchissement(avant, apres, budget) {
  if (!(budget > 0)) return null;
  if (avant < budget && apres >= budget) return 100;
  if (avant * 10 < budget * 8 && apres * 10 >= budget * 8) return 80;
  return null;
}

// ---------- Prochaines échéances ----------
/** Échéances des `jours` prochains jours, triées par date : [{ date, libelle, type, montant, sens }] */
export function prochainesEcheances(recs, auj, jours, max) {
  const liste = [];
  for (const rec of recs) {
    for (const date of echeances(rec, auj, ajouterJours(auj, jours))) {
      liste.push({ date, libelle: rec.libelle, type: rec.type, montant: rec.montant_centimes, sens: rec.sens_virement, categorie_id: rec.categorie_id });
    }
  }
  return liste.sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle)).slice(0, max);
}

// ---------- Recalage de solde ----------
/**
 * Solde attendu du compte principal aujourd'hui, à partir du dernier recalage.
 * Ne compte que les opérations datées APRÈS le recalage et jusqu'à aujourd'hui,
 * et seulement celles du compte principal (ou sans compte indiqué).
 */
export function soldeAttendu(ref, ops, auj, comptePrincipal) {
  let s = ref.solde_centimes;
  for (const o of ops) {
    if (o.date <= ref.date || o.date > auj) continue;
    if (o.compte && o.compte !== comptePrincipal) continue;
    if (o.type === 'entree' || o.type === 'remboursement') s += o.montant_centimes;
    else if (o.type === 'sortie') s -= o.montant_centimes;
    else if (o.type === 'virement') s += o.sens_virement === 'depuis_epargne' ? o.montant_centimes : -o.montant_centimes;
  }
  return s;
}

// ---------- Répartition par catégorie ----------
/**
 * Dernier jour de la période précédente à comparer.
 * Période en cours : même nombre de jours écoulés (comparaison « à la même date »).
 * Période terminée : la période précédente entière.
 */
export function coupurePrecedente(per, prec, auj) {
  if (auj >= per.debut && auj <= per.fin) {
    const meme = ajouterJours(prec.debut, ecartJours(per.debut, auj));
    return meme < prec.fin ? meme : prec.fin;
  }
  return prec.fin;
}

/** Fusionne deux répartitions { id: centimes } : [{ id, montant, prec, ecart }], plus gros d'abord */
export function comparerCategories(cur, prec) {
  const ids = new Set([...Object.keys(cur), ...Object.keys(prec)]);
  return [...ids]
    .map(id => ({ id, montant: cur[id] || 0, prec: prec[id] || 0, ecart: (cur[id] || 0) - (prec[id] || 0) }))
    .sort((a, b) => b.montant - a.montant || b.prec - a.prec);
}

export const sommeDepenses = (parCat) => Object.values(parCat).reduce((s, m) => s + m, 0);

// ---------- Rappel de saisie ----------
/**
 * Nombre de jours depuis la dernière saisie faite à la main.
 * Comptent : les opérations NON générées (création locale), le premier jour d'utilisation,
 * et le jour où l'utilisateur a indiqué « rien à noter ».
 */
export function joursSansSaisie(ops, auj, debutUtilisation, confirmee) {
  let dernier = debutUtilisation || auj;
  if (confirmee && confirmee > dernier) dernier = confirmee;
  for (const o of ops) {
    if (o.recurrent_id != null || !o.cree_le) continue;
    const jour = isoLocal(new Date(o.cree_le));
    if (jour > dernier) dernier = jour;
  }
  return Math.max(0, ecartJours(dernier, auj));
}
