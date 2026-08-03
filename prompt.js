// prompt.js - FINAL FIX for tmc chor

const TIER1_GALI = [
  'অন্ধভক্ত','অন্ধভকত','ভামপন্থী','চটিচাটা','চটি চাটা','চামচা','চামচে','দালাল','চাটুখোর',
  'andhbhakt','andhbhakto','andhovokto','chatichata','chotichata','chamcha','dalal','andhobhakt'
];

// Party names - HARD BLOCK if combined with insult
const PARTY_WORDS = ['tmc','টিএমসি','তৃণমূল','bjp','বিজেপি','ভাজপা','bam','ভাম','বাম','cpim','cpm','congress','কংগ্রেস','কং','trinamool','rss','aap'];
const INSULT_WORDS = ['chor','চোর','dakat','ডাকাত','cheater','batpar','dalal','চুরি'];

const TIER2_KEYWORDS = [...PARTY_WORDS, 'মোদী','modi','মমতা','mamata','রাহুল','rahul','অভিষেক','abhishek','দল','পার্টি','ভোট','নেতা'];

function getPrompt(text) {
  return `
You are STRICT moderator for NON-POLITICAL group.

Message: "${text}"
Keywords: ${TIER2_KEYWORDS.join(', ')}

RULES:
- "tmc chor", "bjp chor", "bam chor", "cpm chor", "congress chor" = ALWAYS BLOCK (party + chor)
- Party names with insult = BLOCK
- Leader name + insult/praise like "modi chor", "mamata bhalo", "rahul kharap" = BLOCK
- "bam hok ba cong hok ba bjp hok" = BLOCK
- "dol bedhe jai", "biriyanir vokto", "left side" = ALLOW
- If 50-50 = BLOCK

Reply ONLY: BLOCK or ALLOW
`.trim();
}

module.exports = { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, TIER2_KEYWORDS, getPrompt };
