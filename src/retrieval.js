import { loadDocuments } from './projects.js';

const STOP_WORDS = new Set(['почему', 'когда', 'какой', 'какая', 'какие', 'можно', 'нужно', 'чтобы',
  'работает', 'работать', 'этого', 'этой', 'этот', 'этом', 'если', 'после', 'через', 'меня', 'моего',
  'есть', 'для', 'как', 'или', 'при', 'без', 'что', 'где', 'нет', 'the', 'and', 'with', 'from']);

function tokens(text) {
  return (text.toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter((word) => !STOP_WORDS.has(word))
    .map((word) => word.length > 6 ? word.slice(0, 6) : word);
}

export function chunkDocuments(documents) {
  return documents.flatMap(({ source, text }) => {
    const chunks = [];
    let heading = source;
    let body = [];
    const flush = () => {
      const value = body.join('\n').trim();
      if (value) chunks.push({ source, heading, text: value.slice(0, 2200) });
      body = [];
    };
    for (const line of text.split(/\r?\n/)) {
      if (/^#{1,3} /.test(line)) { flush(); heading = line.replace(/^#+\s*/, '').trim(); }
      else body.push(line);
    }
    flush();
    return chunks;
  });
}

export function rankChunks(query, chunks, limit = 4) {
  const queryTokens = [...new Set(tokens(query))];
  if (!queryTokens.length) return [];
  const lengths = chunks.map((chunk) => tokens(`${chunk.heading} ${chunk.text}`).length);
  const average = lengths.reduce((sum, n) => sum + n, 0) / (lengths.length || 1);
  const frequencies = new Map(queryTokens.map((term) => [term, chunks.filter((chunk) =>
    tokens(`${chunk.heading} ${chunk.text}`).includes(term)).length]));
  const ranked = chunks.map((chunk, index) => {
    const body = tokens(chunk.text);
    const title = tokens(chunk.heading);
    const score = queryTokens.reduce((sum, term) => {
      const frequency = body.filter((word) => word === term).length + 3 * title.filter((word) => word === term).length;
      const documentFrequency = frequencies.get(term) || 0;
      const idf = Math.log(1 + (chunks.length - documentFrequency + .5) / (documentFrequency + .5));
      return sum + idf * frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * lengths[index] / (average || 1)));
    }, 0);
    return { ...chunk, score };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score || 0;
  return ranked.filter((chunk) => chunk.score >= top * .35).slice(0, limit);
}

export async function retrieve(projectId, query, limit = 4) {
  return rankChunks(query, chunkDocuments(await loadDocuments(projectId)), limit);
}
