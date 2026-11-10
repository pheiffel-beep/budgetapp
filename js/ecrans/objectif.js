// Écran « Objectif » (onglet doré) : un seul objectif d'épargne, une somme à atteindre.
// Épargne comptée = valeur des poches choisies (toutes par défaut).
// Ton volontairement sobre : des chiffres, pas de messages d'encouragement.

import { db } from '../db.js';
import { euros, aujourdhui, dateFR, versCentimes } from '../format.js';
import { esc, pastille, ouvrirPanneau, fermerPanneau, toast } from '../ui.js';
import { periodeContenant, decalerPeriode } from '../dates.js';
import { signalerChangement } from '../operations.js';
import { etatPoche, epargneNette, projectionObjectif } from '../calculs.js';
import { chargerPoches } from '../poches.js';
import { ouvrirEpargne } from './epargne.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_RYTHME = 12;   // le rythme se calcule sur les 12 derniers mois au plus
const signe = c => `${c > 0 ? '+' : ''}${euros(c)}`;
const sansEuro = c => euros(c).replace(/\s?€$/, '').replace(/[\s  ]/g, '');

export async function afficher(el) {
  const auj = aujourdhui();
  const jourDebut = await db.parametre('jour_debut_mois', 1);
  const objectif = await db.parametre('objectif', null);
  const lesPoches = await chargerPoches();
  const ops = await db.tous('operations');

  if (!lesPoches.length) {
    el.innerHTML = `
      <h1>Objectif</h1>
      <section class="carte carte-or">
        <p>Pour suivre un objectif d'épargne, l'application doit connaître tes comptes d'épargne.</p>
        <p class="muet petit">Crée d'abord tes poches (compte d'épargne, réserve, placements…) avec leur montant actuel.</p>
        <div class="pile"><button type="button" class="btn btn-or" id="o-poches">Créer mes poches d'épargne</button></div>
      </section>`;
    el.querySelector('#o-poches').onclick = () => ouvrirEpargne({ retour: 'objectif' });
    return;
  }

  if (!objectif) {
    el.innerHTML = `
      <h1>Objectif</h1>
      <section class="carte carte-or">
        <p>Une somme d'épargne à atteindre, et où tu en es.</p>
        <p class="muet petit">Un seul objectif, calculé sur le total de tes poches d'épargne.</p>
        <div class="pile"><button type="button" class="btn btn-or" id="o-definir">Définir mon objectif</button></div>
      </section>`;
    el.querySelector('#o-definir').onclick = () => formulaire(null, lesPoches);
    return;
  }

  // ----- Épargne comptée -----
  const exclues = objectif.poches_exclues || [];
  const comptees = lesPoches.filter(p => !exclues.includes(p.id));
  const idsComptes = comptees.map(p => p.id);
  const idsToutes = lesPoches.map(p => p.id);
  const etats = comptees.map(p => ({ p, ...etatPoche(p, ops) }));
  const actuel = etats.reduce((s, e) => s + e.valeur, 0);

  // ----- Rythme : épargne moyenne par mois (mois terminés ; à défaut, le mois en cours) -----
  // Virements des poches comptées ; si toutes comptent, les virements sans poche aussi.
  const virements = ops.filter(o => o.type === 'virement' &&
    (idsComptes.includes(o.poche_id) || (!exclues.length && !idsToutes.includes(o.poche_id))));
  const courante = periodeContenant(auj, jourDebut);
  const premiereDate = ops.reduce((m, o) => (!m || o.date < m ? o.date : m), null);
  const nets = [];
  let per = decalerPeriode(courante, -1, jourDebut);
  while (nets.length < MOIS_RYTHME && premiereDate && per.fin >= premiereDate) {
    nets.push(epargneNette(virements, per).net);
    per = decalerPeriode(per, -1, jourDebut);
  }
  const moisEnCoursSeul = !nets.length;
  if (moisEnCoursSeul) nets.push(epargneNette(virements, courante).net);
  const rythme = Math.round(nets.reduce((s, n) => s + n, 0) / nets.length);

  const proj = projectionObjectif({ actuel, cible: objectif.cible_centimes, rythme, auj, dateVoulue: objectif.date_voulue || null });
  const baseRythme = moisEnCoursSeul ? 'mois en cours' : nets.length === 1 ? 'dernier mois' : `moyenne des ${nets.length} derniers mois`;

  let lignes = '';
  if (proj.atteint) {
    lignes = `<li><span>Objectif atteint</span><strong class="ligne-val sans-coupure">${signe(actuel - objectif.cible_centimes)}</strong></li>`;
  } else {
    lignes += `<li><span>Ton rythme <span class="muet petit">(${baseRythme})</span></span><strong class="ligne-val sans-coupure">${signe(rythme)}/mois</strong></li>`;
    lignes += proj.dateEstimee
      ? `<li><span>À ce rythme, atteint vers</span><strong class="ligne-val sans-coupure">${MOIS[proj.dateEstimee.mois - 1]} ${proj.dateEstimee.annee}</strong></li>`
      : `<li><span class="muet">Pas de date estimée : il faut au moins un mois avec de l'épargne.</span></li>`;
    if (objectif.date_voulue) {
      lignes += proj.effortMensuel != null
        ? `<li><span>Pour le ${dateFR(objectif.date_voulue)}, il faut</span><strong class="ligne-val sans-coupure">${euros(proj.effortMensuel)}/mois</strong></li>`
        : `<li><span class="muet">La date souhaitée (${dateFR(objectif.date_voulue)}) est passée.</span></li>`;
    }
  }

  el.innerHTML = `
    <h1>${esc(objectif.nom || 'Mon objectif')}</h1>

    <section class="carte carte-or" aria-label="Avancement de l'objectif">
      <div class="muet">Épargne comptée</div>
      <div class="montant montant-or">${euros(actuel)}</div>
      <div class="muet">sur ${euros(objectif.cible_centimes)}</div>
      <div class="barre barre-or" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${proj.pct}" aria-label="Objectif : ${proj.pct} %">
        <div class="barre-remplie" style="width:${proj.pct}%"></div></div>
      <div class="objectif-chiffres"><strong>${proj.pct} %</strong><span class="muet">${proj.atteint ? 'Atteint' : `Reste ${euros(proj.reste)}`}</span></div>
    </section>

    <section class="carte"><ul class="liste">${lignes}</ul>
      ${proj.atteint ? '' : `<p class="muet petit aide">La projection ne tient compte que de tes versements. La valeur des placements peut monter ou descendre.</p>`}
    </section>

    <h2>Ce qui est compté</h2>
    <section class="carte carte-liste"><ul class="liste">
      ${etats.map(e => `<li class="ligne-poche">
        ${pastille(e.p)}
        <span class="op-texte"><span class="op-titre">${esc(e.p.nom)}</span></span>
        <strong class="poche-valeur">${euros(e.valeur)}</strong></li>`).join('')}
    </ul></section>
    ${exclues.length ? `<p class="muet petit">Non comptées : ${lesPoches.filter(p => exclues.includes(p.id)).map(p => esc(p.nom)).join(', ')}.</p>` : ''}

    <div class="pile">
      <button type="button" class="btn" id="o-epargne"><i data-lucide="piggy-bank"></i>Voir mes poches d'épargne</button>
      <button type="button" class="btn btn-leger" id="o-modifier"><i data-lucide="pencil"></i>Modifier l'objectif</button>
    </div>`;

  el.querySelector('#o-epargne').onclick = () => ouvrirEpargne({ retour: 'objectif' });
  el.querySelector('#o-modifier').onclick = () => formulaire(objectif, lesPoches);
}

// ---------- Définir ou modifier l'objectif ----------
function formulaire(objectif, lesPoches) {
  const o = objectif || { nom: '', cible_centimes: 0, date_voulue: null, poches_exclues: [] };
  ouvrirPanneau(`
    <div class="saisie-entete">
      <h2 class="titre-panneau">${objectif ? 'Modifier l\'objectif' : 'Mon objectif'}</h2>
      <button type="button" class="btn-icone" id="o-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>
    <label class="champ">Somme à atteindre (€)
      <input type="text" id="o-cible" inputmode="decimal" autocomplete="off" placeholder="ex. 50000"
        value="${o.cible_centimes ? sansEuro(o.cible_centimes) : ''}"></label>
    <label class="champ">Nom (facultatif)
      <input type="text" id="o-nom" value="${esc(o.nom || '')}" maxlength="30" autocomplete="off" placeholder="Mon objectif"></label>
    <label class="champ">Date souhaitée (facultatif)
      <input type="date" id="o-date" value="${o.date_voulue || ''}"></label>
    <p class="muet petit aide">Poches comptées dans l'objectif :</p>
    ${lesPoches.map(p => `<label class="case"><input type="checkbox" data-o-poche="${p.id}" ${(o.poches_exclues || []).includes(p.id) ? '' : 'checked'}>
      ${esc(p.nom)}</label>`).join('')}
    <div class="pile">
      <button type="button" class="btn btn-principal" id="o-ok">Enregistrer</button>
      ${objectif ? '<button type="button" class="btn btn-danger" id="o-suppr">Supprimer l\'objectif</button>' : ''}
    </div>`);
  const $ = id => document.getElementById(id);
  $('o-fermer').onclick = fermerPanneau;
  $('o-ok').onclick = async () => {
    const cible = versCentimes($('o-cible').value.trim());
    if (!(cible > 0)) { toast('Indique la somme à atteindre (ex. 50000)'); return; }
    const exclues = [...document.querySelectorAll('[data-o-poche]')].filter(c => !c.checked).map(c => Number(c.dataset.oPoche));
    if (exclues.length === lesPoches.length) { toast('Garde au moins une poche'); return; }
    await db.definirParametre('objectif', {
      nom: $('o-nom').value.trim(), cible_centimes: cible, date_voulue: $('o-date').value || null, poches_exclues: exclues,
    });
    fermerPanneau(); signalerChangement();
    toast('Objectif enregistré');
  };
  $('o-suppr')?.addEventListener('click', async () => {
    if (!confirm('Supprimer l\'objectif ? Tes poches et tes virements ne changent pas.')) return;
    await db.definirParametre('objectif', null);
    fermerPanneau(); signalerChangement(); toast('Objectif supprimé');
  });
}
