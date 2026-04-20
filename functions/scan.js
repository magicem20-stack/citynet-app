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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key non configurata sul server.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    console.error('Body parse error:', e.message);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body non valido: ' + e.message }) };
  }

  const { image } = body;
  if (!image) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campo image mancante.' }) };
  }

  console.log('Image received, length:', image.length);

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
    console.log('Calling Anthropic API...');
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

    const raw = await response.text();
    console.log('Anthropic status:', response.status);
    console.log('Anthropic response (first 500):', raw.substring(0, 500));

    if (!response.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Errore API Anthropic: ' + raw.substring(0, 200) }) };
    }

    const data = JSON.parse(raw);
    if (data.error) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    const text = data.content?.map(c => c.text || '').join('') || '';
    console.log('Claude text response:', text);

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch(e) {
    console.error('Function error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore interno: ' + e.message }) };
  }
};
