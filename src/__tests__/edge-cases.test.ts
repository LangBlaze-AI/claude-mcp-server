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

describe('Edge Cases and Integration Issues', () => {
  let handler: ClaudeToolHandler;
  let sessionStorage: InMemorySessionStorage;

  beforeEach(() => {
    sessionStorage = new InMemorySessionStorage();
    handler = new ClaudeToolHandler(sessionStorage);
    mockedExecuteCommand.mockClear();
  });

  test('should handle model parameters with resume', async () => {
    const sessionId = sessionStorage.createSession();
    sessionStorage.setClaudeSessionId(sessionId, 'existing-conv-id');

    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response' }),
      stderr: '',
    });

    // User wants to change model in existing session
    await handler.execute({
      prompt: 'Use different model',
      sessionId,
      model: 'claude-opus-4-6',
    });

    // Resume mode: -p prompt --resume session-id --model selectedModel --output-format json
    const call = mockedExecuteCommand.mock.calls[0];
    expect(call[1]).toEqual([
      '-p',
      'Use different model',
      '--resume',
      'existing-conv-id',
      '--model',
      'claude-opus-4-6',
      '--output-format',
      'json',
    ]);
  });

  test('should handle missing session ID gracefully', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response without session ID' }),
      stderr: 'Some other output',
    });

    const sessionId = sessionStorage.createSession();
    await handler.execute({
      prompt: 'Test prompt',
      sessionId,
    });

    // Should not crash, claude session ID should be undefined (no session_id in JSON)
    expect(sessionStorage.getClaudeSessionId(sessionId)).toBeUndefined();
  });

  test('should handle command execution failures', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('Claude CLI not found'));

    await expect(handler.execute({ prompt: 'Test prompt' })).rejects.toThrow(
      'Failed to execute claude command'
    );
  });

  test('should handle empty/malformed CLI responses', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await handler.execute({ prompt: 'Test prompt' });

    expect(result.content[0].text).toBe('No output from Claude');
  });

  test('should validate prompt parameter exists', async () => {
    await expect(
      handler.execute({}) // Missing required prompt
    ).rejects.toThrow();
  });

  test('should handle long conversation contexts', async () => {
    const sessionId = sessionStorage.createSession();

    // Add many turns to test context building
    for (let i = 0; i < 10; i++) {
      sessionStorage.addTurn(sessionId, {
        prompt: `Question ${i}`,
        response: `Answer ${i}`.repeat(100), // Long responses
        timestamp: new Date(),
      });
    }

    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Final question',
      sessionId,
    });

    // Should only use recent turns, not crash with too much context
    const call = mockedExecuteCommand.mock.calls[0];
    const prompt = call?.[1]?.[1]; // claude -p <prompt> --model ...
    expect(typeof prompt).toBe('string');
    if (prompt) {
      expect(prompt.length).toBeLessThan(5000); // Reasonable limit
    }
  });

  test('should pass allowedTools flag to CLI', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Test prompt',
      allowedTools: 'Bash,Read,Write',
    });

    const call = mockedExecuteCommand.mock.calls[0];
    expect(call[1]).toContain('--allowedTools');
    expect(call[1]).toContain('Bash,Read,Write');
  });

  test('should pass dangerouslySkipPermissions flag to CLI', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Test prompt',
      dangerouslySkipPermissions: true,
    });

    const call = mockedExecuteCommand.mock.calls[0];
    expect(call[1]).toContain('--dangerously-skip-permissions');
  });

  test('should pass maxTurns flag to CLI', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ result: 'Response' }),
      stderr: '',
    });

    await handler.execute({
      prompt: 'Test prompt',
      maxTurns: 5,
    });

    const call = mockedExecuteCommand.mock.calls[0];
    expect(call[1]).toContain('--max-turns');
    expect(call[1]).toContain('5');
  });
});
