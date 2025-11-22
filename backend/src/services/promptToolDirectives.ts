const TOOL_DIRECTIVE_REGEX = /\[\[tool:(price|indicators|news|fundamentals|macro)\]\]/gi;

export type ToolDirective = 'price' | 'indicators' | 'news' | 'fundamentals' | 'macro';

export interface ParsedPromptContent {
  sanitizedContent: string;
  tools: Set<ToolDirective>;
}

export const extractToolDirectives = (content: string): ParsedPromptContent => {
  const tools = new Set<ToolDirective>();
  const sanitizedContent = content.replace(TOOL_DIRECTIVE_REGEX, (_match, directive: string) => {
    tools.add(directive.toLowerCase() as ToolDirective);
    return '';
  });
  return { sanitizedContent: sanitizedContent.trim(), tools };
};
