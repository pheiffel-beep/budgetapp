// Recalage de solde : compare ce que l'application croit avec le solde réel du compte courant.
//
// Principe : au premier recalage, on note le solde réel (point de départ).
// Aux suivants, l'appli calcule le solde qu'elle attend (point de départ + opérations depuis)
// et te montre l'écart. Tu peux le ranger en « Divers/Imprévus » (dépense ou revenu d'ajustement)
// ou l'ignorer. Dans les deux cas, le nouveau solde réel devient le point de départ.

import { db } from './db.js';
import { euros, versCentimesSigne, aujourdhui, dateFR } from './format.js';
import { ouvrirPanneau, fermerPanneau, toast, esc, icones } from './ui.js';
import { soldeAttendu } from './calculs.js';
import { enregistrerOperation, signalerChangement } from './operations.js';

export async function ouvrirRecalage() {
  const ref = await db.parametre('recalage_ref', null);
  const comptes = await db.parametre('comptes', []);
  const principal = comptes[0] || 'Courant';

  ouvrirPanneau(`
    <div class="saisie-entete">
      <h2 class="titre-panneau">Recaler avec mon solde réel</h2>
      <button type="button" class="btn-icone" id="rc-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>
    ${ref
      ? `<p class="muet petit">Dernier recalage le ${dateFR(ref.date)} : ${euros(ref.solde_centimes)}.</p>`
      : `<p class="muet petit">C'est le premier recalage : l'application note ton solde comme point de départ.
          La prochaine fois, elle te dira s'il y a un écart (paiement oublié, retrait d'espèces…).</p>`}
    <label class="champ">Solde réel de ton compte « ${esc(principal)} » (€)
      <input type="text" id="rc-solde" inputmode="decimal" autocomplete="off" placeholder="ex. 1 234,56"></label>
    <p class="muet petit aide">Encode d'abord tes dépenses du jour, puis regarde le solde dans ton application bancaire.</p>
    <button type="button" class="btn btn-principal" id="rc-ok">${ref ? 'Comparer' : 'Enregistrer le point de départ'}</button>`);

  const $ = id => document.getElementById(id);
  $('rc-fermer').onclick = fermerPanneau;
  $('rc-ok').onclick = async () => {
    const reel = versCentimesSigne($('rc-solde').value);
    if (reel == null) { toast('Solde invalide (ex. 1234,56)'); return; }
    const auj = aujourdhui();

    if (!ref) {
      await db.definirParametre('recalage_ref', { solde_centimes: reel, date: auj });
      fermerPanneau(); signalerChangement();
      toast('Point de départ enregistré');
      return;
    }
    const ops = await db.operationsEntre(ref.date, auj);
    const attendu = soldeAttendu(ref, ops, auj, principal);
    montrerEcart(ref, reel, attendu, auj);
  };
}

function montrerEcart(ref, reel, attendu, auj) {
  const ecart = reel - attendu;
  const note = `Recalage de solde`;
  const nouvelleRef = { solde_centimes: reel, date: auj };

  const terminer = async (message) => {
    await db.definirParametre('recalage_ref', nouvelleRef);
    fermerPanneau(); signalerChangement(); toast(message);
  };

  if (ecart === 0) {
    ouvrirPanneau(`
      <h2 class="titre-panneau">Tout est juste</h2>
      <p>L'application attendait <strong>${euros(attendu)}</strong> et tu as <strong>${euros(reel)}</strong>.
        Aucun écart depuis le ${dateFR(ref.date)}.</p>
      <button type="button" class="btn btn-principal" id="rc-ok">Parfait</button>`);
    document.getElementById('rc-ok').onclick = () => terminer('Recalage enregistré, aucun écart');
    return;
  }

  const manque = ecart < 0;
  ouvrirPanneau(`
    <h2 class="titre-panneau">Écart de ${euros(Math.abs(ecart))}</h2>
    <section class="carte">
      <div class="ligne-info"><span>L'appli attendait</span><strong>${euros(attendu)}</strong></div>
      <div class="ligne-info"><span>Ton solde réel</span><strong>${euros(reel)}</strong></div>
      <div class="ligne-info"><span>Écart</span><strong class="${manque ? '' : 'pos'}">${manque ? '-' : '+'}${euros(Math.abs(ecart))}</strong></div>
    </section>
    <p class="muet">${manque
      ? 'Il y a eu plus de dépenses que ce que tu as encodé (paiement oublié, retrait d\'espèces…).'
      : 'Il y a eu plus d\'argent entrant que ce que tu as encodé.'}</p>
    <div class="pile">
      <button type="button" class="btn btn-principal" id="rc-ranger">${manque
        ? 'Ranger en dépense « Divers/Imprévus »' : 'Ranger en revenu « Autre revenu »'}</button>
      <button type="button" class="btn" id="rc-ignorer">Ignorer l'écart</button>
      <button type="button" class="btn" id="rc-annuler">Annuler</button>
    </div>`);

  document.getElementById('rc-annuler').onclick = fermerPanneau;
  document.getElementById('rc-ignorer').onclick = () => terminer('Recalage enregistré, écart ignoré');
  document.getElementById('rc-ranger').onclick = async () => {
    const cats = await db.tous('categories');
    const cat = manque
      ? cats.find(c => c.nom === 'Divers/Imprévus') : cats.find(c => c.nom === 'Autre revenu');
    await enregistrerOperation({
      type: manque ? 'sortie' : 'entree',
      montant_centimes: Math.abs(ecart),
      date: auj,
      categorie_id: cat ? cat.id : null,
      compte: '',
      note,
    });
    await terminer(manque ? 'Écart rangé en Divers/Imprévus' : 'Écart rangé en revenu');
  };
}
