// Écran « Catégories » (ouvert depuis Réglages) : ajouter, renommer, changer l'icône et la couleur,
// masquer ou réafficher dans la grille de saisie, supprimer avec réaffectation.

import { db } from '../db.js';
import { esc, pastille, ouvrirPanneau, fermerPanneau, toast, icones } from '../ui.js';
import { signalerChangement } from '../operations.js';
import {
  ICONES, COULEURS, NOM_MAX, groupeDe, validerNom, estSysteme,
  creerCategorie, modifierCategorie, supprimerCategorie, usageCategorie, compteursOperations,
} from '../categories.js';

const GROUPES = [
  ['quotidien', 'Dépenses du quotidien', 'Elles apparaissent dans la grille de saisie.'],
  ['fixe', 'Charges fixes', 'Elles classent tes charges fixes. Masquées de la grille de saisie par défaut.'],
  ['revenu', 'Revenus', 'Elles apparaissent quand tu saisis une entrée.'],
];
const LIBELLE_GROUPE = { quotidien: 'Dépense du quotidien', fixe: 'Charge fixe', revenu: 'Revenu' };

export async function afficher(el) {
  const cats = (await db.tous('categories')).sort((a, b) => a.ordre - b.ordre);
  const compteurs = await compteursOperations();

  const ligne = c => {
    const n = compteurs[c.id] || 0;
    const sous = [n ? `${n} opération${n > 1 ? 's' : ''}` : 'Aucune opération', c.masquee ? 'masquée de la grille' : ''].filter(Boolean).join(' · ');
    return `<li class="ligne-btn"><button type="button" data-cat="${c.id}">
      ${pastille(c)}
      <span class="op-texte"><span class="op-titre">${esc(c.nom)}</span><span class="op-sous">${sous}</span></span>
      <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>`;
  };

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="c-retour" aria-label="Retour aux réglages"><i data-lucide="chevron-left"></i></button>
      <h1>Catégories</h1>
    </div>
    ${GROUPES.map(([g, titre, aide]) => `
      <h2>${titre}</h2>
      <p class="muet petit aide">${aide}</p>
      <section class="carte carte-liste"><ul class="liste">${cats.filter(c => groupeDe(c) === g).map(ligne).join('')}</ul></section>`).join('')}
    <button type="button" class="btn" id="c-ajouter"><i data-lucide="plus"></i>Ajouter une catégorie</button>`;

  el.querySelector('#c-retour').onclick = () => window.dispatchEvent(new CustomEvent('naviguer', { detail: 'reglages' }));
  el.querySelector('#c-ajouter').onclick = () => editeur(null, cats);
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () =>
    editeur(cats.find(c => c.id === Number(b.dataset.cat)), cats));
}

// ---------- Éditeur ----------
function editeur(cat, cats) {
  const e = cat
    ? { nom: cat.nom, icone: cat.icone, couleur: cat.couleur, masquee: !!cat.masquee, groupe: groupeDe(cat) }
    : { nom: '', icone: 'circle-help', couleur: COULEURS[0], masquee: false, groupe: 'quotidien' };

  const dessiner = () => {
    ouvrirPanneau(`
      <div class="saisie-entete">
        <h2 class="titre-panneau">${cat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
        <button type="button" class="btn-icone" id="e-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
      </div>

      ${cat ? '' : `
      <div class="segment" role="group" aria-label="Type de catégorie">
        ${['quotidien', 'fixe', 'revenu'].map(g => `<button type="button" data-groupe="${g}" aria-pressed="${e.groupe === g}">${
          g === 'quotidien' ? 'Quotidien' : g === 'fixe' ? 'Charge fixe' : 'Revenu'}</button>`).join('')}
      </div>`}

      <div class="apercu">
        ${pastille({ icone: e.icone, couleur: e.couleur })}
        <input type="text" id="e-nom" value="${esc(e.nom)}" maxlength="${NOM_MAX}" placeholder="Nom de la catégorie"
          autocomplete="off" aria-label="Nom de la catégorie">
      </div>

      <h3 class="sous-titre">Icône</h3>
      <div class="grille-icones" role="group" aria-label="Icône">
        ${ICONES.map(i => `<button type="button" data-icone="${i}" aria-pressed="${i === e.icone}" aria-label="${i}"><i data-lucide="${i}"></i></button>`).join('')}
      </div>

      <h3 class="sous-titre">Couleur</h3>
      <div class="grille-couleurs" role="group" aria-label="Couleur">
        ${COULEURS.map(c => `<button type="button" data-couleur="${c}" style="background:${c}" aria-pressed="${c === e.couleur}" aria-label="Couleur ${c}"></button>`).join('')}
      </div>

      <label class="case"><input type="checkbox" id="e-visible" ${e.masquee ? '' : 'checked'}>
        Afficher dans la grille de saisie</label>

      <div class="pile">
        <button type="button" class="btn btn-principal" id="e-ok">Enregistrer</button>
        ${cat && !estSysteme(cat) ? '<button type="button" class="btn btn-danger" id="e-suppr">Supprimer…</button>' : ''}
        ${cat && estSysteme(cat) ? '<p class="muet petit centre">Cette catégorie sert au recalage de solde : tu peux la renommer ou la masquer, mais pas la supprimer.</p>' : ''}
      </div>`);

    const $ = id => document.getElementById(id);
    const lireNom = () => { e.nom = $('e-nom').value; e.masquee = !$('e-visible').checked; };

    $('e-fermer').onclick = fermerPanneau;
    document.querySelectorAll('[data-groupe]').forEach(b => b.onclick = () => {
      lireNom();
      e.groupe = b.dataset.groupe;
      e.masquee = e.groupe === 'fixe';          // une charge fixe est masquée de la grille par défaut
      dessiner();
    });
    document.querySelectorAll('[data-icone]').forEach(b => b.onclick = () => { lireNom(); e.icone = b.dataset.icone; dessiner(); });
    document.querySelectorAll('[data-couleur]').forEach(b => b.onclick = () => { lireNom(); e.couleur = b.dataset.couleur; dessiner(); });

    $('e-ok').onclick = async () => {
      lireNom();
      const v = validerNom(e.nom, cats, cat ? cat.id : null);
      if (!v.ok) { toast(v.erreur, { duree: 3500 }); return; }
      if (cat) await modifierCategorie(cat.id, { nom: v.nom, icone: e.icone, couleur: e.couleur, masquee: e.masquee });
      else await creerCategorie({ nom: v.nom, icone: e.icone, couleur: e.couleur, groupe: e.groupe, masquee: e.masquee });
      fermerPanneau(); signalerChangement();
      toast(cat ? 'Catégorie modifiée' : 'Catégorie ajoutée');
    };
    $('e-suppr')?.addEventListener('click', () => confirmerSuppression(cat, cats));
  };

  dessiner();
}

// ---------- Suppression avec réaffectation ----------
async function confirmerSuppression(cat, cats) {
  const usage = await usageCategorie(cat.id);
  const utilisee = usage.ops > 0 || usage.recs > 0;
  const destinations = cats.filter(c => c.id !== cat.id && c.type === cat.type);

  if (utilisee && !destinations.length) {
    ouvrirPanneau(`
      <h2 class="titre-panneau">Suppression impossible</h2>
      <p>Il faut au moins une autre catégorie du même type pour y déplacer ce qui utilise « ${esc(cat.nom)} ».</p>
      <button type="button" class="btn" id="s-fermer">Fermer</button>`);
    document.getElementById('s-fermer').onclick = fermerPanneau;
    return;
  }

  const lignes = [
    usage.ops ? `<strong>${usage.ops} opération${usage.ops > 1 ? 's' : ''}</strong>` : '',
    usage.recs ? `<strong>${usage.recs} charge${usage.recs > 1 ? 's' : ''} ou revenu${usage.recs > 1 ? 's' : ''} fixe${usage.recs > 1 ? 's' : ''}</strong>` : '',
  ].filter(Boolean).join(' et ');

  ouvrirPanneau(`
    <h2 class="titre-panneau">Supprimer « ${esc(cat.nom)} » ?</h2>
    ${utilisee ? `
      <p>Cette catégorie contient ${lignes}. Tout sera déplacé vers :</p>
      <label class="champ">Catégorie de destination
        <select id="s-dest">
          ${destinations.map(d => `<option value="${d.id}">${esc(d.nom)}</option>`).join('')}
        </select></label>`
      : '<p>Cette catégorie n\'est utilisée nulle part.</p>'}
    ${usage.budget ? '<p class="muet petit">Son budget sera supprimé.</p>' : ''}
    <div class="pile">
      <button type="button" class="btn btn-danger-plein" id="s-ok">Supprimer la catégorie</button>
      <button type="button" class="btn" id="s-annuler">Annuler</button>
    </div>`);
  document.getElementById('s-annuler').onclick = fermerPanneau;
  document.getElementById('s-ok').onclick = async () => {
    try {
      const dest = utilisee ? Number(document.getElementById('s-dest').value) : null;
      await supprimerCategorie(cat.id, dest);
      fermerPanneau(); signalerChangement();
      toast(utilisee ? 'Catégorie supprimée, opérations déplacées' : 'Catégorie supprimée');
    } catch (err) {
      console.error(err);
      fermerPanneau();
      toast('Impossible de supprimer cette catégorie');
    }
  };
}
