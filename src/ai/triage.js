const { z } = require('zod');

const triageSchema = z.object({
  classification: z.enum(['PRODUCT_BUG', 'AUTOMATION_DEFECT', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE', 'FLAKY', 'INCONCLUSIVE']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

const evidenceSchema = z.object({
  testName: z.string().min(1),
  playwrightStatus: z.string().min(1),
  failureMessage: z.string().optional(),
  stack: z.string().optional(),
  retry: z.number().int().min(0),
});

async function requestAITriage(evidence) {
  const response = await fetch(process.env.AI_BASE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{ role: 'user', content: `Classify this Playwright failure as bounded JSON: ${JSON.stringify(evidence)}` }],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || '{}');
}

async function triageFailure(evidence, provider = requestAITriage) {
  const validatedEvidence = evidenceSchema.safeParse(evidence);
  if (!validatedEvidence.success || !evidence.failureMessage) {
    return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'Minimum triage evidence was not available.' };
  }
  if (provider === requestAITriage && (!process.env.AI_API_KEY || !process.env.AI_BASE_URL || !process.env.AI_MODEL)) {
    return { classification: 'INCONCLUSIVE', confidence: 0.2, reason: 'AI analysis unavailable; provider is not configured.' };
  }
  try {
    const raw = await provider(evidence);
    return triageSchema.parse(raw);
  } catch {
    return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'AI triage output was unavailable or invalid.' };
  }
}

module.exports = { triageSchema, evidenceSchema, triageFailure, requestAITriage };
