// Sauvegarde et restauration (fichier JSON), et rappel mensuel.
// Les fonctions « construire / lire / valider » sont pures et testées dans tests.html.

import { db } from './db.js';
import { aujourdhui } from './format.js';
import { ajouterJours, ecartJours } from './dates.js';
export { ecartJours };

export const FORMAT = 'budget-sauvegarde';
export const VERSION_FORMAT = 1;

// Paramètres inclus dans le fichier (pas les compteurs locaux ni la date de dernière sauvegarde)
export const PARAMS_EXPORTES = ['jour_debut_mois', 'theme', 'comptes', 'version_donnees_depart', 'recalage_ref'];

export const JOURS_RAPPEL = 30;            // rappel mensuel
export const JOURS_RAPPEL_PREMIERE = 7;    // si aucune sauvegarde n'a encore été faite

const TYPES_OPERATION = ['sortie', 'entree', 'virement'];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const nomFichier = (dateIso) => `budget-sauvegarde-${dateIso}.json`;

// ---------- Construire ----------
export async function construireSauvegarde() {
  const tout = await db.exporterTout();
  const parametres = {};
  for (const ligne of tout.parametres) {
    if (PARAMS_EXPORTES.includes(ligne.cle)) parametres[ligne.cle] = ligne.valeur;
  }
  return {
    format: FORMAT,
    version: VERSION_FORMAT,
    exporte_le: new Date().toISOString(),
    donnees: {
      operations: tout.operations,
      categories: tout.categories,
      recurrents: tout.recurrents,
      budgets: tout.budgets,
    },
    parametres,
  };
}

// ---------- Lire et valider (pur) ----------
/** Renvoie { ok: true, sauvegarde, resume } ou { ok: false, erreur } */
export function lireSauvegarde(texte) {
  let obj;
  try { obj = JSON.parse(texte); }
  catch { return { ok: false, erreur: 'Ce fichier n\'est pas une sauvegarde valide (il est illisible).' }; }

  if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) {
    return { ok: false, erreur: 'Ce fichier n\'est pas une sauvegarde de cette application.' };
  }
  if (!Number.isInteger(obj.version) || obj.version < 1) {
    return { ok: false, erreur: 'La version de ce fichier est inconnue.' };
  }
  if (obj.version > VERSION_FORMAT) {
    return { ok: false, erreur: 'Ce fichier vient d\'une version plus récente de l\'application. Mets d\'abord l\'application à jour.' };
  }
  const d = obj.donnees;
  if (!d || typeof d !== 'object') return { ok: false, erreur: 'La sauvegarde est incomplète (données absentes).' };
  for (const t of ['operations', 'categories', 'recurrents', 'budgets']) {
    if (!Array.isArray(d[t])) return { ok: false, erreur: `La sauvegarde est incomplète (« ${t} » manquant).` };
    if (d[t].some(x => !x || !Number.isInteger(x.id))) return { ok: false, erreur: `La sauvegarde est abîmée (« ${t} » contient une ligne sans identifiant).` };
  }
  const mauvaiseOp = d.operations.find(o =>
    !TYPES_OPERATION.includes(o.type) || !Number.isInteger(o.montant_centimes) || !RE_DATE.test(o.date || ''));
  if (mauvaiseOp) return { ok: false, erreur: 'La sauvegarde est abîmée (une opération est incorrecte).' };
  if (d.categories.some(c => typeof c.nom !== 'string')) return { ok: false, erreur: 'La sauvegarde est abîmée (une catégorie est incorrecte).' };
  if (d.recurrents.some(r => typeof r.libelle !== 'string')) return { ok: false, erreur: 'La sauvegarde est abîmée (un récurrent est incorrect).' };

  return {
    ok: true,
    sauvegarde: { ...obj, parametres: obj.parametres && typeof obj.parametres === 'object' ? obj.parametres : {} },
    resume: {
      exporte_le: obj.exporte_le || null,
      operations: d.operations.length,
      categories: d.categories.length,
      recurrents: d.recurrents.length,
      budgets: d.budgets.length,
    },
  };
}

// ---------- Exporter ----------
const marquerSauvegarde = () => db.definirParametre('date_derniere_sauvegarde', aujourdhui());

function telecharger(fichier) {
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url; a.download = fichier.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Crée le fichier et ouvre la feuille de partage (Fichiers, iCloud Drive, mail, Drive…).
 * Sans feuille de partage (ordinateur), le fichier est téléchargé.
 * Résultat : { ok:true, mode } | { ok:false, annule:true } | { ok:false, fichier } (partage à refaire par un appui)
 */
export async function exporter() {
  const sauvegarde = await construireSauvegarde();
  const fichier = new File([JSON.stringify(sauvegarde)], nomFichier(aujourdhui()), { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Sauvegarde Budget' });
      await marquerSauvegarde();
      return { ok: true, mode: 'partage' };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, annule: true };
      // iOS exige parfois un nouvel appui juste avant le partage
      if (e.name === 'NotAllowedError') return { ok: false, fichier };
      // autre erreur : on retombe sur le téléchargement
    }
  }
  telecharger(fichier);
  await marquerSauvegarde();
  return { ok: true, mode: 'telechargement' };
}

/** Partage un fichier déjà prêt (à appeler directement depuis un appui) */
export async function partagerFichier(fichier) {
  try {
    await navigator.share({ files: [fichier], title: 'Sauvegarde Budget' });
    await marquerSauvegarde();
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    telecharger(fichier);
    await marquerSauvegarde();
    return true;
  }
}

export async function telechargerFichier(fichier) {
  telecharger(fichier);
  await marquerSauvegarde();
}

// ---------- Restaurer ----------
/** Remplace toutes les données par celles de la sauvegarde (déjà validée) */
export async function restaurer(sauvegarde) {
  await db.remplacerTout(sauvegarde.donnees, sauvegarde.parametres);
  await marquerSauvegarde();   // les données actuelles correspondent au fichier
}

// ---------- Rappel ----------
/** Renvoie { jamais, jours } si un rappel doit s'afficher, sinon null */
export async function rappelNecessaire() {
  const auj = aujourdhui();
  const masque = await db.parametre('rappel_sauvegarde_masque_jusqua', null);
  if (masque && masque >= auj) return null;
  if ((await db.compter('operations')) === 0) return null;

  const derniere = await db.parametre('date_derniere_sauvegarde', null);
  if (derniere) {
    const jours = ecartJours(derniere, auj);
    return jours >= JOURS_RAPPEL ? { jamais: false, jours } : null;
  }
  const debut = await db.parametre('date_premiere_utilisation', null);
  if (!debut) return null;
  const jours = ecartJours(debut, auj);
  return jours >= JOURS_RAPPEL_PREMIERE ? { jamais: true, jours } : null;
}

/** « Rappeler dans 3 jours » */
export const reporterRappel = () =>
  db.definirParametre('rappel_sauvegarde_masque_jusqua', ajouterJours(aujourdhui(), 3));
