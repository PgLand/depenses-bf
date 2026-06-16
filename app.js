(function setupMobileNav() {
  const mq = window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)');
  function apply() {
    document.documentElement.classList.toggle('mobile-nav', mq.matches);
  }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else mq.addListener(apply);
})();

const KEY = 'depenses_bf_v1';
const PWA_HINT_KEY = 'depenses_bf_import_hint_seen';
const PERIOD_CUTOFF = 15;
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
let state = { repas: [], depenses: [], dettes: [], budgets: [] };
let currentMonth = getCurrentPeriod();

function load() {
  try {
    const d = localStorage.getItem(KEY);
    if (d) {
      const parsed = JSON.parse(d);
      state = { repas: [], depenses: [], dettes: [], budgets: [], ...parsed };
      const migrated = migrateRepasList(state.repas || []);
      const hadOldFields = (state.repas || []).some(r =>
        r.gateau !== undefined || r.boisson !== undefined || r.labas !== undefined
      );
      state.repas = migrated.map(({ gateau, boisson, labas, ...r }) => r);
      if (hadOldFields) save();
    }
  } catch {
    toast('Données locales illisibles — démarrage à zéro', 'error');
  }
}

function migrateRepasList(repas) {
  return repas.map(r => ({
    ...r,
    snack: (r.snack ?? r.gateau ?? 0) + (r.labas ?? r.boisson ?? 0)
  }));
}

function repasTotal(r) {
  return (r.petit || 0) + (r.dej || 0) + (r.diner || 0) + (r.snack || 0);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Espace de stockage plein — exportez vos données', 'error');
  }
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' FCFA';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function periodKey(y, m) {
  return `${y}-${pad2(m)}`;
}

function shiftMonth(y, m, delta) {
  let nm = m + delta;
  let ny = y;
  while (nm > 12) { nm -= 12; ny += 1; }
  while (nm < 1) { nm += 12; ny -= 1; }
  return [ny, nm];
}

function isoDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function periodRange(periodKeyStr) {
  const [y, m] = periodKeyStr.split('-').map(Number);
  const [ny, nm] = shiftMonth(y, m, 1);
  return {
    start: isoDate(y, m, PERIOD_CUTOFF),
    end: isoDate(ny, nm, PERIOD_CUTOFF)
  };
}

function inMonth(date, m) {
  if (!date || !m) return false;
  const { start, end } = periodRange(m);
  if (date < start || date > end) return false;
  const [y, mo] = m.split('-').map(Number);
  const [, dm] = date.split('-').map(Number);
  const [py, pm] = shiftMonth(y, mo, -1);
  const prevEnd = periodRange(periodKey(py, pm)).end;
  if (date === prevEnd && date === start && dm > pm) return false;
  return true;
}

function getCurrentPeriod(dateStr = todayISO()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const cur = periodKey(y, m);
  const [py, pm] = shiftMonth(y, m, -1);
  const prev = periodKey(py, pm);
  if (d < PERIOD_CUTOFF) return inMonth(dateStr, prev) ? prev : cur;
  return inMonth(dateStr, cur) ? cur : prev;
}

function periodLabel(periodKeyStr) {
  const [y, m] = periodKeyStr.split('-').map(Number);
  const [ny, nm] = shiftMonth(y, m, 1);
  const endYear = nm < m ? ny : y;
  return `15 ${MOIS_FR[m - 1]} – 15 ${MOIS_FR[nm - 1]} ${endYear}`;
}

function updatePeriodLabel() {
  const el = document.getElementById('periodLabel');
  if (el) el.textContent = periodLabel(currentMonth);
}

function hasData() {
  return !!(state.repas.length || state.depenses.length || state.dettes.length || state.budgets.length);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function openTab(tabId) {
  document.querySelectorAll('.tab').forEach(x => {
    x.classList.remove('active');
    x.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  const tab = document.querySelector('.tab[data-tab="' + tabId + '"]');
  if (tab) {
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
  }
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}

function importFromJson(data) {
  if (!validateImport(data)) throw new Error('invalid');
  state = {
    repas: migrateRepasList(data.repas || []),
    depenses: data.depenses || [],
    dettes: data.dettes || [],
    budgets: data.budgets || []
  };
  save();
  renderAll();
}

function handleImportFile(file, inputEl) {
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      importFromJson(JSON.parse(ev.target.result));
      toast('Données importées avec succès');
      document.getElementById('pwaImportModal').hidden = true;
    } catch {
      toast('Fichier JSON invalide ou incomplet', 'error');
    }
    if (inputEl) inputEl.value = '';
  };
  r.readAsText(file);
}

async function exportData() {
  const json = JSON.stringify(state, null, 2);
  const filename = 'depenses-bf-' + todayISO() + '.json';
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: 'Dépenses BF — sauvegarde' });
      toast('Enregistrez le fichier, puis importez-le dans l’app installée');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Export téléchargé — cherchez-le dans Fichiers → Téléchargements');
}

function updateStorageContextUI() {
  const el = document.getElementById('storageContext');
  if (!el) return;
  el.textContent = isStandalone() ? 'l’application installée' : 'Safari / ce navigateur';
}

function updateInstallWarnings() {
  const warn = document.getElementById('safariInstallWarn');
  const shareBtn = document.getElementById('btnShareExport');
  if (warn) warn.hidden = !(isIOS() && !isStandalone() && hasData());
  if (shareBtn) shareBtn.hidden = !(navigator.share && isIOS());
}

function checkPwaDataHint() {
  if (!isStandalone() || hasData() || localStorage.getItem(PWA_HINT_KEY)) return;
  const modal = document.getElementById('pwaImportModal');
  if (!modal) return;
  modal.hidden = false;
  openTab('parametres');
}

function setupImportHandlers(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.onchange = e => handleImportFile(e.target.files[0], e.target);
}

function setupPwaStorageUI() {
  updateStorageContextUI();
  updateInstallWarnings();
  checkPwaDataHint();

  const btnBefore = document.getElementById('btnExportBeforeInstall');
  const btnShare = document.getElementById('btnShareExport');
  const btnDismiss = document.getElementById('btnModalDismiss');
  if (btnBefore) btnBefore.onclick = exportData;
  if (btnShare) btnShare.onclick = exportData;
  if (btnDismiss) {
    btnDismiss.onclick = () => {
      localStorage.setItem(PWA_HINT_KEY, '1');
      document.getElementById('pwaImportModal').hidden = true;
    };
  }

  setupImportHandlers('fileImport');
  setupImportHandlers('fileImportModal');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function jourSemaine(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return JOURS[new Date(y, m - 1, d).getDay()];
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function validateImport(data) {
  if (!data || typeof data !== 'object') return false;
  const arrays = ['repas', 'depenses', 'dettes', 'budgets'];
  return arrays.every(k => Array.isArray(data[k]));
}

function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" class="empty">${esc(msg)}</td></tr>`;
}

function td(content, label) {
  return label ? `<td data-label="${esc(label)}">${content}</td>` : `<td>${content}</td>`;
}

function actionCell(editFn, delFn, id, extra = '') {
  return `<td class="actions">
    <button class="edit-btn" onclick="${editFn}('${esc(id)}')" aria-label="Modifier" title="Modifier">✎</button>
    ${extra}
    <button class="del" onclick="${delFn}('${esc(id)}')" aria-label="Supprimer">×</button>
  </td>`;
}

function setEditMode(form, submitBtn, cancelBtn, editing, addLabel, editLabel) {
  form.classList.toggle('editing', editing);
  submitBtn.textContent = editing ? editLabel : addLabel;
  cancelBtn.hidden = !editing;
}

function scrollToForm(form) {
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Tabs
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    t.setAttribute('aria-selected', 'true');
    document.getElementById(t.dataset.tab).classList.add('active');
    if (document.documentElement.classList.contains('mobile-nav')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
});

// Period (du 15 au 15)
const pm = document.getElementById('periodMonth');
pm.value = currentMonth;
updatePeriodLabel();
pm.onchange = () => {
  currentMonth = pm.value;
  updatePeriodLabel();
  renderAll();
};

// REPAS
const formRepas = document.getElementById('formRepas');
const btnRepas = document.getElementById('btnRepas');
const btnRepasCancel = document.getElementById('btnRepasCancel');

document.getElementById('rDate').value = todayISO();

function resetRepasForm() {
  formRepas.reset();
  document.getElementById('rEditId').value = '';
  document.getElementById('rDate').value = todayISO();
  setEditMode(formRepas, btnRepas, btnRepasCancel, false, 'Ajouter', 'Enregistrer');
}

btnRepasCancel.onclick = resetRepasForm;

window.editRepas = id => {
  const r = state.repas.find(x => x.id === id);
  if (!r) return;
  document.getElementById('rEditId').value = r.id;
  document.getElementById('rDate').value = r.date;
  document.getElementById('rPetit').value = r.petit || '';
  document.getElementById('rDej').value = r.dej || '';
  document.getElementById('rDiner').value = r.diner || '';
  document.getElementById('rSnack').value = r.snack || '';
  setEditMode(formRepas, btnRepas, btnRepasCancel, true, 'Ajouter', 'Enregistrer');
  scrollToForm(formRepas);
  toast('Modification — validez ou annulez');
};

formRepas.onsubmit = e => {
  e.preventDefault();
  const editId = document.getElementById('rEditId').value;
  const date = document.getElementById('rDate').value;
  const entry = {
    petit: +document.getElementById('rPetit').value || 0,
    dej: +document.getElementById('rDej').value || 0,
    diner: +document.getElementById('rDiner').value || 0,
    snack: +document.getElementById('rSnack').value || 0
  };
  const total = repasTotal(entry);
  if (total <= 0) {
    toast('Saisissez au moins un montant', 'error');
    return;
  }
  if (editId) {
    const r = state.repas.find(x => x.id === editId);
    const conflict = state.repas.find(x => x.date === date && x.id !== editId);
    if (conflict) {
      toast('Un repas existe déjà pour cette date', 'error');
      return;
    }
    Object.assign(r, { date, ...entry });
    toast('Repas modifié');
  } else {
    const existing = state.repas.find(r => r.date === date);
    if (existing) {
      Object.assign(existing, entry);
      toast('Repas du ' + date + ' mis à jour');
    } else {
      state.repas.push({ id: uid(), date, ...entry });
      toast('Repas enregistré');
    }
  }
  save();
  resetRepasForm();
  renderRepas();
  renderDashboard();
};

function renderRepas() {
  const tb = document.querySelector('#tblRepas tbody');
  tb.innerHTML = '';
  let tp = 0, td = 0, tdi = 0, tsn = 0, tt = 0;
  const rows = state.repas
    .filter(r => inMonth(r.date, currentMonth))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) {
    tb.innerHTML = emptyRow(8, 'Aucun repas pour cette période');
  } else {
    rows.forEach(r => {
      const tot = repasTotal(r);
      tp += r.petit || 0;
      td += r.dej || 0;
      tdi += r.diner || 0;
      tsn += r.snack || 0;
      tt += tot;
      tb.innerHTML += `<tr>
        ${td(esc(r.date), 'Date')}
        ${td(esc(jourSemaine(r.date)), 'Jour')}
        ${td(r.petit ? fmt(r.petit) : '—', 'Petit-déj')}
        ${td(r.dej ? fmt(r.dej) : '—', 'Déjeuner')}
        ${td(r.diner ? fmt(r.diner) : '—', 'Dîner')}
        ${td(r.snack ? fmt(r.snack) : '—', 'Snack')}
        ${td('<b>' + fmt(tot) + '</b>', 'Total')}
        ${actionCell('editRepas', 'delRepas', r.id)}
      </tr>`;
    });
  }
  document.getElementById('trPetit').textContent = fmt(tp);
  document.getElementById('trDej').textContent = fmt(td);
  document.getElementById('trDiner').textContent = fmt(tdi);
  document.getElementById('trSnack').textContent = fmt(tsn);
  document.getElementById('trTotal').textContent = fmt(tt);
}

window.delRepas = id => {
  if (confirm('Supprimer ce repas ?')) {
    state.repas = state.repas.filter(x => x.id !== id);
    save();
    renderRepas();
    renderDashboard();
    toast('Repas supprimé');
  }
};

// DEPENSES
const formDep = document.getElementById('formDep');
const btnDep = document.getElementById('btnDep');
const btnDepCancel = document.getElementById('btnDepCancel');

document.getElementById('dDate').value = todayISO();

function resetDepForm() {
  formDep.reset();
  document.getElementById('dEditId').value = '';
  document.getElementById('dDate').value = todayISO();
  setEditMode(formDep, btnDep, btnDepCancel, false, 'Ajouter', 'Enregistrer');
}

btnDepCancel.onclick = resetDepForm;

window.editDep = id => {
  const d = state.depenses.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dEditId').value = d.id;
  document.getElementById('dDate').value = d.date;
  document.getElementById('dCat').value = d.cat;
  document.getElementById('dLib').value = d.lib;
  document.getElementById('dMont').value = d.mont;
  setEditMode(formDep, btnDep, btnDepCancel, true, 'Ajouter', 'Enregistrer');
  scrollToForm(formDep);
  toast('Modification — validez ou annulez');
};

formDep.onsubmit = e => {
  e.preventDefault();
  const editId = document.getElementById('dEditId').value;
  const mont = +document.getElementById('dMont').value;
  if (mont <= 0) {
    toast('Le montant doit être supérieur à 0', 'error');
    return;
  }
  const data = {
    date: document.getElementById('dDate').value,
    cat: document.getElementById('dCat').value,
    lib: document.getElementById('dLib').value.trim(),
    mont
  };
  if (editId) {
    Object.assign(state.depenses.find(x => x.id === editId), data);
    toast('Dépense modifiée');
  } else {
    state.depenses.push({ id: uid(), ...data });
    toast('Dépense ajoutée');
  }
  save();
  resetDepForm();
  renderDep();
  renderDashboard();
};

document.getElementById('dSearch').oninput = renderDep;

function renderDep() {
  const q = document.getElementById('dSearch').value.toLowerCase();
  const tb = document.querySelector('#tblDep tbody');
  tb.innerHTML = '';
  let tot = 0;
  const rows = state.depenses
    .filter(d => inMonth(d.date, currentMonth))
    .filter(d => !q || d.lib.toLowerCase().includes(q) || d.cat.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) {
    tb.innerHTML = emptyRow(5, q ? 'Aucun résultat' : 'Aucune dépense pour cette période');
  } else {
    rows.forEach(d => {
      tot += d.mont;
      tb.innerHTML += `<tr>
        ${td(esc(d.date), 'Date')}
        ${td(esc(d.cat), 'Catégorie')}
        ${td(esc(d.lib), 'Libellé')}
        ${td(fmt(d.mont), 'Montant')}
        ${actionCell('editDep', 'delDep', d.id)}
      </tr>`;
    });
  }
  document.getElementById('tDepTotal').textContent = fmt(tot);
}

window.delDep = id => {
  if (confirm('Supprimer cette dépense ?')) {
    state.depenses = state.depenses.filter(x => x.id !== id);
    save();
    renderDep();
    renderDashboard();
    toast('Dépense supprimée');
  }
};

// DETTES
const formDet = document.getElementById('formDet');
const btnDet = document.getElementById('btnDet');
const btnDetCancel = document.getElementById('btnDetCancel');

document.getElementById('eDate').value = todayISO();

function resetDetForm() {
  formDet.reset();
  document.getElementById('eEditId').value = '';
  document.getElementById('eDate').value = todayISO();
  setEditMode(formDet, btnDet, btnDetCancel, false, 'Ajouter', 'Enregistrer');
}

btnDetCancel.onclick = resetDetForm;

window.editDet = id => {
  const d = state.dettes.find(x => x.id === id);
  if (!d) return;
  document.getElementById('eEditId').value = d.id;
  document.getElementById('eDate').value = d.date;
  document.getElementById('eNom').value = d.nom;
  document.getElementById('eMont').value = d.mont;
  document.getElementById('eStatut').value = d.statut;
  setEditMode(formDet, btnDet, btnDetCancel, true, 'Ajouter', 'Enregistrer');
  scrollToForm(formDet);
  toast('Modification — validez ou annulez');
};

formDet.onsubmit = e => {
  e.preventDefault();
  const editId = document.getElementById('eEditId').value;
  const mont = +document.getElementById('eMont').value;
  if (mont <= 0) {
    toast('Le montant doit être supérieur à 0', 'error');
    return;
  }
  const data = {
    date: document.getElementById('eDate').value,
    nom: document.getElementById('eNom').value.trim(),
    mont,
    statut: document.getElementById('eStatut').value
  };
  if (editId) {
    Object.assign(state.dettes.find(x => x.id === editId), data);
    toast('Dette modifiée');
  } else {
    state.dettes.push({ id: uid(), ...data });
    toast('Dette enregistrée');
  }
  save();
  resetDetForm();
  renderDet();
  renderDashboard();
};

function renderDet() {
  const tb = document.querySelector('#tblDet tbody');
  tb.innerHTML = '';
  let reste = 0;
  const rows = state.dettes.sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) {
    tb.innerHTML = emptyRow(5, 'Aucune dette enregistrée');
  } else {
    rows.forEach(d => {
      if (d.statut === 'dû') reste += d.mont;
      const bc = d.statut === 'dû' ? 'b-due' : 'b-paid';
      tb.innerHTML += `<tr>
        ${td(esc(d.date), 'Date')}
        ${td(esc(d.nom), 'Personne')}
        ${td(fmt(d.mont), 'Montant')}
        ${td('<span class="badge ' + bc + '">' + esc(d.statut) + '</span>', 'Statut')}
        <td class="actions">
          <button class="edit-btn" onclick="editDet('${esc(d.id)}')" aria-label="Modifier" title="Modifier">✎</button>
          <button onclick="toggleDet('${esc(d.id)}')" aria-label="Changer statut" title="Basculer statut">↔</button>
          <button class="del" onclick="delDet('${esc(d.id)}')" aria-label="Supprimer">×</button>
        </td>
      </tr>`;
    });
  }
  document.getElementById('tDetReste').textContent = fmt(reste);
}

window.toggleDet = id => {
  const d = state.dettes.find(x => x.id === id);
  d.statut = d.statut === 'dû' ? 'remboursé' : 'dû';
  save();
  renderDet();
  renderDashboard();
  toast(d.statut === 'remboursé' ? 'Dette marquée remboursée' : 'Dette marquée due');
};

window.delDet = id => {
  if (confirm('Supprimer cette dette ?')) {
    state.dettes = state.dettes.filter(x => x.id !== id);
    save();
    renderDet();
    renderDashboard();
    toast('Dette supprimée');
  }
};

// BUDGET
const formBud = document.getElementById('formBud');
const btnBud = document.getElementById('btnBud');
const btnBudCancel = document.getElementById('btnBudCancel');

document.getElementById('bMois').value = currentMonth;

function resetBudForm() {
  formBud.reset();
  document.getElementById('bEditId').value = '';
  document.getElementById('bMois').value = currentMonth;
  setEditMode(formBud, btnBud, btnBudCancel, false, 'Enregistrer', 'Enregistrer');
}

btnBudCancel.onclick = resetBudForm;

window.editBud = id => {
  const b = state.budgets.find(x => x.id === id);
  if (!b) return;
  document.getElementById('bEditId').value = b.id;
  document.getElementById('bMois').value = b.mois;
  document.getElementById('bMont').value = b.mont;
  setEditMode(formBud, btnBud, btnBudCancel, true, 'Enregistrer', 'Enregistrer');
  scrollToForm(formBud);
  toast('Modification — validez ou annulez');
};

formBud.onsubmit = e => {
  e.preventDefault();
  const editId = document.getElementById('bEditId').value;
  const m = document.getElementById('bMois').value;
  const mt = +document.getElementById('bMont').value;
  if (mt <= 0) {
    toast('Le budget doit être supérieur à 0', 'error');
    return;
  }
  if (editId) {
    const b = state.budgets.find(x => x.id === editId);
    const conflict = state.budgets.find(x => x.mois === m && x.id !== editId);
    if (conflict) {
      toast('Un budget existe déjà pour cette période', 'error');
      return;
    }
    b.mois = m;
    b.mont = mt;
    toast('Budget modifié');
  } else {
    const ex = state.budgets.find(b => b.mois === m);
    if (ex) ex.mont = mt;
    else state.budgets.push({ id: uid(), mois: m, mont: mt });
    toast('Budget enregistré');
  }
  save();
  resetBudForm();
  renderBud();
  renderDashboard();
};

function renderBud() {
  const tb = document.querySelector('#tblBud tbody');
  tb.innerHTML = '';
  const rows = state.budgets.sort((a, b) => b.mois.localeCompare(a.mois));
  if (!rows.length) {
    tb.innerHTML = emptyRow(5, 'Aucun budget défini — ajoutez-en un ci-dessus');
  } else {
    rows.forEach(b => {
      const dep = depMois(b.mois) + repasMois(b.mois);
      const reste = b.mont - dep;
      const cls = reste < 0 ? 'text-danger' : 'text-success';
      tb.innerHTML += `<tr>
        ${td(periodLabel(b.mois), 'Période')}
        ${td(fmt(b.mont), 'Budget')}
        ${td(fmt(dep), 'Dépenses')}
        ${td('<span class="' + cls + '"><b>' + fmt(reste) + '</b></span>', 'Reste')}
        ${actionCell('editBud', 'delBud', b.id)}
      </tr>`;
    });
  }
}

window.delBud = id => {
  if (confirm('Supprimer ce budget ?')) {
    state.budgets = state.budgets.filter(x => x.id !== id);
    save();
    renderBud();
    renderDashboard();
    toast('Budget supprimé');
  }
};

function depMois(m) {
  return state.depenses.filter(d => inMonth(d.date, m)).reduce((s, d) => s + d.mont, 0);
}

function repasMois(m) {
  return state.repas
    .filter(r => inMonth(r.date, m))
    .reduce((s, r) => s + repasTotal(r), 0);
}

// DASHBOARD
function renderDashboard() {
  const m = currentMonth;
  const bud = state.budgets.find(b => b.mois === m);
  const budM = bud ? bud.mont : 0;
  const dep = depMois(m) + repasMois(m);
  const dette = state.dettes.filter(d => d.statut === 'dû').reduce((s, d) => s + d.mont, 0);
  const reste = budM - dep;

  document.getElementById('dBudget').textContent = fmt(budM);
  document.getElementById('dDep').textContent = fmt(dep);

  const resteEl = document.getElementById('dReste');
  resteEl.textContent = fmt(reste);
  const resteCard = resteEl.closest('.card');
  resteCard.classList.toggle('danger', reste < 0);
  resteCard.classList.toggle('highlight', reste >= 0);

  document.getElementById('dDette').textContent = fmt(dette);

  // Budget progress
  const progressBox = document.getElementById('budgetProgress');
  if (budM > 0) {
    const pct = Math.min(100, Math.round((dep / budM) * 100));
    progressBox.hidden = false;
    document.getElementById('progLabel').textContent = pct + ' % du budget utilisé';
    const bar = document.getElementById('progBar');
    bar.style.width = pct + '%';
    bar.className = 'progress-fill' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');
  } else {
    progressBox.hidden = true;
  }

  // Top cat
  const cats = {};
  state.depenses.filter(d => inMonth(d.date, m)).forEach(d => {
    cats[d.cat] = (cats[d.cat] || 0) + d.mont;
  });
  const rm = repasMois(m);
  if (rm) cats['Repas (quotidien)'] = rm;
  const tc = document.querySelector('#tblTopCat tbody');
  tc.innerHTML = '';
  const topEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!topEntries.length) {
    tc.innerHTML = emptyRow(2, 'Aucune dépense');
  } else {
    topEntries.forEach(([c, v]) => {
      tc.innerHTML += `<tr>${td(esc(c), 'Catégorie')}${td(fmt(v), 'Montant')}</tr>`;
    });
  }

  // Last ops
  const all = [
    ...state.depenses.map(d => ({
      date: d.date,
      type: 'Dépense',
      lib: d.lib + ' (' + d.cat + ')',
      mont: -d.mont
    })),
    ...state.repas.map(r => ({
      date: r.date,
      type: 'Repas',
      lib: 'repas du jour',
      mont: -repasTotal(r)
    }))
  ]
    .filter(o => inMonth(o.date, m))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const tl = document.querySelector('#tblLast tbody');
  tl.innerHTML = '';
  if (!all.length) {
    tl.innerHTML = emptyRow(4, 'Aucune opération cette période');
  } else {
    all.forEach(o => {
      const cls = o.mont < 0 ? 'text-danger' : 'text-success';
      tl.innerHTML += `<tr>
        ${td(esc(o.date), 'Date')}
        ${td(esc(o.type), 'Type')}
        ${td(esc(o.lib), 'Libellé')}
        ${td('<span class="' + cls + '">' + fmt(Math.abs(o.mont)) + '</span>', 'Montant')}
      </tr>`;
    });
  }
}

// PARAMETRES
document.getElementById('btnExport').onclick = exportData;

document.getElementById('btnReset').onclick = () => {
  if (confirm('Tout effacer ? Cette action est irréversible.')) {
    state = { repas: [], depenses: [], dettes: [], budgets: [] };
    save();
    renderAll();
    toast('Toutes les données ont été effacées', 'error');
  }
};

function renderAll() {
  resetRepasForm();
  resetDepForm();
  resetDetForm();
  resetBudForm();
  renderRepas();
  renderDep();
  renderDet();
  renderBud();
  renderDashboard();
  updateInstallWarnings();
}

load();
renderAll();
setupPwaStorageUI();

// PWA — service worker & installation
let deferredInstallPrompt = null;
const btnInstall = document.getElementById('btnInstall');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  btnInstall.hidden = false;
});

btnInstall.onclick = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  btnInstall.hidden = true;
  if (outcome === 'accepted') toast('Application installée');
};

window.addEventListener('appinstalled', () => {
  btnInstall.hidden = true;
  toast('Application installée sur votre appareil');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=4').then(reg => reg.update()).catch(() => {});
  });
}
