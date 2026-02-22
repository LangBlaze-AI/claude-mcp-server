import { z } from 'zod';

// Tool constants
export const TOOLS = {
  CLAUDE: 'claude',
  REVIEW: 'review',
  PING: 'ping',
  HELP: 'help',
  LIST_SESSIONS: 'listSessions',
} as const;

export type ToolName = typeof TOOLS[keyof typeof TOOLS];

// Claude model constants
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6' as const;
export const CLAUDE_DEFAULT_MODEL_ENV_VAR = 'CLAUDE_DEFAULT_MODEL' as const;

// Available model options (for documentation/reference)
export const AVAILABLE_CLAUDE_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5-20251001',
] as const;

// Helper function to generate model description
export const getModelDescription = (toolType: 'claude' | 'review') => {
  const modelList = AVAILABLE_CLAUDE_MODELS.join(', ');
  if (toolType === 'claude') {
    return `Specify which model to use (defaults to ${DEFAULT_CLAUDE_MODEL}). Options: ${modelList}`;
  }
  return `Specify which model to use for the review (defaults to ${DEFAULT_CLAUDE_MODEL})`;
};

// Tool annotations for MCP 2025-11-25 spec
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// Tool definition interface
export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
}

// Tool result interface matching MCP SDK expectations
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
    _meta?: Record<string, unknown>;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

// Server configuration
export interface ServerConfig {
  name: string;
  version: string;
}

// Schema for a single fallback provider entry
export const ProviderSchema = z.object({
  routerBaseUrl: z.string().url().optional(),
  model: z.string().optional(),
});

export type ProviderEntry = z.infer<typeof ProviderSchema>;

// Zod schemas for tool arguments
export const ClaudeToolSchema = z.object({
  prompt: z.string(),
  sessionId: z
    .string()
    .max(256, { error: 'Session ID must be 256 characters or fewer' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      error: 'Session ID can only contain letters, numbers, hyphens, and underscores',
    })
    .optional(),
  resetSession: z.boolean().optional(),
  model: z.string().optional(),
  workingDirectory: z.string().optional(),
  allowedTools: z.string().optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
  outputFormat: z.enum(['text', 'json', 'stream-json']).optional(),
  maxTurns: z.number().int().positive().optional(),
  routerBaseUrl: z.string().url().optional(),
  fallbackProviders: z
    .array(ProviderSchema)
    .max(5)
    .optional()
    .describe('Ordered list of fallback providers to try if the primary call fails'),
});

// Review tool schema
export const ReviewToolSchema = z.object({
  prompt: z.string().optional(),
  uncommitted: z.boolean().optional(),
  base: z.string().optional(),
  commit: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
  workingDirectory: z.string().optional(),
});

export const PingToolSchema = z.object({
  message: z.string().optional(),
});

export const HelpToolSchema = z.object({});

export const ListSessionsToolSchema = z.object({});

export type ClaudeToolArgs = z.infer<typeof ClaudeToolSchema>;
export type ReviewToolArgs = z.infer<typeof ReviewToolSchema>;
export type PingToolArgs = z.infer<typeof PingToolSchema>;
export type ListSessionsToolArgs = z.infer<typeof ListSessionsToolSchema>;

// Command execution result
export interface CommandResult {
  stdout: string;
  stderr: string;
}

// Progress token from MCP request metadata
export type ProgressToken = string | number;

// Context passed to tool handlers for sending progress notifications
export interface ToolHandlerContext {
  progressToken?: ProgressToken;
  sendProgress: (message: string, progress?: number, total?: number) => Promise<void>;
  done?: () => void;
}
