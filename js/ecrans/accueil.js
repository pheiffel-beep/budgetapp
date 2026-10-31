// Écran Accueil.
// Phase 0 : emplacement du « reste à dépenser » + carte de vérification du socle.
// La carte de vérification sera retirée en phase 3.

import { db } from '../db.js';
import { euros, aujourdhui, dateFR, versCentimes } from '../format.js';

export async function afficher(el) {
  const ouvertures = await db.parametre('nb_ouvertures', 0);
  const nbCategories = await db.compter('categories');

  el.innerHTML = `
    <h1>Accueil</h1>

    <section class="carte reste" aria-label="Reste à dépenser">
      <div class="muet">Reste à dépenser ce mois-ci</div>
      <div class="montant">—</div>
      <div class="muet petit">Le calcul arrive en phase 3</div>
    </section>

    <h2>Vérification du socle (phase 0)</h2>
    <section class="carte">
      <ul class="liste">
        <li>Ouvertures de l'application <span class="ligne-val">${ouvertures}</span></li>
        <li>Catégories en mémoire <span class="ligne-val">${nbCategories} / 22</span></li>
        <li>Date du jour <span class="ligne-val">${dateFR(aujourdhui())}</span></li>
        <li>Format 123456 centimes <span class="ligne-val">${euros(123456)}</span></li>
        <li>Format « 12,5 » saisi <span class="ligne-val">${euros(versCentimes('12,5'))}</span></li>
        <li>Format négatif <span class="ligne-val">${euros(-1250)}</span></li>
      </ul>
    </section>`;
}
