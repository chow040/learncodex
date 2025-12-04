# Generative UI for Report Card PRD

## Purpose & Context
- Enable users to co-create and customize reports by interacting with the AI chatbot.
- Allow users to ask the AI to generate specific content (summaries, analysis, tables) and persist it directly into a dedicated "Generative Section" within the report.
- Transform the static report consumption experience into an interactive, dynamic authoring workflow.

## Goals
1.  **Interactive Generation**: Users can instruct the AI via chat to generate content specifically for the report.
2.  **Seamless Integration**: Generated content is rendered natively within a "Generative Section" of the report card, not just in the chat window.
3.  **Persistence**: The generated content becomes part of the saved report payload and is persisted across sessions.
4.  **Iterative Refinement**: Users can ask the AI to modify or update the generated section (e.g., "make it shorter", "add a table").

## Non-Goals
- Full document editing (like Google Docs). The focus is on AI-generated blocks within a structured report.
- Generating complex interactive widgets (v1 is text/markdown/tables).
- Real-time collaborative editing by multiple users.

## User Stories
- As a user, I can ask the chatbot to "summarize the key risks" and see the result appear in the report's Generative Section.
- As a user, I can ask the AI to "add a pros/cons table" to the report.
- As a user, I can review the AI-generated content in the report and choose to keep it or ask for changes.
- As a user, when I save the report, the generative section is saved along with the standard metrics.

## Scope (v1)
- **UI**: Add a "Generative Section" to the Report Card component.
- **Chat Integration**: Update Chat interface to support "generation" intent.
- **Backend**: Update Report payload structure to store the generative content.
- **AI**: Prompt engineering to handle "update report" requests and output structured data for the UI.

## Functional Requirements
1.  **Generative Section**:
    - A dedicated area in the Report Card (e.g., below the main metrics or in a separate tab).
    - Supports Markdown rendering (text, lists, tables).
    - Initially empty or contains a placeholder.

2.  **Chat-to-Report Workflow**:
    - User types a command (e.g., "Draft an executive summary").
    - AI identifies the intent to modify the report.
    - AI generates the content and sends a structured signal to the frontend.
    - Frontend updates the "Generative Section" with the new content.
    - **Optional**: A "Preview" state where the user must click "Apply" to commit the change to the report view.

3.  **Persistence**:
    - The `payload` field in the `Reports` table (see `saved-reports-prd.md`) must be extensible to hold this new section.
    - Saving the report (auto-save or manual) persists this section.

4.  **Refinement**:
    - Context awareness: The AI must know what is currently in the Generative Section to "rewrite" or "append" to it.

## Non-Functional Requirements
- **Latency**: Generation should feel responsive. Streaming responses for the generative section is desirable if possible.
- **Safety**: Generated content must adhere to standard safety guidelines.
- **Consistency**: The generated content should not contradict the hard data in the report.

## Data Model Changes
- **Report Payload**:
  Existing `payload` JSONB will be extended.
  ```json
  {
    "ticker": "AAPL",
    "metrics": { ... },
    "generativeSection": {
      "content": "## Executive Summary\n\nApple Inc. has shown strong performance...",
      "lastUpdated": "2023-10-27T10:00:00Z",
      "version": 1
    }
  }
  ```

## API/Integration Contracts
- **Chat API**:
  - Needs to support a "tool call" or specific response format that the frontend interprets as "update_report_content".
  - Example Response:
    ```json
    {
      "type": "update_report",
      "content": "## New Summary...",
      "message": "I've updated the summary section for you."
    }
    ```
- **Report Save API**:
  - Uses existing `PUT /api/reports/:id` (or similar) to save the updated payload.

## UX/UI Flow
1.  **Open Report**: User opens a saved report. Generative Section is visible.
2.  **Open Chat**: User opens the side chat panel.
3.  **Request**: User types "Write a bearish thesis for this stock".
4.  **Generation**:
    - AI processes request.
    - Chat shows "Generating report content...".
    - Generative Section updates (streams or snaps) with the text "## Bearish Thesis...".
5.  **Refinement**: User types "Add a bullet point about regulatory risks".
    - AI reads current section, adds the point, and updates the section.
6.  **Save**: User clicks "Save Report" (or auto-save triggers).

## Risks & Mitigations
- **Hallucination**: AI might generate incorrect facts. *Mitigation*: Disclaimer that this section is AI-generated; encourage user review.
- **Overwriting**: AI might accidentally wipe previous notes. *Mitigation*: The AI should be prompted to "append" or "edit" rather than "replace" unless explicitly asked. Undo functionality in the UI would be beneficial.
- **Formatting**: Markdown rendering might break with complex AI outputs. *Mitigation*: Strict output schema/validation for the AI.

## Rollout
- **Phase 1**: Internal testing with "Summary" generation only.
- **Phase 2**: Beta release to select users.
- **Phase 3**: Full rollout with "Append/Edit" capabilities.

## Appendix: Auth & Verification UX (blocking flow)
- Prevented repeated verification-email spam: unverified logins reuse an existing token and only send email via an explicit Resend action (10-minute cooldown).
- Login modal now shows an inline “email not verified” banner with a resend button; signup still shows the full “Check your inbox” confirmation.
- The auth modal resets state on open/close, so stale verification UI and form data are cleared each time.
