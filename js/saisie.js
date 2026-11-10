// Panneau de saisie express (nouvelle opération) et d'édition (opération existante).

import { db } from './db.js';
import { euros, aujourdhui } from './format.js';
import { periodeContenant } from './dates.js';
import { franchissement, depensesParCategorie, resteADepenser, franchissementReste, SEUILS_RESTE } from './calculs.js';
import { ouvrirPanneau, fermerPanneau, toast, esc, pastille, icones } from './ui.js';
import {
  enregistrerOperation, supprimerOperation, restaurerOperation, compterUtilisation,
  signalerChangement, libelleOperation,
} from './operations.js';
import { ouvrirFiche } from './ecrans/fiche-categorie.js';
import { chargerPoches } from './poches.js';

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
    poche_id: operation?.poche_id ?? null,
    poches: await chargerPoches(),
    date: operation?.date ?? aujourdhui(),
    note: operation?.note ?? '',
    compte: operation?.compte ?? '',
    recurrent: operation?.recurrent_id != null ? await db.lire('recurrents', operation.recurrent_id) : null,
    majDefaut: false,
    rapide: !operation && !!(await db.parametre('saisie_rapide', false)),   // mode « un appui sur la catégorie = enregistré »
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
  // Remboursement : les catégories de charges fixes (Santé, Assurances…) sont proposées aussi,
  // à la suite des catégories du quotidien
  if (s.type === 'remboursement') {
    return s.categories.filter(c => c.type === 'sortie')
      .sort((a, b) => (a.masquee ? 1 : 0) - (b.masquee ? 1 : 0) || (b.utilisations || 0) - (a.utilisations || 0) || a.ordre - b.ordre);
  }
  let liste = s.categories.filter(c => c.type === typeCat && !c.masquee);
  // En édition, la catégorie actuelle reste visible même si elle est masquée (ex. technique)
  const actuelle = s.categories.find(c => c.id === s.categorie_id);
  if (actuelle && actuelle.type === typeCat && !liste.includes(actuelle)) liste.push(actuelle);
  return liste.sort((a, b) => (b.utilisations || 0) - (a.utilisations || 0) || a.ordre - b.ordre);
}

function dessiner() {
  const el = document.getElementById('saisie');
  const TYPES = [['sortie', 'Sortie'], ['entree', 'Entrée'], ['remboursement', 'Rembours.'], ['virement', 'Virement']];
  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'eff'];

  el.innerHTML = `
    <div class="saisie-entete">
      <h2 class="titre-panneau">${s.edition ? 'Modifier l\'opération' : 'Nouvelle opération'}</h2>
      <button type="button" class="btn-icone" id="s-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>

    <div class="segment seg-types" role="group" aria-label="Type d'opération">
      ${TYPES.map(([v, l]) => `<button type="button" data-type="${v}" aria-pressed="${s.type === v}"${v === 'remboursement' ? ' aria-label="Remboursement"' : ''}>${l}</button>`).join('')}
    </div>
    ${s.type === 'remboursement' ? `
      <p class="muet petit centre aide-type">Argent qui revient sur une dépense (mutuelle, article rendu…) :
        il est déduit de la catégorie choisie.</p>` : ''}

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
      </div>
      ${s.poches.length ? `
      <div class="grille-cat" role="group" aria-label="Poche d'épargne">
        ${s.poches.map(p => `
          <button type="button" class="cat-btn" data-poche="${p.id}" aria-pressed="${p.id === s.poche_id}">
            ${pastille(p)}<span>${esc(p.nom)}</span>
          </button>`).join('')}
      </div>` : ''}` : `
      <div class="grille-cat" role="group" aria-label="Catégorie">
        ${categoriesAffichees().map(c => `
          <button type="button" class="cat-btn" data-cat="${c.id}" aria-pressed="${c.id === s.categorie_id}">
            ${pastille(c)}<span>${esc(c.nom).replace(/\//g, '/&#8203;')}</span>
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

    ${s.rapide && s.type !== 'virement' ? `
      <p class="muet petit centre">Saisie rapide : une note ou une date se remplit <strong>avant</strong> de toucher la catégorie.</p>` : `
      <div class="barre-enregistrer">
        <button type="button" class="btn btn-principal" id="s-enregistrer">Enregistrer</button>
      </div>`}
    ${lienFiche()}
    ${s.edition ? `<button type="button" class="btn btn-danger" id="s-supprimer">Supprimer</button>` : ''}
  `;
  icones();
  brancher(el);
}

// En modification : lien vers la fiche de la catégorie d'origine (ex. « Tout voir pour Padel »)
function catOrigine() {
  const o = s.original;
  if (!s.edition || !o || o.type === 'virement' || o.categorie_id == null) return null;
  return s.categories.find(c => c.id === o.categorie_id) || null;
}
function lienFiche() {
  const c = catOrigine();
  return c ? `<button type="button" class="btn btn-leger" id="s-fiche"><i data-lucide="chart-column"></i>Tout voir pour ${esc(c.nom)}</button>` : '';
}

function brancher(el) {
  el.querySelector('#s-fermer').onclick = fermer;
  el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    lireOptions();
    if (s.type !== b.dataset.type) {
      // Sortie → remboursement : mêmes catégories, on garde celle qui est choisie
      const garder = s.type === 'sortie' && b.dataset.type === 'remboursement';
      s.type = b.dataset.type;
      if (!garder) s.categorie_id = null;
    }
    dessiner();
  });
  el.querySelectorAll('[data-touche]').forEach(b => b.onclick = () => touche(b.dataset.touche));
  el.querySelectorAll('[data-sens]').forEach(b => b.onclick = () => {
    s.sens = b.dataset.sens;
    el.querySelectorAll('[data-sens]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  el.querySelectorAll('[data-poche]').forEach(b => b.onclick = () => {
    s.poche_id = Number(b.dataset.poche);
    el.querySelectorAll('[data-poche]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    s.categorie_id = Number(b.dataset.cat);
    if (s.rapide) {
      valider();                                   // saisie rapide : un appui = enregistré
    } else {
      el.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', x === b));
    }
  });
  el.querySelector('.options').addEventListener('toggle', e => { s.optionsOuvertes = e.target.open; });
  el.querySelector('#s-enregistrer')?.addEventListener('click', valider);
  el.querySelector('#s-maj')?.addEventListener('change', e => { s.majDefaut = e.target.checked; });
  el.querySelector('#s-supprimer')?.addEventListener('click', supprimer);
  el.querySelector('#s-fiche')?.addEventListener('click', () => {
    const o = s.original;
    fermer();
    ouvrirFiche(o.categorie_id, { date: o.date });
  });
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
  if (s.type === 'virement' && s.poches.length && !s.poches.some(p => p.id === s.poche_id)) { toast('Choisis une poche d\'épargne'); return; }

  const op = {
    ...(s.original || {}),
    type: s.type,
    sens_virement: s.sens,
    montant_centimes: montant,
    categorie_id: s.categorie_id,
    poche_id: s.poche_id,
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
  const compte = !edition && op.type !== 'remboursement';   // un remboursement ne change pas l'ordre des catégories
  if (compte) await compterUtilisation(op.categorie_id, 1);
  fermer();
  signalerChangement();

  // Alerte de budget (80 % puis 100 %) pour une nouvelle sortie
  let alerte = null;
  if (!edition && op.type === 'sortie' && op.categorie_id != null) {
    alerte = await alerteBudget(op, cat);
    const bas = await alerteReste(op);
    if (bas) alerte = alerte ? { ton: 'danger', texte: `${alerte.texte}\n${bas.texte}` } : bas;
  }

  if (edition) {
    toast(s_majFaite ? 'Opération et montant par défaut modifiés' : 'Opération modifiée');
  } else {
    toast(`${libelleOperation(op, cat)} · ${euros(montant)}${alerte ? '\n' + alerte.texte : ''}`, {
      action: 'Annuler',
      duree: alerte ? 6500 : 5000,
      ton: alerte ? alerte.ton : null,
      surAction: async () => {
        await supprimerOperation(id);
        if (compte) await compterUtilisation(op.categorie_id, -1);
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

/** Vérifie si la nouvelle dépense fait franchir 80 % ou 100 % du budget de sa catégorie */
async function alerteBudget(op, cat) {
  const budget = (await db.tous('budgets')).find(b => b.categorie_id === op.categorie_id);
  if (!budget) return null;
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(op.date, jourDebut);
  const ops = await db.operationsEntre(per.debut, per.fin);
  const apres = depensesParCategorie(ops, per)[op.categorie_id] || 0;
  const avant = apres - op.montant_centimes;
  const max = budget.montant_mensuel_centimes;
  const seuil = franchissement(avant, apres, max);
  const nom = cat ? cat.nom : 'cette catégorie';
  if (seuil === 100) {
    return apres > max
      ? { ton: 'danger', texte: `Budget ${nom} dépassé : ${euros(apres)} sur ${euros(max)}` }
      : { ton: 'danger', texte: `Budget ${nom} atteint : ${euros(apres)} sur ${euros(max)}` };
  }
  if (seuil === 80) {
    return { ton: 'alerte', texte: `Attention : ${Math.round(apres * 100 / max)} % du budget ${nom} (${euros(apres)} sur ${euros(max)})` };
  }
  return null;
}

/** Vérifie si la nouvelle dépense fait passer le reste à dépenser sous le seuil orange ou rouge (réglables) */
async function alerteReste(op) {
  const auj = aujourdhui();
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(auj, jourDebut);
  if (op.date < per.debut || op.date > per.fin) return null;
  const seuils = { orange: await db.parametre('seuil_orange', SEUILS_RESTE.orange), rouge: await db.parametre('seuil_rouge', SEUILS_RESTE.rouge) };
  const calc = resteADepenser(await db.tous('operations'), await db.tous('recurrents'), auj, per);
  if (!(calc.entrees > 0)) return null;
  const seuil = franchissementReste(calc.reste + op.montant_centimes, calc.reste, seuils);
  if (!seuil) return null;
  return seuil === 'rouge'
    ? { ton: 'danger', texte: `Reste à dépenser : ${euros(calc.reste)} (sous ${euros(seuils.rouge)})` }
    : { ton: 'alerte', texte: `Reste à dépenser : ${euros(calc.reste)} (sous ${euros(seuils.orange)})` };
}
