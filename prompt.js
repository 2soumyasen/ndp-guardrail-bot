// prompt.js - Pure JavaScript version (No external library) - FINAL FIX v3

const HARD_GALI_SHORT = ['mc', 'bc'];

const HARD_GALI = [
  'madarchod', 'mdrchod', 'mdrchd', 'bhosdike', 'bhosdi',
  'chutiya', 'chutya', 'chutia', 'randi', 'randwa', 
  'lund', 'loda', 'gaandu', 'gandu', 'harami', 'kamina', 
  'kutta', 'bainchod', 'bhenchod', 'behenchod'
];

const TIER2_KEYWORDS = [
  'tmc', 'টিএমসি', 'তৃণমূল', 'trinamool', 'bjp', 'বিজেপি', 'ভাজপা',
  'bam', 'ভাম', 'বাম', 'cpim', 'cpm', 'congress', 'কংগ্রেস', 'কং',
  'rss', 'aap', 'modi', 'মোদী', 'mamata', 'মমতা', 'mamta', 'momo', 
  'didi', 'pishi', 'pisi', 'rahul', 'রাহুল', 'abhishek', 'অভিষেক',
  'ভোট', 'vote', 'election', 'সরকার', 'নেতা', 'নেত্রী', 'দল', 'পার্টি'
];

function cleanWord(word) {
  return word.toLowerCase()
    .replace(/[^a-z\u0980-\u09FF]/g, '');
}

function hasHardGali(text) {
  const words = text.toLowerCase().split(/\s+/).map(cleanWord).filter(w => w.length >= 2);
  
  for (const w of words) {
    // Short gali like mc, bc = exact match only
    if (HARD_GALI_SHORT.includes(w)) {
      return true;
    }
    // Long gali = exact match only (no includes, no fuzzy for short)
    if (HARD_GALI.includes(w)) {
      return true;
    }
  }
  return false;
}

function getPrompt(text) {
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

  return `
You are a STRICT moderator for a NON-POLITICAL group.
You understand English, Hindi, Bengali, and Hinglish.

Message: "${text}"
Word Count: ${wordCount}
Keywords: ${TIER2_KEYWORDS.join(', ')}

RULES (Follow in exact order):

1. If Word Count ≤ 3:
   → ALLOW
   EXCEPTION → ALWAYS BLOCK if message is exactly Party+Insult or Leader+Insult bigram:
   "tmc chor", "bjp chor", "bam chor", "cpm chor", "congress chor", "tmc dakat", "bjp dakat", "modi chor", "mamata chor", "rahul chor", "abhishek chor", "didi chor", "pishi chor", "momo chor"

2. If Word Count > 3:
   A. Party name + Insult (chor, dakat, cheater, batpar, dalal, churi, corrupt) → ALWAYS BLOCK
   B. Leader name + Insult / Negative attack → BLOCK
   C. Leader name + Praise / Positive → ALLOW
   D. Clear political discussion / support / criticism (India) → BLOCK
   E. "bam hok ba cong hok ba bjp hok" type comparison → BLOCK

3. If no political word (from Keywords list) → ALLOW
4. If 50-50 confused → ALLOW

Important: Treat bigram attacks as BLOCK even if short.

REPLY WITH ONLY VALID JSON:
{"decision": "BLOCK", "reason": "Party+Insult"}
or
{"decision": "ALLOW", "reason": "No politics"}
Reason must be very short (max 6 words).
`.trim();
}

// Main function
async function moderateMessage(text, llmCallFunction) {
  // 1. Check hard gali first (exact match only)
  if (hasHardGali(text)) {
    return {
      decision: "BLOCK",
      reason: "Hard gali detected"
    };
  }

  // 2. Send to LLM
  const prompt = getPrompt(text);
  const llmResponse = await llmCallFunction(prompt);

  try {
    return JSON.parse(llmResponse);
  } catch (e) {
    return {
      decision: "ALLOW",
      reason: "Parse error"
    };
  }
}

module.exports = {
  HARD_GALI,
  HARD_GALI_SHORT,
  TIER2_KEYWORDS,
  hasHardGali,
  getPrompt,
  moderateMessage
};
