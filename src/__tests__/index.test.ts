import { exec } from 'child_process';
import { promisify } from 'util';

// Mock chalk to avoid ESM issues in Jest
jest.mock('chalk', () => ({
  default: {
    blue: (text: string) => text,
    yellow: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
  },
}));

// Mock command execution to avoid actual claude calls
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    stdout: JSON.stringify({ result: 'mocked output' }),
    stderr: '',
  }),
}));

import { TOOLS } from '../types.js';
import { toolDefinitions } from '../tools/definitions.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  toolHandlers,
  ClaudeToolHandler,
  ReviewToolHandler,
  PingToolHandler,
  HelpToolHandler,
  ListSessionsToolHandler,
} from '../tools/handlers.js';
import { InMemorySessionStorage } from '../session/storage.js';
import { ClaudeMcpServer } from '../server.js';

const execAsync = promisify(exec);

describe('Claude MCP Server', () => {
  test('should build successfully', async () => {
    const { stdout } = await execAsync('npm run build');
    expect(stdout).toBeDefined();
  });

  describe('Tool Definitions', () => {
    test('should have all required tools defined', () => {
      expect(toolDefinitions).toHaveLength(5);

      const toolNames = toolDefinitions.map((tool) => tool.name);
      expect(toolNames).toContain(TOOLS.CLAUDE);
      expect(toolNames).toContain(TOOLS.REVIEW);
      expect(toolNames).toContain(TOOLS.PING);
      expect(toolNames).toContain(TOOLS.HELP);
      expect(toolNames).toContain(TOOLS.LIST_SESSIONS);
    });

    test('claude tool should define output schema', () => {
      const claudeTool = toolDefinitions.find(
        (tool) => tool.name === TOOLS.CLAUDE
      );
      expect(claudeTool?.outputSchema).toBeDefined();
      expect(claudeTool?.outputSchema?.type).toBe('object');
    });

    test('claude tool should have required prompt parameter', () => {
      const claudeTool = toolDefinitions.find(
        (tool) => tool.name === TOOLS.CLAUDE
      );
      expect(claudeTool).toBeDefined();
      expect(claudeTool?.inputSchema.required).toContain('prompt');
      expect(claudeTool?.description).toContain('Execute Claude Code CLI');
    });

    test('ping tool should have optional message parameter', () => {
      const pingTool = toolDefinitions.find((tool) => tool.name === TOOLS.PING);
      expect(pingTool).toBeDefined();
      expect(pingTool?.inputSchema.required).toEqual([]);
      expect(pingTool?.description).toContain('Test MCP server connection');
    });

    test('help tool should have no required parameters', () => {
      const helpTool = toolDefinitions.find((tool) => tool.name === TOOLS.HELP);
      expect(helpTool).toBeDefined();
      expect(helpTool?.inputSchema.required).toEqual([]);
      expect(helpTool?.description).toContain('Get Claude Code CLI help');
    });
  });

  describe('Tool Handlers', () => {
    test('should have handlers for all tools', () => {
      expect(toolHandlers[TOOLS.CLAUDE]).toBeInstanceOf(ClaudeToolHandler);
      expect(toolHandlers[TOOLS.REVIEW]).toBeInstanceOf(ReviewToolHandler);
      expect(toolHandlers[TOOLS.PING]).toBeInstanceOf(PingToolHandler);
      expect(toolHandlers[TOOLS.HELP]).toBeInstanceOf(HelpToolHandler);
      expect(toolHandlers[TOOLS.LIST_SESSIONS]).toBeInstanceOf(
        ListSessionsToolHandler
      );
    });

    test('ping handler should return message', async () => {
      const handler = new PingToolHandler();
      const result = await handler.execute({ message: 'test' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('test');
    });

    test('ping handler should use default message', async () => {
      const handler = new PingToolHandler();
      const result = await handler.execute({});

      expect(result.content[0].text).toBe('pong');
    });

    test('listSessions handler should return session info', async () => {
      const sessionStorage = new InMemorySessionStorage();
      const handler = new ListSessionsToolHandler(sessionStorage);
      const result = await handler.execute({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('No active sessions');
    });

    test('review tool should have correct definition', () => {
      const reviewTool = toolDefinitions.find(
        (tool) => tool.name === TOOLS.REVIEW
      );
      expect(reviewTool).toBeDefined();
      expect(reviewTool?.inputSchema.required).toEqual([]);
      expect(reviewTool?.description).toContain('code review');
    });
  });

  describe('Server Initialization', () => {
    test('should initialize server with config', () => {
      const config = { name: 'test-server', version: '1.0.0' };
      const server = new ClaudeMcpServer(config);
      expect(server).toBeInstanceOf(ClaudeMcpServer);
    });
  });

  describe('MCP schema compatibility', () => {
    test('claude tool results should validate against CallToolResultSchema', () => {
      const result = {
        content: [{ type: 'text', text: 'ok', _meta: { model: 'claude-sonnet-4-6' } }],
        structuredContent: { sessionId: 'sess_123' },
      };

      const parsed = CallToolResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    test('tool definitions should validate against ListToolsResultSchema', () => {
      const parsed = ListToolsResultSchema.safeParse({
        tools: toolDefinitions,
      });
      expect(parsed.success).toBe(true);
    });
  });
});
