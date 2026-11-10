// Écran « Épargne » : les poches d'épargne (solde ou valeur de chacune) et ce qui a réellement
// bougé, mois par mois et année par année.
// Épargne du mois = virements vers l'épargne − virements depuis l'épargne.
// Vue d'ensemble (toutes les poches) ou vue d'une seule poche.
// On y arrive par la ligne « Épargne du mois » de l'accueil ou par Réglages > Poches d'épargne.

import { db } from '../db.js';
import { euros, aujourdhui, dateFR, versCentimes } from '../format.js';
import { esc, icones, pastille, ouvrirPanneau, fermerPanneau, toast } from '../ui.js';
import { periodeContenant, periodeDuMois, libellePeriode } from '../dates.js';
import { triRecent, signalerChangement } from '../operations.js';
import { epargneNette, etatPoche, virementsDePoche } from '../calculs.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';
import { chargerPoches, enregistrerPoche, supprimerPoche, ajouterReleve, ICONES_POCHES, COULEURS_POCHES } from '../poches.js';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const SANS_POCHE = 'sans';

// vue : null = toutes les poches · id d'une poche · 'sans' = virements sans poche
let etat = { annee: null, mois: null, retour: 'accueil', vue: null };

export async function ouvrirEpargne({ date = null, retour = 'accueil' } = {}) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const per = periodeContenant(date || aujourdhui(), jourDebut);
  etat = { annee: per.annee, mois: per.mois, retour, vue: null };
  window.dispatchEvent(new CustomEvent('naviguer', { detail: 'epargne' }));
}

/** Montant signé : « +310 € », « -50 € » */
const signe = c => `${c > 0 ? '+' : ''}${euros(c)}`;
const sansEuro = c => euros(c).replace(/\s?€$/, '').replace(/[\s  ]/g, '');

export async function afficher(el) {
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const courante = periodeContenant(aujourdhui(), jourDebut);
  if (etat.annee == null) etat = { ...etat, annee: courante.annee, mois: courante.mois };
  const ops = await db.tous('operations');
  const lesPoches = await chargerPoches();
  const ids = lesPoches.map(p => p.id);
  const tousVirements = ops.filter(o => o.type === 'virement');
  const sansPoche = virementsDePoche(ops, null, ids);

  // Poche affichée (si elle a été supprimée entre-temps : retour à la vue d'ensemble)
  let poche = null;
  if (etat.vue === SANS_POCHE) { if (!sansPoche.length || !lesPoches.length) etat.vue = null; }
  else if (etat.vue != null) { poche = lesPoches.find(p => p.id === etat.vue) || null; if (!poche) etat.vue = null; }

  const virements = poche ? virementsDePoche(ops, poche.id) : etat.vue === SANS_POCHE ? sansPoche : tousVirements;
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

  // ----- Haut de page : vue d'ensemble ou poche -----
  const etats = lesPoches.map(p => ({ p, ...etatPoche(p, ops), mois: epargneNette(virementsDePoche(ops, p.id), courante).net }));
  const totalValeur = etats.reduce((s, e) => s + e.valeur, 0);
  const moisCourant = epargneNette(tousVirements, courante).net;

  const lignePoche = e => {
    const sous = [e.p.placement ? `Versé ${euros(e.verse)}` : `Ce mois : ${signe(e.mois)}`];
    return `<li class="ligne-btn"><button type="button" data-poche="${e.p.id}">
      ${pastille(e.p)}
      <span class="op-texte"><span class="op-titre">${esc(e.p.nom)}</span><span class="op-sous">${sous.join(' · ')}</span></span>
      <strong class="poche-valeur">${euros(e.valeur)}</strong>
      <i data-lucide="chevron-right" class="muet"></i></button></li>`;
  };

  let haut;
  if (poche) {
    const e = etats.find(x => x.p.id === poche.id);
    haut = `
      <div class="nav-retour">
        <button type="button" class="btn-icone" id="e-retour" aria-label="Retour à toute l'épargne"><i data-lucide="chevron-left"></i></button>
        <h1 class="fiche-titre">${pastille(poche)}<span>${esc(poche.nom)}</span></h1>
      </div>
      <section class="carte reste">
        <div class="muet">${poche.placement ? 'Valeur' : 'Solde'}</div>
        <div class="montant">${euros(e.valeur)}</div>
        ${poche.placement || e.gain ? `<div class="muet petit">Versé : ${euros(e.verse)} ·
          <span class="${e.gain > 0 ? 'pos' : e.gain < 0 ? 'negatif' : ''}">${poche.placement ? (e.gain < 0 ? 'Moins-value' : 'Plus-value') : 'Écart'} : ${signe(e.gain)}</span></div>` : ''}
        <div class="muet petit">${e.releve
          ? `${poche.placement ? 'Valeur' : 'Solde'} noté${poche.placement ? 'e' : ''} le ${dateFR(e.releve.date)}, virements suivants ajoutés`
          : `Départ de ${euros(poche.depart_centimes || 0)} le ${dateFR(poche.date_depart)}, plus les virements faits depuis`}</div>
        <div class="pile">
          <button type="button" class="btn btn-leger" id="e-releve"><i data-lucide="refresh-cw"></i>${poche.placement ? 'Mettre à jour la valeur' : 'Corriger le solde'}</button>
          <button type="button" class="btn btn-leger" id="e-modifier"><i data-lucide="pencil"></i>Modifier la poche</button>
        </div>
      </section>`;
  } else if (etat.vue === SANS_POCHE) {
    haut = `
      <div class="nav-retour">
        <button type="button" class="btn-icone" id="e-retour" aria-label="Retour à toute l'épargne"><i data-lucide="chevron-left"></i></button>
        <h1>Sans poche</h1>
      </div>
      <p class="muet petit">Virements d'épargne qui ne sont rattachés à aucune poche. Touche un virement pour lui en choisir une.</p>`;
  } else {
    haut = `
      <div class="nav-retour">
        <button type="button" class="btn-icone" id="e-retour" aria-label="Retour"><i data-lucide="chevron-left"></i></button>
        <h1>Épargne</h1>
      </div>
      ${lesPoches.length ? `
      <section class="carte reste">
        <div class="muet">Mon épargne</div>
        <div class="montant">${euros(totalValeur)}</div>
        <div class="muet petit">Ce mois : ${signe(moisCourant)}</div>
      </section>
      <h2>Mes poches</h2>
      <section class="carte carte-liste"><ul class="liste">
        ${etats.map(lignePoche).join('')}
        ${sansPoche.length ? `<li class="ligne-btn"><button type="button" data-poche="${SANS_POCHE}">
          ${pastille({ icone: 'arrow-left-right', couleur: '#8c95a6' })}
          <span class="op-texte"><span class="op-titre">Sans poche</span>
            <span class="op-sous">${sansPoche.length} virement${sansPoche.length > 1 ? 's' : ''} à rattacher</span></span>
          <i data-lucide="chevron-right" class="muet"></i></button></li>` : ''}
      </ul></section>` : `
      <section class="carte bandeau-info">
        <i data-lucide="piggy-bank"></i>
        <span>Tu as plusieurs comptes d'épargne ? Crée une poche pour chacun (sauvegarde, réserve, ETF, crypto…) :
          chaque virement visera sa poche et tu verras le solde de chacune.</span>
      </section>`}
      <button type="button" class="btn" id="e-ajouter"><i data-lucide="plus"></i>Ajouter une poche</button>
      <h2>Mouvements</h2>`;
  }

  el.innerHTML = `
    ${haut}

    <div class="nav-mois">
      <button type="button" class="btn-icone" id="e-prec" aria-label="Année précédente" ${etat.annee <= anneeMin ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button>
      <strong>${etat.annee}</strong>
      <button type="button" class="btn-icone" id="e-suiv" aria-label="Année suivante" ${etat.annee >= anneeMax ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
    </div>

    <section class="carte ${etat.vue == null && !lesPoches.length ? 'reste' : 'resume-annee'}">
      <div class="muet">${etat.vue == null ? 'Épargne' : 'Versé'} en ${etat.annee}</div>
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
            <span class="graphe-piste"><span class="graphe-barre${m.net < 0 ? ' negative' : ''}" style="height:${m.net ? Math.max(4, Math.round(Math.abs(m.net) * 100 / max)) : 0}%;background:${m.net < 0 ? 'var(--rouge)' : poche ? esc(poche.couleur) : 'var(--vert)'}"></span></span>
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

  const redessiner = async ({ haut = false } = {}) => { await afficher(el); icones(); if (haut) window.scrollTo(0, 0); };
  el.querySelector('#e-retour').onclick = () => {
    if (etat.vue != null) { etat.vue = null; redessiner({ haut: true }); }
    else window.dispatchEvent(new CustomEvent('naviguer', { detail: etat.retour || 'accueil' }));
  };
  el.querySelectorAll('[data-poche]').forEach(b => b.onclick = () => {
    etat.vue = b.dataset.poche === SANS_POCHE ? SANS_POCHE : Number(b.dataset.poche);
    redessiner({ haut: true });
  });
  el.querySelector('#e-ajouter')?.addEventListener('click', () => formulairePoche(null));
  el.querySelector('#e-modifier')?.addEventListener('click', () => formulairePoche(poche));
  el.querySelector('#e-releve')?.addEventListener('click', () => formulaireReleve(poche, etats.find(x => x.p.id === poche.id).valeur));
  el.querySelector('#e-prec').onclick = () => changerAnnee(el, -1, courante);
  el.querySelector('#e-suiv').onclick = () => changerAnnee(el, 1, courante);
  el.querySelectorAll('[data-mois]').forEach(b => b.onclick = () => { etat.mois = Number(b.dataset.mois); redessiner(); });
  el.querySelectorAll('[data-annee]').forEach(b => b.onclick = () => {
    etat.annee = Number(b.dataset.annee);
    etat.mois = etat.annee === courante.annee ? courante.mois : 12;
    redessiner();
  });
  const ul = el.querySelector('#e-liste');
  if (ul) activerGestes(ul, liste);
}

async function changerAnnee(el, n, courante) {
  etat.annee += n;
  etat.mois = etat.annee === courante.annee ? courante.mois : (n < 0 ? 12 : 1);
  await afficher(el); icones();
}

// ---------- Créer ou modifier une poche ----------
function formulairePoche(poche) {
  const p = poche ? { ...poche } : {
    nom: '', icone: ICONES_POCHES[0], couleur: COULEURS_POCHES[0], placement: false,
    depart_centimes: 0, date_depart: aujourdhui(), releves: [],
  };
  const $ = id => document.getElementById(id);
  const lire = () => {
    p.nom = $('p-nom').value.trim();
    p.placement = $('p-placement').checked;
    p.date_depart = $('p-date').value || aujourdhui();
    const txt = $('p-depart').value.trim();
    return txt === '' ? 0 : versCentimes(txt);
  };

  const dessiner = () => {
    ouvrirPanneau(`
      <div class="saisie-entete">
        <h2 class="titre-panneau">${poche ? 'Modifier la poche' : 'Nouvelle poche d\'épargne'}</h2>
        <button type="button" class="btn-icone" id="p-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
      </div>
      <label class="champ">Nom
        <input type="text" id="p-nom" value="${esc(p.nom)}" maxlength="30" autocomplete="off" placeholder="ex. Poire pour la soif"></label>
      <div class="choix-pastilles" role="group" aria-label="Icône">
        ${ICONES_POCHES.map(i => `<button type="button" data-icone="${i}" aria-pressed="${i === p.icone}" aria-label="${i}">
          ${pastille({ icone: i, couleur: p.couleur })}</button>`).join('')}
      </div>
      <div class="choix-pastilles" role="group" aria-label="Couleur">
        ${COULEURS_POCHES.map(c => `<button type="button" data-couleur="${c}" aria-pressed="${c === p.couleur}" aria-label="Couleur">
          <span class="pastille pastille-couleur" style="background:${c}"></span></button>`).join('')}
      </div>
      <label class="case"><input type="checkbox" id="p-placement" ${p.placement ? 'checked' : ''}>
        Placement (ETF, crypto, actions) : la valeur varie</label>
      <label class="champ"><span id="p-lib-depart">${p.placement ? 'Déjà versé à cette date (€)' : 'Solde à cette date (€)'}</span>
        <input type="text" id="p-depart" inputmode="decimal" autocomplete="off" placeholder="ex. 2500"
          value="${p.depart_centimes ? sansEuro(p.depart_centimes) : ''}"></label>
      <label class="champ">Date de départ
        <input type="date" id="p-date" value="${p.date_depart}" max="${aujourdhui()}"></label>
      <p class="muet petit aide">Indique ce qu'il y a sur ce compte à la date choisie. Les virements que tu encodes
        <strong>à partir de maintenant</strong> s'ajoutent ou se retirent ; ceux déjà encodés jusqu'à cette date sont compris dans ce montant.</p>
      <div class="pile">
        <button type="button" class="btn btn-principal" id="p-ok">Enregistrer</button>
        ${poche ? '<button type="button" class="btn btn-danger" id="p-suppr">Supprimer cette poche</button>' : ''}
      </div>`);

    $('p-fermer').onclick = fermerPanneau;
    const garder = () => { const m = lire(); if (m != null) p.depart_centimes = m; };
    document.querySelectorAll('[data-icone]').forEach(b => b.onclick = () => { garder(); p.icone = b.dataset.icone; dessiner(); });
    document.querySelectorAll('[data-couleur]').forEach(b => b.onclick = () => { garder(); p.couleur = b.dataset.couleur; dessiner(); });
    $('p-placement').onchange = e => {
      $('p-lib-depart').textContent = e.target.checked ? 'Déjà versé à cette date (€)' : 'Solde à cette date (€)';
    };
    $('p-ok').onclick = async () => {
      const montant = lire();
      if (!p.nom) { toast('Donne un nom à la poche'); return; }
      if (montant == null) { toast('Montant invalide (ex. 2500 ou 2500,50)'); return; }
      p.depart_centimes = montant;
      const id = await enregistrerPoche(p);
      if (!poche) etat.vue = id;
      fermerPanneau(); signalerChangement();
      toast(poche ? 'Poche modifiée' : 'Poche créée');
    };
    $('p-suppr')?.addEventListener('click', async () => {
      if (!confirm(`Supprimer la poche « ${p.nom} » ? Ses virements restent dans l'historique, sans poche.`)) return;
      await supprimerPoche(p.id);
      etat.vue = null;
      fermerPanneau(); signalerChangement(); toast('Poche supprimée');
    });
  };
  dessiner();
}

// ---------- Noter la valeur réelle (placement) ou corriger le solde ----------
function formulaireReleve(poche, valeurActuelle) {
  const mot = poche.placement ? 'valeur' : 'solde';
  ouvrirPanneau(`
    <div class="saisie-entete">
      <h2 class="titre-panneau">${poche.placement ? 'Valeur' : 'Solde'} · ${esc(poche.nom)}</h2>
      <button type="button" class="btn-icone" id="v-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>
    <p class="muet petit">${poche.placement
      ? 'Note ce que vaut ce placement aujourd\'hui (regarde chez ton courtier). Ce que tu as versé ne change pas : tu verras la plus-value ou la moins-value.'
      : 'Note le solde réel du compte (intérêts reçus, écart…). Ce n\'est pas un virement : ton reste à dépenser ne change pas.'}</p>
    <label class="champ">${poche.placement ? 'Valeur actuelle (€)' : 'Solde réel (€)'}
      <input type="text" id="v-montant" inputmode="decimal" autocomplete="off" placeholder="${sansEuro(valeurActuelle)}"></label>
    <label class="champ">Date
      <input type="date" id="v-date" value="${aujourdhui()}" min="${poche.date_depart || ''}" max="${aujourdhui()}"></label>
    <div class="pile"><button type="button" class="btn btn-principal" id="v-ok">Enregistrer</button></div>`);
  const $ = id => document.getElementById(id);
  $('v-fermer').onclick = fermerPanneau;
  $('v-ok').onclick = async () => {
    const txt = $('v-montant').value.trim();
    const montant = txt === '' ? null : versCentimes(txt);
    if (montant == null) { toast('Montant invalide (ex. 3200 ou 3200,50)'); return; }
    const date = $('v-date').value || aujourdhui();
    if (poche.date_depart && date < poche.date_depart) { toast('La date est avant le départ de la poche'); return; }
    await ajouterReleve(poche.id, date, montant);
    fermerPanneau(); signalerChangement();
    toast(`Nouvelle ${mot === 'valeur' ? 'valeur notée' : 'correction du solde notée'}`);
  };
}

/** Onglet du bas qui reste allumé */
export const ongletParent = () => (etat.retour === 'historique' ? 'historique' : etat.retour === 'reglages' ? 'reglages' : etat.retour === 'objectif' ? 'objectif' : 'accueil');
