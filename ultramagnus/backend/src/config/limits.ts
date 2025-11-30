export const MAX_REPORT_PAYLOAD_BYTES = 1.5 * 1024 * 1024; // ~1.5 MB cap for saved reports
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// Conversation/chat caps
export const MAX_CONVERSATION_MESSAGE_BYTES = 6 * 1024; // ~6 KB per message
export const MAX_CONVERSATION_TOTAL_BYTES = 300 * 1024; // ~300 KB per report chat
export const CONVERSATION_RETENTION_DAYS = 90;
export const CONVERSATION_DEFAULT_WINDOW = 20;
export const CONVERSATION_MAX_WINDOW = 50;
export const CONVERSATION_SUMMARY_MESSAGE_THRESHOLD = 20;
export const CONVERSATION_SUMMARY_BYTE_THRESHOLD = 50 * 1024; // ~50 KB
export const CONVERSATION_SUMMARY_MAX_CHARS = 1200;
export const CONVERSATION_SUMMARY_ANCHOR_COUNT = 3;
