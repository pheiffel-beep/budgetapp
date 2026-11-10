// Écran Historique : liste du mois groupée par jour, filtres, recherche dans les notes.

import { db } from '../db.js';
import { euros, aujourdhui } from '../format.js';
import { esc, icones } from '../ui.js';
import { periodeContenant, decalerPeriode, libellePeriode, libelleJour } from '../dates.js';
import { categoriesParId, triRecent, montantSigne } from '../operations.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';

// Gardés entre deux visites de l'onglet
let periode = null;
let jourDebutCache = null;
const filtres = { type: 'tous', categorie: '', compte: '', recherche: '' };

export async function afficher(el) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  if (!periode || jourDebutCache !== jourDebut) { periode = periodeContenant(aujourdhui(), jourDebut); jourDebutCache = jourDebut; }
  const cats = await categoriesParId();
  const comptes = await db.parametre('comptes', []);
  const listeCats = Object.values(cats).sort((a, b) => b.type.localeCompare(a.type) || a.ordre - b.ordre);

  el.innerHTML = `
    <h1>Historique</h1>

    <div class="nav-mois">
      <button type="button" class="btn-icone" id="h-prec" aria-label="Mois précédent"><i data-lucide="chevron-left"></i></button>
      <strong>${libellePeriode(periode, jourDebut)}</strong>
      <button type="button" class="btn-icone" id="h-suiv" aria-label="Mois suivant"><i data-lucide="chevron-right"></i></button>
    </div>

    <div class="filtres">
      <div class="segment petit-seg" role="group" aria-label="Type">
        ${[['tous', 'Tout'], ['sortie', 'Sorties'], ['entree', 'Entrées'], ['virement', 'Virements']]
          .map(([v, l]) => `<button type="button" data-f-type="${v}" aria-pressed="${filtres.type === v}">${l}</button>`).join('')}
      </div>
      <div class="filtres-ligne">
        <select id="h-cat" aria-label="Filtrer par catégorie">
          <option value="">Toutes catégories</option>
          ${listeCats.map(c => `<option value="${c.id}" ${String(c.id) === filtres.categorie ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}
        </select>
        <select id="h-compte" aria-label="Filtrer par compte">
          <option value="">Tous comptes</option>
          ${comptes.map(c => `<option ${c === filtres.compte ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <input type="search" id="h-recherche" placeholder="Rechercher dans les notes" value="${esc(filtres.recherche)}" aria-label="Rechercher dans les notes" autocomplete="off">
    </div>

    <div id="h-resume" class="resume"></div>
    <div id="h-liste"></div>`;

  el.querySelector('#h-prec').onclick = () => { periode = decalerPeriode(periode, -1, jourDebut); afficher(el).then(icones); };
  el.querySelector('#h-suiv').onclick = () => { periode = decalerPeriode(periode, 1, jourDebut); afficher(el).then(icones); };
  el.querySelectorAll('[data-f-type]').forEach(b => b.onclick = () => {
    filtres.type = b.dataset.fType;
    el.querySelectorAll('[data-f-type]').forEach(x => x.setAttribute('aria-pressed', x === b));
    dessinerListe(el, cats);
  });
  el.querySelector('#h-cat').onchange = e => { filtres.categorie = e.target.value; dessinerListe(el, cats); };
  el.querySelector('#h-compte').onchange = e => { filtres.compte = e.target.value; dessinerListe(el, cats); };
  el.querySelector('#h-recherche').oninput = e => { filtres.recherche = e.target.value; dessinerListe(el, cats); };

  await dessinerListe(el, cats);
}

async function dessinerListe(el, cats) {
  const toutes = await db.operationsEntre(periode.debut, periode.fin);
  const q = filtres.recherche.trim().toLowerCase();
  const ops = toutes.filter(o =>
    (filtres.type === 'tous' || o.type === filtres.type || (filtres.type === 'sortie' && o.type === 'remboursement')) &&
    (!filtres.categorie || String(o.categorie_id) === filtres.categorie) &&
    (!filtres.compte || o.compte === filtres.compte) &&
    (!q || (o.note || '').toLowerCase().includes(q))
  ).sort(triRecent);

  // Résumé du mois (sur les opérations filtrées)
  const somme = t => ops.filter(o => o.type === t).reduce((s, o) => s + o.montant_centimes, 0);
  const versEp = ops.filter(o => o.type === 'virement' && o.sens_virement !== 'depuis_epargne').reduce((s, o) => s + o.montant_centimes, 0);
  const depuisEp = ops.filter(o => o.type === 'virement' && o.sens_virement === 'depuis_epargne').reduce((s, o) => s + o.montant_centimes, 0);
  const netEp = versEp - depuisEp;
  const virements = ops.some(o => o.type === 'virement');
  el.querySelector('#h-resume').innerHTML = ops.length ? `
    <span>Entrées <strong class="pos">+${euros(somme('entree'))}</strong></span>
    <span>Sorties <strong>${euros(-somme('sortie'))}</strong></span>
    ${somme('remboursement') ? `<span>Remboursé <strong class="pos">+${euros(somme('remboursement'))}</strong></span>` : ''}
    ${virements ? `<span>Épargne <strong>${netEp > 0 ? '+' : ''}${euros(netEp)}</strong></span>` : ''}` : '';

  const zone = el.querySelector('#h-liste');
  if (!ops.length) {
    zone.innerHTML = `<div class="vide"><i data-lucide="list"></i>
      <p>${toutes.length ? 'Aucune opération ne correspond aux filtres.' : 'Aucune opération ce mois-ci.'}</p></div>`;
    icones();
    return;
  }

  // Regroupement par jour
  const jours = [];
  for (const o of ops) {
    const dernier = jours.at(-1);
    if (dernier && dernier.date === o.date) dernier.ops.push(o);
    else jours.push({ date: o.date, ops: [o] });
  }

  zone.innerHTML = jours.map(j => {
    const total = j.ops.filter(o => o.type !== 'virement').reduce((s, o) => s + montantSigne(o), 0);
    return `
      <section class="jour">
        <h3 class="jour-titre"><span>${libelleJour(j.date)}</span><span class="muet">${total > 0 ? '+' : ''}${euros(total)}</span></h3>
        <ul class="liste liste-ops">${j.ops.map(o => htmlLigne(o, cats[o.categorie_id])).join('')}</ul>
      </section>`;
  }).join('');

  icones();
  zone.querySelectorAll('.liste-ops').forEach(ul => activerGestes(ul, ops));
}
