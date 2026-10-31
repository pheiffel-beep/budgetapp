// Écran Accueil : « Combien me reste-t-il ce mois-ci ? »
// Reste à dépenser, budgets proches de la limite, prochaines échéances, dernières opérations.

import { db } from '../db.js';
import { euros, eurosArrondis, aujourdhui, jjmm } from '../format.js';
import { esc, pastille, icones } from '../ui.js';
import { periodeContenant, libelleDates } from '../dates.js';
import { categoriesParId, triRecent } from '../operations.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';
import { rappelNecessaire, reporterRappel } from '../sauvegarde.js';
import { resteADepenser, depensesParCategorie, statutBudget, prochainesEcheances, joursSansSaisie } from '../calculs.js';
import { budgetsParCategorie, htmlBarre } from '../budgets.js';
import { ouvrirRecalage } from '../recalage.js';
import { ouvrirSaisie } from '../saisie.js';

const JOURS_RAPPEL_SAISIE = 3;
const redessiner = el => afficher(el).then(icones);

export async function afficher(el) {
  const auj = aujourdhui();
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(auj, jourDebut);
  const cats = await categoriesParId();
  const toutes = await db.tous('operations');
  const recs = await db.tous('recurrents');
  const budgets = await budgetsParCategorie();
  const rappel = await rappelNecessaire();
  const ref = await db.parametre('recalage_ref', null);
  const sansSaisie = joursSansSaisie(toutes, auj,
    await db.parametre('date_premiere_utilisation', null), await db.parametre('saisie_confirmee', null));

  const calc = resteADepenser(toutes, recs, auj, per);
  const dernieres = [...toutes].sort(triRecent).slice(0, 5);
  const depenses = depensesParCategorie(toutes, per);
  const proches = Object.entries(budgets)
    .map(([id, budget]) => ({ cat: cats[id], budget, dep: depenses[id] || 0 }))
    .filter(x => x.cat)
    .map(x => ({ ...x, st: statutBudget(x.dep, x.budget) }))
    .sort((a, b) => b.st.ratio - a.st.ratio)
    .slice(0, 3);
  const echeances = prochainesEcheances(recs, auj, 31, 5);

  const negatif = calc.reste < 0;
  const epargne = calc.vers + calc.depuis > 0;
  const v = calc.aVenir;

  el.innerHTML = `
    <h1>Accueil</h1>

    ${sansSaisie >= JOURS_RAPPEL_SAISIE ? `
    <section class="carte bandeau-saisie" role="status">
      <i data-lucide="notebook-pen"></i>
      <div>
        <strong>Rien encodé depuis ${sansSaisie} jours</strong>
        <p class="muet petit">Des dépenses à noter ? Courses, essence, un café…</p>
        <div class="rappel-actions">
          <button type="button" class="btn btn-principal" id="a-noter">Ajouter</button>
          <button type="button" class="btn" id="a-rien">Rien à noter</button>
        </div>
      </div>
    </section>` : ''}

    ${rappel ? `
    <section class="carte bandeau-rappel" role="alert">
      <i data-lucide="save"></i>
      <div>
        <strong>${rappel.jamais ? 'Pense à faire une première sauvegarde' : 'Il est temps de sauvegarder'}</strong>
        <p class="muet petit">${rappel.jamais
          ? 'Tes données ne sont que sur ce téléphone.'
          : `Dernière sauvegarde il y a ${rappel.jours} jours.`}</p>
        <div class="rappel-actions">
          <button type="button" class="btn btn-principal" id="a-sauver">Sauvegarder</button>
          <button type="button" class="btn" id="a-reporter">Dans 3 jours</button>
        </div>
      </div>
    </section>` : ''}

    <section class="carte reste" aria-label="Reste à dépenser">
      <div class="muet">Reste à dépenser</div>
      <div class="montant ${negatif ? 'negatif' : ''}">${euros(calc.reste)}</div>
      <div class="${negatif ? 'negatif' : 'muet'}">${negatif
        ? 'Tu as dépassé ce que tu avais ce mois-ci'
        : calc.reste === 0 ? (calc.entrees ? 'Il ne reste rien à dépenser' : '')
        : `soit ~${eurosArrondis(calc.parJour)}/jour jusqu'au ${jjmm(per.fin)}`}</div>
      <div class="muet petit">${libelleDates(per)}</div>
      ${epargne ? `<div class="muet petit">Épargne : ${euros(calc.vers)} mis de côté${calc.depuis ? `, ${euros(calc.depuis)} retiré` : ''}</div>` : ''}
      ${calc.entrees === 0 ? '<div class="muet petit">Aucun revenu encodé sur cette période : le calcul part de 0 €.</div>' : ''}

      <details class="calcul">
        <summary>Voir le calcul</summary>
        <ul class="liste">
          <li>Revenus reçus <span class="ligne-val pos">+${euros(calc.entrees)}</span></li>
          <li>Dépenses et charges déjà payées <span class="ligne-val">-${euros(calc.sorties)}</span></li>
          <li>Charges fixes encore à venir <span class="ligne-val">-${euros(v.charges)}</span></li>
          ${calc.vers + v.vers ? `<li>Virements vers épargne (passés et à venir) <span class="ligne-val">-${euros(calc.vers + v.vers)}</span></li>` : ''}
          ${calc.depuis + v.depuis ? `<li>Virements depuis épargne <span class="ligne-val pos">+${euros(calc.depuis + v.depuis)}</span></li>` : ''}
        </ul>
        <p class="muet petit">Les revenus pas encore reçus ne sont pas comptés.</p>
      </details>

      <button type="button" class="btn btn-leger" id="a-recaler"><i data-lucide="scale"></i>Recaler avec mon solde réel</button>
      ${ref ? `<div class="muet petit">Dernier recalage : ${jjmm(ref.date)}</div>` : ''}
    </section>

    <section class="carte carte-liste"><ul class="liste">
      <li class="ligne-btn"><button type="button" id="a-repartition">
        <i data-lucide="chart-pie"></i><span>Où part mon argent ?</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
    </ul></section>

    ${proches.length ? `
    <h2>Budgets</h2>
    <section class="carte carte-liste"><ul class="liste">
      ${proches.map(x => `<li class="ligne-budget"><span class="ligne-btn-faux">
        ${pastille(x.cat)}
        <span class="op-texte"><span class="op-titre">${esc(x.cat.nom)}</span>
          ${htmlBarre(x.dep, x.budget, x.st, esc(x.cat.nom))}
          <span class="op-sous">${euros(x.dep)} sur ${euros(x.budget)}</span></span>
        <span class="pct ${x.st.couleur}">${Math.round(x.st.ratio * 100)} %</span></span></li>`).join('')}
    </ul></section>` : ''}

    ${echeances.length ? `
    <h2>Prochaines échéances</h2>
    <section class="carte carte-liste"><ul class="liste">
      ${echeances.map(e => `<li><span class="op-texte"><span class="op-titre">${esc(e.libelle)}</span>
        <span class="op-sous">${jjmm(e.date)}${e.type === 'virement' ? ' · virement' : ''}</span></span>
        <span class="ligne-val ${e.type === 'entree' ? 'pos' : ''}">${e.type === 'entree' ? '+' : ''}${euros(e.montant)}</span></li>`).join('')}
    </ul></section>` : ''}

    <h2>Dernières opérations</h2>
    ${dernieres.length ? `
      <section class="carte carte-liste">
        <ul class="liste liste-ops" id="a-ops">
          ${dernieres.map(o => htmlLigne(o, cats[o.categorie_id], { avecDate: true })).join('')}
        </ul>
      </section>
      <button type="button" class="btn" id="a-tout">Voir tout l'historique</button>` : `
      <div class="vide"><i data-lucide="circle-plus"></i>
        <p>Rien d'encodé pour l'instant.<br>Touche le bouton « + » pour ajouter une dépense.</p></div>`}`;

  el.querySelector('#a-recaler').onclick = ouvrirRecalage;
  el.querySelector('#a-repartition').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'repartition' }));
  if (sansSaisie >= JOURS_RAPPEL_SAISIE) {
    el.querySelector('#a-noter').onclick = () => ouvrirSaisie();
    el.querySelector('#a-rien').onclick = async () => { await db.definirParametre('saisie_confirmee', auj); redessiner(el); };
  }

  if (rappel) {
    el.querySelector('#a-sauver').onclick = () =>
      window.dispatchEvent(new CustomEvent('naviguer', { detail: 'reglages' }));
    el.querySelector('#a-reporter').onclick = async () => { await reporterRappel(); redessiner(el); };
  }

  if (dernieres.length) {
    activerGestes(el.querySelector('#a-ops'), dernieres);
    el.querySelector('#a-tout').onclick = () =>
      window.dispatchEvent(new CustomEvent('naviguer', { detail: 'historique' }));
  }
}
