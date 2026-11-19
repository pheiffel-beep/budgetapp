// Recalage de solde : compare ce que l'application croit avec le solde réel du compte courant.
//
// Principe : au premier recalage, on note le solde réel (point de départ).
// Aux suivants, l'appli montre le solde qu'elle attend (point de départ + opérations depuis),
// tu tapes le montant affiché par ta banque, et elle te montre l'écart.
// Tu peux le ranger en « Divers/Imprévus » (dépense ou revenu d'ajustement) : le reste à dépenser
// est alors corrigé, et l'appli affiche l'avant / après. Ou l'ignorer.
// Dans tous les cas, le nouveau solde réel devient le point de départ.

import { db } from './db.js';
import { euros, versCentimesSigne, aujourdhui, dateFR } from './format.js';
import { ouvrirPanneau, fermerPanneau, toast, esc } from './ui.js';
import { soldeAttendu, resteADepenser } from './calculs.js';
import { periodeContenant } from './dates.js';
import { enregistrerOperation, signalerChangement } from './operations.js';

const POURQUOI = `Ton reste à dépenser n'est pas ton solde bancaire : il retire déjà les charges fixes
  encore à venir et l'épargne prévue jusqu'à la fin de la période.`;

/** Reste à dépenser actuel (le même calcul que l'accueil) */
async function resteActuel(auj) {
  const per = periodeContenant(auj, await db.parametre('jour_debut_mois', 1));
  return resteADepenser(await db.tous('operations'), await db.tous('recurrents'), auj, per).reste;
}

export async function ouvrirRecalage() {
  const ref = await db.parametre('recalage_ref', null);
  const comptes = await db.parametre('comptes', []);
  const principal = comptes[0] || 'Courant';
  const auj = aujourdhui();
  const attendu = ref ? soldeAttendu(ref, await db.operationsEntre(ref.date, auj), auj, principal) : null;

  ouvrirPanneau(`
    <div class="saisie-entete">
      <h2 class="titre-panneau">Recaler avec mon solde réel</h2>
      <button type="button" class="btn-icone" id="rc-fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
    </div>
    ${ref
      ? `<section class="carte">
          <div class="muet petit">Selon l'appli, ton compte « ${esc(principal)} » devrait être à</div>
          <div class="rc-gros">${euros(attendu)}</div>
          <p class="muet petit aide">Calculé à partir du ${dateFR(ref.date)} (${euros(ref.solde_centimes)} en banque),
            plus tout ce que tu as encodé depuis.</p>
        </section>
        <p class="muet petit">Tape le montant que ta banque affiche. S'il est différent, l'appli te montre l'écart
          (paiement oublié, retrait d'espèces…) et peut corriger ton reste à dépenser.</p>`
      : `<p>Tape le montant que ta banque affiche <strong>aujourd'hui</strong> sur ton compte « ${esc(principal)} ».</p>
        <p class="muet petit">Cette première fois, l'appli le note comme <strong>point de départ</strong> : rien ne change à l'écran.
          Les fois suivantes, elle comparera ce montant avec ce qu'elle a calculé, et corrigera ton reste à dépenser s'il y a un écart.</p>`}
    <label class="champ">Montant affiché par ta banque (€)
      <input type="text" id="rc-solde" inputmode="decimal" autocomplete="off" placeholder="ex. 1 234,56"></label>
    <p class="muet petit aide">Encode d'abord tes dépenses du jour, puis regarde le solde dans ton application bancaire.</p>
    <button type="button" class="btn btn-principal" id="rc-ok">${ref ? 'Comparer' : 'Enregistrer le point de départ'}</button>`);

  const $ = id => document.getElementById(id);
  $('rc-fermer').onclick = fermerPanneau;
  $('rc-ok').onclick = async () => {
    const reel = versCentimesSigne($('rc-solde').value);
    if (reel == null) { toast('Montant invalide (ex. 1234,56)'); return; }

    if (!ref) {
      await db.definirParametre('recalage_ref', { solde_centimes: reel, date: auj });
      signalerChangement();
      ouvrirPanneau(`
        <h2 class="titre-panneau">Point de départ noté</h2>
        <p>Ton compte est à <strong>${euros(reel)}</strong> le ${dateFR(auj)}.</p>
        <p class="muet petit">La prochaine fois que tu recales, l'appli comparera avec ce qu'elle a calculé
          et te dira s'il y a un écart.</p>
        <p class="muet petit">${POURQUOI}</p>
        <button type="button" class="btn btn-principal" id="rc-fin">Compris</button>`);
      $('rc-fin').onclick = fermerPanneau;
      return;
    }
    await montrerEcart(ref, reel, attendu, auj);
  };
}

async function montrerEcart(ref, reel, attendu, auj) {
  const cats = await db.tous('categories');
  const trouver = (cle, nom) => cats.find(c => c.cle === cle) || cats.find(c => c.nom === nom);
  const catDepense = trouver('divers', 'Divers/Imprévus');
  const catRevenu = trouver('autre_revenu', 'Autre revenu');
  const ecart = reel - attendu;
  const nouvelleRef = { solde_centimes: reel, date: auj };
  const avant = await resteActuel(auj);
  const $ = id => document.getElementById(id);

  if (ecart === 0) {
    await db.definirParametre('recalage_ref', nouvelleRef);
    signalerChangement();
    ouvrirPanneau(`
      <h2 class="titre-panneau">Tout est juste</h2>
      <p>L'appli attendait <strong>${euros(attendu)}</strong> et ta banque affiche <strong>${euros(reel)}</strong>.
        Aucun écart depuis le ${dateFR(ref.date)}.</p>
      <p class="muet petit">Ton reste à dépenser (<strong>${euros(avant)}</strong>) est fiable.</p>
      <button type="button" class="btn btn-principal" id="rc-fin">Parfait</button>`);
    $('rc-fin').onclick = fermerPanneau;
    return;
  }

  const manque = ecart < 0;
  const apres = avant + ecart; // une dépense d'ajustement fait baisser le reste, un revenu le fait monter
  const cat = manque ? catDepense : catRevenu;
  const nomCat = cat ? cat.nom : (manque ? 'Divers/Imprévus' : 'Autre revenu');

  ouvrirPanneau(`
    <h2 class="titre-panneau">Écart de ${euros(Math.abs(ecart))}</h2>
    <section class="carte">
      <div class="ligne-info"><span>L'appli attendait</span><strong>${euros(attendu)}</strong></div>
      <div class="ligne-info"><span>Ta banque affiche</span><strong>${euros(reel)}</strong></div>
      <div class="ligne-info"><span>Écart</span><strong class="${manque ? '' : 'pos'}">${manque ? '-' : '+'}${euros(Math.abs(ecart))}</strong></div>
    </section>
    <p class="muet">${manque
      ? 'Il est sorti plus d\'argent que ce que tu as encodé (paiement oublié, retrait d\'espèces…).'
      : 'Il est entré plus d\'argent que ce que tu as encodé.'}</p>
    <section class="carte">
      <div class="muet petit">Si tu ranges l'écart en ${manque ? 'dépense' : 'revenu'} « ${esc(nomCat)} », ton reste à dépenser passe de</div>
      <div class="rc-avant-apres"><span>${euros(avant)}</span><i data-lucide="arrow-right"></i><strong class="${apres < 0 ? 'negatif' : ''}">${euros(apres)}</strong></div>
    </section>
    <div class="pile">
      <button type="button" class="btn btn-principal" id="rc-ranger">Ranger et corriger mon reste à dépenser</button>
      <button type="button" class="btn" id="rc-ignorer">Ignorer l'écart</button>
      <button type="button" class="btn" id="rc-annuler">Annuler</button>
    </div>
    <p class="muet petit">« Ignorer » : le montant de ta banque devient le nouveau point de départ, mais ton reste à dépenser ne bouge pas.</p>`);

  $('rc-annuler').onclick = fermerPanneau;
  $('rc-ignorer').onclick = async () => {
    await db.definirParametre('recalage_ref', nouvelleRef);
    fermerPanneau(); signalerChangement(); toast('Recalage enregistré, écart ignoré');
  };
  $('rc-ranger').onclick = async () => {
    await enregistrerOperation({
      type: manque ? 'sortie' : 'entree',
      montant_centimes: Math.abs(ecart),
      date: auj,
      categorie_id: cat ? cat.id : null,
      compte: '',
      note: 'Recalage de solde',
    });
    await db.definirParametre('recalage_ref', nouvelleRef);
    signalerChangement();
    const corrige = await resteActuel(auj);
    ouvrirPanneau(`
      <h2 class="titre-panneau">C'est recalé</h2>
      <p>${manque ? '-' : '+'}${euros(Math.abs(ecart))} rangé en ${manque ? 'dépense' : 'revenu'} « ${esc(nomCat)} ».</p>
      <section class="carte">
        <div class="muet petit">Reste à dépenser</div>
        <div class="rc-avant-apres"><span>${euros(avant)}</span><i data-lucide="arrow-right"></i><strong class="${corrige < 0 ? 'negatif' : ''}">${euros(corrige)}</strong></div>
      </section>
      <p class="muet petit">Si tu retrouves le paiement oublié, encode-le et supprime la ligne « Recalage de solde » dans l'Historique.</p>
      <button type="button" class="btn btn-principal" id="rc-fin">OK</button>`);
    $('rc-fin').onclick = fermerPanneau;
  };
}
