import { ClaudeToolHandler } from '../tools/handlers.js';
import { InMemorySessionStorage } from '../session/storage.js';
import { executeCommand } from '../utils/command.js';

// Mock the command execution
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockedExecuteCommand = executeCommand as jest.MockedFunction<
  typeof executeCommand
>;

describe('Claude Resume Functionality', () => {
  let handler: ClaudeToolHandler;
  let sessionStorage: InMemorySessionStorage;
  let originalStructuredContent: string | undefined;

  beforeAll(() => {
    originalStructuredContent = process.env.STRUCTURED_CONTENT_ENABLED;
  });

  afterAll(() => {
    if (originalStructuredContent) {
      process.env.STRUCTURED_CONTENT_ENABLED = originalStructuredContent;
    } else {
      delete process.env.STRUCTURED_CONTENT_ENABLED;
    }
  });

  beforeEach(() => {
    sessionStorage = new InMemorySessionStorage();
    handler = new ClaudeToolHandler(sessionStorage);
    mockedExecuteCommand.mockClear();
    process.env.STRUCTURED_CONTENT_ENABLED = '1';
  });

  test('should use claude -p for new session without claude session ID', async () => {
    const sessionId = sessionStorage.createSession();
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Test response', session_id: 'abc-123-def' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'First message',
      sessionId,
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'First message',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should extract and store session ID from JSON stdout', async () => {
    const sessionId = sessionStorage.createSession();
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Test response', session_id: 'abc-123-def' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'First message',
      sessionId,
    });

    expect(sessionStorage.getClaudeSessionId(sessionId)).toBe('abc-123-def');
  });

  test('should use resume for subsequent messages in session', async () => {
    const sessionId = sessionStorage.createSession();
    sessionStorage.setClaudeSessionId(sessionId, 'existing-claude-session-id');

    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Resumed response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Continue the task',
      sessionId,
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Continue the task',
      '--resume',
      'existing-claude-session-id',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should reset session ID when session is reset', async () => {
    const sessionId = sessionStorage.createSession();
    sessionStorage.setClaudeSessionId(sessionId, 'old-session-id');

    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Test response', session_id: 'new-session-id' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Reset and start new',
      sessionId,
      resetSession: true,
    });

    // Should use new session (not resume) and get new session ID
    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Reset and start new',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
    expect(sessionStorage.getClaudeSessionId(sessionId)).toBe('new-session-id');
  });

  test('should fall back to manual context if no claude session ID', async () => {
    const sessionId = sessionStorage.createSession();

    // Add some history
    sessionStorage.addTurn(sessionId, {
      prompt: 'Previous question',
      response: 'Previous answer',
      timestamp: new Date(),
    });

    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Context-aware response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Follow up question',
      sessionId,
    });

    // Should build enhanced prompt since no claude session ID
    const call = mockedExecuteCommand.mock.calls[0];
    const sentPrompt = call?.[1]?.[1]; // claude -p <prompt> --model ...
    expect(sentPrompt).toContain('Context:');
    expect(sentPrompt).toContain('Task: Follow up question');
  });

  test('should pass routerBaseUrl as ANTHROPIC_BASE_URL env override', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Test response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Router check',
      routerBaseUrl: 'http://localhost:8080',
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      { ANTHROPIC_BASE_URL: 'http://localhost:8080' }
    );
  });
});
