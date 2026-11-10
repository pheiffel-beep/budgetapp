// Ligne d'opération (historique, accueil) et ses gestes :
// toucher = modifier · glisser vers la gauche = supprimer · appui long = menu.

import { euros, dateFR } from './format.js';
import { esc, pastille, ouvrirPanneau, fermerPanneau } from './ui.js';
import { libelleOperation, montantSigne } from './operations.js';
import { ouvrirSaisie, supprimerAvecAnnulation } from './saisie.js';
import { ouvrirFiche } from './ecrans/fiche-categorie.js';
import { db } from './db.js';

const ICONE_VIREMENT = { icone: 'arrow-left-right', couleur: '#8c95a6' };

export function htmlLigne(op, cat, { avecDate = false } = {}) {
  const visuel = op.type === 'virement' ? ICONE_VIREMENT : (cat || { icone: 'circle-help', couleur: '#8c95a6' });
  const note = op.note && op.note !== libelleOperation(op, cat) ? op.note : '';
  const sous = [avecDate ? dateFR(op.date) : '', note, op.compte].filter(Boolean).map(esc).join(' · ');
  const val = montantSigne(op);
  const positif = op.type === 'entree' || op.type === 'remboursement';
  const signe = positif ? '+' : '';
  const classe = positif ? 'pos' : op.type === 'virement' ? 'neutre' : '';
  return `
    <li class="op" data-id="${op.id}">
      <div class="op-fond" aria-hidden="true"><i data-lucide="trash-2"></i></div>
      <button type="button" class="op-contenu" aria-label="${esc(libelleOperation(op, cat))}, ${euros(val)}. Toucher pour modifier.">
        ${pastille(visuel)}
        <span class="op-texte">
          <span class="op-titre">${esc(libelleOperation(op, cat))}</span>
          ${sous ? `<span class="op-sous">${sous}</span>` : ''}
        </span>
        <span class="op-montant ${classe}">${signe}${euros(val)}</span>
      </button>
    </li>`;
}

/** Branche les gestes sur toutes les lignes d'une liste */
export function activerGestes(liste, operations) {
  const parId = Object.fromEntries(operations.map(o => [o.id, o]));

  liste.querySelectorAll('.op').forEach(li => {
    const contenu = li.querySelector('.op-contenu');
    const id = Number(li.dataset.id);
    let x0 = 0, y0 = 0, dx = 0, glisse = false, annule = false, minuteur = null, geste = false;

    contenu.addEventListener('pointerdown', e => {
      x0 = e.clientX; y0 = e.clientY; dx = 0; glisse = false; annule = false; geste = false;
      try { contenu.setPointerCapture(e.pointerId); } catch { /* pas grave */ }   // le geste reste suivi même si le doigt revient en arrière
      minuteur = setTimeout(() => { geste = true; menu(parId[id]); }, 550);
    });
    contenu.addEventListener('pointermove', e => {
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(minuteur);
      if (annule) return;
      if (!glisse && Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { annule = true; return; }
      if (mx < -10 || glisse) {
        glisse = true; geste = true;
        li.classList.add('glisse');
        dx = Math.min(0, mx);
        contenu.style.transform = `translateX(${dx}px)`;
        li.classList.toggle('pret', dx < -90);
      }
    });
    const fin = () => {
      clearTimeout(minuteur);
      if (glisse && dx < -90) {
        contenu.style.transform = 'translateX(-100%)';
        setTimeout(() => supprimerAvecAnnulation(id), 150);
      } else {
        contenu.style.transform = '';
        li.classList.remove('pret', 'glisse');
      }
      glisse = false;
    };
    contenu.addEventListener('pointerup', fin);
    contenu.addEventListener('pointercancel', fin);
    contenu.addEventListener('contextmenu', e => e.preventDefault());

    // Le « clic » sert aussi au clavier et à VoiceOver
    contenu.addEventListener('click', () => {
      if (geste) { geste = false; return; }
      ouvrirSaisie(parId[id]);
    });
  });
}

async function menu(op) {
  const cat = op.type !== 'virement' && op.categorie_id != null ? await db.lire('categories', op.categorie_id) : null;
  ouvrirPanneau(`
    <h2 class="titre-panneau">Opération</h2>
    <div class="pile">
      <button type="button" class="btn" id="m-modifier"><i data-lucide="pencil"></i>Modifier</button>
      ${cat ? `<button type="button" class="btn" id="m-fiche"><i data-lucide="chart-column"></i>Tout voir pour ${esc(cat.nom)}</button>` : ''}
      <button type="button" class="btn btn-danger" id="m-supprimer"><i data-lucide="trash-2"></i>Supprimer</button>
      <button type="button" class="btn" id="m-fermer">Fermer</button>
    </div>`);
  document.getElementById('m-modifier').onclick = () => { fermerPanneau(); ouvrirSaisie(op); };
  document.getElementById('m-supprimer').onclick = () => { fermerPanneau(); supprimerAvecAnnulation(op.id); };
  document.getElementById('m-fermer').onclick = fermerPanneau;
  const bf = document.getElementById('m-fiche');
  if (bf) bf.onclick = () => { fermerPanneau(); ouvrirFiche(op.categorie_id, { date: op.date }); };
}
