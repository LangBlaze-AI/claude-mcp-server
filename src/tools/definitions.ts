import { TOOLS, getModelDescription, type ToolDefinition } from '../types.js';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: TOOLS.CLAUDE,
    description: 'Execute Claude Code CLI in non-interactive mode for AI assistance',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The coding task, question, or analysis request',
        },
        sessionId: {
          type: 'string',
          description:
            'Optional session ID for conversational context. When resuming a session, allowedTools and workingDirectory are applied normally.',
        },
        resetSession: {
          type: 'boolean',
          description:
            'Reset the session history before processing this request',
        },
        model: {
          type: 'string',
          description: getModelDescription('claude'),
        },
        workingDirectory: {
          type: 'string',
          description:
            'Working directory for the agent to use as its root (passed via --cwd flag)',
        },
        allowedTools: {
          type: 'string',
          description:
            'Comma-separated list of tools to allow (e.g. "Bash,Read,Write"). Passed via --allowedTools flag.',
        },
        dangerouslySkipPermissions: {
          type: 'boolean',
          description: 'Skip permission prompts. Use with caution.',
        },
        outputFormat: {
          type: 'string',
          enum: ['text', 'json', 'stream-json'],
          description: 'Output format for the claude CLI response (default: json)',
        },
        maxTurns: {
          type: 'number',
          description: 'Maximum number of agentic turns before stopping',
        },
        routerBaseUrl: {
          type: 'string',
          description:
            'Override ANTHROPIC_BASE_URL for this call (e.g. for claude-code-router)',
        },
        fallbackProviders: {
          type: 'array',
          maxItems: 5,
          description:
            'Ordered list of fallback providers to try if the primary call fails. Each entry can override model and/or routerBaseUrl.',
          items: {
            type: 'object',
            properties: {
              routerBaseUrl: {
                type: 'string',
                description: 'Override ANTHROPIC_BASE_URL for this fallback attempt',
              },
              model: {
                type: 'string',
                description: 'Model to use for this fallback attempt',
              },
            },
          },
        },
      },
      required: ['prompt'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
    annotations: {
      title: 'Execute Claude Code CLI',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: TOOLS.REVIEW,
    description:
      'Run a code review using Claude Code CLI by passing review context as a prompt',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Custom review instructions or focus areas (cannot be used with uncommitted=true; use base/commit review instead)',
        },
        uncommitted: {
          type: 'boolean',
          description:
            'Review staged, unstaged, and untracked changes (working tree) - cannot be combined with custom prompt',
        },
        base: {
          type: 'string',
          description:
            'Review changes against a specific base branch (e.g., "main", "develop")',
        },
        commit: {
          type: 'string',
          description: 'Review the changes introduced by a specific commit SHA',
        },
        title: {
          type: 'string',
          description: 'Optional title to display in the review summary',
        },
        model: {
          type: 'string',
          description: getModelDescription('review'),
        },
        workingDirectory: {
          type: 'string',
          description:
            'Working directory to run the review in (passed via --cwd flag)',
        },
      },
      required: [],
    },
    annotations: {
      title: 'Code Review',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: TOOLS.PING,
    description: 'Test MCP server connection',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo back',
        },
      },
      required: [],
    },
    annotations: {
      title: 'Ping Server',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: TOOLS.HELP,
    description: 'Get Claude Code CLI help information',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: {
      title: 'Get Help',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: TOOLS.LIST_SESSIONS,
    description: 'List all active conversation sessions with metadata',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: {
      title: 'List Sessions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
