'use strict';

function isPqpReporterEnabled(value) {
  return value === 'true';
}

function hasValidOptInValue(value) {
  return value === undefined || value === '' || value === 'true' || value === 'false';
}

module.exports = { isPqpReporterEnabled, hasValidOptInValue };
