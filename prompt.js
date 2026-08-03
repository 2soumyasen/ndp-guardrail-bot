// prompt.js - No hard filter on names, only on gali

// ===== TIER 1: ONLY PURE GALI - Instant Delete =====
const TIER1_GALI = [
  'অন্ধভক্ত','অন্ধভকত','ভামপন্থী','চটিচাটা','চটি চাটা','চামচা','চামচে','দালাল','চাটুখোর',
  'andhbhakt','andhbhakto','andhovokto',
  'chatichata','chotichata','chati chata','chamcha','chamca','dalal','chatukhor'
];
// REMOVED from here: bham, modi, mamata, rahul etc - they are NOT gali

// ===== TIER 2: ALL POLITICAL WORDS + NAMES - AI checks context =====
const TIER2_KEYWORDS = [
  // Parties
  'ভাজপা','বিজেপি','ভাজপাই','বাম','বামপন্থী','সিপিএম','কংগ্রেস','কং','তৃণমূল','টিএমসি','ভাম','bham',
  'bjp','bhajpa','vajapa','bam','cpim','cpm','congress','tmc','trinamool','rss','aap',
  // Leaders - NOW SOFT FILTER
  'মোদী','মোদি','modi','মমতা','mamata','রাহুল','rahul','অভিষেক','abhishek','শুভেন্দু','suvendu',
  // Concepts
  'দলীয়','দল','পার্টি','party','রাজনীতি','ভোট','নেতা','নির্বাচন','election','mla','mp',
  'আন্দোলন','অন্ধত্ব','ভক্ত','bhakt','left','right','ধর্ম','secular'
];

function getPrompt(text) {
  return `
You are STRICT moderator for NON-POLITICAL group NDP.

Message: "${text}"
Keywords: ${TIER2_KEYWORDS.join(', ')}

SEMANTIC RULES FOR NAMES:
- "modi" "mamata" "rahul" alone in non-political sentence like "modi market e gechilam", "mamata di r bari" = ALLOW
- If name used for political discussion, praising/criticizing as leader, party comparison = BLOCK
  Example: "modi bhalo kaj korche", "mamata chor", "rahul er bhashon" = BLOCK

GENERAL RULES:
- "দল বেঁধে যাই", "বিরিয়ানির ভক্ত", "left side" = ALLOW
- "বামই হোক বা কং হোক বা ভাজপা হোক অন্যায় অন্যায়ই" = BLOCK
- "দলীয় অন্ধত্ব থেকে দূরে থাকো", "সব দল খারাপ" = BLOCK (political preaching)
- 2+ party names in one msg = BLOCK
- If 50-50 confused = BLOCK

Reply ONLY: BLOCK or ALLOW
`.trim();
}

module.exports = { TIER1_GALI, TIER2_KEYWORDS, getPrompt };
