// prompt.js - FINAL FIX for tmc chor + Rup bhalo issue

const TIER1_GALI = [
'অন্ধভক্ত','অন্ধভকত','ভামপন্থী','চটিচাটা','চটি চাটা','চামচা','চামচে','দালাল','চাটুখোর',
'andhbhakt','andhbhakto','andhovokto','chatichata','chotichata','chamcha','dalal','andhobhakto',
'madarchod','mc','bc','chutiya','bainchod','randi'
];

// Party names - HARD BLOCK if combined with insult
const PARTY_WORDS = ['tmc','টিএমসি','তৃণমূল','bjp','বিজেপি','ভাজপা','bam','ভাম','বাম','cpim','cpm','congress','কংগ্রেস','কং','trinamool','rss','aap'];
const INSULT_WORDS = ['chor','চোর','dakat','ডাকাত','cheater','batpar','dalal','চুরি'];

const TIER2_KEYWORDS = [...PARTY_WORDS, 'মোদী','modi','মমতা','mamata','রাহুল','rahul','অভিষেক','abhishek','দল','পার্টি','ভোট','নেতা'];

function getPrompt(text) {
  const wordCount = text.trim().split(/\s+/).filter(w=>w.length>0).length;
  
  return `
You are STRICT moderator for NON-POLITICAL group.

Message: "${text}"
Word Count: ${wordCount}
Keywords: ${TIER2_KEYWORDS.join(', ')}

RULES (Follow in order):
1. If Word Count <= 3 => ALWAYS ALLOW, unless hard gali (madarchod, chutiya, randi, bc, mc). Example "Rup bhalo" (2 words) = ALLOW.

2. If Word Count > 3:
   - "tmc chor", "bjp chor", "bam chor", "cpm chor", "congress chor" = ALWAYS BLOCK (party + chor)
   - Party name + insult word (chor, dakat, cheater, batpar, churi) = BLOCK
   - Leader name + insult like "modi chor", "rahul kharap" = BLOCK
   - BUT Leader name + praise like "mamata bhalo", "rup bhalo", "modi bhalo" = ALLOW (do not block praise anymore)
   - "bam hok ba cong hok ba bjp hok" = BLOCK
   - "dol bedhe jai", "biriyanir vokto", "left side" = ALLOW

3. If no political word (from Keywords list) => ALLOW

4. If 50-50 confused => ALLOW (changed from BLOCK to reduce false deletes)

Reply ONLY: BLOCK or ALLOW
`.trim();
}

module.exports = { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, TIER2_KEYWORDS, getPrompt };
