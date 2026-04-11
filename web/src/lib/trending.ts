import type { PlatformMessage, TrendingTopic, PlatformType } from "./platforms/types";

// Common English stop words to filter out
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from",
  "has", "have", "he", "her", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "let", "me", "my", "no", "nor", "not", "of",
  "on", "or", "our", "own", "say", "she", "so", "than", "that", "the",
  "them", "then", "there", "these", "they", "this", "to", "too", "up", "us",
  "very", "was", "we", "were", "what", "when", "where", "which", "while",
  "who", "whom", "why", "will", "with", "would", "you", "your",
  "about", "after", "again", "all", "also", "am", "any", "because", "been",
  "before", "being", "between", "both", "but", "can", "could", "did", "does",
  "doing", "down", "during", "each", "few", "get", "got", "had", "having",
  "here", "hers", "herself", "himself", "itself", "more", "most", "much",
  "must", "myself", "need", "now", "off", "once", "only", "other", "ours",
  "ourselves", "out", "over", "own", "same", "should", "some", "such",
  "take", "tell", "their", "theirs", "themselves", "those", "through",
  "under", "until", "upon", "want", "well", "went", "what", "which",
  "while", "whom", "whose", "will", "with", "within", "without",
  "yes", "yet", "you", "your", "yours", "yourself", "yourselves",
  // Social media noise
  "rt", "like", "lol", "lmao", "omg", "http", "https", "www", "com",
  "gonna", "gotta", "wanna", "really", "think", "know", "make",
  "good", "new", "way", "one", "two", "see", "look", "come", "back",
  "still", "day", "time", "thing", "people", "man", "don", "didn",
  "doesn", "isn", "wasn", "won", "couldn", "shouldn", "wouldn",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "") // remove URLs
    .replace(/[^a-z0-9\s#@]/g, " ") // keep alphanum, #, @
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

export function extractTrendingTopics(messages: PlatformMessage[], topN: number = 20): TrendingTopic[] {
  if (messages.length === 0) return [];

  // Count word frequency across all messages (document frequency)
  const wordFreq = new Map<string, { count: number; platforms: Set<PlatformType>; samples: string[] }>();

  for (const msg of messages) {
    const tokens = tokenize(msg.body);
    const seen = new Set<string>(); // count each word once per message

    for (const token of tokens) {
      if (seen.has(token)) continue;
      seen.add(token);

      const entry = wordFreq.get(token) || { count: 0, platforms: new Set(), samples: [] };
      entry.count++;
      entry.platforms.add(msg.platform);
      if (entry.samples.length < 3) {
        entry.samples.push(msg.body.slice(0, 140));
      }
      wordFreq.set(token, entry);
    }
  }

  // Calculate TF-IDF-like score
  // TF = document frequency (how many messages contain the word)
  // IDF = log(total messages / doc frequency) - boosts rare-but-present terms
  const totalDocs = messages.length;

  const scored: TrendingTopic[] = [];
  for (const [keyword, data] of wordFreq) {
    if (data.count < 2) continue; // need at least 2 occurrences
    const tf = data.count / totalDocs;
    const idf = Math.log(1 + totalDocs / data.count);
    const platformBoost = data.platforms.size > 1 ? 1.5 : 1.0; // boost cross-platform topics
    const score = tf * idf * platformBoost;

    scored.push({
      keyword,
      score: Math.round(score * 1000) / 1000,
      count: data.count,
      platforms: Array.from(data.platforms),
      sampleMessages: data.samples,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
