# Product Requirements Document (PRD): Unified Logging System

## 1. Introduction
**Project Name:** Ultramagnus Logging System  
**Date:** 29 November 2025  
**Status:** Draft  

### 1.1 Objective
To implement a robust, unified logging infrastructure across the Frontend (Moonshot) and Backend (Ultramagnus BFF) to enable effective Root Cause Analysis (RCA), debugging, and system monitoring. The system must capture errors, warnings, and critical operational events with sufficient context to reproduce and fix issues.

### 1.2 Problem Statement
Currently, the application lacks a centralized mechanism to track errors. Frontend errors are lost in the user's browser console, and backend errors may only appear in ephemeral terminal outputs. This makes diagnosing production issues, user-reported bugs, and performance bottlenecks difficult.

## 2. Scope
*   **Frontend (Moonshot):** React application running in the browser.
*   **Backend (Ultramagnus BFF):** Node.js/Express application.
*   **Integration:** Correlation between Frontend actions and Backend processing.

## 3. Functional Requirements

### 3.1 Backend Logging (Node.js/Express)
The backend must act as the source of truth for server-side operations and potentially as an aggregator for frontend logs.

*   **Structured Logging:** All logs must be output in JSON format for easy parsing by log management tools (e.g., CloudWatch, Datadog, ELK).
*   **Log Levels:**
    *   `ERROR`: Fatal errors causing request failure (e.g., DB connection lost, unhandled exceptions).
    *   `WARN`: Unexpected situations that don't stop the flow (e.g., deprecated API usage, retries).
    *   `INFO`: Standard operational events (e.g., Server start, Request received).
    *   `DEBUG`: Detailed information for development (e.g., Payload details, function entry/exit).
*   **Contextual Information:** Every log entry must include:
    *   `timestamp`: ISO 8601 format.
    *   `level`: Severity level.
    *   `correlationId`: A unique ID tracing the request from FE to BE.
    *   `service`: "backend-bff".
    *   `userId`: (If authenticated) ID of the user making the request.
    *   `path`: API endpoint accessed.
*   **HTTP Request Logging:**
    *   Log incoming requests (Method, URL, User-Agent).
    *   Log outgoing responses (Status Code, Response Time).
*   **Error Handling:**
    *   Capture full stack traces for `ERROR` level logs.
    *   Catch unhandled promise rejections and uncaught exceptions.

### 3.2 Frontend Logging (React/Vite)
The frontend must capture client-side exceptions and transmit them to a centralized location.

*   **Global Error Boundary:** Catch React component tree crashes and log the component stack.
*   **API Error Interceptor:** Capture failed HTTP requests (4xx, 5xx) and network failures.
*   **Log Transmission:**
    *   Critical errors must be sent to a logging endpoint (e.g., `POST /api/logs` or a 3rd party service like Sentry).
    *   Logs should be batched to avoid network congestion.
*   **Context:**
    *   Browser/Device info.
    *   Current URL/Route.
    *   User ID (if logged in).
    *   Correlation ID (generated per session or per request).

### 3.3 Correlation & Tracing
*   **Correlation ID:** The Frontend shall generate a unique `X-Request-ID` header for every API call.
*   The Backend must read this header and include it in all logs generated during that request's lifecycle.
*   If the header is missing, the Backend must generate one.

## 4. Non-Functional Requirements

### 4.1 Performance
*   Logging operations must be asynchronous and non-blocking.
*   Frontend log transmission must not degrade the user interface responsiveness.
*   Log payload size should be minimized (exclude large base64 strings or heavy data blobs).

### 4.2 Security & Privacy (PII)
*   **Data Masking:** strictly scrub Sensitive Personal Information (SPI) and Personally Identifiable Information (PII) before logging.
    *   Passwords, Auth Tokens, API Keys, Credit Card numbers.
*   **Sanitization:** Ensure logs do not contain script injection vectors.

### 4.3 Reliability
*   The logging system failure (e.g., disk full, network down) must not crash the main application.

## 5. Technical Architecture Proposal

### 5.1 Stack Recommendations
*   **Backend Library:** `winston` or `pino` (High performance, JSON support).
    *   *Current State:* Uses `morgan` for HTTP logs. Recommend replacing/augmenting with `winston` for application-level logging.
*   **Frontend Library:** Custom utility wrapping `console` or integration with **Sentry** (Recommended for production).
    *   *Alternative:* If self-hosted is required, create a `Logger` service in `src/services/` that pushes to a new Backend endpoint `POST /api/v1/logs`.

### 5.2 Log Schema Example (JSON)
```json
{
  "timestamp": "2025-11-29T14:30:00.123Z",
  "level": "error",
  "service": "ultramagnus-backend",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "message": "Database connection failed",
  "userId": "user_123",
  "meta": {
    "component": "AuthService",
    "stack": "Error: Connection timeout at..."
  }
}
```

## 6. Implementation Plan

### Phase 1: Backend Foundation
1.  Install `winston`.
2.  Configure Logger with Transports (Console for Dev, File/Stream for Prod).
3.  Create Middleware to attach `correlationId` (using `uuid`) to `req` object.
4.  Replace `console.log` with `Logger.info/error` throughout the codebase.
5.  Add Global Error Handler middleware to catch and log all errors.

### Phase 2: Frontend Integration
1.  Create `Logger` service in Frontend.
2.  Implement React Error Boundary to catch UI crashes.
3.  Update API Client (axios/fetch) to inject `X-Request-ID`.
4.  (Optional) Implement `POST /logs` endpoint on Backend to receive FE errors.

### Phase 3: Monitoring & Alerts
1.  Set up log aggregation (e.g., pipe logs to CloudWatch or a local file viewer).
2.  Define alerts for high error rates (e.g., > 1% of requests failing).

## 7. Success Metrics
*   **Time to Detect:** Reduction in time from issue occurrence to discovery.
*   **Time to Resolve:** Reduction in time to diagnose root cause using correlation IDs.
*   **Coverage:** 100% of unhandled exceptions are captured and logged.
