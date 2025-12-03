
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY is missing in .env');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey });

async function testChatStream() {
  console.log('🚀 Starting Chat Stream Test...');

  // 1. Mock Data (Simulating what the frontend sends)
  const report = {
    companyName: 'Tesla Inc',
    ticker: 'TSLA',
    currentPrice: '$245.00',
    priceChange: '+2.5%',
    verdict: 'HOLD',
    rocketScore: 75,
    summary: 'Tesla is a leading EV manufacturer...',
    scenarioAnalysis: { bull: { price: '$400' }, bear: { price: '$150' } },
    shortTermFactors: { positive: [{ title: 'Strong Delivery Numbers' }], negative: [{ title: 'Margin Compression' }] }
  };
  const userNotes = 'I am worried about competition.';
  const userThesis = 'Long term hold.';
  
  // Simulate a history that might cause issues (e.g. starts with User)
  const messageHistory = [
    { role: 'user', text: 'What is the bull case?' },
    { role: 'assistant', text: 'The bull case is $400 based on FSD adoption.' },
    { role: 'user', text: 'And the bear case?' }
  ];

  // 2. Replicate Logic from aiStream.ts
  const contextSummary = `
    STOCK ANALYSIS CONTEXT:
    Company: ${report.companyName} (${report.ticker})
    Price: ${report.currentPrice} (${report.priceChange})
    Verdict: ${report.verdict}
    Moonshot Score: ${report.rocketScore}/100
    Summary: ${report.summary}
    Bull Case: ${report.scenarioAnalysis?.bull?.price}
    Bear Case: ${report.scenarioAnalysis?.bear?.price}
    Short Term Factors: ${(report.shortTermFactors?.positive || []).map((f: any) => f.title).join(', ')}
    Risks: ${(report.shortTermFactors?.negative || []).map((f: any) => f.title).join(', ')}
    
    USER'S NOTES:
    "${userNotes || 'No notes yet.'}"

    USER'S INVESTMENT THESIS:
    "${userThesis || 'No thesis defined yet.'}"
  `;

  const systemInstruction = `
  You are 'Ultramagnus', an elite Wall Street equity research assistant. 
  Use the STOCK ANALYSIS CONTEXT to answer. Keep answers concise, punchy, and professional.
  `;

  // 1. Normalize roles
  const rawHistory = messageHistory.map((m: any) => ({
    role: m?.role === 'assistant' ? 'model' : 'user',
    text: m?.text || ''
  }));

  // 2. Build System Message
  const systemMsgText = `System Context:\n${contextSummary}\n\n${systemInstruction}`;
  
  // 3. Construct conversation with strict alternation
  const mergedContents: { role: string; parts: { text: string }[] }[] = [
    { role: 'user', parts: [{ text: systemMsgText }] }
  ];

  for (const msg of rawHistory) {
    const lastMsg = mergedContents[mergedContents.length - 1];
    if (lastMsg.role === msg.role) {
      console.log(`   ⚠️ Merging consecutive ${msg.role} message...`);
      lastMsg.parts[0].text += `\n\n---\n\n${msg.text}`;
    } else {
      mergedContents.push({ role: msg.role, parts: [{ text: msg.text }] });
    }
  }

  if (mergedContents[mergedContents.length - 1].role === 'model') {
    console.log('   ⚠️ Appending dummy user prompt to end of history...');
    mergedContents.push({ role: 'user', parts: [{ text: "Please continue." }] });
  }

  console.log('📝 Final Payload Structure:', JSON.stringify(mergedContents, null, 2));

  // 3. Execute Stream
  try {
    console.log('📡 Connecting to Gemini (gemini-3-pro-preview)...');
    const stream = await client.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: mergedContents
    });

    console.log('✅ Request sent. Iterating stream directly...');
    
    for await (const chunk of stream) {
        const c = chunk as any;
        const text = typeof c.text === 'function' ? c.text() : c.text;
        if (text) {
            process.stdout.write(text);
        }
    }
    
    console.log('\n\n✅ Stream completed successfully.');

  } catch (err: any) {
    console.error('\n❌ STREAM FAILED!');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    if (err.response) {
        console.error('Response Status:', err.response.status);
        console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testChatStream();
