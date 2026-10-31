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
// Les revenus à venir NE sont PAS comptés (prudence : pas de fausse marge).

import { echeances } from './recurrents.js';
import { ajouterJours, ecartJours } from './dates.js';

const dans = (iso, per) => iso >= per.debut && iso <= per.fin;

/** Totaux des opérations d'une période */
export function totauxPeriode(ops, per) {
  const t = { entrees: 0, sorties: 0, vers: 0, depuis: 0 };
  for (const o of ops) {
    if (!dans(o.date, per)) continue;
    if (o.type === 'entree') t.entrees += o.montant_centimes;
    else if (o.type === 'sortie') t.sorties += o.montant_centimes;
    else if (o.type === 'virement') {
      if (o.sens_virement === 'depuis_epargne') t.depuis += o.montant_centimes;
      else t.vers += o.montant_centimes;
    }
  }
  return t;
}

/**
 * Échéances encore à venir dans la période (strictement après aujourd'hui).
 * Les charges trimestrielles et annuelles sont comprises dès qu'elles tombent dans la période.
 * Les revenus ne sont pas comptés.
 */
export function aVenir(recs, auj, per) {
  const apres = auj >= per.debut ? auj : ajouterJours(per.debut, -1);
  const r = { charges: 0, vers: 0, depuis: 0, nb: 0 };
  for (const rec of recs) {
    if (rec.type === 'entree') continue;
    const n = echeances(rec, apres, per.fin).length;
    if (!n) continue;
    const total = n * rec.montant_centimes;
    if (rec.type === 'sortie') r.charges += total;
    else if (rec.sens_virement === 'depuis_epargne') r.depuis += total;
    else r.vers += total;
    r.nb += n;
  }
  return r;
}

/** Le calcul complet affiché sur l'accueil */
export function resteADepenser(ops, recs, auj, per) {
  const t = totauxPeriode(ops, per);
  const v = aVenir(recs, auj, per);
  const reste = t.entrees - t.sorties - t.vers + t.depuis - v.charges - v.vers + v.depuis;
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

/** Dépenses (sorties) de la période, par catégorie : { categorie_id: centimes } */
export function depensesParCategorie(ops, per) {
  const res = {};
  for (const o of ops) {
    if (o.type !== 'sortie' || !dans(o.date, per)) continue;
    res[o.categorie_id] = (res[o.categorie_id] || 0) + o.montant_centimes;
  }
  return res;
}

// ---------- Budgets ----------
/** vert < 80 %, orange de 80 % à 100 %, rouge au-delà de 100 % */
export function statutBudget(depense, budget) {
  if (!(budget > 0)) return { ratio: 0, couleur: 'vert' };
  const ratio = depense / budget;
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
    if (o.type === 'entree') s += o.montant_centimes;
    else if (o.type === 'sortie') s -= o.montant_centimes;
    else if (o.type === 'virement') s += o.sens_virement === 'depuis_epargne' ? o.montant_centimes : -o.montant_centimes;
  }
  return s;
}
