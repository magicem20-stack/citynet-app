const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const HEADERS = [
  'Timestamp', 'Nome', 'Cognome', 'Ruolo', 'Cellulare', 'Email',
  'Organizzazione', 'CAP', 'Città', 'Telefono', 'Email org',
  'Categoria', 'Dettagli categoria', 'Come conosciuto', 'Obiettivo', 'Note'
];

const CAT_LABELS = {
  pa: 'Pubblica Amministrazione',
  rifiuti: 'Gestione rifiuti',
  ente: 'Ente / Ass. ambientale',
  privato: 'Azienda privata',
  progettista: 'Progettista / Ing.',
  universita: 'Università / Ricerca'
};

async function getAuthClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error('Google credentials non configurate.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: SCOPES
  });

  return auth.getClient();
}

async function ensureHeaders(sheets, sheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A1:P1'
  });

  const existing = res.data.values?.[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1:P1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
  }
}

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GOOGLE_SHEET_ID non configurato.' }) };
  }

  let lead;
  try {
    lead = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body non valido.' }) };
  }

  try {
    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    await ensureHeaders(sheets, sheetId);

    const subSummary = lead.sub
      ? Object.values(lead.sub).filter(Boolean).join(' | ')
      : '';

    const row = [
      new Date(lead.ts || Date.now()).toLocaleString('it-IT'),
      lead.nome || '',
      lead.cognome || '',
      lead.ruolo || '',
      lead.cell || '',
      lead.email || '',
      lead.org || '',
      lead.cap || '',
      lead.citta || '',
      lead.tel || '',
      lead.email_org || '',
      lead.categoria ? CAT_LABELS[lead.categoria] || lead.categoria : '',
      subSummary,
      lead.source || '',
      lead.obiettivo || '',
      lead.note || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A:P',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });

    console.log('Lead saved to Sheet:', lead.nome, lead.cognome);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch(e) {
    console.error('Sheet error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore scrittura Sheet: ' + e.message }) };
  }
};
