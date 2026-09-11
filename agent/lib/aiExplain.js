import { checkAnswer } from './verifier.js'
import { callOpenAI } from './openai.js'

// Explains an already-verified bounty answer in plain English — never a second source of
// truth. checkAnswer() has already done the real, exact re-computation and comparison; this
// only summarizes those real numbers for the human reviewer, it never independently judges
// whether the answer is correct.
export async function explainAnswer(taskId) {
  const { matches, submitted, freshAnalysis } = await checkAnswer(taskId)

  const prompt = `A monitoring agent flagged this DeFi lending activity as ${submitted.verdict}. Its own AI judgment reasoned: "${submitted.reasoning}"

An independent re-check of the same live data ${matches ? 'confirmed' : 'did NOT confirm'} this. That independent AI judgment reasoned: "${freshAnalysis.reasoning}"

In 2-3 short sentences, plainly explain to a non-technical reviewer why this activity is worth a second look, and clearly state whether the two independent checks agree. Do not invent any numbers beyond what's given above.`

  const explanation = await callOpenAI(prompt, { maxTokens: 200 })
  return { explanation }
}
