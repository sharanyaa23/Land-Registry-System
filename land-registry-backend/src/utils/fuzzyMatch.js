// src/utils/fuzzyMatch.js
const { distance } = require('fastest-levenshtein');

function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\/+/g, '/');   // normalize survey slashes
}

function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na.length || !nb.length) return 0;

  const maxLen = Math.max(na.length, nb.length);
  const dist = distance(na, nb);
  return Math.max(0, (maxLen - dist) / maxLen);
}

function bestMatch(target, candidates) {
  if (!candidates?.length) return { match: null, score: 0, index: -1 };
  let best = { match: null, score: 0, index: -1 };

  candidates.forEach((candidate, i) => {
    const score = fuzzyMatch(target, candidate);
    if (score > best.score) {
      best = { match: candidate, score, index: i };
    }
  });
  return best;
}

module.exports = fuzzyMatch;
module.exports.fuzzyMatch = fuzzyMatch;
module.exports.bestMatch = bestMatch;
module.exports.normalize = normalize;