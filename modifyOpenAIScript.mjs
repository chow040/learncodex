import fs from 'fs';
import path from 'path';

const file = path.join('backend', 'src', 'services', 'openaiService.ts');
let text = fs.readFileSync(file, 'utf8');

const beforeSignature = `export const requestEquityAssessment = async (
  input: AssessmentInput,
  context?: AssessmentContext,
): Promise<AssessmentPayload> => {`;
if (!text.includes(beforeSignature)) {
  throw new Error('Original function signature not found');
}
text = text.replace(
  beforeSignature,
  `export const requestEquityAssessment = async (
  input: AssessmentInput,
  context?: AssessmentContext,
): Promise<{ assessment: AssessmentPayload; prompt: string; systemPrompt: string }> => {`,
);

const promptBlock = `  const response = await client.responses.create({
    model: env.openAiModel,
    input: [
      {
        role: 'system',
        content: \
`You are an equity analyst who produces concise, actionable insights.
Respond only in JSON with the schema:
{
  "summary": string,
  "riskRating": "low" | "medium" | "high",
  "opportunities": string[],
  "watchItems": string[],
  "nextSteps": string[]
}`,
`;
if (!text.includes(promptBlock)) {
  throw new Error('Prompt block not found');
}
text = text.replace(
  promptBlock,
  `  const systemPrompt = \
`You are an equity analyst who produces concise, actionable insights.
Respond only in JSON with the schema:
{
  "summary": string,
  "riskRating": "low" | "medium" | "high",
  "opportunities": string[],
  "watchItems": string[],
  "nextSteps": string[]
}`;
  const prompt = userContentLines.join('\n').trim();

  const response = await client.responses.create({
    model: env.openAiModel,
    input: [
      {
        role: 'system',
        content: systemPrompt,
`,
);

const userBlock = `      },
      {
        role: 'user',
        content: userContentLines.join('\n').trim(),
      },`;
if (!text.includes(userBlock)) {
  throw new Error('User block not found');
}
text = text.replace(
  userBlock,
  `      },
      {
        role: 'user',
        content: prompt,
      },`,
);

const returnBlock = `    return {
      ...parsed,
      rawText: responseText,
    } satisfies AssessmentPayload;`;
if (!text.includes(returnBlock)) {
  throw new Error('Return block not found');
}
text = text.replace(
  returnBlock,
  `    return {
      assessment: {
        ...parsed,
        rawText: responseText,
      } satisfies AssessmentPayload,
      prompt,
      systemPrompt,
    };`,
);

fs.writeFileSync(file, text);
