// Journal technique : ce que fait l'application et ce qui va mal, uniquement sur ce téléphone.
// Il ne contient JAMAIS de montant, de libellé ni de note : seulement des événements techniques.
// Aucun envoi automatique : tu l'exportes toi-même si tu veux me le montrer.

import { db } from './db.js';

export const MAX_ENTREES = 500;
let ecritures = 0;

async function ecrire(niveau, source, message, detail) {
  try {
    await db.journalAjouter({
      t: new Date().toISOString(),
      niveau,
      source,
      message: String(message ?? '').slice(0, 300),
      ...(detail ? { detail: String(detail).slice(0, 1500) } : {}),
    });
    if (++ecritures % 50 === 0) await db.journalElaguer(MAX_ENTREES);
  } catch { /* le journal ne doit jamais faire planter l'application */ }
}

export const journal = {
  info: (source, message, detail) => ecrire('info', source, message, detail),
  avert: (source, message, detail) => ecrire('avertissement', source, message, detail),
  erreur: (source, erreur, detail) => ecrire('erreur', source,
    erreur instanceof Error ? erreur.message : erreur,
    detail ?? (erreur instanceof Error ? erreur.stack : undefined)),
};

/** Enregistre les erreurs non gérées de la page */
export function installerCapteurs() {
  window.addEventListener('error', e => {
    journal.erreur('js', e.message || 'Erreur', `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}\n${(e.error && e.error.stack) || ''}`);
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    journal.erreur('promesse', r instanceof Error ? r.message : String(r), r && r.stack);
  });
}

/** Texte à envoyer : en-tête + une ligne par entrée (la plus ancienne d'abord) */
export function texteExport(entrees, meta) {
  const lignes = [
    'Journal technique — Budget',
    `Version : ${meta.version}`,
    `Exporté le : ${meta.exporteLe}`,
    `Appareil : ${meta.appareil}`,
    `Entrées : ${entrees.length}`,
    '',
  ];
  for (const e of entrees) {
    lignes.push(`${e.t} [${e.niveau}] ${e.source} — ${e.message}`);
    if (e.detail) lignes.push(...String(e.detail).split('\n').map(l => `    ${l}`));
  }
  return lignes.join('\n') + '\n';
}
