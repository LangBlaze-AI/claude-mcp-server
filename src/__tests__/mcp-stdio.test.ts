import { spawn } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

const JSONRPC_VERSION = '2.0';
const TEST_TIMEOUT_MS = 10000;

async function ensureBuild(distPath: string): Promise<void> {
  if (existsSync(distPath)) return;
  await execAsync('npm run build');
}

function createClaudeStub(): string {
  const stubDir = mkdtempSync(path.join(tmpdir(), 'claude-mcp-test-'));
  const stubPath = path.join(stubDir, 'claude');
  const stubScript = `#!/bin/sh
printf '{"result":"ok","session_id":"sess_stub_123"}\n'
exit 0
`;
  writeFileSync(stubPath, stubScript, { mode: 0o755 });
  chmodSync(stubPath, 0o755);
  return stubDir;
}

describe('MCP stdio integration', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);

  let server: ReturnType<typeof spawn> | null = null;
  let stubDir: string | null = null;
  let buffer = '';
  const pending = new Map<number, (payload: unknown) => void>();

  const sendRequest = (request: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      if (!server?.stdin) {
        reject(new Error('Server stdin not available'));
        return;
      }
      const id = request.id as number;
      const timer = globalThis.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response ${id}`));
      }, TEST_TIMEOUT_MS);
      pending.set(id, (payload) => {
        globalThis.clearTimeout(timer);
        resolve(payload);
      });
      server.stdin.write(`${JSON.stringify(request)}\n`);
    });

  beforeAll(async () => {
    const distPath = path.join(process.cwd(), 'dist', 'index.js');
    await ensureBuild(distPath);
    stubDir = createClaudeStub();

    server = spawn(process.execPath, [distPath], {
      env: {
        ...process.env,
        PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
        STRUCTURED_CONTENT_ENABLED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    server.stdout?.setEncoding('utf8');
    server.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const payload = JSON.parse(line) as {
              id?: number;
              result?: unknown;
            };
            if (typeof payload.id === 'number') {
              const resolver = pending.get(payload.id);
              if (resolver) {
                resolver(payload.result ?? payload);
                pending.delete(payload.id);
              }
            }
          } catch {
            // Ignore non-JSON output
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  });

  afterAll(async () => {
    if (server) {
      server.kill();
      await new Promise((resolve) => server?.once('exit', resolve));
    }
    if (stubDir) {
      rmSync(stubDir, { recursive: true, force: true });
    }
  });

  test('supports tools/list and tools/call over stdio', async () => {
    const listResponse = (await sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'tools/list',
      params: {},
    })) as {
      tools: Array<{
        name: string;
        outputSchema?: { properties?: Record<string, unknown> };
      }>;
    };

    const listParse = ListToolsResultSchema.safeParse(listResponse);
    expect(listParse.success).toBe(true);

    const claudeTool = listResponse.tools.find((tool) => tool.name === 'claude');
    expect(claudeTool?.outputSchema?.properties).toEqual({
      sessionId: { type: 'string' },
    });

    const callResponse = (await sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'tools/call',
      params: { name: 'claude', arguments: { prompt: 'Test prompt' } },
    })) as {
      content: Array<{
        type: string;
        text: string;
        _meta?: { sessionId?: string };
      }>;
      structuredContent?: { sessionId?: string };
    };

    const callParse = CallToolResultSchema.safeParse(callResponse);
    expect(callParse.success).toBe(true);
    expect(callResponse.structuredContent?.sessionId).toBe('sess_stub_123');
  });
});
