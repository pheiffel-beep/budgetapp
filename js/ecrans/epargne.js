// Écran « Épargne » : ce qui a réellement bougé sur l'épargne, mois par mois et année par année.
// Épargne du mois = virements vers l'épargne − virements depuis l'épargne.
// On y arrive en touchant la ligne « Épargne du mois » de l'accueil.

import { db } from '../db.js';
import { euros, aujourdhui } from '../format.js';
import { esc, icones } from '../ui.js';
import { periodeContenant, periodeDuMois, libellePeriode } from '../dates.js';
import { triRecent } from '../operations.js';
import { epargneNette } from '../calculs.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

let etat = { annee: null, mois: null, retour: 'accueil' };

export async function ouvrirEpargne({ date = null, retour = 'accueil' } = {}) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(date || aujourdhui(), jourDebut);
  etat = { annee: per.annee, mois: per.mois, retour };
  window.dispatchEvent(new CustomEvent('naviguer', { detail: 'epargne' }));
}

/** Montant signé : « +310 € », « -50 € » */
const signe = c => `${c > 0 ? '+' : ''}${euros(c)}`;

export async function afficher(el) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const courante = periodeContenant(aujourdhui(), jourDebut);
  const ops = await db.tous('operations');
  const virements = ops.filter(o => o.type === 'virement');
  const premiereDate = ops.reduce((m, o) => (!m || o.date < m ? o.date : m), null);
  const premiere = premiereDate ? periodeContenant(premiereDate, jourDebut) : courante;

  const anneeMin = Math.min(premiere.annee, etat.annee);
  const anneeMax = Math.max(courante.annee, etat.annee);

  const parMois = Array.from({ length: 12 }, (_, i) => {
    const p = periodeDuMois(etat.annee, i + 1, jourDebut);
    const e = epargneNette(virements, p);
    return { p, ...e, futur: p.debut > courante.debut, avantDebut: p.debut < premiere.debut };
  });
  const totalAnnee = parMois.reduce((s, m) => s + m.net, 0);
  const moisComptes = parMois.filter(m => !m.futur && !m.avantDebut).length;
  const moyenne = moisComptes ? Math.round(totalAnnee / moisComptes) : 0;
  const max = Math.max(1, ...parMois.map(m => Math.abs(m.net)));

  const choisi = parMois[etat.mois - 1];
  const liste = virements.filter(o => o.date >= choisi.p.debut && o.date <= choisi.p.fin).sort(triRecent);

  const annees = [];
  for (let a = anneeMax; a >= anneeMin; a--) {
    const p = { debut: periodeDuMois(a, 1, jourDebut).debut, fin: periodeDuMois(a, 12, jourDebut).fin };
    annees.push({ a, net: epargneNette(virements, p).net });
  }

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="e-retour" aria-label="Retour"><i data-lucide="chevron-left"></i></button>
      <h1>Épargne</h1>
    </div>

    <div class="nav-mois">
      <button type="button" class="btn-icone" id="e-prec" aria-label="Année précédente" ${etat.annee <= anneeMin ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button>
      <strong>${etat.annee}</strong>
      <button type="button" class="btn-icone" id="e-suiv" aria-label="Année suivante" ${etat.annee >= anneeMax ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
    </div>

    <section class="carte reste">
      <div class="muet">Épargne en ${etat.annee}</div>
      <div class="montant ${totalAnnee < 0 ? 'negatif' : ''}">${signe(totalAnnee)}</div>
      <div class="muet petit">${moisComptes
        ? `Moyenne : ${signe(moyenne)} par mois (sur ${moisComptes} mois)`
        : 'Pas encore de mois écoulé cette année.'}</div>
      <div class="muet petit">Mis de côté moins retiré, virements déjà faits</div>
    </section>

    <section class="carte">
      <div class="graphe" role="group" aria-label="Épargne mois par mois en ${etat.annee}">
        ${parMois.map((m, i) => `
          <button type="button" class="graphe-col${i + 1 === etat.mois ? ' choisi' : ''}${m.futur ? ' futur' : ''}" data-mois="${i + 1}"
              aria-pressed="${i + 1 === etat.mois}" aria-label="${libellePeriode(m.p, jourDebut)} : ${signe(m.net)}">
            <span class="graphe-valeur">${m.net ? signe(m.net).replace(/,00\s?€$/, ' €') : ''}</span>
            <span class="graphe-piste"><span class="graphe-barre${m.net < 0 ? ' negative' : ''}" style="height:${m.net ? Math.max(4, Math.round(Math.abs(m.net) * 100 / max)) : 0}%;background:${m.net < 0 ? 'var(--rouge)' : 'var(--vert)'}"></span></span>
            <span class="graphe-mois">${MOIS_COURTS[i]}</span>
          </button>`).join('')}
      </div>
    </section>

    <h2>${libellePeriode(choisi.p, jourDebut)} <span class="muet">· ${signe(choisi.net)}</span></h2>
    ${liste.length ? `
      <p class="muet petit">Mis de côté : ${euros(choisi.vers)}${choisi.depuis ? ` · Retiré : ${euros(choisi.depuis)}` : ''}</p>
      <section class="carte carte-liste"><ul class="liste liste-ops" id="e-liste">${liste.map(o => htmlLigne(o, null, { avecDate: true })).join('')}</ul></section>`
      : `<div class="vide"><i data-lucide="piggy-bank"></i><p>${choisi.futur ? 'Ce mois n\'est pas encore arrivé.' : 'Aucun virement d\'épargne ce mois-là.'}</p></div>`}

    <h2>Année par année</h2>
    <section class="carte">
      <ul class="liste">
        ${annees.map(({ a, net }) => `
          <li class="ligne-btn"><button type="button" data-annee="${a}" ${a === etat.annee ? 'aria-current="true"' : ''}>
            <span class="op-titre">${a}</span>
            <strong class="annee-total">${signe(net)}</strong>
            <i data-lucide="chevron-right"></i>
          </button></li>`).join('')}
      </ul>
    </section>`;

  el.querySelector('#e-retour').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: etat.retour || 'accueil' }));
  el.querySelector('#e-prec').onclick = () => changerAnnee(el, -1, courante);
  el.querySelector('#e-suiv').onclick = () => changerAnnee(el, 1, courante);
  el.querySelectorAll('[data-mois]').forEach(b => b.onclick = async () => {
    etat.mois = Number(b.dataset.mois);
    await afficher(el); icones();
  });
  el.querySelectorAll('[data-annee]').forEach(b => b.onclick = async () => {
    etat.annee = Number(b.dataset.annee);
    etat.mois = etat.annee === courante.annee ? courante.mois : 12;
    await afficher(el); icones();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const ul = el.querySelector('#e-liste');
  if (ul) activerGestes(ul, liste);
}

async function changerAnnee(el, n, courante) {
  etat.annee += n;
  etat.mois = etat.annee === courante.annee ? courante.mois : (n < 0 ? 12 : 1);
  await afficher(el); icones();
}

/** Onglet du bas qui reste allumé */
export const ongletParent = () => (etat.retour === 'historique' ? 'historique' : 'accueil');
