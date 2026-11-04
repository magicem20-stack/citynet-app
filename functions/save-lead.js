const crypto = require('crypto');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Ecomondo 2026';

const CAT_LABELS = {
  pa: 'PA', rifiuti: 'Rifiuti', ente: 'Ente',
  privato: 'Privato', progettista: 'Progettista', universita: 'Università'
};

function formatSub(sub) {
  if (!sub || typeof sub !== 'object') return '';
  return Object.entries(sub)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  } catch {
    return isoString || '';
  }
}

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) throw new Error('Google credentials not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth error: ' + JSON.stringify(data));
  return data.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!SHEET_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GOOGLE_SHEET_ID non configurato' }) };
  }

  let lead;
  try {
    lead = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON non valido' }) };
  }

  // Map lead fields to sheet columns A:R
  const row = [
    formatDate(lead.ts),                          // A: Data
    lead.nome || '',                               // B: Nome
    lead.cognome || '',                            // C: Cognome
    lead.ruolo || '',                              // D: Ruolo
    lead.cell || '',                               // E: Cellulare
    lead.email || '',                              // F: Email
    lead.org || '',                                // G: Organizzazione
    lead.cap || '',                                // H: CAP
    lead.citta || '',                              // I: Città
    '',                                            // J: Provincia (not collected)
    '',                                            // K: Regione (not collected)
    lead.tel || '',                                // L: Telefono
    lead.email_org || '',                          // M: Email org
    CAT_LABELS[lead.categoria] || lead.categoria || '', // N: Categoria
    formatSub(lead.sub),                           // O: Dettagli categoria
    lead.source || '',                             // P: Come conosciuto
    lead.obiettivo || '',                          // Q: Obiettivo
    lead.note || ''                                // R: Note
  ];

  try {
    const token = await getAccessToken();
    const range = encodeURIComponent(`${SHEET_NAME}!A:R`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ values: [row] })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || `HTTP ${res.status}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, updatedRange: result.updates?.updatedRange })
    };
  } catch (err) {
    console.error('[save-lead] Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
