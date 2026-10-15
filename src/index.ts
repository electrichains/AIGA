import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer, runStdioServer } from './mcp/server.js';
import {
  initWebSocketServer,
  getCurrentVillageState,
  setCurrentVillageState,
  broadcastLayerUpdate,
} from './web/websocket.js';
import { parseKmzLayers } from './spatial/kmzParser.js';
import { FAMILY_COLORS } from './spatial/generator.js';
import * as turf from '@turf/turf';
import { onboardingRouter } from './web/onboarding.js';
import { requireAdmin, rateLimit } from './web/guards.js';

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

  // Render sits behind a proxy: trust it so rate limits see the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // CORS only for origins listed in CORS_ORIGINS (comma-separated). The onboarding
  // page and dashboard are same-origin, and MCP clients are servers, so none need it.
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));

  // Large bodies only where KMZ files travel (admin routes); everything else stays small.
  app.use(['/api/upload-kmz', '/messages'], express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '64kb' }));

  if (!process.env.AIGA_ADMIN_TOKEN) {
    console.warn('[Security] AIGA_ADMIN_TOKEN is not set: the MCP endpoints and KMZ upload are open to anyone.');
  }

  // Applicant onboarding API (Asara + applications to J-Mission)
  app.use(onboardingRouter());

  // Static files: the onboarding experience at /, the Cesium dashboard at /dashboard
  const publicDir = path.join(__dirname, 'web/public');
  // three.js is served from our own origin (no third-party CDN wait on mobile), cached for a year.
  const threeBuildDir = path.resolve(__dirname, '../node_modules/three/build');
  app.use('/vendor/three', express.static(threeBuildDir, { maxAge: '365d', immutable: true, index: false }));
  // Pages always revalidate so a deploy shows up at once; other assets cache for a day.
  const staticOptions = {
    maxAge: '1d',
    setHeaders: (res: express.Response, filePath: string) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  };
  app.get('/dashboard', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'dashboard.html'));
  });
  app.use(express.static(publicDir, staticOptions));
  app.use('/web', express.static(publicDir, staticOptions));

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

  // REST endpoint to upload and visualize KMZ/KML files directly
  app.post('/api/upload-kmz', requireAdmin, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
    try {
      const { kmz_base64, kmz_url, name } = req.body;
      if (!kmz_base64 && !kmz_url) {
        res.status(400).json({ error: 'Either kmz_base64 or kmz_url must be provided' });
        return;
      }

      const parsed = await parseKmzLayers({ kmz_base64, kmz_url });

      // Build plots with 12 family assignments and styles
      const enrichedPlots = parsed.plots.map((p, idx) => {
        const family_id = (idx % 12) + 1;
        const colorHex = FAMILY_COLORS[(family_id - 1) % FAMILY_COLORS.length];
        const centroid = turf.centroid(p.feature).geometry.coordinates as [number, number];

        // Ensure feature properties carry styling for Cesium
        p.feature.properties = {
          ...p.feature.properties,
          id: p.id,
          family_id,
          familyName: p.name || `Family #${family_id}`,
          layerType: 'plot',
          colorHex,
          fillColor: colorHex,
          fillOpacity: 0.65,
          strokeColor: '#FFFFFF',
          strokeWidth: 2,
          areaSqm: p.areaSqm,
          extrudeHeightMeters: 5 + (family_id % 3) * 2,
        };

        return {
          family_id,
          familyName: p.name || `Family #${family_id}`,
          areaSqm: p.areaSqm,
          centroid: [Math.round(centroid[0] * 1000000) / 1000000, Math.round(centroid[1] * 1000000) / 1000000] as [number, number],
          colorHex,
        };
      });

      const newVillageState = {
        villageName: name || 'Custom Uploaded KMZ Village',
        kml: '',
        featureCollection: parsed.featureCollection,
        summary: {
          plotCount: parsed.summary.plotCount,
          hubRadiusMeters: 35,
          totalVillageAreaSqm: parsed.summary.totalPlotAreaSqm,
          averagePlotAreaSqm:
            parsed.summary.plotCount > 0
              ? Math.round((parsed.summary.totalPlotAreaSqm / parsed.summary.plotCount) * 100) / 100
              : 0,
          plots: enrichedPlots,
          bbox: parsed.summary.bbox,
          center: parsed.summary.center,
          elevation: parsed.summary.elevation,
        },
      };

      setCurrentVillageState(newVillageState as any);

      // Broadcast to all active family dashboards via WebSocket
      broadcastLayerUpdate({
        layer_type: 'village_reset',
        action: 'sync',
        payload: newVillageState,
        source: 'web_client',
      });

      res.json({
        status: 'success',
        villageName: newVillageState.villageName,
        summary: newVillageState.summary,
        totalFeatures: parsed.summary.totalFeatures,
      });
    } catch (err: any) {
      console.error('[API] KMZ Upload error:', err);
      res.status(400).json({ error: err.message });
    }
  });

  // MCP SSE Transport setup
  const mcpServer = createMcpServer();
  const sseSessions = new Map<string, SSEServerTransport>();

  // 1. SSE Connection endpoint for JamotLite MCP client
  app.get('/sse', requireAdmin, async (req, res) => {
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
  app.post('/messages', requireAdmin, async (req, res) => {
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

  // Root route: the AIGA Village onboarding
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
    console.log(`🏡 Village onboarding: http://localhost:${PORT}/`);
    console.log(`🛰️  3D Dashboard:       http://localhost:${PORT}/dashboard`);
    console.log(`⚡ MCP SSE Endpoint:   http://localhost:${PORT}/sse`);
    console.log(`💬 WebSocket Stream:   ws://localhost:${PORT}/ws`);
    console.log(`❤️  Health Check:       http://localhost:${PORT}/health`);
    console.log('🤖 Built for JamotLite (12 Families Permaculture Engine)');
    console.log('===========================================================');
  });
}
