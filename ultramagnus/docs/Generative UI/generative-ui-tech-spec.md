# Generative UI for Report Card - Technical Specification

## Overview
This document outlines the technical implementation for the Generative UI features in the Report Card. The goal is to allow users to generate, refine, and persist AI-generated content directly within the report structure using a chat interface.

## Frontend Architecture

### 1. New Dependencies
To support rich text rendering and dynamic UI, we will add the following lightweight libraries:
-   `react-markdown`: For safely rendering the AI's markdown output.
-   `remark-gfm`: To support GitHub Flavored Markdown (tables, strikethrough, task lists).
-   `clsx` & `tailwind-merge`: For clean and dynamic Tailwind class construction.

### 2. Component Hierarchy
We will introduce a new set of components in `moonshot/components/generative/`:

#### A. `GenerativeSection` (Container)
-   **Purpose**: The main wrapper for AI content.
-   **Props**: `content` (string), `isGenerating` (boolean), `onUpdate` (function), `onRegenerate` (function).
-   **UI**:
    -   Distinct background (e.g., `bg-slate-900/50` with subtle border).
    -   Header with "AI Analysis" label and `Sparkles` icon.
    -   Toolbar for actions (Copy, Regenerate, Edit).
-   **States**:
    -   `Empty`: Shows a placeholder or "Draft with AI" CTA.
    -   `Streaming`: Shows `SkeletonLoader` or progressively appearing text.
    -   `Content`: Renders the `MarkdownRenderer`.
    -   `Error`: Retry UI.

#### B. `MarkdownRenderer`
-   **Purpose**: Renders the markdown string into styled HTML.
-   **Implementation**: Wraps `react-markdown`.
-   **Styling**: Uses Tailwind Typography (`prose prose-invert`) with custom overrides for:
    -   `table`: Full width, bordered, styled headers.
    -   `h1/h2`: Mapped to appropriate text sizes to fit the report hierarchy.
    -   `a`: Styled as external links.

#### C. `ActionToolbar`
-   **Purpose**: Floating or fixed toolbar for managing the section.
-   **Actions**:
    -   **Regenerate**: Re-run the last prompt.
    -   **Refine**: Open a mini-chat input to tweak specific parts.
    -   **Save**: Explicit commit (optional, if auto-save is active).

#### D. `SuggestionChips`
-   **Purpose**: Quick prompts for the user.
-   **Location**: Visible when the section is empty or in the chat interface.
-   **Examples**: "Summarize Risks", "Create SWOT Analysis", "Explain Valuation".

### 3. State Management
-   **Local State**: `ReportCard` will hold the `generativeSection` state (content, metadata).
-   **Streaming**: The `useChat` or `geminiService` hook needs to support a mode where chunks are directed to this specific state variable rather than the main chat history, or the chat message contains a structured block that the UI extracts.

## Backend & Data Model

### 1. Database Schema
No new tables required. We will extend the `payload` JSONB column in the `reports` table.

**Updated Payload Structure:**
```json
{
  "ticker": "AAPL",
  "metrics": { ... },
  "generativeSection": {
    "id": "gen-123",
    "content": "## Executive Summary\n\n...",
    "lastUpdated": "2023-10-27T10:00:00Z",
    "promptHistory": [
      "Summarize the key risks"
    ],
    "version": 1
  }
}
```

### 2. AI Service / Prompt Engineering
-   **System Prompt Update**: The AI must be instructed to output a specific delimiter or JSON structure when it intends to update the report.
-   **Tool Calling**: Ideally, use Gemini's function calling capability.
    -   Function: `update_report_section(content: string, section_name: string)`
    -   When the model calls this, the frontend intercepts it and updates the `GenerativeSection` state.

## Data Flow

1.  **User Intent**: User clicks "Draft Summary" chip OR types "Add a summary" in Chat.
2.  **Request**: Frontend sends message + current report context to Gemini.
3.  **Generation**:
    -   Gemini streams response.
    -   If using Function Calling: The arguments stream in, frontend updates the preview.
    -   If using Delimiters: Frontend parses stream for `<<<REPORT_CONTENT>>>...` blocks.
4.  **Render**: `GenerativeSection` updates in real-time.
5.  **Persistence**:
    -   On stream completion, the new content is merged into the local `report` object.
    -   `saveReport()` is triggered (debounced) to persist to Supabase.

## Implementation Steps

1.  **Setup**: Install dependencies (`react-markdown`, etc.).
2.  **Component Build**: Create `GenerativeSection.tsx` and `MarkdownRenderer.tsx`.
3.  **Integration**: Add `GenerativeSection` to `ReportCard.tsx` (conditionally rendered).
4.  **Service Update**: Modify `geminiService.ts` to handle "update report" intent/tools.
5.  **State Wiring**: Connect Chat input to Report state.
6.  **Persistence**: Ensure `saveReport` includes the new field.

## Authentication UX Considerations (related flow guardrails)
- Backend: `/api/auth/login` no longer sends verification emails on each sign-in attempt; it reuses an active token and relies on the dedicated `/api/auth/resend-verification` endpoint with a 10-minute cooldown.
- Frontend: Auth modal surfaces an inline “email not verified” banner on 403 `verification_required`, with a throttled resend button and cleared state on modal reopen.
- State hygiene: modal form and verification UI reset on open/close to avoid stale banners or prefilled credentials.

## Security & Safety
-   **Sanitization**: `react-markdown` prevents script injection by default.
-   **Validation**: Ensure the payload size doesn't exceed DB limits (check `saved-reports-prd.md` limits).
