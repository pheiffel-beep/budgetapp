// Écran Accueil.
// Phase 1 : emplacement du « reste à dépenser » (calcul en phase 3) + 5 dernières opérations.

import { db } from '../db.js';
import { categoriesParId, triRecent } from '../operations.js';
import { htmlLigne, activerGestes } from '../ligne-operation.js';

export async function afficher(el) {
  const cats = await categoriesParId();
  const dernieres = (await db.tous('operations')).sort(triRecent).slice(0, 5);

  el.innerHTML = `
    <h1>Accueil</h1>

    <section class="carte reste" aria-label="Reste à dépenser">
      <div class="muet">Reste à dépenser ce mois-ci</div>
      <div class="montant">—</div>
      <div class="muet petit">Le calcul arrive en phase 3</div>
    </section>

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

  if (dernieres.length) {
    activerGestes(el.querySelector('#a-ops'), dernieres);
    el.querySelector('#a-tout').onclick = () =>
      window.dispatchEvent(new CustomEvent('naviguer', { detail: 'historique' }));
  }
}
