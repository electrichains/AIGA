import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerMcpTools } from './tools.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'aiga-spatial-mcp',
    version: '1.0.0',
  });

  registerMcpTools(server);

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AIGA MCP Server running in stdio transport mode.');
}
