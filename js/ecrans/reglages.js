// Écran Réglages : charges et revenus fixes, sauvegarde / restauration, thème, version.
// Données, période, sauvegarde, sécurité (code), thème, dépannage (journal), à propos.

import { db } from '../db.js';
import { appliquerTheme, VERSION } from '../app.js';
import { dateFR, aujourdhui, euros, versCentimes } from '../format.js';
import { SEUILS_RESTE } from '../calculs.js';
import { toast, ouvrirPanneau, fermerPanneau, esc, icones } from '../ui.js';
import { journal } from '../journal.js';
import {
  codeActif, definirCode, verifierCode, retirerCode, definirDelai, pavePin, pauseVerrou, verrouDisponible, LONGUEUR_CODE,
} from '../verrou.js';
import { signalerChangement } from '../operations.js';
import { initialiserDonnees } from '../seed.js';
import { genererRecurrents } from '../recurrents.js';
import { ouvrirEpargne } from './epargne.js';
import {
  exporter, partagerFichier, telechargerFichier, lireSauvegarde, restaurer, ecartJours,
} from '../sauvegarde.js';

const THEMES = [
  { val: 'sombre', label: 'Sombre' },
  { val: 'clair',  label: 'Clair' },
  { val: 'auto',   label: 'Auto' },
];

export async function afficher(el) {
  const actuel = await db.parametre('theme', 'clair');
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const saisieRapide = !!(await db.parametre('saisie_rapide', false));
  const seuilOrange = await db.parametre('seuil_orange', SEUILS_RESTE.orange);
  const seuilRouge = await db.parametre('seuil_rouge', SEUILS_RESTE.rouge);
  const sansEuro = c => euros(c).replace(/\s?€$/, '').replace(/[\s\u202f\u00a0]/g, '').replace(/,00$/, '');
  const code = await codeActif();
  const delaiVerrou = await db.parametre('delai_verrou', 60);
  const nbErreurs = (await db.journalTous()).filter(e => e.niveau === 'erreur').length;
  const derniere = await db.parametre('date_derniere_sauvegarde', null);
  const jours = derniere ? ecartJours(derniere, aujourdhui()) : null;
  const etat = !derniere
    ? '<span class="a-completer">Aucune sauvegarde pour l\'instant</span>'
    : `<span class="${jours >= 30 ? 'a-completer' : 'muet'}">${dateFR(derniere)}${jours === 0 ? ' (aujourd\'hui)' : ` (il y a ${jours} jour${jours > 1 ? 's' : ''})`}</span>`;

  el.innerHTML = `
    <h1>Réglages</h1>

    <h2>Mes données</h2>
    <section class="carte carte-liste"><ul class="liste">
      <li class="ligne-btn"><button type="button" id="g-categories">
        <i data-lucide="tag"></i><span>Catégories</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
      <li class="ligne-btn"><button type="button" id="g-recurrents">
        <i data-lucide="repeat"></i><span>Charges et revenus fixes</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
      <li class="ligne-btn"><button type="button" id="g-poches">
        <i data-lucide="piggy-bank"></i><span>Poches d'épargne</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
    </ul></section>

    <h2>Saisie des dépenses</h2>
    <section class="carte">
      <label class="case"><input type="checkbox" id="g-rapide" ${saisieRapide ? 'checked' : ''}>
        Enregistrement rapide</label>
      <p class="muet petit aide">Désactivé (par défaut) : tu touches une catégorie, tu complètes si tu veux la date ou la note,
        puis tu touches « Enregistrer ». Activé : toucher la catégorie enregistre aussitôt la dépense (un geste de moins,
        mais la note et la date doivent être remplies avant).</p>
    </section>

    <h2>Période du budget</h2>
    <section class="carte">
      <label class="champ">Ma période commence le
        <select id="g-jour">
          ${Array.from({ length: 28 }, (_, i) => i + 1).map(j =>
            `<option value="${j}" ${j === jourDebut ? 'selected' : ''}>${j === 1 ? '1er du mois (mois civil)' : `${j} du mois`}</option>`).join('')}
        </select></label>
      <p class="muet petit aide">Si tu es payé vers le 25, choisis ce jour : ta période ira par exemple du 25 au 24
        du mois suivant, et le « reste à dépenser » repartira à zéro à chaque salaire.</p>
    </section>

    <h2>Reste à dépenser</h2>
    <section class="carte">
      <label class="champ">La barre passe à l'orange sous (€)
        <input type="text" id="g-seuil-orange" inputmode="decimal" autocomplete="off" value="${sansEuro(seuilOrange)}"></label>
      <label class="champ">Elle passe au rouge sous (€)
        <input type="text" id="g-seuil-rouge" inputmode="decimal" autocomplete="off" value="${sansEuro(seuilRouge)}"></label>
      <p class="muet petit aide">Sur l'accueil, la barre sous le « reste à dépenser » se vide au fil des dépenses et change
        de couleur sous ces montants. Un message te prévient quand une dépense te fait passer dessous.
        Le petit trait sur la barre montre où en est le mois.</p>
    </section>

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

    <h2>Sécurité</h2>
    <section class="carte">
      <div class="ligne-info"><span>Verrouillage par code</span>
        <span class="${code ? 'pos' : 'muet'}">${code ? 'Activé' : 'Désactivé'}</span></div>
      ${!verrouDisponible() ? '<p class="muet petit aide">Indisponible : ce navigateur n\'autorise pas le chiffrement du code.</p>'
        : code ? `
        <label class="champ">Redemander le code
          <select id="g-delai">
            ${[[0, 'À chaque retour dans l\'appli'], [60, 'Après 1 minute d\'absence'], [300, 'Après 5 minutes d\'absence']]
              .map(([v, l]) => `<option value="${v}" ${v === delaiVerrou ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        <div class="pile">
          <button type="button" class="btn" id="g-code-changer">Changer le code</button>
          <button type="button" class="btn btn-danger" id="g-code-off">Désactiver le code</button>
        </div>`
        : `<div class="pile"><button type="button" class="btn btn-principal" id="g-code-on"><i data-lucide="lock"></i>Définir un code à ${LONGUEUR_CODE} chiffres</button></div>`}
      <p class="muet petit aide">Le code protège contre un regard indiscret, il ne chiffre pas tes données. Il n'est pas
        inclus dans les sauvegardes. Si tu l'oublies, il faudra effacer l'application puis restaurer une sauvegarde :
        pense à en faire une.</p>
    </section>

    <h2>Thème</h2>
    <div class="segment" role="group" aria-label="Thème">
      ${THEMES.map(t => `<button type="button" data-theme-choix="${t.val}"
          aria-pressed="${t.val === actuel}">${t.label}</button>`).join('')}
    </div>

    <h2>Dépannage</h2>
    <section class="carte carte-liste"><ul class="liste">
      <li class="ligne-btn"><button type="button" id="g-journal">
        <i data-lucide="list"></i><span>Journal technique${nbErreurs ? ` <span class="a-completer">· ${nbErreurs} erreur${nbErreurs > 1 ? 's' : ''}</span>` : ''}</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
    </ul></section>

    <h2>À propos</h2>
    <section class="carte">
      <ul class="liste">
        <li>Version <span class="ligne-val muet">${VERSION}</span></li>
        <li>Données <span class="ligne-val muet">sur ce téléphone uniquement</span></li>
      </ul>
    </section>`;

  el.querySelector('#g-poches').onclick = () => ouvrirEpargne({ retour: 'reglages' });
  el.querySelector('#g-categories').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'categories' }));
  el.querySelector('#g-recurrents').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'recurrents' }));

  el.querySelector('#g-rapide').onchange = async e => {
    await db.definirParametre('saisie_rapide', e.target.checked);
    toast(e.target.checked ? 'Enregistrement rapide activé' : 'Enregistrement rapide désactivé');
  };

  const seuil = (id, cle, autre, plusGrand) => el.querySelector(id).onchange = async e => {
    const c = versCentimes(e.target.value.trim());
    const a = versCentimes(el.querySelector(autre).value.trim());
    if (c == null || (a != null && (plusGrand ? c < a : c > a))) {
      toast(c == null ? 'Montant invalide (ex. 100)' : 'Le seuil orange doit être au-dessus du seuil rouge');
      e.target.value = sansEuro(await db.parametre(cle, SEUILS_RESTE[plusGrand ? 'orange' : 'rouge']));
      return;
    }
    await db.definirParametre(cle, c);
    toast('Seuil enregistré');
  };
  seuil('#g-seuil-orange', 'seuil_orange', '#g-seuil-rouge', true);
  seuil('#g-seuil-rouge', 'seuil_rouge', '#g-seuil-orange', false);

  el.querySelector('#g-jour').onchange = async e => {
    await db.definirParametre('jour_debut_mois', Number(e.target.value));
    toast('Période enregistrée');
  };

  el.querySelector('#g-journal').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'journal' }));

  el.querySelector('#g-code-on')?.addEventListener('click', async () => {
    const nouveau = await saisirNouveauCode();
    if (nouveau) { await definirCode(nouveau); toast('Code activé'); afficher(el).then(icones); }
  });
  el.querySelector('#g-code-changer')?.addEventListener('click', async () => {
    if (!(await demanderCodeActuel())) return;
    const nouveau = await saisirNouveauCode('Choisis un nouveau code');
    if (nouveau) { await definirCode(nouveau); toast('Code modifié'); afficher(el).then(icones); }
  });
  el.querySelector('#g-code-off')?.addEventListener('click', async () => {
    if (!(await demanderCodeActuel())) return;
    await retirerCode(); toast('Code désactivé'); afficher(el).then(icones);
  });
  el.querySelector('#g-delai')?.addEventListener('change', async e => {
    await definirDelai(Number(e.target.value)); toast('Réglage enregistré');
  });

  el.querySelector('#g-exporter').onclick = lancerExport;

  const entree = el.querySelector('#g-fichier');
  el.querySelector('#g-restaurer').onclick = () => { pauseVerrou(); entree.value = ''; entree.click(); };
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
  pauseVerrou();                       // la feuille de partage met l'appli en arrière-plan
  try { res = await exporter(); }
  catch (e) { toast('Impossible de créer la sauvegarde'); journal.erreur('sauvegarde', e); return; }
  finally { pauseVerrou(2000); }

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
      pauseVerrou();
      const ok = await partagerFichier(res.fichier);
      pauseVerrou(2000);
      if (ok) { fermerPanneau(); toast('Sauvegarde envoyée'); signalerChangement(); }
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
      journal.erreur('sauvegarde', e);
      toast('Échec de la restauration, tes données n\'ont pas été modifiées');
    }
  };
}


// ---------- Code de verrouillage : saisies dans un panneau ----------
/** Demande un nouveau code (deux fois). Renvoie le code ou null si annulé. */
function saisirNouveauCode(titre = 'Choisis un code') {
  return new Promise(resolve => {
    ouvrirPanneau('<div id="pz"></div><button type="button" class="btn" id="pz-annuler">Annuler</button>');
    let premier = null;
    const pin = pavePin(document.getElementById('pz'), {
      titre, sousTitre: `${LONGUEUR_CODE} chiffres`,
      surCode: (code) => {
        if (premier === null) { premier = code; pin.reinitialiser(); pin.titre('Confirme ton code'); return; }
        if (code !== premier) { premier = null; pin.titre(titre); pin.erreur('Les deux codes sont différents. Recommence.'); return; }
        fermerPanneau(); resolve(code);
      },
    });
    document.getElementById('pz-annuler').onclick = () => { fermerPanneau(); resolve(null); };
  });
}

/** Demande le code actuel. Renvoie true s'il est correct, false si annulé. */
function demanderCodeActuel() {
  return new Promise(resolve => {
    ouvrirPanneau('<div id="pz"></div><button type="button" class="btn" id="pz-annuler">Annuler</button>');
    const pin = pavePin(document.getElementById('pz'), {
      titre: 'Code actuel', sousTitre: 'Entre ton code pour continuer',
      surCode: async (code) => {
        if (await verifierCode(code)) { fermerPanneau(); resolve(true); }
        else pin.erreur('Code incorrect');
      },
    });
    document.getElementById('pz-annuler').onclick = () => { fermerPanneau(); resolve(false); };
  });
}
