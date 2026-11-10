// Écran « fiche d'une catégorie » (ex. Padel) :
// total et moyenne, barres mois par mois, liste des opérations du mois choisi, totaux par année.
// On y arrive depuis une opération (fenêtre Modifier ou appui long) ou depuis « Où part mon argent ? ».

import { db } from '../db.js';
import { euros, aujourdhui } from '../format.js';
import { esc, pastille, icones } from '../ui.js';
import { periodeContenant, periodeDuMois, libellePeriode } from '../dates.js';
import { triRecent } from '../operations.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ECRAN_PARENT = { historique: 'historique', repartition: 'accueil', accueil: 'accueil', budgets: 'budgets' };

// État : catégorie affichée, année et mois choisis, écran de retour
let etat = { categorieId: null, annee: null, mois: null, retour: 'historique' };

/** Ouvre la fiche d'une catégorie. `date` : un jour du mois à montrer (par défaut aujourd'hui). */
export async function ouvrirFiche(categorieId, { date = null, retour = null } = {}) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(date || aujourdhui(), jourDebut);
  etat = { categorieId, annee: per.annee, mois: per.mois, retour: retour || ecranActuel() };
  window.dispatchEvent(new CustomEvent('naviguer', { detail: 'fiche' }));
}

// L'écran visible au moment où on ouvre la fiche (pour le bouton retour)
function ecranActuel() {
  const actif = document.querySelector('.onglets button[aria-current="page"]');
  const ecran = document.getElementById('ecran');
  if (ecran && ecran.querySelector('#r-retour')) return 'repartition';
  if (ecran && ecran.querySelector('#f-retour')) return etat.retour;
  return actif ? actif.dataset.onglet : 'historique';
}

/** Onglet du bas qui reste allumé */
export const ongletParent = () => ECRAN_PARENT[etat.retour] || 'historique';

/** Somme signée « dépense » (positive) d'une liste d'opérations de la catégorie */
// Un remboursement vient en déduction de sa catégorie
const somme = liste => liste.reduce((s, o) => s + (o.type === 'remboursement' ? -o.montant_centimes : o.montant_centimes), 0);

export async function afficher(el) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const auj = aujourdhui();
  const courante = periodeContenant(auj, jourDebut);
  const cat = await db.lire('categories', etat.categorieId);

  if (!cat) {
    el.innerHTML = `<div class="vide"><i data-lucide="circle-help"></i><p>Cette catégorie n'existe plus.</p>
      <button type="button" class="btn" id="f-retour">Retour</button></div>`;
    el.querySelector('#f-retour').onclick = retourner;
    return;
  }

  const type = cat.type === 'entree' ? 'entree' : 'sortie';
  const toutesOps = await db.tous('operations');
  const ops = toutesOps.filter(o => o.categorie_id === cat.id &&
    (o.type === type || (type === 'sortie' && o.type === 'remboursement')));
  const premiereDate = toutesOps.reduce((m, o) => (!m || o.date < m ? o.date : m), null);
  const premiere = premiereDate ? periodeContenant(premiereDate, jourDebut) : courante;

  // Années disponibles : de la première opération de l'appli jusqu'à cette année
  const anneeMin = Math.min(premiere.annee, etat.annee);
  const anneeMax = Math.max(courante.annee, etat.annee);

  // Les 12 périodes de l'année choisie
  const periodes = Array.from({ length: 12 }, (_, i) => periodeDuMois(etat.annee, i + 1, jourDebut));
  const dans = (o, p) => o.date >= p.debut && o.date <= p.fin;
  const parMois = periodes.map(p => {
    const liste = ops.filter(o => dans(o, p));
    const futur = p.debut > courante.debut;
    const avantDebut = p.debut < premiere.debut;
    return { p, liste, total: somme(liste), futur, avantDebut };
  });
  const totalAnnee = parMois.reduce((s, m) => s + m.total, 0);
  const moisComptes = parMois.filter(m => !m.futur && !m.avantDebut).length;
  const moyenne = moisComptes ? Math.round(totalAnnee / moisComptes) : 0;
  const max = Math.max(1, ...parMois.map(m => m.total));

  const choisi = parMois[etat.mois - 1];
  const listeMois = choisi.liste.slice().sort(triRecent);

  // Totaux par année, sur tout l'historique
  const annees = [];
  for (let a = anneeMax; a >= anneeMin; a--) {
    const debut = periodeDuMois(a, 1, jourDebut).debut;
    const fin = periodeDuMois(a, 12, jourDebut).fin;
    const t = somme(ops.filter(o => o.date >= debut && o.date <= fin));
    annees.push({ a, t });
  }

  const verbe = type === 'entree' ? 'Reçu' : 'Dépensé';
  const libMois = libellePeriode(choisi.p, jourDebut);

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="f-retour" aria-label="Retour"><i data-lucide="chevron-left"></i></button>
      <h1 class="fiche-titre">${pastille(cat)}<span>${esc(cat.nom)}</span></h1>
    </div>

    <div class="nav-mois">
      <button type="button" class="btn-icone" id="f-prec" aria-label="Année précédente" ${etat.annee <= anneeMin ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button>
      <strong>${etat.annee}</strong>
      <button type="button" class="btn-icone" id="f-suiv" aria-label="Année suivante" ${etat.annee >= anneeMax ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
    </div>

    <section class="carte reste">
      <div class="muet">${verbe} en ${etat.annee}</div>
      <div class="montant">${euros(totalAnnee)}</div>
      <div class="muet petit">${moisComptes
        ? `Moyenne : ${euros(moyenne)} par mois (sur ${moisComptes} mois)`
        : 'Pas encore de mois écoulé cette année.'}</div>
    </section>

    <section class="carte">
      <div class="graphe" role="group" aria-label="${verbe} mois par mois en ${etat.annee}">
        ${parMois.map((m, i) => `
          <button type="button" class="graphe-col${i + 1 === etat.mois ? ' choisi' : ''}${m.futur ? ' futur' : ''}" data-mois="${i + 1}"
              aria-pressed="${i + 1 === etat.mois}" aria-label="${libellePeriode(m.p, jourDebut)} : ${euros(m.total)}">
            <span class="graphe-valeur">${m.total ? euros(m.total).replace(/,00\s?€$/, ' €') : ''}</span>
            <span class="graphe-piste"><span class="graphe-barre" style="height:${m.total > 0 ? Math.max(4, Math.round(m.total * 100 / max)) : 0}%;background:${esc(cat.couleur)}"></span></span>
            <span class="graphe-mois">${MOIS_COURTS[i]}</span>
          </button>`).join('')}
      </div>
    </section>

    <h2>${libMois} <span class="muet">· ${euros(choisi.total)}</span></h2>
    ${listeMois.length
      ? `<section class="carte carte-liste"><ul class="liste liste-ops" id="f-liste">${listeMois.map(o => htmlLigne(o, cat, { avecDate: true })).join('')}</ul></section>`
      : `<div class="vide"><i data-lucide="calendar"></i><p>${choisi.futur ? 'Ce mois n\'est pas encore arrivé.' : `Rien en « ${esc(cat.nom)} » ce mois-là.`}</p></div>`}

    <h2>Année par année</h2>
    <section class="carte">
      <ul class="liste">
        ${annees.map(({ a, t }) => `
          <li class="ligne-btn"><button type="button" data-annee="${a}" ${a === etat.annee ? 'aria-current="true"' : ''}>
            <span class="op-titre">${a}</span>
            <strong class="annee-total">${euros(t)}</strong>
            <i data-lucide="chevron-right"></i>
          </button></li>`).join('')}
      </ul>
    </section>`;

  el.querySelector('#f-retour').onclick = retourner;
  el.querySelector('#f-prec').onclick = () => changerAnnee(el, -1);
  el.querySelector('#f-suiv').onclick = () => changerAnnee(el, 1);
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
  const ul = el.querySelector('#f-liste');
  if (ul) activerGestes(ul, listeMois);
}

async function changerAnnee(el, n) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const courante = periodeContenant(aujourdhui(), jourDebut);
  etat.annee += n;
  etat.mois = etat.annee === courante.annee ? courante.mois : (n < 0 ? 12 : 1);
  await afficher(el); icones();
}

function retourner() {
  window.dispatchEvent(new CustomEvent('naviguer', { detail: etat.retour || 'historique' }));
}
