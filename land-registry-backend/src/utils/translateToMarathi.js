// src/utils/translateToMarathi.js
const axios = require('axios');
const logger = require('./logger.js');

const SURNAME_CORRECTIONS = {
  'pillai': 'पिल्लई',
  'pillay': 'पिल्लई',
  'iyer': 'अय्यर',
  'iyengar': 'अय्यंगार',
  'nair': 'नायर',
  'menon': 'मेनन',
  'naidu': 'नायडू',
  'reddy': 'रेड्डी',
  'sharma': 'शर्मा',
  'verma': 'वर्मा',
  'gupta': 'गुप्ता',
  'singh': 'सिंह',
  'kumar': 'कुमार',
  'patel': 'पटेल',
  'shah': 'शाह',
  'joshi': 'जोशी',
  'kulkarni': 'कुलकर्णी',
  'desai': 'देसाई',
  'patil': 'पाटील',
  'pawar': 'पवार',
  'jadhav': 'जाधव',
  'shinde': 'शिंदे',
  'kadam': 'कदम',
  'salve': 'साळवे',
  'mane': 'माने',
  'more': 'मोरे',
  'bhosale': 'भोसले',
  'gaikwad': 'गायकवाड',
  'sawant': 'सावंत',
  'chavan': 'चव्हाण',
  'waghmare': 'वाघमारे',
  'kamble': 'कांबळे',
  'thorat': 'थोरात',
  'deshpande': 'देशपांडे',
  'gokhale': 'गोखले',
  'damle': 'दामले',
  'naik': 'नाईक',
  'rane': 'राणे',
  'khandagale': 'खंडागळे',
  'mulam': 'मुळम',
};

const fixDevanagari = (text) => {
  return text
    .replace(/ळ/g, 'ल')
    .replace(/ऴ/g, 'ल')
    .replace(/ऌ/g, 'ल')
    .replace(/ं([^ा-ौ]|$)/g, 'म$1')
    .replace(/ं$/g, 'म');
};

const fixSchwaPerWord = (english, devanagari) => {
  const engArr = english.trim().split(/\s+/);
  const devArr = devanagari.trim().split(/\s+/);

  return devArr.map((devWord, i) => {
    const engWord = engArr[i] || '';
    if (/[^aeiou]a$/i.test(engWord)) {
      const lastChar = devWord.slice(-1);
      const isBareConsonant =
        /[\u0900-\u097F]/.test(lastChar) &&
        !/[\u093E-\u094F\u0902\u0903\u094D]/.test(lastChar);
      if (isBareConsonant) return devWord + 'ा';
    }
    return devWord;
  }).join(' ');
};

const fixSurnames = (english, devanagari) => {
  const engArr = english.trim().toLowerCase().split(/\s+/);
  const devArr = devanagari.trim().split(/\s+/);

  return devArr.map((devWord, i) => {
    const engWord = engArr[i] || '';
    return SURNAME_CORRECTIONS[engWord] || devWord;
  }).join(' ');
};

/**
 * Transliterate English name to Marathi (Devanagari)
 * @param {string} text - English name to translate
 * @returns {Promise<string>} Marathi name
 */
const translateToMarathi = async (text) => {
  if (!text || typeof text !== 'string') return '';

  const trimmed = text.trim();
  if (!trimmed) return '';

  // If already contains Devanagari characters, return as-is
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  if (hasDevanagari) return trimmed;

  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(trimmed)}&itc=mr-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;

    const res = await axios.get(url, { timeout: 8000 });

    const transliterated = res.data?.[1]?.[0]?.[1]?.[0];

    if (transliterated) {
      let fixed = fixDevanagari(transliterated.trim());
      fixed = fixSchwaPerWord(trimmed, fixed);
      fixed = fixSurnames(trimmed, fixed);
      return fixed;
    }

    logger.warn('Google Input Tools returned no result', { text: trimmed });
    return trimmed;

  } catch (err) {
    logger.error('Transliteration failed', { text: trimmed, error: err.message });
    return trimmed; // graceful fallback
  }
};