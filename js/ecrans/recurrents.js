// Écran « Charges et revenus fixes » (ouvert depuis Réglages).
// Liste des récurrents, modification, ajout, suppression.

import { db } from '../db.js';
import { euros, versCentimes, aujourdhui, dateFR } from '../format.js';
import { esc, pastille, ouvrirPanneau, fermerPanneau, toast, icones } from '../ui.js';
import { LIBELLES_FREQ, estComplet, estTermine, jourDe, genererRecurrents } from '../recurrents.js';
import { signalerChangement } from '../operations.js';
import { poches, pocheParId } from '../poches.js';
import { chargesFixes } from '../calculs.js';

const GROUPES = [
  ['entree', 'Revenus'],
  ['virement', 'Virements'],
  ['sortie', 'Charges fixes'],
];

export async function afficher(el) {
  const recs = (await db.tous('recurrents')).sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.id - b.id);
  const cats = Object.fromEntries((await db.tous('categories')).map(c => [c.id, c]));
  const auj = aujourdhui();
  const aCompleter = recs.filter(r => !estComplet(r)).length;
  const charges = chargesFixes(recs, auj);

  el.innerHTML = `
    <div class="nav-retour">
      <button type="button" class="btn-icone" id="r-retour" aria-label="Retour aux réglages"><i data-lucide="chevron-left"></i></button>
      <h1>Charges et revenus fixes</h1>
    </div>

    ${aCompleter ? `<div class="carte bandeau-info">
      <i data-lucide="info"></i>
      <span>${aCompleter} élément${aCompleter > 1 ? 's' : ''} à compléter. Touche une ligne pour saisir le montant
      et la date de la première échéance. Les lignes sans montant sont ignorées.</span></div>` : ''}

    <section class="carte">
      <ul class="liste">
        <li><span>Charges mensuelles</span><strong class="ligne-val">${euros(charges.mensuelles)}</strong></li>
        <li><span>Toutes charges, ramenées au mois</span><strong class="ligne-val">${euros(charges.lissees)}</strong></li>
      </ul>
      <p class="muet petit aide">La deuxième ligne ajoute les charges trimestrielles, semestrielles et annuelles,
        réparties sur chaque mois. Les virements vers l'épargne ne sont pas comptés.</p>
    </section>

    ${GROUPES.map(([type, titre]) => {
      const liste = recs.filter(r => r.type === type);
      if (!liste.length) return '';
      return `<h2>${titre}</h2>
        <section class="carte carte-liste"><ul class="liste">
          ${liste.map(r => ligne(r, cats[r.categorie_id], auj)).join('')}
        </ul></section>`;
    }).join('')}

    <button type="button" class="btn" id="r-ajouter"><i data-lucide="plus"></i>Ajouter une charge ou un revenu fixe</button>`;

  el.querySelector('#r-retour').onclick = () => window.dispatchEvent(new CustomEvent('naviguer', { detail: 'reglages' }));
  el.querySelector('#r-ajouter').onclick = () => formulaire(null);
  el.querySelectorAll('[data-rec]').forEach(b => b.onclick = () =>
    formulaire(recs.find(r => r.id === Number(b.dataset.rec))));
}

function ligne(r, cat, auj) {
  const poche = r.type === 'virement' ? pocheParId(r.poche_id) : null;
  const visuel = poche ? poche : r.type === 'virement' ? { icone: 'arrow-left-right', couleur: '#8c95a6' }
    : (cat || { icone: 'circle-help', couleur: '#8c95a6' });
  let detail, valeur;
  if (!estComplet(r)) {
    detail = LIBELLES_FREQ[r.frequence];
    valeur = '<span class="a-completer">À compléter</span>';
  } else {
    detail = `${LIBELLES_FREQ[r.frequence]} · le ${jourDe(r)}${r.frequence !== 'mensuelle' ? ` (dès le ${dateFR(r.date_debut)})` : ''}`;
    if (poche) detail += ` · ${esc(poche.nom)}`;
    if (estTermine(r, auj)) detail += ' · terminé';
    valeur = `<span class="${r.type === 'entree' ? 'pos' : ''}">${euros(r.montant_centimes)}</span>`;
  }
  return `<li class="ligne-btn"><button type="button" data-rec="${r.id}">
      ${pastille(visuel)}
      <span class="op-texte"><span class="op-titre">${esc(r.libelle)}</span><span class="op-sous">${detail}</span></span>
      <span class="op-montant">${valeur}</span>
    </button></li>`;
}

// ---------- Formulaire ----------
async function formulaire(rec) {
  const cats = (await db.tous('categories')).sort((a, b) => a.ordre - b.ordre);
  const r = rec ? { ...rec } : {
    libelle: '', type: 'sortie', sens_virement: 'vers_epargne', frequence: 'mensuelle',
    categorie_id: null, montant_centimes: 0, date_debut: null, date_fin: null,
    jour: null, mois_depart: null, derniere_generation: null, ordre: 999,
  };

  const dessiner = () => {
    const optionsCat = cats.filter(c => c.type === (r.type === 'entree' ? 'entree' : 'sortie'));
    ouvrirPanneau(`
      <div class="saisie-entete">
        <h2 class="titre-panneau">${rec ? 'Modifier' : 'Nouvelle charge ou revenu fixe'}</h2>
        <button type="button" class="btn-icone" id="f-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
      </div>
      <div class="segment" role="group" aria-label="Type">
        ${[['sortie', 'Charge'], ['entree', 'Revenu'], ['virement', 'Virement']]
          .map(([v, l]) => `<button type="button" data-ftype="${v}" aria-pressed="${r.type === v}">${l}</button>`).join('')}
      </div>
      <label class="champ">Libellé
        <input type="text" id="f-libelle" value="${esc(r.libelle)}" maxlength="60" autocomplete="off"></label>
      <label class="champ">Montant (€)
        <input type="text" id="f-montant" inputmode="decimal" autocomplete="off"
          value="${r.montant_centimes ? euros(r.montant_centimes).replace(/\s?€$/, '').replace(/ /g, '') : ''}"
          placeholder="ex. 750,00"></label>
      ${r.type === 'virement' ? `
        <label class="champ">Sens
          <select id="f-sens">
            <option value="vers_epargne" ${r.sens_virement !== 'depuis_epargne' ? 'selected' : ''}>Vers épargne</option>
            <option value="depuis_epargne" ${r.sens_virement === 'depuis_epargne' ? 'selected' : ''}>Depuis épargne</option>
          </select></label>
        ${poches().length ? `
        <label class="champ">Poche d'épargne
          <select id="f-poche">
            <option value="">—</option>
            ${poches().map(p => `<option value="${p.id}" ${p.id === r.poche_id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select></label>` : ''}` : `
        <label class="champ">Catégorie
          <select id="f-cat">
            <option value="">—</option>
            ${optionsCat.map(c => `<option value="${c.id}" ${c.id === r.categorie_id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}
          </select></label>`}
      <label class="champ">Fréquence
        <select id="f-freq">
          ${Object.entries(LIBELLES_FREQ).map(([v, l]) => `<option value="${v}" ${v === r.frequence ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="champ">Date de la première échéance
        <input type="date" id="f-debut" value="${r.date_debut || ''}"></label>
      <p class="muet petit aide">Le jour de cette date sert pour les mois suivants (un 31 devient le dernier jour
        des mois plus courts). Pour un trimestriel, un semestriel ou un annuel, choisis une vraie date d'échéance :
        les suivantes tomberont tous les 3, 6 ou 12 mois à partir d'elle.</p>
      <label class="champ">Date de fin (facultatif)
        <input type="date" id="f-fin" value="${r.date_fin || ''}"></label>
      <div class="pile">
        <button type="button" class="btn btn-principal" id="f-ok">Enregistrer</button>
        ${rec ? '<button type="button" class="btn btn-danger" id="f-suppr">Supprimer</button>' : ''}
      </div>`);

    const $ = id => document.getElementById(id);
    const lire = () => {
      r.libelle = $('f-libelle').value.trim();
      r.frequence = $('f-freq').value;
      r.date_debut = $('f-debut').value || null;
      r.date_fin = $('f-fin').value || null;
      if ($('f-cat')) r.categorie_id = $('f-cat').value ? Number($('f-cat').value) : null;
      if ($('f-sens')) r.sens_virement = $('f-sens').value;
      if ($('f-poche')) r.poche_id = $('f-poche').value ? Number($('f-poche').value) : null;
      const txt = $('f-montant').value.trim();
      return txt === '' ? 0 : versCentimes(txt);
    };

    $('f-fermer').onclick = fermerPanneau;
    document.querySelectorAll('[data-ftype]').forEach(b => b.onclick = () => {
      const m = lire(); if (m != null) r.montant_centimes = m;
      if (r.type !== b.dataset.ftype) { r.type = b.dataset.ftype; r.categorie_id = null; }
      dessiner();
    });

    $('f-ok').onclick = async () => {
      const montant = lire();
      if (!r.libelle) { toast('Indique un libellé'); return; }
      if (montant == null) { toast('Montant invalide (ex. 750,00)'); return; }
      if (r.type !== 'virement' && !r.categorie_id) { toast('Choisis une catégorie'); return; }
      if (r.date_fin && r.date_debut && r.date_fin < r.date_debut) { toast('La date de fin est avant la première échéance'); return; }
      r.montant_centimes = montant;
      r.jour = r.date_debut ? Number(r.date_debut.slice(8, 10)) : null;
      r.mois_depart = r.date_debut ? Number(r.date_debut.slice(5, 7)) : null;
      if (r.type !== 'virement') r.sens_virement = null;
      if (r.type === 'virement') r.categorie_id = null;
      else r.poche_id = null;

      if (rec) await db.modifier('recurrents', r);
      else await db.ajouter('recurrents', r);

      const n = await genererRecurrents(aujourdhui());
      fermerPanneau();
      signalerChangement();
      toast(n ? `Enregistré · ${n} opération${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} à l'historique` : 'Enregistré');
    };

    $('f-suppr')?.addEventListener('click', async () => {
      if (!confirm(`Supprimer « ${r.libelle} » ? Les opérations déjà créées restent dans l'historique.`)) return;
      await db.supprimer('recurrents', r.id);
      fermerPanneau();
      signalerChangement();
      toast('Supprimé');
    });
  };

  dessiner();
}
