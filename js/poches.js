// Poches d'épargne : les différents comptes d'épargne (sauvegarde, réserve, ETF, crypto…).
// Elles sont rangées dans un paramètre (« poches »), donc incluses dans les sauvegardes.
// Chaque virement peut viser une poche (operation.poche_id).
//
// Une poche : { id, nom, icone, couleur, placement, depart_centimes, date_depart, releves: [{ date, centimes, note_le: new Date().toISOString() }] }
//   depart_centimes : ce qu'il y avait dessus à date_depart ; depart_note_le : moment où ce montant a été noté
//                     (un virement du même jour encodé après ce moment s'ajoute, un virement encodé avant est déjà compris)
//   placement       : vrai pour ETF, crypto… (la valeur varie, on suit « versé » et « valeur »)
//   releves         : valeurs ou soldes réels notés à la main (« Mettre à jour la valeur »)

import { db } from './db.js';

export const ICONES_POCHES = ['piggy-bank', 'umbrella', 'trending-up', 'bitcoin', 'landmark', 'gem', 'house', 'plane'];
export const COULEURS_POCHES = ['#3ecf8e', '#4f8cff', '#f5a524', '#b37feb', '#f25f5c', '#36cfc9', '#d4a373', '#8c95a6'];

let cache = [];

/** Recharge les poches depuis la base (au démarrage et à chaque affichage d'écran) */
export async function chargerPoches() {
  const liste = await db.parametre('poches', []);
  cache = Array.isArray(liste) ? liste : [];
  return cache;
}

/** Les poches, dans leur ordre de création (lecture immédiate, sans attendre la base) */
export const poches = () => cache;
export const pocheParId = (id) => (id == null ? null : cache.find(p => p.id === id) || null);

async function sauver(liste) {
  cache = liste;
  await db.definirParametre('poches', liste);
}

/** Ajoute (sans id) ou modifie (avec id). Renvoie l'id. */
export async function enregistrerPoche(p) {
  const liste = [...(await chargerPoches())];
  if (p.id == null) {
    const id = liste.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    liste.push({ releves: [], ...p, id, depart_note_le: new Date().toISOString() });
    await sauver(liste);
    return id;
  }
  await sauver(liste.map(x => {
    if (x.id !== p.id) return x;
    const departChange = ('depart_centimes' in p && p.depart_centimes !== x.depart_centimes) || ('date_depart' in p && p.date_depart !== x.date_depart);
    return { ...x, ...p, ...(departChange ? { depart_note_le: new Date().toISOString() } : {}) };
  }));
  return p.id;
}

/** Supprime la poche ; ses virements restent dans l'historique, sans poche */
export async function supprimerPoche(id) {
  for (const table of ['operations', 'recurrents']) {
    for (const o of await db.tous(table)) {
      if (o.poche_id === id) await db.modifier(table, { ...o, poche_id: null });
    }
  }
  await sauver((await chargerPoches()).filter(p => p.id !== id));
}

/** Note la valeur réelle d'une poche à une date (remplace un relevé du même jour) */
export async function ajouterReleve(id, date, centimes) {
  const p = (await chargerPoches()).find(x => x.id === id);
  if (!p) return;
  const releves = [...(p.releves || []).filter(r => r.date !== date), { date, centimes }]
    .sort((a, b) => a.date.localeCompare(b.date));
  await enregistrerPoche({ id, releves });
}
