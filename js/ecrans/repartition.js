// Écran « Où part mon argent ? » : dépenses de la période par catégorie,
// avec comparaison à la période précédente (à la même date si la période est en cours).
// Les virements ne sont pas des dépenses : ils n'apparaissent pas ici.

import { db } from '../db.js';
import { euros, aujourdhui, jjmm } from '../format.js';
import { esc, icones } from '../ui.js';
import { periodeContenant, decalerPeriode, libelleDates } from '../dates.js';
import { ouvrirFiche } from './fiche-categorie.js';
import { depensesParCategorie, coupurePrecedente, comparerCategories, sommeDepenses } from '../calculs.js';

let periode = null;
let jourDebutCache = null;

const signe = n => `${n > 0 ? '+' : n < 0 ? '-' : ''}${euros(Math.abs(n))}`;
const classeEcart = n => (n > 0 ? 'hausse' : n < 0 ? 'baisse' : 'neutre');

export async function afficher(el) {
  const auj = aujourdhui();
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const courante = periodeContenant(auj, jourDebut);
  if (!periode || jourDebutCache !== jourDebut) { periode = courante; jourDebutCache = jourDebut; }

  const prec = decalerPeriode(periode, -1, jourDebut);
  const enCours = auj >= periode.debut && auj <= periode.fin;
  const coupure = coupurePrecedente(periode, prec, auj);
  const ops = await db.operationsEntre(prec.debut, periode.fin);
  const cats = Object.fromEntries((await db.tous('categories')).map(c => [String(c.id), c]));

  const cur = depensesParCategorie(ops, periode);
  const avant = depensesParCategorie(ops, { debut: prec.debut, fin: coupure });
  const total = sommeDepenses(cur);
  const totalAvant = sommeDepenses(avant);
  const lignes = comparerCategories(cur, avant);
  const max = Math.max(1, ...lignes.map(l => l.montant));

  const ligne = l => {
    const cat = cats[l.id] || { nom: 'Sans catégorie', icone: 'circle-help', couleur: '#8c95a6' };
    const part = total ? Math.round(l.montant * 100 / total) : 0;
    const compar = totalAvant || l.prec
      ? `<span class="ecart ${classeEcart(l.ecart)}">${l.ecart === 0 ? 'inchangé' : signe(l.ecart)}</span>` : '';
    return `<li class="rep-ligne-li"><button type="button" class="rep-ligne" data-fiche="${esc(l.id)}" aria-label="${esc(cat.nom)} : ${euros(l.montant)}. Toucher pour voir le détail.">
      <span class="pastille" style="background:${esc(cat.couleur)}" aria-hidden="true"><i data-lucide="${esc(cat.icone)}"></i></span>
      <span class="rep-corps">
        <span class="rep-titre"><span class="op-titre">${esc(cat.nom)}</span><strong>${euros(l.montant)}</strong></span>
        <span class="barre" role="img" aria-label="${esc(cat.nom)} : ${part} % des dépenses">
          <span class="barre-remplie" style="width:${Math.max(2, l.montant * 100 / max)}%;background:${esc(cat.couleur)}"></span></span>
        <span class="rep-sous"><span class="op-sous">${part} % du total</span>${compar}</span>
      </span><i data-lucide="chevron-right" class="rep-chevron" aria-hidden="true"></i></button></li>`;
  };

  const groupe = (titre, liste) => {
    const visibles = liste.filter(l => l.montant > 0);
    if (!visibles.length) return '';
    const sous = visibles.reduce((s, l) => s + l.montant, 0);
    return `<h2>${titre} <span class="muet">· ${euros(sous)}</span></h2>
      <section class="carte"><ul class="liste">${visibles.map(ligne).join('')}</ul></section>`;
  };
  const technique = l => !!(cats[l.id] && cats[l.id].technique);

  const ecartTotal = total - totalAvant;
  const pct = totalAvant ? Math.round(Math.abs(ecartTotal) * 100 / totalAvant) : null;

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="r-retour" aria-label="Retour à l'accueil"><i data-lucide="chevron-left"></i></button>
      <h1>Où part mon argent ?</h1>
    </div>

    <div class="nav-mois">
      <button type="button" class="btn-icone" id="r-prec" aria-label="Période précédente"><i data-lucide="chevron-left"></i></button>
      <strong>${libelleDates(periode)}</strong>
      <button type="button" class="btn-icone" id="r-suiv" aria-label="Période suivante" ${periode.debut >= courante.debut ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
    </div>

    <section class="carte reste">
      <div class="muet">Dépensé sur la période</div>
      <div class="montant">${euros(total)}</div>
      ${totalAvant ? `
        <div class="${ecartTotal > 0 ? 'hausse' : ecartTotal < 0 ? 'baisse' : 'muet'}">
          ${ecartTotal === 0 ? 'Identique' : `${signe(ecartTotal)} (${ecartTotal > 0 ? '+' : '-'}${pct} %)`}
          <span class="muet">vs ${enCours ? `la période précédente au ${jjmm(coupure)}` : 'la période précédente'}</span>
        </div>
        <div class="muet petit">Période précédente : ${euros(totalAvant)}${enCours ? ` (au ${jjmm(coupure)})` : ''}</div>`
        : '<div class="muet petit">Pas de dépenses sur la période précédente pour comparer.</div>'}
    </section>

    ${total ? `
      ${groupe('Dépenses du quotidien', lignes.filter(l => !technique(l)))}
      ${groupe('Charges fixes', lignes.filter(technique))}`
      : '<div class="vide"><i data-lucide="chart-pie"></i><p>Aucune dépense sur cette période.</p></div>'}`;

  el.querySelector('#r-retour').onclick = () => window.dispatchEvent(new CustomEvent('naviguer', { detail: 'accueil' }));
  el.querySelectorAll('[data-fiche]').forEach(b => b.onclick = () => {
    const id = Number(b.dataset.fiche);
    if (cats[String(id)]) ouvrirFiche(id, { date: periode.debut, retour: 'repartition' });
  });
  el.querySelector('#r-prec').onclick = async () => { periode = prec; await afficher(el); icones(); };
  el.querySelector('#r-suiv').onclick = async () => { periode = decalerPeriode(periode, 1, jourDebut); await afficher(el); icones(); };
}
