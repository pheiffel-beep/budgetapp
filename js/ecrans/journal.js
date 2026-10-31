// Écran « Journal technique » (ouvert depuis Réglages).
// Liste des événements et erreurs enregistrés sur ce téléphone, export en fichier texte, effacement.

import { db } from '../db.js';
import { esc, toast, ouvrirPanneau, fermerPanneau, icones } from '../ui.js';
import { texteExport, journal } from '../journal.js';
import { pauseVerrou } from '../verrou.js';
import { VERSION } from '../app.js';
import { aujourdhui } from '../format.js';

let seulementErreurs = false;
const MAX_AFFICHEES = 150;

const NIVEAUX = { info: 'Info', avertissement: 'Attention', erreur: 'Erreur' };

const heure = iso => {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export async function afficher(el) {
  const toutes = (await db.journalTous()).sort((a, b) => b.id - a.id);
  const nbErreurs = toutes.filter(e => e.niveau === 'erreur').length;
  const visibles = (seulementErreurs ? toutes.filter(e => e.niveau !== 'info') : toutes).slice(0, MAX_AFFICHEES);

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="j-retour" aria-label="Retour aux réglages"><i data-lucide="chevron-left"></i></button>
      <h1>Journal technique</h1>
    </div>

    <p class="muet petit aide">Ce journal reste sur ton téléphone. Il note le démarrage, les erreurs et les actions techniques
      (sauvegarde, restauration, charges fixes générées). Il ne contient <strong>aucun montant, libellé ni note</strong>.
      Rien n'est envoyé : si quelque chose ne marche pas, exporte-le et envoie-le moi.</p>

    <div class="segment petit-seg" role="group" aria-label="Filtre">
      <button type="button" data-filtre="tout" aria-pressed="${!seulementErreurs}">Tout (${toutes.length})</button>
      <button type="button" data-filtre="erreurs" aria-pressed="${seulementErreurs}">Erreurs et alertes</button>
    </div>
    ${nbErreurs ? `<p class="muet petit">${nbErreurs} erreur${nbErreurs > 1 ? 's' : ''} enregistrée${nbErreurs > 1 ? 's' : ''}.</p>` : ''}

    ${visibles.length ? `
      <section class="carte carte-liste"><ul class="liste journal">
        ${visibles.map(e => `<li class="j-${e.niveau}">
          <div class="j-tete"><span class="j-heure">${heure(e.t)}</span>
            <span class="j-niveau">${NIVEAUX[e.niveau] || esc(e.niveau)}</span>
            <span class="j-source">${esc(e.source)}</span></div>
          <div class="j-message">${esc(e.message)}</div>
          ${e.detail ? `<details><summary>Détail</summary><pre>${esc(e.detail)}</pre></details>` : ''}
        </li>`).join('')}
      </ul></section>
      ${toutes.length > MAX_AFFICHEES ? `<p class="muet petit centre">Les ${MAX_AFFICHEES} plus récentes sont affichées. L'export contient tout.</p>` : ''}`
      : `<div class="vide"><i data-lucide="list"></i><p>${toutes.length ? 'Aucune erreur ni alerte.' : 'Le journal est vide.'}</p></div>`}

    <div class="pile">
      <button type="button" class="btn btn-principal" id="j-export" ${toutes.length ? '' : 'disabled'}><i data-lucide="share"></i>Exporter le journal</button>
      <button type="button" class="btn btn-danger" id="j-vider" ${toutes.length ? '' : 'disabled'}>Vider le journal</button>
    </div>`;

  el.querySelector('#j-retour').onclick = () => window.dispatchEvent(new CustomEvent('naviguer', { detail: 'reglages' }));
  el.querySelectorAll('[data-filtre]').forEach(b => b.onclick = async () => {
    seulementErreurs = b.dataset.filtre === 'erreurs';
    await afficher(el); icones();
  });
  el.querySelector('#j-export').onclick = () => exporter(toutes);
  el.querySelector('#j-vider').onclick = () => {
    ouvrirPanneau(`
      <h2 class="titre-panneau">Vider le journal ?</h2>
      <p>Les ${toutes.length} entrées seront effacées. Tes données (opérations, budgets…) ne sont pas touchées.</p>
      <div class="pile">
        <button type="button" class="btn btn-danger-plein" id="j-ok">Vider</button>
        <button type="button" class="btn" id="j-non">Annuler</button>
      </div>`);
    document.getElementById('j-non').onclick = fermerPanneau;
    document.getElementById('j-ok').onclick = async () => {
      await db.journalVider(); fermerPanneau(); await afficher(el); icones(); toast('Journal vidé');
    };
  };
}

async function exporter(entrees) {
  const ordre = [...entrees].sort((a, b) => a.id - b.id);
  const texte = texteExport(ordre, {
    version: VERSION,
    exporteLe: new Date().toISOString(),
    appareil: navigator.userAgent,
  });
  const fichier = new File([texte], `budget-journal-${aujourdhui()}.txt`, { type: 'text/plain' });
  try {
    pauseVerrou();
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: 'Journal technique Budget' });
      toast('Journal envoyé');
    } else {
      const url = URL.createObjectURL(fichier);
      const a = document.createElement('a');
      a.href = url; a.download = fichier.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Journal téléchargé');
    }
  } catch (e) {
    if (e.name !== 'AbortError') { journal.erreur('journal', e); toast('Impossible d\'exporter le journal'); }
  } finally {
    pauseVerrou(2000);
  }
}
