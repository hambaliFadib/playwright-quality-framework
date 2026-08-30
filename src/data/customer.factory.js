const { faker } = require('@faker-js/faker');
const { customerSchema, generateCustomerWithAI } = require('../ai/test-data');

function safeId(testInfo) {
  return `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '-');
}

async function buildCustomerData(identity, provider) {
  const candidate = await generateCustomerWithAI(identity, provider);
  if (candidate) return candidate;
  return customerSchema.parse({
    name: `QA ${faker.person.firstName()} ${identity}`,
    email: `qa-${identity}@example.test`.toLowerCase(),
  });
}

async function makeCustomerData(testInfo) {
  return buildCustomerData(safeId(testInfo));
}

module.exports = { makeCustomerData, buildCustomerData, safeId };
