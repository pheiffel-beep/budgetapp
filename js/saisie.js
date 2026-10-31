// Panneau de saisie express (nouvelle opération) et d'édition (opération existante).

import { db } from './db.js';
import { euros, aujourdhui } from './format.js';
import { ouvrirPanneau, fermerPanneau, toast, esc, pastille, icones } from './ui.js';
import {
  enregistrerOperation, supprimerOperation, restaurerOperation, compterUtilisation,
  signalerChangement, libelleOperation,
} from './operations.js';

const MAX_ENTIERS = 7;

// État du panneau
let s = null;

/**
 * Ouvre le panneau.
 * @param {object|null} operation  opération existante à modifier, ou null pour une nouvelle
 */
export async function ouvrirSaisie(operation = null) {
  const categories = await db.tous('categories');
  const comptes = await db.parametre('comptes', []);
  s = {
    edition: !!operation,
    original: operation,
    type: operation?.type ?? 'sortie',
    saisie: operation ? centimesVersSaisie(operation.montant_centimes) : '',
    categorie_id: operation?.categorie_id ?? null,
    sens: operation?.sens_virement ?? 'vers_epargne',
    date: operation?.date ?? aujourdhui(),
    note: operation?.note ?? '',
    compte: operation?.compte ?? '',
    recurrent: operation?.recurrent_id != null ? await db.lire('recurrents', operation.recurrent_id) : null,
    majDefaut: false,
    optionsOuvertes: !!operation && !!(operation.note || operation.compte || operation.date !== aujourdhui()),
    categories,
    comptes,
  };
  ouvrirPanneau('<div id="saisie"></div>');
  dessiner();
  document.addEventListener('keydown', clavierPhysique);
}

function fermer() {
  document.removeEventListener('keydown', clavierPhysique);
  fermerPanneau();
  s = null;
}

// ---------- Montant ----------
function centimesVersSaisie(c) {
  const e = Math.floor(c / 100), d = c % 100;
  return d ? `${e},${String(d).padStart(2, '0').replace(/0$/, '')}` : String(e);
}

function saisieVersCentimes(txt) {
  if (!txt) return 0;
  const [e, d = ''] = txt.split(',');
  return Number(e || 0) * 100 + Number(d.padEnd(2, '0'));
}

function affichageMontant(txt) {
  if (!txt) return '0';
  const [e, d] = txt.split(',');
  const ent = (e || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return d !== undefined ? `${ent},${d}` : ent;
}

function touche(t) {
  let v = s.saisie;
  if (t === 'eff') v = v.slice(0, -1);
  else if (t === ',') { if (!v.includes(',')) v = (v || '0') + ','; }
  else {
    const [e, d] = v.split(',');
    if (d !== undefined) { if (d.length < 2) v += t; }
    else if (e === '0') v = t;
    else if (e.length < MAX_ENTIERS) v += t;
  }
  s.saisie = v;
  document.getElementById('montant-valeur').textContent = affichageMontant(v);
}

function clavierPhysique(ev) {
  if (!s || ev.target.matches('input, textarea, select')) return;
  if (/^[0-9]$/.test(ev.key)) touche(ev.key);
  else if (ev.key === ',' || ev.key === '.') touche(',');
  else if (ev.key === 'Backspace') touche('eff');
  else if (ev.key === 'Escape') fermer();
  else return;
  ev.preventDefault();
}

// ---------- Dessin ----------
function categoriesAffichees() {
  const typeCat = s.type === 'entree' ? 'entree' : 'sortie';
  let liste = s.categories.filter(c => c.type === typeCat && !c.masquee);
  // En édition, la catégorie actuelle reste visible même si elle est masquée (ex. technique)
  const actuelle = s.categories.find(c => c.id === s.categorie_id);
  if (actuelle && actuelle.type === typeCat && !liste.includes(actuelle)) liste.push(actuelle);
  return liste.sort((a, b) => (b.utilisations || 0) - (a.utilisations || 0) || a.ordre - b.ordre);
}

function dessiner() {
  const el = document.getElementById('saisie');
  const TYPES = [['sortie', 'Sortie'], ['entree', 'Entrée'], ['virement', 'Virement']];
  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'eff'];

  el.innerHTML = `
    <div class="saisie-entete">
      <h2 class="titre-panneau">${s.edition ? 'Modifier l\'opération' : 'Nouvelle opération'}</h2>
      <button type="button" class="btn-icone" id="s-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>

    <div class="segment" role="group" aria-label="Type d'opération">
      ${TYPES.map(([v, l]) => `<button type="button" data-type="${v}" aria-pressed="${s.type === v}">${l}</button>`).join('')}
    </div>

    <div class="montant-saisie type-${s.type}" aria-live="polite">
      <span id="montant-valeur">${affichageMontant(s.saisie)}</span><span class="euro"> €</span>
    </div>

    ${s.recurrent ? `
      <label class="case"><input type="checkbox" id="s-maj" ${s.majDefaut ? 'checked' : ''}>
        Mettre aussi à jour le montant par défaut de « ${esc(s.recurrent.libelle)} »
        (${euros(s.recurrent.montant_centimes)})</label>` : ''}

    <div class="pave" role="group" aria-label="Pavé numérique">
      ${touches.map(t => `<button type="button" data-touche="${t}"
          aria-label="${t === 'eff' ? 'Effacer' : t === ',' ? 'Virgule' : t}">
          ${t === 'eff' ? '<i data-lucide="delete"></i>' : t}</button>`).join('')}
    </div>

    ${s.type === 'virement' ? `
      <div class="segment" role="group" aria-label="Sens du virement">
        <button type="button" data-sens="vers_epargne" aria-pressed="${s.sens === 'vers_epargne'}">Vers épargne</button>
        <button type="button" data-sens="depuis_epargne" aria-pressed="${s.sens === 'depuis_epargne'}">Depuis épargne</button>
      </div>` : `
      <div class="grille-cat" role="group" aria-label="Catégorie">
        ${categoriesAffichees().map(c => `
          <button type="button" class="cat-btn" data-cat="${c.id}" aria-pressed="${c.id === s.categorie_id}">
            ${pastille(c)}<span>${esc(c.nom)}</span>
          </button>`).join('')}
      </div>`}

    <details class="options" ${s.optionsOuvertes ? 'open' : ''}>
      <summary>Date, note, compte</summary>
      <label class="champ">Date
        <input type="date" id="s-date" value="${s.date}" required>
      </label>
      <label class="champ">Note
        <input type="text" id="s-note" value="${esc(s.note)}" maxlength="120" placeholder="Facultatif" autocomplete="off">
      </label>
      <label class="champ">Compte
        <select id="s-compte">
          <option value="">—</option>
          ${s.comptes.map(c => `<option ${c === s.compte ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </label>
    </details>

    ${s.type === 'virement' || s.edition ? `
      <button type="button" class="btn btn-principal" id="s-enregistrer">Enregistrer</button>` : `
      <p class="muet petit centre">Touche une catégorie pour enregistrer.</p>`}
    ${s.edition ? `<button type="button" class="btn btn-danger" id="s-supprimer">Supprimer</button>` : ''}
  `;
  icones();
  brancher(el);
}

function brancher(el) {
  el.querySelector('#s-fermer').onclick = fermer;
  el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    lireOptions();
    if (s.type !== b.dataset.type) { s.type = b.dataset.type; s.categorie_id = null; }
    dessiner();
  });
  el.querySelectorAll('[data-touche]').forEach(b => b.onclick = () => touche(b.dataset.touche));
  el.querySelectorAll('[data-sens]').forEach(b => b.onclick = () => {
    s.sens = b.dataset.sens;
    el.querySelectorAll('[data-sens]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    s.categorie_id = Number(b.dataset.cat);
    if (s.edition) {
      el.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', x === b));
    } else {
      valider();
    }
  });
  el.querySelector('.options').addEventListener('toggle', e => { s.optionsOuvertes = e.target.open; });
  el.querySelector('#s-enregistrer')?.addEventListener('click', valider);
  el.querySelector('#s-maj')?.addEventListener('change', e => { s.majDefaut = e.target.checked; });
  el.querySelector('#s-supprimer')?.addEventListener('click', supprimer);
}

function lireOptions() {
  s.date = document.getElementById('s-date').value || aujourdhui();
  s.note = document.getElementById('s-note').value;
  s.compte = document.getElementById('s-compte').value;
}

// ---------- Actions ----------
async function valider() {
  lireOptions();
  const montant = saisieVersCentimes(s.saisie);
  if (montant <= 0) { toast('Entre d\'abord un montant'); return; }
  if (s.type !== 'virement' && s.categorie_id == null) { toast('Choisis une catégorie'); return; }

  const op = {
    ...(s.original || {}),
    type: s.type,
    sens_virement: s.sens,
    montant_centimes: montant,
    categorie_id: s.categorie_id,
    date: s.date,
    note: s.note,
    compte: s.compte,
  };
  const id = await enregistrerOperation(op);
  const edition = s.edition;
  // Récurrent : le modèle n'est modifié que si la case est cochée
  const s_majFaite = !!(s.recurrent && s.majDefaut && s.recurrent.montant_centimes !== montant);
  if (s_majFaite) await db.modifier('recurrents', { ...s.recurrent, montant_centimes: montant });
  const cat = s.categories.find(c => c.id === s.categorie_id);
  if (!edition) await compterUtilisation(op.categorie_id, 1);
  fermer();
  signalerChangement();

  if (edition) {
    toast(s_majFaite ? 'Opération et montant par défaut modifiés' : 'Opération modifiée');
  } else {
    toast(`${libelleOperation(op, cat)} · ${euros(montant)}`, {
      action: 'Annuler',
      duree: 5000,
      surAction: async () => {
        await supprimerOperation(id);
        await compterUtilisation(op.categorie_id, -1);
        signalerChangement();
      },
    });
  }
}

async function supprimer() {
  const id = s.original.id;
  fermer();
  await supprimerAvecAnnulation(id);
}

/** Supprime une opération avec un bouton « Annuler » pendant 5 secondes */
export async function supprimerAvecAnnulation(id) {
  const op = await supprimerOperation(id);
  signalerChangement();
  toast('Opération supprimée', {
    action: 'Annuler',
    duree: 5000,
    surAction: async () => { await restaurerOperation(op); signalerChangement(); },
  });
}
