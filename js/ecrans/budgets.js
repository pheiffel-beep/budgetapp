// Écran Budgets : un montant mensuel facultatif par catégorie, barre de progression, alertes à 80 % et 100 %.

import { db } from '../db.js';
import { euros, versCentimes, aujourdhui } from '../format.js';
import { esc, pastille, ouvrirPanneau, fermerPanneau, toast, icones } from '../ui.js';
import { periodeContenant, libelleDates } from '../dates.js';
import { depensesParCategorie, statutBudget } from '../calculs.js';
import { budgetsParCategorie, definirBudget, htmlBarre } from '../budgets.js';
import { signalerChangement } from '../operations.js';

export async function afficher(el) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(aujourdhui(), jourDebut);
  const cats = (await db.tous('categories')).filter(c => c.type === 'sortie').sort((a, b) => a.ordre - b.ordre);
  const budgets = await budgetsParCategorie();
  const ops = await db.operationsEntre(per.debut, per.fin);
  const depenses = depensesParCategorie(ops, per);

  const ligne = c => {
    const budget = budgets[c.id];
    const dep = depenses[c.id] || 0;
    if (!budget) {
      return `<li class="ligne-btn"><button type="button" data-cat="${c.id}">
        ${pastille(c)}
        <span class="op-texte"><span class="op-titre">${esc(c.nom)}</span>
          <span class="op-sous">Pas de budget · dépensé ${euros(dep)}</span></span>
        <i data-lucide="plus" class="ligne-val muet"></i></button></li>`;
    }
    const st = statutBudget(dep, budget);
    return `<li class="ligne-btn ligne-budget"><button type="button" data-cat="${c.id}">
      ${pastille(c)}
      <span class="op-texte">
        <span class="op-titre">${esc(c.nom)}</span>
        ${htmlBarre(dep, budget, st, esc(c.nom))}
        <span class="op-sous">${euros(dep)} sur ${euros(budget)}</span>
      </span>
      <span class="pct ${st.couleur}">${Math.round(st.ratio * 100)} %</span></button></li>`;
  };

  const quotidien = cats.filter(c => !c.technique);
  const fixes = cats.filter(c => c.technique);
  el.innerHTML = `
    <h1>Budgets</h1>
    <p class="muet">${libelleDates(per)}</p>
    <p class="muet petit">Un montant par mois et par catégorie, facultatif. Tu seras prévenu à 80 % puis à 100 %.
      Les charges fixes comptent aussi dans leur catégorie.</p>

    <h2>Dépenses du quotidien</h2>
    <section class="carte carte-liste"><ul class="liste">${quotidien.map(ligne).join('')}</ul></section>

    <h2>Charges fixes</h2>
    <section class="carte carte-liste"><ul class="liste">${fixes.map(ligne).join('')}</ul></section>`;

  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    const cat = cats.find(c => c.id === Number(b.dataset.cat));
    editer(cat, budgets[cat.id] || 0, depenses[cat.id] || 0);
  });
}

function editer(cat, actuel, depense) {
  ouvrirPanneau(`
    <div class="saisie-entete">
      <h2 class="titre-panneau">Budget · ${esc(cat.nom)}</h2>
      <button type="button" class="btn-icone" id="b-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>
    <p class="muet petit">Déjà dépensé sur cette période : ${euros(depense)}</p>
    <label class="champ">Montant par mois (€)
      <input type="text" id="b-montant" inputmode="decimal" autocomplete="off" placeholder="ex. 400"
        value="${actuel ? euros(actuel).replace(/\s?€$/, '').replace(/ /g, '') : ''}"></label>
    <div class="pile">
      <button type="button" class="btn btn-principal" id="b-ok">Enregistrer</button>
      ${actuel ? '<button type="button" class="btn btn-danger" id="b-suppr">Supprimer ce budget</button>' : ''}
    </div>`);
  const $ = id => document.getElementById(id);
  $('b-fermer').onclick = fermerPanneau;
  $('b-ok').onclick = async () => {
    const txt = $('b-montant').value.trim();
    const montant = txt === '' ? 0 : versCentimes(txt);
    if (montant == null) { toast('Montant invalide (ex. 400 ou 400,50)'); return; }
    await definirBudget(cat.id, montant);
    fermerPanneau(); signalerChangement();
    toast(montant ? 'Budget enregistré' : 'Budget supprimé');
  };
  $('b-suppr')?.addEventListener('click', async () => {
    await definirBudget(cat.id, 0);
    fermerPanneau(); signalerChangement(); toast('Budget supprimé');
  });
}
