async function checkWithGemini(text) {
  try {
    const prompt = `
You are NDP Guardrail - strict political filter for a Bengali WhatsApp group.

Message to check: "${text}"

BLOCK the message if it contains ANY of these, even hidden/indirect:

1. Any Indian politics: TMC, BJP, Trinamool, Congress, CPIM, CPM, Modi, Mamata, Didi, Abhishek, Suvendu, Rahul, election, vote, neta, rajniti, party, andolon, michil
2. Bengali gali / slang / insult / adult joke - even if written in English letters like "bokachoda", "khanki", "bal", "bc", "mc"
3. Religious hate, communal speech
4. Spam, promotion, earning app, adult link
5. Sarcasm or coded political attack - e.g. "khela hobe", "pisi bhai", "feku", "pappu"

Even if the bad meaning is hidden inside a long story, or written in mixed Banglish, you must BLOCK.

If message is normal chat, friendship, study, help, general talk - ALLOW.

Reply ONLY one word: BLOCK or ALLOW. No explanation.
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().toUpperCase().includes('BLOCK');
  } catch (e) { 
    console.log('Gemini error', e.message);
    return false; 
  }
}
