const { z } = require('zod');

const triageSchema = z.object({
  classification: z.enum(['PRODUCT_BUG', 'AUTOMATION_DEFECT', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE', 'FLAKY', 'INCONCLUSIVE']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
}).strict();

const evidenceSchema = z.object({
  testName: z.string().min(1),
  playwrightStatus: z.string().min(1),
  failureMessage: z.string().optional(),
  stack: z.string().optional(),
  retry: z.number().int().min(0),
});

const triageContract = 'Return exactly one JSON object with no Markdown, no code fences, no explanation before or after JSON. classification MUST be one of PRODUCT_BUG, AUTOMATION_DEFECT, ENVIRONMENT_FAILURE, TEST_DATA_FAILURE, FLAKY, INCONCLUSIVE. confidence MUST be a number between 0 and 1. reason MUST be a non-empty string. Do not add a nested classification object or any extra fields.';

function parseTriageContent(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

async function requestAITriage(evidence, correctionInstruction) {
  const response = await fetch(process.env.AI_BASE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{
        role: 'user',
        content: [
          triageContract,
          correctionInstruction || '',
          `Classify this Playwright failure evidence: ${JSON.stringify(evidence)}`,
        ].filter(Boolean).join('\n'),
      }],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  return parseTriageContent(payload.choices?.[0]?.message?.content);
}

async function triageFailure(evidence, provider = requestAITriage) {
  const validatedEvidence = evidenceSchema.safeParse(evidence);
  if (!validatedEvidence.success || !evidence.failureMessage) {
    return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'Minimum triage evidence was not available.' };
  }
  if (provider === requestAITriage && (!process.env.AI_API_KEY || !process.env.AI_BASE_URL || !process.env.AI_MODEL)) {
    return { classification: 'INCONCLUSIVE', confidence: 0.2, reason: 'AI analysis unavailable; provider is not configured.' };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const correction = attempt === 0 ? undefined : `Previous response failed validation. ${triageContract}`;
      const raw = await provider(evidence, correction);
      const parsedRaw = typeof raw === 'string' ? parseTriageContent(raw) : raw;
      return triageSchema.parse(parsedRaw);
    } catch {
      if (attempt === 1) {
        return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'AI triage output was unavailable or invalid.' };
      }
    }
  }
  return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'AI triage output was unavailable or invalid.' };
}

module.exports = { triageSchema, evidenceSchema, triageFailure, requestAITriage, parseTriageContent };
