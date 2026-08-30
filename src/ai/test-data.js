const { z } = require('zod');

const customerSchema = z.object({
  name: z.string().min(3).max(80),
  email: z.string().email().endsWith('@example.test'),
});

async function requestAIJson(identity) {
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
        content: `Return only JSON for a unique demo customer using identity ${identity}. Schema: {"name":"string","email":"*@example.test"}`,
      }],
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`AI provider failed with ${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

async function generateCustomerWithAI(identity, provider = requestAIJson) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await provider(identity);
      if (!raw) return null;
      const parsed = customerSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

module.exports = { customerSchema, generateCustomerWithAI, requestAIJson };
