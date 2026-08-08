'use strict';

/**
 * Méridien Banque — Frontend vanilla JS
 * Toute donnée provenant du serveur est insérée via textContent (jamais innerHTML)
 * afin d'éviter toute injection XSS.
 */

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  let body = {};
  try {
    body = await res.json();
  } catch (e) {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body.error || 'Une erreur est survenue.');
  }
  return body;
}

function formatMontant(valeur) {
  return Number(valeur).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = (el.id === 'auth-message' ? 'auth-message' : 'app-message') + ' ' + type;
  el.hidden = false;
  window.clearTimeout(el._timeout);
  el._timeout = window.setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------------------------------------------------------------------------
// Thème clair / sombre
// ---------------------------------------------------------------------------

function initTheme() {
  const saved = localStorage.getItem('meridien-theme') || 'light';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('meridien-theme', next);
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('theme-icon').textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-icon').textContent = '🌙';
  }
}

// ---------------------------------------------------------------------------
// Écran authentification
// ---------------------------------------------------------------------------

const authMessageEl = document.getElementById('auth-message');

function initAuthTabs() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabRegister.setAttribute('aria-selected', 'false');
    formLogin.hidden = false;
    formRegister.hidden = true;
    authMessageEl.hidden = true;
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    tabRegister.setAttribute('aria-selected', 'true');
    tabLogin.setAttribute('aria-selected', 'false');
    formRegister.hidden = false;
    formLogin.hidden = true;
    authMessageEl.hidden = true;
  });
}

function initAuthForms() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const data = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      await enterApp(data.username);
    } catch (err) {
      showMessage(authMessageEl, err.message, 'error');
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-password-confirm').value;

    if (password !== confirm) {
      showMessage(authMessageEl, 'Les mots de passe ne correspondent pas.', 'error');
      return;
    }

    try {
      await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      showMessage(authMessageEl, 'Compte créé. Vous pouvez vous connecter.', 'success');
      document.getElementById('tab-login').click();
      document.getElementById('login-username').value = username;
    } catch (err) {
      showMessage(authMessageEl, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Transition entre écrans
// ---------------------------------------------------------------------------

let currentAccounts = [];

async function enterApp(username) {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app-screen').hidden = false;
  document.getElementById('current-username').textContent = username;

  await loadDashboard();
  await loadTransactions();
  await loadBeneficiaries();
}

function exitApp() {
  document.getElementById('app-screen').hidden = true;
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

// ---------------------------------------------------------------------------
// Navigation par onglets "registre"
// ---------------------------------------------------------------------------

function initLedgerTabs() {
  const tabs = document.querySelectorAll('.ledger-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

async function loadDashboard() {
  try {
    const data = await apiFetch('/api/dashboard');
    currentAccounts = data.accounts;

    document.getElementById('total-balance').textContent = formatMontant(data.solde_total);

    const grid = document.getElementById('accounts-grid');
    clearChildren(grid);
    data.accounts.forEach((compte) => {
      const card = document.createElement('div');
      card.className = 'account-card';

      const nom = document.createElement('div');
      nom.className = 'account-card__name';
      nom.textContent = compte.nom;

      const solde = document.createElement('div');
      solde.className = 'account-card__balance';
      solde.textContent = formatMontant(compte.solde);

      card.appendChild(nom);
      card.appendChild(solde);
      grid.appendChild(card);
    });

    populateAccountSelects(data.accounts);
  } catch (err) {
    showMessage(document.getElementById('app-message'), err.message, 'error');
  }
}

function populateAccountSelects(accounts) {
  const filterSelect = document.getElementById('filter-account');
  const fromSelect = document.getElementById('transfer-from');
  const toSelect = document.getElementById('transfer-to');

  clearChildren(fromSelect);
  clearChildren(toSelect);

  const currentFilterValue = filterSelect.value;
  clearChildren(filterSelect);
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Tous les comptes';
  filterSelect.appendChild(allOpt);

  accounts.forEach((compte) => {
    const optFilter = document.createElement('option');
    optFilter.value = compte.id;
    optFilter.textContent = compte.nom;
    filterSelect.appendChild(optFilter);

    const optFrom = document.createElement('option');
    optFrom.value = compte.id;
    optFrom.textContent = `${compte.nom} (${formatMontant(compte.solde)})`;
    fromSelect.appendChild(optFrom);

    const optTo = document.createElement('option');
    optTo.value = compte.id;
    optTo.textContent = compte.nom;
    toSelect.appendChild(optTo);
  });

  filterSelect.value = currentFilterValue;
  if (toSelect.options.length > 1) toSelect.selectedIndex = 1;
}

// ---------------------------------------------------------------------------
// Transactions + filtres
// ---------------------------------------------------------------------------

async function loadTransactions(filters = {}) {
  const tbody = document.getElementById('transactions-tbody');
  clearChildren(tbody);
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 5;
  loadingCell.className = 'empty-row';
  loadingCell.textContent = 'Chargement…';
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);

  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const data = await apiFetch('/api/transactions?' + params.toString());
    const accountsById = {};
    data.accounts.forEach((c) => { accountsById[c.id] = c.nom; });

    clearChildren(tbody);

    if (data.transactions.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'empty-row';
      cell.textContent = 'Aucune transaction trouvée.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    data.transactions.forEach((t) => {
      const row = document.createElement('tr');

      const dateCell = document.createElement('td');
      dateCell.textContent = formatDate(t.date);

      const compteCell = document.createElement('td');
      compteCell.textContent = accountsById[t.compteId] || t.compteId;

      const libelleCell = document.createElement('td');
      libelleCell.textContent = t.libelle;

      const typeCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge ' + (t.type === 'credit' ? 'badge--credit' : 'badge--debit');
      badge.textContent = t.type === 'credit' ? 'Crédit' : 'Débit';
      typeCell.appendChild(badge);

      const montantCell = document.createElement('td');
      montantCell.className = 'text-right ' + (t.type === 'credit' ? 'amount-credit' : 'amount-debit');
      montantCell.textContent = (t.type === 'credit' ? '+ ' : '− ') + formatMontant(t.montant);

      row.appendChild(dateCell);
      row.appendChild(compteCell);
      row.appendChild(libelleCell);
      row.appendChild(typeCell);
      row.appendChild(montantCell);
      tbody.appendChild(row);
    });
  } catch (err) {
    clearChildren(tbody);
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-row';
    cell.textContent = err.message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function initFilters() {
  const form = document.getElementById('filters-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadTransactions({
      compteId: document.getElementById('filter-account').value,
      type: document.getElementById('filter-type').value,
      dateMin: document.getElementById('filter-date-min').value,
      dateMax: document.getElementById('filter-date-max').value,
    });
  });

  document.getElementById('reset-filters').addEventListener('click', () => {
    form.reset();
    loadTransactions();
  });
}

// ---------------------------------------------------------------------------
// Virement entre comptes
// ---------------------------------------------------------------------------

function initTransferForm() {
  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const appMessage = document.getElementById('app-message');

    const fromAccount = document.getElementById('transfer-from').value;
    const toAccount = document.getElementById('transfer-to').value;
    const amount = document.getElementById('transfer-amount').value;
    const libelle = document.getElementById('transfer-label').value;

    if (fromAccount === toAccount) {
      showMessage(appMessage, 'Le compte source et le compte destination doivent être différents.', 'error');
      return;
    }

    try {
      await apiFetch('/api/transfer', {
        method: 'POST',
        body: JSON.stringify({ fromAccount, toAccount, amount, libelle }),
      });
      showMessage(appMessage, 'Virement effectué avec succès.', 'success');
      document.getElementById('transfer-form').reset();
      await loadDashboard();
      await loadTransactions();
    } catch (err) {
      showMessage(appMessage, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Bénéficiaires
// ---------------------------------------------------------------------------

async function loadBeneficiaries() {
  const list = document.getElementById('beneficiaries-list');
  try {
    const data = await apiFetch('/api/beneficiaries');
    renderBeneficiaries(data.beneficiaries);
  } catch (err) {
    clearChildren(list);
  }
}

function renderBeneficiaries(beneficiaries) {
  const list = document.getElementById('beneficiaries-list');
  clearChildren(list);

  if (beneficiaries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-row';
    li.textContent = 'Aucun bénéficiaire enregistré.';
    list.appendChild(li);
    return;
  }

  beneficiaries.forEach((b) => {
    const li = document.createElement('li');
    li.className = 'beneficiary-item';

    const info = document.createElement('div');
    info.className = 'beneficiary-item__info';

    const nom = document.createElement('span');
    nom.className = 'beneficiary-item__name';
    nom.textContent = b.nom;

    const iban = document.createElement('span');
    iban.className = 'beneficiary-item__iban';
    iban.textContent = b.iban;

    info.appendChild(nom);
    info.appendChild(iban);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'beneficiary-item__delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', () => deleteBeneficiary(b.id));

    li.appendChild(info);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

async function deleteBeneficiary(id) {
  try {
    const data = await apiFetch('/api/beneficiaries/' + encodeURIComponent(id), { method: 'DELETE' });
    renderBeneficiaries(data.beneficiaries);
  } catch (err) {
    showMessage(document.getElementById('app-message'), err.message, 'error');
  }
}

function initBeneficiaryForm() {
  document.getElementById('beneficiary-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const appMessage = document.getElementById('app-message');
    const nom = document.getElementById('beneficiary-name').value.trim();
    const iban = document.getElementById('beneficiary-iban').value.trim();

    try {
      const data = await apiFetch('/api/beneficiaries', {
        method: 'POST',
        body: JSON.stringify({ nom, iban }),
      });
      showMessage(appMessage, 'Bénéficiaire ajouté.', 'success');
      document.getElementById('beneficiary-form').reset();
      renderBeneficiaries(data.beneficiaries);
    } catch (err) {
      showMessage(appMessage, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Déconnexion
// ---------------------------------------------------------------------------

function initLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch (err) {
      // Même en cas d'erreur réseau, on ramène l'utilisateur à l'écran de connexion.
    }
    exitApp();
  });
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function checkExistingSession() {
  try {
    const data = await apiFetch('/api/session');
    if (data.authenticated) {
      await enterApp(data.username);
    }
  } catch (err) {
    // Pas de session active : on reste sur l'écran de connexion.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuthTabs();
  initAuthForms();
  initLedgerTabs();
  initFilters();
  initTransferForm();
  initBeneficiaryForm();
  initLogout();
  checkExistingSession();
});
