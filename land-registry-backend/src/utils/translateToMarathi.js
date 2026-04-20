import translate from 'google-translate-api-x';
import logger from './logger.js';



export const translateToMarathi = async (text) => {
  if (!text || typeof text !== 'string') return '';

  let trimmed = text.trim();
  if (!trimmed) return '';

  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  if (hasDevanagari) return trimmed;

  try {
    const result = await translate(trimmed, {
      to: 'mr',
      from: 'auto',
    });

    let translated = result.text.trim();

    translated = translated
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ');

    return translated;

  } catch (err) {
    logger.error('Translation failed', { error: err.message });
    return trimmed;
  }
};

