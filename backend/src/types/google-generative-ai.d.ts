declare module '@google/generative-ai' {
  export type Content = {
    role: string;
    parts: { text: string }[];
  };

  export interface GenerativeModel {
    generateContent(
      request:
        | string
        | {
            contents: Content[];
          },
    ): Promise<{
      response: Promise<{
        text(): string;
      }>;
    }>;
  }

  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: {
      model: string;
      generationConfig?: Record<string, unknown>;
    }): GenerativeModel;
  }
}
