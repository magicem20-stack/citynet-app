exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key non configurata sul server.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida.' }) };
  }

  const { image } = body;
  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Immagine mancante.' }) };
  }

  const prompt = `Extract all contact data visible on this business card. Return ONLY a valid JSON object with these exact keys (use null if not found):
{
  "nome": null,
  "cognome": null,
  "ruolo": null,
  "cell": null,
  "email": null,
  "org": null,
  "via": null,
  "cap": null,
  "citta": null,
  "tel": null,
  "email_org": null
}
No preamble, no markdown, no explanation. Only the JSON object.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content?.map(c => c.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch(e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Errore lettura biglietto: ' + e.message })
    };
  }
};
