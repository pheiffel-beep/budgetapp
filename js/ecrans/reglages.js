// Écran Réglages. Phase 0 : choix du thème (enregistré) + version.
// Phase 2 : accès aux charges et revenus fixes. Le reste arrive en phase 4.

import { db } from '../db.js';
import { appliquerTheme, VERSION } from '../app.js';
import { toast } from '../ui.js';

const THEMES = [
  { val: 'sombre', label: 'Sombre' },
  { val: 'clair',  label: 'Clair' },
  { val: 'auto',   label: 'Auto' },
];

export async function afficher(el) {
  const actuel = await db.parametre('theme', 'sombre');

  el.innerHTML = `
    <h1>Réglages</h1>

    <h2>Mes données</h2>
    <section class="carte carte-liste"><ul class="liste">
      <li class="ligne-btn"><button type="button" id="g-recurrents">
        <i data-lucide="repeat"></i><span>Charges et revenus fixes</span>
        <i data-lucide="chevron-right" class="ligne-val muet"></i></button></li>
    </ul></section>

    <h2>Thème</h2>
    <div class="segment" role="group" aria-label="Thème">
      ${THEMES.map(t => `<button type="button" data-theme-choix="${t.val}"
          aria-pressed="${t.val === actuel}">${t.label}</button>`).join('')}
    </div>

    <h2>À propos</h2>
    <section class="carte">
      <ul class="liste">
        <li>Version <span class="ligne-val muet">${VERSION}</span></li>
        <li>Données <span class="ligne-val muet">sur ce téléphone uniquement</span></li>
      </ul>
    </section>`;

  el.querySelector('#g-recurrents').onclick = () =>
    window.dispatchEvent(new CustomEvent('naviguer', { detail: 'recurrents' }));

  el.querySelectorAll('[data-theme-choix]').forEach(b => b.addEventListener('click', async () => {
    const choix = b.dataset.themeChoix;
    await db.definirParametre('theme', choix);
    await appliquerTheme(choix);
    el.querySelectorAll('[data-theme-choix]').forEach(x =>
      x.setAttribute('aria-pressed', x.dataset.themeChoix === choix));
    toast('Thème enregistré');
  }));
}
