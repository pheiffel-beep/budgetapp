// Écran Réglages : charges et revenus fixes, sauvegarde / restauration, thème, version.
// La suite (catégories, jour de début de mois, code, journal) arrive plus tard.

import { db } from '../db.js';
import { appliquerTheme, VERSION } from '../app.js';
import { dateFR, aujourdhui } from '../format.js';
import { toast, ouvrirPanneau, fermerPanneau, esc, icones } from '../ui.js';
import { signalerChangement } from '../operations.js';
import { initialiserDonnees } from '../seed.js';
import { genererRecurrents } from '../recurrents.js';
import {
  exporter, partagerFichier, telechargerFichier, lireSauvegarde, restaurer, ecartJours,
} from '../sauvegarde.js';

const THEMES = [
  { val: 'sombre', label: 'Sombre' },
  { val: 'clair',  label: 'Clair' },
  { val: 'auto',   label: 'Auto' },
];

export async function afficher(el) {
  const actuel = await db.parametre('theme', 'sombre');
  const derniere = await db.parametre('date_derniere_sauvegarde', null);
  const jours = derniere ? ecartJours(derniere, aujourdhui()) : null;
  const etat = !derniere
    ? '<span class="a-completer">Aucune sauvegarde pour l\'instant</span>'
    : `<span class="${jours >= 30 ? 'a-completer' : 'muet'}">${dateFR(derniere)}${jours === 0 ? ' (aujourd\'hui)' : ` (il y a ${jours} jour${jours > 1 ? 's' : ''})`}</span>`;

  el.innerHTML = `
    <h1>Réglages</h1>

    <h2>Mes données</h2>
    <section class="carte carte-liste"><ul class="liste">
      <li class="ligne-btn"><button type="button" id="g-recurrents">
        <i data-lucide="repeat"></i><span>Charges et revenus fixes</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
    </ul></section>

    <h2>Sauvegarde</h2>
    <section class="carte">
      <div class="ligne-info"><span>Dernière sauvegarde</span>${etat}</div>
      <p class="muet petit aide">Tes données restent uniquement sur ce téléphone. Le fichier de sauvegarde contient
        tout (opérations, catégories, charges fixes, budgets). Enregistre-le dans Fichiers, iCloud Drive ou Drive,
        ou envoie-le par mail.</p>
      <div class="pile">
        <button type="button" class="btn btn-principal" id="g-exporter"><i data-lucide="share"></i>Exporter une sauvegarde</button>
        <button type="button" class="btn" id="g-restaurer"><i data-lucide="file-up"></i>Restaurer depuis un fichier</button>
      </div>
      <input type="file" id="g-fichier" accept=".json,application/json" hidden>
    </section>

    <h2>Thème</h2>
    <div class="segment" role="group" aria-label="Thème">
      ${THEMES.map(t => `<button type="button" data-theme-choix="${t.val}"
          aria-pressed="${t.val === actuel}">${t.label}</button>`).join('')}
    </div>

    <h2>À propos</h2>
    <section class="carte">
      <ul class="liste">
        <li>Version <span class="ligne-val muet">${VERSION}</span></li>
        <li>Données <span class="ligne-val muet">sur ce téléphone uniquement</span></li>
      </ul>
    </section>`;

  el.querySelector('#g-recurrents').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'recurrents' }));

  el.querySelector('#g-exporter').onclick = lancerExport;

  const entree = el.querySelector('#g-fichier');
  el.querySelector('#g-restaurer').onclick = () => { entree.value = ''; entree.click(); };
  entree.onchange = async () => {
    const fichier = entree.files[0];
    if (fichier) await preparerRestauration(fichier);
  };

  el.querySelectorAll('[data-theme-choix]').forEach(b => b.addEventListener('click', async () => {
    const choix = b.dataset.themeChoix;
    await db.definirParametre('theme', choix);
    await appliquerTheme(choix);
    el.querySelectorAll('[data-theme-choix]').forEach(x =>
      x.setAttribute('aria-pressed', x.dataset.themeChoix === choix));
    toast('Thème enregistré');
  }));
}

// ---------- Export ----------
async function lancerExport() {
  let res;
  try { res = await exporter(); }
  catch (e) { toast('Impossible de créer la sauvegarde'); console.error(e); return; }

  if (res.ok) {
    toast(res.mode === 'partage' ? 'Sauvegarde envoyée' : 'Sauvegarde téléchargée');
    signalerChangement();
  } else if (res.fichier) {
    // iOS a refusé le partage automatique : un appui de plus suffit
    ouvrirPanneau(`
      <h2 class="titre-panneau">Fichier prêt</h2>
      <p class="muet">${esc(res.fichier.name)}</p>
      <div class="pile">
        <button type="button" class="btn btn-principal" id="p-partager"><i data-lucide="share"></i>Partager le fichier</button>
        <button type="button" class="btn" id="p-telecharger"><i data-lucide="download"></i>Télécharger</button>
        <button type="button" class="btn" id="p-fermer">Annuler</button>
      </div>`);
    document.getElementById('p-partager').onclick = async () => {
      if (await partagerFichier(res.fichier)) { fermerPanneau(); toast('Sauvegarde envoyée'); signalerChangement(); }
    };
    document.getElementById('p-telecharger').onclick = async () => {
      await telechargerFichier(res.fichier); fermerPanneau(); toast('Sauvegarde téléchargée'); signalerChangement();
    };
    document.getElementById('p-fermer').onclick = fermerPanneau;
  }
  // res.annule : l'utilisateur a fermé la feuille de partage, on ne dit rien
}

// ---------- Restauration ----------
async function preparerRestauration(fichier) {
  let texte;
  try { texte = await fichier.text(); }
  catch { toast('Impossible de lire ce fichier'); return; }

  const lu = lireSauvegarde(texte);
  if (!lu.ok) {
    ouvrirPanneau(`
      <h2 class="titre-panneau">Restauration impossible</h2>
      <p>${esc(lu.erreur)}</p>
      <p class="muet petit">Tes données actuelles n'ont pas été touchées.</p>
      <button type="button" class="btn" id="p-fermer">Fermer</button>`);
    document.getElementById('p-fermer').onclick = fermerPanneau;
    return;
  }

  const r = lu.resume;
  const actuelles = await db.compter('operations');
  const quand = r.exporte_le ? dateFR(r.exporte_le.slice(0, 10)) : 'date inconnue';
  ouvrirPanneau(`
    <h2 class="titre-panneau">Remplacer tes données ?</h2>
    <section class="carte">
      <div class="ligne-info"><span>Sauvegarde du</span><strong>${quand}</strong></div>
      <div class="ligne-info"><span>Opérations</span><strong>${r.operations}</strong></div>
      <div class="ligne-info"><span>Charges et revenus fixes</span><strong>${r.recurrents}</strong></div>
      <div class="ligne-info"><span>Catégories</span><strong>${r.categories}</strong></div>
    </section>
    <p>Tes données actuelles (<strong>${actuelles} opération${actuelles > 1 ? 's' : ''}</strong>) seront
      <strong>effacées et remplacées</strong> par celles de ce fichier.</p>
    <div class="pile">
      <button type="button" class="btn btn-danger-plein" id="p-confirmer">Remplacer mes données</button>
      <button type="button" class="btn" id="p-annuler">Annuler</button>
    </div>`);
  document.getElementById('p-annuler').onclick = fermerPanneau;
  document.getElementById('p-confirmer').onclick = async () => {
    try {
      await restaurer(lu.sauvegarde);
      await initialiserDonnees();                 // complète une ancienne sauvegarde si besoin
      await genererRecurrents(aujourdhui());      // rattrape les échéances depuis la sauvegarde
      await appliquerTheme();
      fermerPanneau();
      toast('Données restaurées');
      signalerChangement();
    } catch (e) {
      console.error(e);
      fermerPanneau();
      toast('Échec de la restauration, tes données n\'ont pas été modifiées');
    }
  };
}
