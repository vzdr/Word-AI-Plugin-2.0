---
issue: 12
stream: Retry Logic & Async State Management
agent: general-purpose
started: 2025-10-14T16:28:24Z
completed: 2025-10-14T17:15:00Z
status: completed
---

# Stream B: Retry Logic & Async State Management

## Scope
Create useAsync hook for managing async operations with loading/error/retry states, create useRetry hook implementing exponential backoff retry logic, add retry configuration options, enhance aiService.ts with retry middleware, and update existing LoadingIndicator to show retry attempts.

## Files Created
- `C:\Users\Zdravkovic\Desktop\testdirectory\word-plugin\src\utils\retry.ts` - Retry utilities with exponential backoff
- `C:\Users\Zdravkovic\Desktop\testdirectory\word-plugin\src\hooks\useRetry.ts` - React hook for retry logic
- `C:\Users\Zdravkovic\Desktop\testdirectory\word-plugin\src\hooks\useAsync.ts` - React hook for async state management

## Files Modified
- `C:\Users\Zdravkovic\Desktop\testdirectory\word-plugin\src\services\aiService.ts` - Added retry wrapper for API calls
- `C:\Users\Zdravkovic\Desktop\testdirectory\word-plugin\src\taskpane\components\LoadingIndicator.tsx` - Added retry attempt display

## Dependencies
- None - can start immediately

## Implementation Details

### 1. retry.ts Utilities
Created comprehensive retry utilities with the following features:

**Configuration:**
```typescript
DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
}
```

**Key Functions:**
- `calculateDelay(attempt, config)` - Exponential backoff calculation
- `shouldRetryError(error)` - Smart error detection for transient vs permanent failures
- `retryWithBackoff(fn, config, onRetry)` - Execute function with retry logic
- `withRetry(fn, config)` - Higher-order function wrapper for retry behavior

**Error Detection Logic:**
- **Retries:** Network errors, timeouts, 429 (rate limit), 503 (service unavailable), 502/504 (gateway errors)
- **Does NOT retry:** 400 (bad request), 401/403 (auth errors), 404 (not found), 422 (validation errors)

### 2. useRetry Hook
React hook that manages retry state with exponential backoff:

**Features:**
- Tracks retry attempts (`retryCount`)
- Indicates retry in progress (`isRetrying`)
- Provides execute method with automatic retry
- Respects `maxRetries` configuration
- Cleanup on component unmount
- Only retries transient errors

**Usage:**
```typescript
const { execute, isRetrying, retryCount, maxRetries } = useRetry(
  async () => fetchData(),
  { maxAttempts: 3, initialDelay: 1000 }
);
```

### 3. useAsync Hook
Generic async state management hook with optional retry integration:

**Features:**
- Manages `loading`, `error`, `data` states
- Optional immediate execution on mount
- Success/error callbacks
- Reset functionality
- Cleanup on component unmount
- Optional retry integration via `useAsyncWithRetry`

**Usage:**
```typescript
const { data, loading, error, execute, reset } = useAsync(
  async (userId) => fetchUser(userId),
  {
    immediate: false,
    onSuccess: (data) => console.log('Success:', data),
    onError: (error) => console.error('Error:', error)
  }
);
```

### 4. aiService.ts Enhancement
Enhanced AI service with automatic retry logic:

**Changes:**
- Renamed original `askAI` to `askAIInternal` (private)
- Created new public `askAI` wrapper with retry logic
- Added `AI_SERVICE_RETRY_CONFIG` constant
- Configured retry behavior for AI-specific error types
- Added logging for retry attempts

**Retry Configuration for AI Service:**
```typescript
AI_SERVICE_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  shouldRetry: (error) => {
    // Custom logic for AIServiceError types
    // Retries: TIMEOUT, NETWORK_ERROR, SERVICE_UNAVAILABLE, RATE_LIMIT
    // Does NOT retry: INVALID_REQUEST, AUTH_ERROR
  }
}
```

**Behavior:**
- Automatically retries transient failures (503, 429, timeouts)
- Does NOT retry permanent errors (400, 401, 404, 422)
- Logs each retry attempt with delay and error details
- Uses exponential backoff between attempts

### 5. LoadingIndicator Enhancement
Updated to display retry information:

**New Props:**
- `retryCount?: number` - Current retry attempt number
- `maxRetries?: number` - Maximum retry attempts

**Behavior:**
- Shows "Processing your request..." during initial load
- Shows "Retrying... (attempt X of Y)" when retrying
- Uses React.useMemo for efficient message calculation
- Maintains existing spinner functionality and accessibility

**Example Usage:**
```typescript
<LoadingIndicator
  message="Processing..."
  retryCount={retryCount}
  maxRetries={maxRetries}
/>
```

## Configuration Values Used

| Component | Setting | Value | Rationale |
|-----------|---------|-------|-----------|
| Retry Config | maxAttempts | 3 | Balance between persistence and user wait time |
| Retry Config | initialDelay | 1000ms | Sufficient for most transient issues to resolve |
| Retry Config | maxDelay | 10000ms | Cap to prevent excessive wait times |
| Retry Config | backoffMultiplier | 2 | Standard exponential backoff (1s, 2s, 4s) |
| AI Service | timeout | 30000ms | Existing setting, sufficient for AI responses |

## Testing Considerations

### Unit Tests Needed:
1. **retry.ts:**
   - Test `calculateDelay` with various attempt numbers
   - Test `shouldRetryError` for different error types and status codes
   - Test `retryWithBackoff` executes correct number of attempts
   - Test `retryWithBackoff` stops on permanent errors
   - Test exponential backoff delays are correct

2. **useRetry:**
   - Test retry state updates correctly
   - Test respects maxAttempts limit
   - Test only retries transient errors
   - Test cleanup on unmount
   - Test reset functionality

3. **useAsync:**
   - Test loading/error/data state management
   - Test immediate execution option
   - Test success/error callbacks
   - Test cleanup on unmount
   - Test reset functionality

4. **aiService.ts:**
   - Test retries on 503 errors
   - Test retries on timeout errors
   - Test retries on 429 rate limit
   - Test does NOT retry on 400 errors
   - Test does NOT retry on 401 errors
   - Test logging of retry attempts

5. **LoadingIndicator:**
   - Test displays default message when no retry
   - Test displays retry message with count
   - Test message updates on retryCount change

### Integration Tests:
- Test complete flow from component using useAsync with retry
- Test AI service retries and eventually succeeds
- Test AI service exhausts retries and reports error
- Test LoadingIndicator updates during retry sequence

## Notes for Stream C Integration
Stream C will integrate these hooks into components. Key integration points:

1. **App.tsx:** Use `useAsync` or `useAsyncWithRetry` for AI queries
2. **Components:** Pass `retryCount` and `maxRetries` to LoadingIndicator
3. **Error Handling:** Combine with ErrorBoundary from Stream A
4. **Logging:** Add comprehensive logging throughout retry flow

## Coordination with Stream A
- No file conflicts - Stream A working on different components
- Stream A's ErrorBoundary will catch errors after retries exhausted
- Stream A's NetworkStatusContext can be used to skip retries when offline
- Both streams' outputs will be integrated in Stream C

## Status
All deliverables completed:
- Retry utilities with exponential backoff
- useRetry hook with state management
- useAsync hook for async operations
- AI service integrated with retry logic
- LoadingIndicator enhanced with retry display
- All TypeScript interfaces documented
- JSDoc comments added for all exports
- Ready for Stream C integration
