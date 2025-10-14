import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Simple LangChain.js smoke test that exercises prompt templates + runnable execution
 * without calling a real provider. It chains a prompt and a lambda runnable.
 */
async function main(): Promise<void> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant that answers succinctly.'],
    ['human', 'Give me a one sentence summary about {topic}.'],
  ]);

  const summariser = new RunnableLambda({
    func: async (input: any) => {
      const messages = typeof input?.toChatMessages === 'function'
        ? input.toChatMessages()
        : Array.isArray(input?.messages)
          ? input.messages
          : [];
      const last = messages.length ? messages[messages.length - 1] : { content: 'the topic' };
      const topic = typeof last.content === 'string' ? last.content.replace('Give me a one sentence summary about ', '').replace('.', '') : 'the topic';
      return `Test summary: ${topic} wiring successful.`;
    },
  });

  const chain = RunnableSequence.from([prompt, summariser]);

  const response = await chain.invoke({ topic: 'LangChain.js' });
  console.log(response);
}

main().catch((err) => {
  console.error('LangChain smoke test failed:', err);
  process.exit(1);
});
