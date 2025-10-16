---
issue: 8
analyzed: 2025-10-13T13:35:00Z
streams: 4
parallelizable: true
---

# Work Stream Analysis: Issue #8 - AI Integration (OpenAI)

## Overview
Integrate OpenAI API for processing queries with context, implementing RAG pattern, rate limiting, caching, and error handling for production-ready AI features.

## Parallel Work Streams

### Stream A: OpenAI SDK Integration & Prompt Engineering
**Agent Type:** general-purpose
**Can Start:** ✅ Immediately
**Estimated Time:** 8 hours

**Scope:**
- Install and configure OpenAI SDK
- Implement prompt template system for context injection
- Create RAG (Retrieval-Augmented Generation) pattern
- Add source attribution in responses
- Implement streaming responses (optional)
- Create prompt engineering utilities

**Files to Create:**
- `backend/src/services/openai.ts` (new)
- `backend/src/utils/promptBuilder.ts` (new)
- `backend/src/types/ai.ts` (new)
- `backend/.env.example` (update with OPENAI_API_KEY)

**Deliverables:**
- OpenAI client configuration
- Prompt template system
- RAG implementation
- Source attribution logic
- TypeScript interfaces for AI operations

---

### Stream B: Rate Limiting & Caching
**Agent Type:** general-purpose
**Can Start:** ✅ Immediately (parallel with A)
**Estimated Time:** 6 hours

**Scope:**
- Implement rate limiting middleware
- Create in-memory caching layer (Redis optional)
- Add cache invalidation strategies
- Implement request throttling
- Add user-based rate limits

**Files to Create:**
- `backend/src/middleware/rateLimiter.ts` (new)
- `backend/src/utils/cache.ts` (new)
- `backend/src/config/rateLimits.ts` (new)

**Deliverables:**
- Rate limiting middleware
- In-memory cache with TTL
- Cache key generation
- Rate limit per user/IP
- Cache hit/miss tracking

---

### Stream C: API Endpoint & Error Handling
**Agent Type:** general-purpose
**Can Start:** ⏳ After Stream A completes
**Estimated Time:** 6 hours

**Scope:**
- Create POST /api/query endpoint
- Integrate OpenAI service from Stream A
- Implement comprehensive error handling
- Add retry logic with exponential backoff
- Handle timeouts and API errors
- Add request validation

**Files to Create/Modify:**
- `backend/src/routes/query.ts` (new)
- `backend/src/routes/index.ts` (add query route)
- `backend/src/middleware/apiErrorHandler.ts` (new)

**Deliverables:**
- POST /api/query endpoint
- Request validation
- Error handling for API failures
- Retry logic with backoff
- Timeout handling
- Response formatting

---

### Stream D: Testing & Performance
**Agent Type:** test-runner
**Can Start:** ⏳ After Streams A, B, C complete
**Estimated Time:** 8 hours

**Scope:**
- Write unit tests for OpenAI service
- Write integration tests for query endpoint
- Test rate limiting functionality
- Test caching behavior
- Performance benchmarking (< 5s p95)
- Load testing for concurrent requests

**Files to Create:**
- `backend/src/services/__tests__/openai.test.ts` (new)
- `backend/src/routes/__tests__/query.test.ts` (new)
- `backend/src/middleware/__tests__/rateLimiter.test.ts` (new)
- `backend/src/utils/__tests__/cache.test.ts` (new)

**Deliverables:**
- Comprehensive test suite
- Performance benchmarks
- Load test results
- Error scenario tests
- Cache behavior tests

---

## Dependency Graph

```
Stream A (OpenAI SDK) ──────┐
                            ├──> Stream C (API Endpoint) ──┐
Stream B (Rate Limit) ──────┤                              ├──> Stream D (Testing)
                            └──────────────────────────────┘
```

## Technical Stack

- **AI SDK:** OpenAI Node.js SDK (latest)
- **Caching:** In-memory Map with TTL (or Redis for production)
- **Rate Limiting:** express-rate-limit or custom middleware
- **Retry:** exponential-backoff library
- **Validation:** express-validator
- **Testing:** Jest + Supertest

## API Endpoint Specification

**POST /api/query**

Request:
```json
{
  "question": "string",
  "contextFiles": ["parsed file content"],
  "inlineContext": "string",
  "settings": {
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "maxTokens": 2000
  }
}
```

Response:
```json
{
  "answer": "string",
  "sources": [
    {"file": "filename", "chunk": "relevant text"}
  ],
  "model": "gpt-3.5-turbo",
  "tokensUsed": 1234,
  "cached": false,
  "responseTime": 2.5
}
```

## Prompt Engineering Strategy

**System Prompt Template:**
```
You are a helpful AI assistant analyzing documents and answering questions based on provided context.

Context from uploaded files:
{file_contexts}

Additional context:
{inline_context}

User question: {question}

Instructions:
- Answer based on the provided context
- Cite sources when possible
- If the answer is not in the context, say so clearly
- Be concise and accurate
```

## Rate Limiting Configuration

- **Per User:** 60 requests/hour
- **Per IP:** 100 requests/hour
- **Global:** 1000 requests/hour
- **Burst Limit:** 10 requests/minute

## Caching Strategy

- **Cache Key:** Hash of (question + context + settings)
- **TTL:** 1 hour
- **Max Size:** 1000 entries (LRU eviction)
- **Invalidation:** Manual or TTL-based

## Error Handling

**Error Types:**
- OpenAI API errors (rate limit, invalid request, auth)
- Timeout errors (> 10 seconds)
- Network errors
- Invalid input errors
- Cache errors (non-fatal)

**Retry Strategy:**
- Initial retry delay: 1 second
- Max retries: 3
- Exponential backoff: 2x multiplier
- Max delay: 10 seconds

## Performance Requirements

- **Response Time (p95):** < 5 seconds
- **Response Time (p99):** < 10 seconds
- **Cache Hit Rate:** > 30%
- **Concurrent Requests:** 50+ simultaneous
- **Uptime:** 99.9%

## Security Considerations

- API keys in environment variables
- Input validation and sanitization
- Rate limiting to prevent abuse
- Request size limits
- CORS properly configured
- No sensitive data in logs

## Risk Factors

- **Medium Risk:** OpenAI API costs can escalate
- **Mitigation:** Rate limiting + caching + cost monitoring
- **Medium Risk:** API latency variability
- **Mitigation:** Retry logic + timeout handling + caching
- **Low Risk:** Complex prompt engineering
- **Mitigation:** Iterative testing + prompt templates

## Success Criteria

- ✅ All acceptance criteria met
- ✅ Response time < 5 seconds (p95)
- ✅ Rate limiting prevents abuse
- ✅ Caching reduces API calls by 30%+
- ✅ Error handling covers all scenarios
- ✅ Tests passing with 80%+ coverage
- ✅ API costs manageable
