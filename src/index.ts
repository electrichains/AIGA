import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer, runStdioServer } from './mcp/server.js';
import { initWebSocketServer, getCurrentVillageState } from './web/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// If started with --stdio flag, run standalone stdio MCP server for CLI agent integration
if (process.argv.includes('--stdio')) {
  runStdioServer().catch((err) => {
    console.error('Fatal error starting stdio MCP server:', err);
    process.exit(1);
  });
} else {
  startHttpAndSseServer();
}

function startHttpAndSseServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 10000);

  // Security & utility middlewares
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Serve static Cesium 3D Dashboard
  const publicDir = path.join(__dirname, 'web/public');
  app.use(express.static(publicDir));
  app.use('/web', express.static(publicDir));

  // Health check endpoint for Render monitoring
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'AIGA - AI Village & Spatial Planning Engine',
      version: '1.0.0',
      jamotLiteReady: true,
      timestamp: new Date().toISOString(),
    });
  });

  // REST endpoint for current village state
  app.get('/api/village', (_req, res) => {
    res.json(getCurrentVillageState());
  });

  // MCP SSE Transport setup
  const mcpServer = createMcpServer();
  const sseSessions = new Map<string, SSEServerTransport>();

  // 1. SSE Connection endpoint for JamotLite MCP client
  app.get('/sse', async (req, res) => {
    console.log('[MCP SSE] New client connection request');
    try {
      // In @modelcontextprotocol/sdk, SSEServerTransport receives the POST message endpoint ('/messages') and the res object
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      sseSessions.set(sessionId, transport);

      req.on('close', () => {
        console.log(`[MCP SSE] Client session closed: ${sessionId}`);
        sseSessions.delete(sessionId);
      });

      await mcpServer.connect(transport);
      console.log(`[MCP SSE] Session established: ${sessionId}`);
    } catch (err: any) {
      console.error('[MCP SSE] Connection error:', err);
      if (!res.headersSent) {
        res.status(500).send(`SSE Error: ${err.message}`);
      }
    }
  });

  // 2. Incoming MCP messages POST endpoint
  app.post('/messages', async (req, res) => {
    const sessionId = (req.query.sessionId as string) || '';
    const transport = sseSessions.get(sessionId);

    if (!transport) {
      console.warn(`[MCP SSE] Session not found for ID: ${sessionId}`);
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (err: any) {
      console.error(`[MCP SSE] Error processing message for session ${sessionId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Root route fallback to 3D web viewer
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  const server = http.createServer(app);

  // Initialize WebSockets server on the same HTTP server
  initWebSocketServer(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================================');
    console.log('🌍 AIGA: AI Village & Spatial Planning Engine is LIVE');
    console.log(`📡 Port:               ${PORT}`);
    console.log(`🛰️  3D Web Viewer:      http://localhost:${PORT}/web`);
    console.log(`⚡ MCP SSE Endpoint:   http://localhost:${PORT}/sse`);
    console.log(`💬 WebSocket Stream:   ws://localhost:${PORT}/ws`);
    console.log(`❤️  Health Check:       http://localhost:${PORT}/health`);
    console.log('🤖 Built for JamotLite (12 Families Permaculture Engine)');
    console.log('===========================================================');
  });
}
