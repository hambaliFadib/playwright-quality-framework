const { z } = require('zod');

const CLASSIFICATIONS = [
  'PRODUCT_BUG',
  'AUTOMATION_DEFECT',
  'ENVIRONMENT_FAILURE',
  'TEST_DATA_FAILURE',
  'FLAKY',
  'INCONCLUSIVE',
];

const triageSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
}).strict();

const evidenceSchema = z.object({
  testName: z.string().min(1),
  playwrightStatus: z.string().min(1),
  failureMessage: z.string().optional(),
  stack: z.string().optional(),
  retry: z.number().int().min(0),
}).strict();

function buildTriagePrompt(evidence, correction = false) {
  const contract = {
    classification: 'PRODUCT_BUG | AUTOMATION_DEFECT | ENVIRONMENT_FAILURE | TEST_DATA_FAILURE | FLAKY | INCONCLUSIVE',
    confidence: 'number from 0 to 1',
    reason: 'non-empty string',
  };

  const prefix = correction
    ? 'Your previous response did not satisfy the required JSON contract. Correct it.'
    : 'Classify this Playwright failure.';

  return `${prefix}\n\nReturn exactly one JSON object and nothing else.\nDo not use Markdown, code fences, commentary, or text before or after the JSON.\nThe object must contain exactly these fields and no additional fields:\n${JSON.stringify(contract, null, 2)}\n\nclassification MUST be one of the six listed string values. It must not be an object.\nconfidence MUST be a number between 0 and 1.\nreason MUST be a non-empty string.\n\nPlaywright failure evidence:\n${JSON.stringify(evidence, null, 2)}`;
}

function parseTriageContent(content) {
  if (typeof content !== 'string') throw new Error('AI triage content must be a string');

  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText || '{}');
}

async function requestAITriage(evidence, options = {}) {
  const response = await fetch(process.env.AI_BASE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.AI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{ role: 'user', content: buildTriagePrompt(evidence, options.correction === true) }],
      temperature: 0,
    }),
  });

  if (!response.ok) throw new Error(`AI provider failed with ${response.status}`);

  const payload = await response.json();
  return parseTriageContent(payload.choices?.[0]?.message?.content || '{}');
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
      const raw = await provider(validatedEvidence.data, { correction: attempt === 1 });
      const parsed = triageSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // Retry once with the correction contract, then use the safe fallback.
    }
  }

  return { classification: 'INCONCLUSIVE', confidence: 0.1, reason: 'AI triage output was unavailable or invalid.' };
}

module.exports = {
  CLASSIFICATIONS,
  triageSchema,
  evidenceSchema,
  buildTriagePrompt,
  parseTriageContent,
  triageFailure,
  requestAITriage,
};
