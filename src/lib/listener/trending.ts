import type { PlatformMessage } from "./platforms";

export interface TrendingTopic {
  term: string;
  score: number;
  count: number;
  platforms: string[];
}

// Common English stop words to filter out
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "its", "this", "that", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "shall",
  "can", "not", "no", "nor", "so", "if", "as", "up", "out", "about",
  "into", "over", "after", "than", "then", "just", "also", "more", "very",
  "too", "much", "many", "some", "any", "all", "each", "every", "both",
  "few", "most", "other", "such", "only", "own", "same", "he", "she",
  "we", "you", "they", "me", "him", "her", "us", "them", "my", "your",
  "his", "our", "their", "what", "which", "who", "whom", "when", "where",
  "why", "how", "i", "am", "here", "there", "now", "get", "got", "like",
  "know", "think", "want", "go", "going", "see", "look", "make", "take",
  "come", "give", "say", "said", "tell", "use", "try", "need", "even",
  "still", "well", "back", "way", "new", "one", "two", "really", "thing",
  "things", "let", "right", "good", "great", "yeah", "yes", "ok", "okay",
  "sure", "oh", "hey", "hi", "hello", "thanks", "thank", "please", "dont",
  "im", "ive", "its", "thats", "youre", "were", "theyre", "hes", "shes",
  "been", "being", "https", "http", "www", "com", "rt", "via",
]);

const MIN_WORD_LENGTH = 3;

function tokenize(text: string): string[] {
  // Remove URLs
  const cleaned = text.replace(/https?:\/\/\S+/g, "");
  // Extract words (alphanumeric, including hashtags)
  const words = cleaned.toLowerCase().match(/[#]?[a-z0-9]+/g) || [];
  return words.filter(
    (w) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w.replace("#", "")),
  );
}

export function extractTrending(
  messages: PlatformMessage[],
  topN = 20,
): TrendingTopic[] {
  if (messages.length === 0) return [];

  // Count term frequency across all messages and track which platforms
  const termFreq = new Map<string, { count: number; platforms: Set<string> }>();
  const docCount = messages.length;

  // Also track document frequency (how many messages contain each term) for TF-IDF
  const docFreq = new Map<string, number>();

  for (const msg of messages) {
    const words = tokenize(msg.text);
    const uniqueInDoc = new Set(words);

    for (const word of words) {
      const entry = termFreq.get(word) || {
        count: 0,
        platforms: new Set<string>(),
      };
      entry.count++;
      entry.platforms.add(msg.platform);
      termFreq.set(word, entry);
    }

    for (const word of uniqueInDoc) {
      docFreq.set(word, (docFreq.get(word) || 0) + 1);
    }
  }

  // Calculate TF-IDF score for each term
  const topics: TrendingTopic[] = [];
  for (const [term, { count, platforms }] of termFreq) {
    const tf = count;
    const df = docFreq.get(term) || 1;
    // IDF: log(total docs / docs containing term) — higher for rarer terms
    // But we also want frequently occurring terms, so use TF * IDF
    const idf = Math.log(1 + docCount / df);
    const score = tf * idf;

    topics.push({
      term,
      score: Math.round(score * 100) / 100,
      count,
      platforms: Array.from(platforms),
    });
  }

  // Sort by score descending
  topics.sort((a, b) => b.score - a.score);
  return topics.slice(0, topN);
}
