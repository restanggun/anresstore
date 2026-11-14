// Keep aliases explicit so short queries do not accidentally match unrelated products.
const aliases: Record<string, string> = {
 ml: "mobile legends", mlbb: "mobile legends", ff: "free fire",
 wa: "whatsapp", ig: "instagram", yt: "youtube",
};

function normalize(value: string) {
 return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function distance(a: string, b: string) {
 let previous = Array.from({length: b.length + 1}, (_, i) => i);
 let beforePrevious: number[] | undefined;
 for (let i = 1; i <= a.length; i++) {
  const current = [i];
  for (let j = 1; j <= b.length; j++) {
   current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
   if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j]!, beforePrevious![j - 2]! + 1);
  }
  beforePrevious = previous;
  previous = current;
 }
 return previous[b.length]!;
}

/** Rank matches by relevance; null means at least one search term did not match. */
export function productSearchScore(query: string, fields: string[]): number | null {
 const raw = normalize(query);
 if (!raw) return 0;
 const term = aliases[raw] ?? raw;
 const values = fields.map(normalize).filter(Boolean);
 const words = values.flatMap(value => value.split(" "));
 const scores = term.split(" ").map(token => {
  let best = 0;
  for (const word of words) {
   if (word === token) best = Math.max(best, 100);
   else if (word.startsWith(token)) best = Math.max(best, 80);
   else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 65);
   else if (!/\d/.test(token) && !/\d/.test(word) && token.length >= 4) {
    const maxEdits = token.length >= 7 ? 2 : 1;
    if (Math.abs(token.length - word.length) <= maxEdits && distance(token, word) <= maxEdits) best = Math.max(best, 45);
   }
  }
  return best;
 });
 if (scores.some(score => score === 0)) return null;
 return scores.reduce((sum, score) => sum + score, 0) + (values[0] === term ? 200 : values[0]?.startsWith(term) ? 120 : values[0]?.includes(term) ? 60 : 0);
}

export function searchProducts<T>(items: T[], query: string, fields: (item: T) => string[]): T[] {
 if (!normalize(query)) return items;
 return items.map((item, index) => ({item, index, score: productSearchScore(query, fields(item))}))
  .filter((result): result is {item: T; index: number; score: number} => result.score !== null)
  .sort((a, b) => b.score - a.score || a.index - b.index)
  .map(result => result.item);
}
