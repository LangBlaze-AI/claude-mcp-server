import {
  TOOLS,
  DEFAULT_CLAUDE_MODEL,
  CLAUDE_DEFAULT_MODEL_ENV_VAR,
  type ToolResult,
  type ToolHandlerContext,
  type ClaudeToolArgs,
  type ReviewToolArgs,
  type PingToolArgs,
  ClaudeToolSchema,
  ReviewToolSchema,
  PingToolSchema,
  HelpToolSchema,
  ListSessionsToolSchema,
} from '../types.js';
import {
  InMemorySessionStorage,
  type SessionStorage,
  type ConversationTurn,
} from '../session/storage.js';
import { ToolExecutionError, ValidationError } from '../errors.js';
import { executeCommand, executeCommandStreaming } from '../utils/command.js';
import { ZodError } from 'zod';

// Default no-op context for handlers that don't need progress
const defaultContext: ToolHandlerContext = {
  sendProgress: async () => {},
};

const isStructuredContentEnabled = (): boolean => {
  const raw = process.env.STRUCTURED_CONTENT_ENABLED;
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

export class ClaudeToolHandler {
  constructor(private sessionStorage: SessionStorage) {}

  async execute(
    args: unknown,
    context: ToolHandlerContext = defaultContext
  ): Promise<ToolResult> {
    try {
      const {
        prompt,
        sessionId,
        resetSession,
        model,
        workingDirectory,
        allowedTools,
        dangerouslySkipPermissions,
        outputFormat,
        maxTurns,
        routerBaseUrl,
      }: ClaudeToolArgs = ClaudeToolSchema.parse(args);

      let activeSessionId = sessionId;
      let enhancedPrompt = prompt;

      // Only work with sessions if explicitly requested
      let useResume = false;
      let claudeSessionId: string | undefined;

      if (sessionId) {
        this.sessionStorage.ensureSession(sessionId);
        if (resetSession) {
          this.sessionStorage.resetSession(sessionId);
        }

        claudeSessionId =
          this.sessionStorage.getClaudeSessionId(sessionId);
        if (claudeSessionId) {
          useResume = true;
        } else {
          // Fallback to manual context building if no claude session ID
          const session = this.sessionStorage.getSession(sessionId);
          if (
            session &&
            Array.isArray(session.turns) &&
            session.turns.length > 0
          ) {
            enhancedPrompt = this.buildEnhancedPrompt(session.turns, prompt);
          }
        }
      }

      // Build command arguments
      const selectedModel =
        model ||
        process.env[CLAUDE_DEFAULT_MODEL_ENV_VAR] ||
        DEFAULT_CLAUDE_MODEL;

      let cmdArgs: string[];

      if (useResume && claudeSessionId) {
        // Resume mode: use --resume flag
        cmdArgs = ['-p', enhancedPrompt, '--resume', claudeSessionId, '--model', selectedModel];
        if (outputFormat) {
          cmdArgs.push('--output-format', outputFormat);
        } else {
          cmdArgs.push('--output-format', 'json');
        }
        if (workingDirectory) {
          cmdArgs.push('--cwd', workingDirectory);
        }
      } else {
        // New session mode
        cmdArgs = ['-p', enhancedPrompt, '--model', selectedModel];
        if (outputFormat) {
          cmdArgs.push('--output-format', outputFormat);
        } else {
          cmdArgs.push('--output-format', 'json');
        }
        if (maxTurns) {
          cmdArgs.push('--max-turns', String(maxTurns));
        }
        if (dangerouslySkipPermissions) {
          cmdArgs.push('--dangerously-skip-permissions');
        }
        if (allowedTools) {
          cmdArgs.push('--allowedTools', allowedTools);
        }
        if (workingDirectory) {
          cmdArgs.push('--cwd', workingDirectory);
        }
      }

      // Send initial progress notification
      await context.sendProgress('Starting Claude execution...', 0);

      // Use streaming execution if progress is enabled
      const useStreaming = !!context.progressToken;
      const envOverride = routerBaseUrl
        ? { ANTHROPIC_BASE_URL: routerBaseUrl }
        : undefined;

      const result = useStreaming
        ? await executeCommandStreaming('claude', cmdArgs, {
            onProgress: (message) => {
              // Send progress notification for each chunk of output
              context.sendProgress(message);
            },
            envOverride,
          })
        : envOverride
          ? await executeCommand('claude', cmdArgs, envOverride)
          : await executeCommand('claude', cmdArgs);

      // Parse JSON output from claude --output-format json
      let response: string;
      let extractedSessionId: string | undefined;
      try {
        const parsed = JSON.parse(result.stdout);
        response = parsed.result ?? result.stdout;
        extractedSessionId = parsed.session_id;
      } catch {
        response = result.stdout || result.stderr || 'No output from Claude';
      }

      // Store session ID from new conversations for future resume
      if (activeSessionId && !useResume && extractedSessionId) {
        this.sessionStorage.setClaudeSessionId(
          activeSessionId,
          extractedSessionId
        );
      }

      // Save turn only if using a session
      if (activeSessionId) {
        const turn: ConversationTurn = {
          prompt,
          response,
          timestamp: new Date(),
        };
        this.sessionStorage.addTurn(activeSessionId, turn);
      }

      // Prepare metadata for dual approach:
      // - content[0]._meta: For Claude Code compatibility (avoids structuredContent bug)
      // - structuredContent: For other MCP clients that properly support it
      const metadata: Record<string, unknown> = {
        ...(selectedModel && { model: selectedModel }),
        ...(activeSessionId && { sessionId: activeSessionId }),
      };

      return {
        content: [
          {
            type: 'text',
            text: response,
            _meta: metadata,
          },
        ],
        structuredContent:
          isStructuredContentEnabled() && Object.keys(metadata).length > 0
            ? metadata
            : undefined,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new ValidationError(TOOLS.CLAUDE, error.message);
      }
      throw new ToolExecutionError(
        TOOLS.CLAUDE,
        'Failed to execute claude command',
        error
      );
    }
  }

  private buildEnhancedPrompt(
    turns: ConversationTurn[],
    newPrompt: string
  ): string {
    if (turns.length === 0) return newPrompt;

    // Get relevant context from recent turns
    const recentTurns = turns.slice(-2);
    const contextualInfo = recentTurns
      .map((turn) => {
        // Extract key information without conversational format
        if (
          turn.response.includes('function') ||
          turn.response.includes('def ')
        ) {
          return `Previous code context: ${turn.response.slice(0, 200)}...`;
        }
        return `Context: ${turn.prompt} -> ${turn.response.slice(0, 100)}...`;
      })
      .join('\n');

    // Build enhanced prompt that provides context without conversation format
    return `${contextualInfo}\n\nTask: ${newPrompt}`;
  }
}

export class PingToolHandler {
  async execute(
    args: unknown,
    _context: ToolHandlerContext = defaultContext
  ): Promise<ToolResult> {
    try {
      const { message = 'pong' }: PingToolArgs = PingToolSchema.parse(args);

      return {
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(TOOLS.PING, error.message);
      }
      throw new ToolExecutionError(
        TOOLS.PING,
        'Failed to execute ping command',
        error
      );
    }
  }
}

export class HelpToolHandler {
  async execute(
    args: unknown,
    _context: ToolHandlerContext = defaultContext
  ): Promise<ToolResult> {
    try {
      HelpToolSchema.parse(args);

      const result = await executeCommand('claude', ['--help']);

      return {
        content: [
          {
            type: 'text',
            text: result.stdout || 'No help information available',
          },
        ],
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(TOOLS.HELP, error.message);
      }
      throw new ToolExecutionError(
        TOOLS.HELP,
        'Failed to execute help command',
        error
      );
    }
  }
}

export class ListSessionsToolHandler {
  constructor(private sessionStorage: SessionStorage) {}

  async execute(
    args: unknown,
    _context: ToolHandlerContext = defaultContext
  ): Promise<ToolResult> {
    try {
      ListSessionsToolSchema.parse(args);

      const sessions = this.sessionStorage.listSessions();
      const sessionInfo = sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        lastAccessedAt: session.lastAccessedAt.toISOString(),
        turnCount: session.turns.length,
      }));

      return {
        content: [
          {
            type: 'text',
            text:
              sessionInfo.length > 0
                ? JSON.stringify(sessionInfo, null, 2)
                : 'No active sessions',
          },
        ],
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(TOOLS.LIST_SESSIONS, error.message);
      }
      throw new ToolExecutionError(
        TOOLS.LIST_SESSIONS,
        'Failed to list sessions',
        error
      );
    }
  }
}

export class ReviewToolHandler {
  async execute(
    args: unknown,
    context: ToolHandlerContext = defaultContext
  ): Promise<ToolResult> {
    try {
      const {
        prompt,
        uncommitted,
        base,
        commit,
        title,
        model,
        workingDirectory,
      }: ReviewToolArgs = ReviewToolSchema.parse(args);

      if (prompt && uncommitted) {
        throw new ValidationError(
          TOOLS.REVIEW,
          'The review prompt cannot be combined with uncommitted=true. Use a base/commit review or omit the prompt.'
        );
      }

      // Build review prompt from context parameters
      const selectedModel =
        model ||
        process.env[CLAUDE_DEFAULT_MODEL_ENV_VAR] ||
        DEFAULT_CLAUDE_MODEL;

      const reviewContext: string[] = [];
      if (uncommitted) reviewContext.push('Review staged, unstaged, and untracked changes (working tree diff).');
      if (base) reviewContext.push(`Review changes against base branch: ${base}.`);
      if (commit) reviewContext.push(`Review changes introduced by commit: ${commit}.`);
      if (title) reviewContext.push(`Review title: ${title}.`);

      const reviewPrompt = prompt
        ? `${reviewContext.join(' ')} ${prompt}`
        : reviewContext.length > 0
          ? reviewContext.join(' ') + ' Please provide a detailed code review.'
          : 'Please review the current code changes and provide feedback.';

      const cmdArgs = ['-p', reviewPrompt, '--model', selectedModel, '--output-format', 'json'];
      if (workingDirectory) cmdArgs.push('--cwd', workingDirectory);

      // Send initial progress notification
      await context.sendProgress('Starting code review...', 0);

      // Use streaming execution if progress is enabled
      const useStreaming = !!context.progressToken;
      const result = useStreaming
        ? await executeCommandStreaming('claude', cmdArgs, {
            onProgress: (message) => {
              context.sendProgress(message);
            },
          })
        : await executeCommand('claude', cmdArgs);

      // Parse JSON output from claude --output-format json
      let response: string;
      try {
        const parsed = JSON.parse(result.stdout);
        response = parsed.result ?? result.stdout;
      } catch {
        response = result.stdout || result.stderr || 'No review output from Claude';
      }

      // Prepare metadata for dual approach:
      // - content[0]._meta: For Claude Code compatibility (avoids structuredContent bug)
      // - structuredContent: For other MCP clients that properly support it
      const metadata: Record<string, unknown> = {
        model: selectedModel,
        ...(base && { base }),
        ...(commit && { commit }),
      };

      return {
        content: [
          {
            type: 'text',
            text: response,
            _meta: metadata,
          },
        ],
        structuredContent: isStructuredContentEnabled() ? metadata : undefined,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(TOOLS.REVIEW, error.message);
      }
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ToolExecutionError(
        TOOLS.REVIEW,
        'Failed to execute claude review',
        error
      );
    }
  }
}

// Tool handler registry
const sessionStorage = new InMemorySessionStorage();

export const toolHandlers = {
  [TOOLS.CLAUDE]: new ClaudeToolHandler(sessionStorage),
  [TOOLS.REVIEW]: new ReviewToolHandler(),
  [TOOLS.PING]: new PingToolHandler(),
  [TOOLS.HELP]: new HelpToolHandler(),
  [TOOLS.LIST_SESSIONS]: new ListSessionsToolHandler(sessionStorage),
} as const;
