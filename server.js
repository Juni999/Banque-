/**
 * Méridien Banque — Backend Express
 * Stack : Node.js + Express + fs + crypto (aucune autre dépendance)
 * Stockage utilisateurs : users.txt (une ligne par utilisateur : username:hash:date)
 * Stockage comptes/transactions/bénéficiaires : data.json (fichier local, PAS une base de données)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, 'users.txt');
const DATA_FILE = path.join(__dirname, 'data.json');

// Sel applicatif fixe pour le hash "simple" demandé (crypto.createHash).
// NB : en production réelle, préférez crypto.scrypt / bcrypt avec sel par utilisateur.
const SALT = 'Meridien_Banque_Sel_App_2026';

// ---------------------------------------------------------------------------
// Initialisation des fichiers de stockage (créés automatiquement s'ils n'existent pas)
// ---------------------------------------------------------------------------
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '', 'utf8');
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf8');
}

app.use(express.json());

// IMPORTANT : seul le dossier public/ est servi statiquement.
// users.txt et data.json sont dans le dossier racine et ne sont donc JAMAIS
// accessibles directement depuis le navigateur.
app.use(express.static('.'));

// ---------------------------------------------------------------------------
// Sessions simples en mémoire (token aléatoire <-> username), via cookie HttpOnly
// ---------------------------------------------------------------------------
const sessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, username);
  return token;
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
  }
  req.username = sessions.get(token);
  next();
}

// ---------------------------------------------------------------------------
// Utilitaires sécurité / validation
// ---------------------------------------------------------------------------
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 100;
}

// Échappe les entrées utilisateur avant stockage/affichage (protection XSS supplémentaire côté serveur)
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

// ---------------------------------------------------------------------------
// Gestion de users.txt
// Format exact d'une ligne : username:hashDuMotDePasse:dateCreationISO
// ---------------------------------------------------------------------------
function readUsersFile() {
  const content = fs.readFileSync(USERS_FILE, 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const [username, hash, date] = line.split(':');
      return { username, hash, date };
    });
}

function findUser(username) {
  return readUsersFile().find((u) => u.username === username);
}

function appendUser(username, hash) {
  const line = `${username}:${hash}:${new Date().toISOString()}\n`;
  fs.appendFileSync(USERS_FILE, line, 'utf8');
}

// ---------------------------------------------------------------------------
// Gestion de data.json (comptes / transactions / bénéficiaires par utilisateur)
// ---------------------------------------------------------------------------
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createDefaultUserData() {
  const now = new Date().toISOString();
  return {
    accounts: [
      { id: 'courant', nom: 'Compte Courant', solde: 1500 },
      { id: 'epargne', nom: 'Compte Épargne', solde: 3200 },
    ],
    transactions: [
      { id: crypto.randomUUID(), compteId: 'courant', type: 'credit', montant: 1500, libelle: 'Dépôt initial', date: now },
      { id: crypto.randomUUID(), compteId: 'epargne', type: 'credit', montant: 3200, libelle: 'Dépôt initial', date: now },
    ],
    beneficiaries: [],
  };
}

// =============================================================================
// ROUTES — AUTHENTIFICATION
// =============================================================================

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!isValidUsername(username)) {
    return res.status(400).json({
      error: "Identifiant invalide (3 à 30 caractères : lettres, chiffres, points, tirets ou underscores).",
    });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Mot de passe invalide (6 caractères minimum).' });
  }
  if (findUser(username)) {
    return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
  }

  const hash = hashPassword(password);
  appendUser(username, hash);

  const data = readData();
  data[username] = createDefaultUserData();
  writeData(data);

  return res.status(201).json({ message: 'Compte créé avec succès. Vous pouvez vous connecter.' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!isValidUsername(username) || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Identifiant ou mot de passe invalide.' });
  }

  const user = findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'Identifiant introuvable.' });
  }

  const hash = hashPassword(password);
  if (hash !== user.hash) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  const token = createSession(username);
  res.setHeader(
    'Set-Cookie',
    `session_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );
  return res.json({ message: 'Connexion réussie.', username });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const cookies = parseCookies(req);
  sessions.delete(cookies.session_token);
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ message: 'Déconnecté.' });
});

app.get('/api/session', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  if (token && sessions.has(token)) {
    return res.json({ authenticated: true, username: sessions.get(token) });
  }
  return res.json({ authenticated: false });
});

// =============================================================================
// ROUTES — DONNÉES BANCAIRES (toutes protégées par requireAuth)
// =============================================================================

app.get('/api/dashboard', requireAuth, (req, res) => {
  const data = readData();
  const userData = data[req.username];
  if (!userData) return res.status(404).json({ error: 'Données introuvables.' });

  const solde_total = userData.accounts.reduce((sum, c) => sum + c.solde, 0);
  res.json({ accounts: userData.accounts, solde_total });
});

app.get('/api/transactions', requireAuth, (req, res) => {
  const data = readData();
  const userData = data[req.username];
  if (!userData) return res.status(404).json({ error: 'Données introuvables.' });

  let transactions = [...userData.transactions];
  const { compteId, type, dateMin, dateMax } = req.query;

  if (compteId) transactions = transactions.filter((t) => t.compteId === compteId);
  if (type) transactions = transactions.filter((t) => t.type === type);
  if (dateMin) transactions = transactions.filter((t) => new Date(t.date) >= new Date(dateMin));
  if (dateMax) transactions = transactions.filter((t) => new Date(t.date) <= new Date(dateMax));

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ transactions, accounts: userData.accounts });
});

app.post('/api/transfer', requireAuth, (req, res) => {
  const { fromAccount, toAccount, amount, libelle } = req.body || {};
  const montant = Number(amount);

  if (!fromAccount || !toAccount || fromAccount === toAccount) {
    return res.status(400).json({ error: 'Comptes source et destination invalides.' });
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }

  const data = readData();
  const userData = data[req.username];
  const source = userData.accounts.find((c) => c.id === fromAccount);
  const dest = userData.accounts.find((c) => c.id === toAccount);

  if (!source || !dest) {
    return res.status(404).json({ error: 'Compte introuvable.' });
  }
  if (source.solde < montant) {
    return res.status(400).json({ error: 'Solde insuffisant.' });
  }

  source.solde = Math.round((source.solde - montant) * 100) / 100;
  dest.solde = Math.round((dest.solde + montant) * 100) / 100;

  const now = new Date().toISOString();
  const label = sanitizeText(libelle) || 'Virement interne';

  userData.transactions.push({
    id: crypto.randomUUID(),
    compteId: source.id,
    type: 'debit',
    montant,
    libelle: `${label} vers ${dest.nom}`,
    date: now,
  });
  userData.transactions.push({
    id: crypto.randomUUID(),
    compteId: dest.id,
    type: 'credit',
    montant,
    libelle: `${label} depuis ${source.nom}`,
    date: now,
  });

  writeData(data);
  res.json({ message: 'Virement effectué avec succès.', accounts: userData.accounts });
});

app.get('/api/beneficiaries', requireAuth, (req, res) => {
  const data = readData();
  const userData = data[req.username];
  res.json({ beneficiaries: userData.beneficiaries });
});

app.post('/api/beneficiaries', requireAuth, (req, res) => {
  const { nom, iban } = req.body || {};
  const nomClean = sanitizeText(nom);
  const ibanClean = sanitizeText(iban).toUpperCase().replace(/\s/g, '');

  if (!nomClean || nomClean.length < 2 || nomClean.length > 60) {
    return res.status(400).json({ error: 'Nom de bénéficiaire invalide (2 à 60 caractères).' });
  }
  if (!/^[A-Z0-9]{15,34}$/.test(ibanClean)) {
    return res.status(400).json({ error: 'IBAN invalide.' });
  }

  const data = readData();
  const userData = data[req.username];
  userData.beneficiaries.push({ id: crypto.randomUUID(), nom: nomClean, iban: ibanClean });
  writeData(data);

  res.status(201).json({ message: 'Bénéficiaire ajouté avec succès.', beneficiaries: userData.beneficiaries });
});

app.delete('/api/beneficiaries/:id', requireAuth, (req, res) => {
  const data = readData();
  const userData = data[req.username];
  const before = userData.beneficiaries.length;
  userData.beneficiaries = userData.beneficiaries.filter((b) => b.id !== req.params.id);

  if (userData.beneficiaries.length === before) {
    return res.status(404).json({ error: 'Bénéficiaire introuvable.' });
  }

  writeData(data);
  res.json({ message: 'Bénéficiaire supprimé.', beneficiaries: userData.beneficiaries });
});

// ---------------------------------------------------------------------------
// Blocage explicite de tout accès direct aux fichiers de stockage
// (redondant avec express.static qui ne sert que public/, mais explicite)
// ---------------------------------------------------------------------------
app.get(['/users.txt', '/data.json'], (req, res) => {
  res.status(403).json({ error: 'Accès interdit.' });
});

// Gestion propre des erreurs non interceptées
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

app.listen(PORT, () => {
  console.log(`✅ Méridien Banque démarré sur http://localhost:${PORT}`);
});
