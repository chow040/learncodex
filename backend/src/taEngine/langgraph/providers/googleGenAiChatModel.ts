import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { Runnable } from '@langchain/core/runnables';

type GoogleGenAiOptions = {
  apiKey: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
};

const DEFAULT_PART_TEXT = ' ';

const messageRoleToGoogle = (message: BaseMessage): 'user' | 'model' => {
  const type = message._getType();
  if (type === 'ai' || type === 'tool') {
    return 'model';
  }
  return 'user';
};

const stringifyContent = (content: BaseMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === 'string') {
          return chunk;
        }
        if (chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string') {
          return chunk.text;
        }
        return JSON.stringify(chunk);
      })
      .join('\n');
  }
  if (content && typeof content === 'object' && 'text' in content && typeof (content as any).text === 'string') {
    return (content as any).text;
  }
  if (content === undefined || content === null) {
    return '';
  }
  return String(content);
};

const toGoogleContents = (messages: BaseMessage[]): Content[] => {
  if (!messages || messages.length === 0) {
    return [
      {
        role: 'user',
        parts: [{ text: DEFAULT_PART_TEXT }],
      },
    ];
  }

  return messages.map((message) => {
    const text = stringifyContent(message.content).trim();
    return {
      role: messageRoleToGoogle(message),
      parts: [{ text: text.length > 0 ? text : DEFAULT_PART_TEXT }],
    };
  });
};

export class GoogleGenAiChatModel extends Runnable<BaseMessage[], AIMessage> {
  static lc_name(): string {
    return 'GoogleGenAiChatModel';
  }
  lc_serializable = true;
  lc_namespace = ['equity-insight', 'providers', 'google'];
  private readonly model;

  constructor(options: GoogleGenAiOptions) {
    super();
    if (!options.apiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY is not configured.');
    }
    if (!options.model) {
      throw new Error('GOOGLE_GENAI_MODEL must be provided when using Google GenAI.');
    }
    const genAI = new GoogleGenerativeAI(options.apiKey);
    this.model = genAI.getGenerativeModel({
      model: options.model,
      generationConfig: {
        temperature: options.temperature ?? 1,
        ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
      },
    });
  }

  override async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    const contents = toGoogleContents(messages);
    const result = await this.model.generateContent({ contents });
    const response = await result.response;
    const text = response?.text?.() ?? '';
    return new AIMessage(text);
  }
}
