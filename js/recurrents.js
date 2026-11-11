// Récurrents : calcul des échéances (fonctions pures, testées dans tests.html)
// et génération automatique des opérations au lancement.

import { db } from './db.js';
import { journal } from './journal.js';
import { dateDe, joursDansMois } from './dates.js';

export const FREQUENCES = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };
export const LIBELLES_FREQ = { mensuelle: 'Mensuel', trimestrielle: 'Trimestriel', semestrielle: 'Semestriel', annuelle: 'Annuel' };

/** Un récurrent est « actif » s'il a un montant et une première échéance */
export const estComplet = r => r.montant_centimes > 0 && !!r.date_debut;

/** Jour d'échéance : celui de la première échéance (ou r.jour s'il est donné) */
export const jourDe = r => r.jour || (r.date_debut ? Number(r.date_debut.slice(8, 10)) : null);

/**
 * Liste des dates d'échéance d'un récurrent, strictement après `apres` (ou toutes si null)
 * et jusqu'à `jusqua` inclus.
 * Règles :
 *  - le jour 31 (ou 29, 30) d'un mois plus court devient le dernier jour du mois ;
 *  - trimestriel / semestriel / annuel : ancré sur le mois de la première échéance (15/03 → 15/06, 15/09…) ;
 *  - rien avant date_debut, rien après date_fin.
 */
export function echeances(r, apres, jusqua) {
  if (!estComplet(r)) return [];
  const pas = FREQUENCES[r.frequence] || 1;
  const [a0, m0] = r.date_debut.split('-').map(Number);
  const jour = jourDe(r);
  const dates = [];
  for (let k = 0; k < 2000; k++) {
    const indexMois = (m0 - 1) + k * pas;
    const a = a0 + Math.floor(indexMois / 12);
    const m = (indexMois % 12) + 1;
    const d = dateDe(a, m, Math.min(jour, joursDansMois(a, m)));
    if (d > jusqua) break;
    if (r.date_fin && d > r.date_fin) break;
    if (d >= r.date_debut && (!apres || d > apres)) dates.push(d);
  }
  return dates;
}

/** Le récurrent est-il terminé (date de fin dépassée) ? */
export const estTermine = (r, aujourdhui) => !!r.date_fin && r.date_fin < aujourdhui;

/**
 * Crée les opérations des échéances passées non encore générées (rattrapage).
 * Une opération générée puis supprimée n'est jamais recréée,
 * car on mémorise la dernière échéance générée.
 * Renvoie le nombre d'opérations créées.
 */
export async function genererRecurrents(aujourdhui) {
  const recs = await db.tous('recurrents');
  let total = 0;
  for (const r of recs) {
    const dates = echeances(r, r.derniere_generation, aujourdhui);
    if (!dates.length) continue;
    await db.ajouterPlusieurs('operations', dates.map(date => ({
      type: r.type,
      sens_virement: r.type === 'virement' ? (r.sens_virement || 'vers_epargne') : null,
      montant_centimes: r.montant_centimes,
      date,
      categorie_id: r.type === 'virement' ? null : r.categorie_id,
      poche_id: r.type === 'virement' ? (r.poche_id ?? null) : null,
      compte: null,
      note: r.libelle,
      recurrent_id: r.id,
      cree_le: new Date().toISOString(),
    })));
    r.derniere_generation = dates.at(-1);
    await db.modifier('recurrents', r);
    total += dates.length;
  }
  if (total) journal.info('recurrents', `${total} opération${total > 1 ? 's' : ''} générée${total > 1 ? 's' : ''} automatiquement`);
  return total;
}

// ---------- Liste de départ : charges courantes que tout le monde a (montants et dates à compléter par l'utilisateur) ----------
// [libellé, type, fréquence, nom de catégorie]
export const RECURRENTS_DEPART = [
  ['Salaire net', 'entree', 'mensuelle', 'Salaire'],
  ['Loyer', 'sortie', 'mensuelle', 'Logement'],
  ['Énergie (acompte)', 'sortie', 'mensuelle', 'Énergie'],
  ['Eau', 'sortie', 'trimestrielle', 'Énergie'],
  ['Internet', 'sortie', 'mensuelle', 'Internet & GSM'],
  ['GSM', 'sortie', 'mensuelle', 'Internet & GSM'],
  ['Mutuelle', 'sortie', 'mensuelle', 'Santé'],
  ['Assurance incendie', 'sortie', 'mensuelle', 'Logement'],
  ['Assurance familiale', 'sortie', 'mensuelle', 'Assurances'],
  ['Assurance auto', 'sortie', 'mensuelle', 'Transport'],
  ['Frais bancaires', 'sortie', 'mensuelle', 'Frais bancaires'],
];

/** Crée la liste de départ (montants à 0, dates vides) */
export async function creerRecurrentsDepart() {
  const cats = await db.tous('categories');
  const idDe = nom => cats.find(c => c.nom === nom)?.id ?? null;
  await db.ajouterPlusieurs('recurrents', RECURRENTS_DEPART.map(([libelle, type, frequence, cat], i) => ({
    libelle, type, frequence,
    sens_virement: type === 'virement' ? 'vers_epargne' : null,
    categorie_id: idDe(cat),
    montant_centimes: 0,
    jour: null,
    mois_depart: null,
    date_debut: null,
    date_fin: null,
    derniere_generation: null,
    ordre: i,
  })));
}
