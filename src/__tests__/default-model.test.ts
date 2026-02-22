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

describe('Default Model Configuration', () => {
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
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Test response' }),
      stderr: '',
    });
    process.env.STRUCTURED_CONTENT_ENABLED = '1';
  });

  test('should use claude-sonnet-4-6 as default model when no model specified', async () => {
    await handler.execute({ prompt: 'Test prompt' });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Test prompt',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should include default model in response metadata', async () => {
    const result = await handler.execute({ prompt: 'Test prompt' });

    expect(result.content[0]._meta?.model).toBe('claude-sonnet-4-6');
    expect(result.structuredContent?.model).toBe('claude-sonnet-4-6');
  });

  test('should override default model when explicit model provided', async () => {
    await handler.execute({
      prompt: 'Test prompt',
      model: 'claude-opus-4-6',
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Test prompt',
      '--model',
      'claude-opus-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should use default model with sessions', async () => {
    const sessionId = sessionStorage.createSession();

    await handler.execute({
      prompt: 'Test prompt',
      sessionId,
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Test prompt',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should use default model with resume functionality', async () => {
    const sessionId = sessionStorage.createSession();
    sessionStorage.setClaudeSessionId(sessionId, 'existing-conv-id');

    await handler.execute({
      prompt: 'Resume with default model',
      sessionId,
    });

    expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
      '-p',
      'Resume with default model',
      '--resume',
      'existing-conv-id',
      '--model',
      'claude-sonnet-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should use CLAUDE_DEFAULT_MODEL environment variable when set', async () => {
    const originalEnv = process.env.CLAUDE_DEFAULT_MODEL;
    process.env.CLAUDE_DEFAULT_MODEL = 'claude-opus-4-6';

    try {
      await handler.execute({ prompt: 'Test with env var' });

      expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
        '-p',
        'Test with env var',
        '--model',
        'claude-opus-4-6',
        '--output-format',
        'json',
      ]);
    } finally {
      if (originalEnv) {
        process.env.CLAUDE_DEFAULT_MODEL = originalEnv;
      } else {
        delete process.env.CLAUDE_DEFAULT_MODEL;
      }
    }
  });

  test('should prioritize explicit model over environment variable', async () => {
    const originalEnv = process.env.CLAUDE_DEFAULT_MODEL;
    process.env.CLAUDE_DEFAULT_MODEL = 'claude-opus-4-6';

    try {
      await handler.execute({
        prompt: 'Test priority',
        model: 'claude-haiku-4-5-20251001',
      });

      expect(mockedExecuteCommand).toHaveBeenCalledWith('claude', [
        '-p',
        'Test priority',
        '--model',
        'claude-haiku-4-5-20251001',
        '--output-format',
        'json',
      ]);
    } finally {
      if (originalEnv) {
        process.env.CLAUDE_DEFAULT_MODEL = originalEnv;
      } else {
        delete process.env.CLAUDE_DEFAULT_MODEL;
      }
    }
  });
});
