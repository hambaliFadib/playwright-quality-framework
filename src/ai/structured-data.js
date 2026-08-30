async function requestStructuredJson({ prompt, identity }) {
  if (!process.env.AI_API_KEY || !process.env.AI_BASE_URL || !process.env.AI_MODEL) return null;
  const response = await fetch(process.env.AI_BASE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.AI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{
        role: 'user',
        content: `${prompt}\nReturn only JSON. Identity: ${identity || 'not provided'}`,
      }],
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`AI provider failed with ${response.status}`);
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || '{}');
}

async function generateStructuredData({ prompt, schema, identity, fallback, provider = requestStructuredJson }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await provider({ prompt, identity });
      if (raw) {
        const parsed = schema.safeParse(raw);
        if (parsed.success) return parsed.data;
      }
    } catch {
      if (attempt === 1) break;
    }
  }
  return schema.parse(await fallback({ identity }));
}

module.exports = { generateStructuredData, requestStructuredJson };
