#!/usr/bin/env node

import chalk from 'chalk';
import { ClaudeMcpServer } from './server.js';

const SERVER_CONFIG = {
  name: 'claude-mcp-server',
  version: '0.0.6',
} as const;

async function main(): Promise<void> {
  try {
    const server = new ClaudeMcpServer(SERVER_CONFIG);
    await server.start();
  } catch (error) {
    console.error(chalk.red('Failed to start server:'), error);
    process.exit(1);
  }
}

main();
