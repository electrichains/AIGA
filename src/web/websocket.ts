import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { generateGenerativeVillage, GeneratedVillageResult } from '../spatial/generator.js';
import { validateSpatialRules, SpatialValidationResult } from '../spatial/ruleValidator.js';

export interface SpatialLayerBroadcast {
  layer_type: 'plot' | 'water' | 'road' | 'hub' | 'annotation' | 'village_reset';
  action: 'create' | 'update' | 'delete' | 'sync';
  payload: any;
  family_id?: number;
  timestamp: string;
  source: 'mcp' | 'web_client' | 'system';
}

export interface ClientConnectionInfo {
  ws: WebSocket;
  familyId?: number;
  role: 'family' | 'steward' | 'viewer';
  connectedAt: string;
  ip?: string;
}

// In-memory village state initialized with Bali Eco-Village
let currentVillageState: GeneratedVillageResult = generateGenerativeVillage({
  village_name: 'AIGA Bali Eco-Village (JamotLite)',
});

const clients = new Map<WebSocket, ClientConnectionInfo>();

let wssInstance: WebSocketServer | null = null;

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const info: ClientConnectionInfo = {
      ws,
      role: 'viewer',
      connectedAt: new Date().toISOString(),
      ip: req.socket.remoteAddress,
    };
    clients.set(ws, info);

    // Send welcome payload and current village state
    ws.send(
      JSON.stringify({
        type: 'initial_state',
        data: {
          villageName: currentVillageState.villageName,
          featureCollection: currentVillageState.featureCollection,
          summary: currentVillageState.summary,
          activeClients: clients.size,
          timestamp: new Date().toISOString(),
        },
      })
    );

    // Handle incoming client messages
    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        handleClientMessage(ws, parsed);
      } catch (err) {
        console.warn('Invalid WebSocket message from client:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcastClientCount();
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err);
      clients.delete(ws);
    });

    broadcastClientCount();
  });

  // Heartbeat interval to prevent proxy timeouts
  setInterval(() => {
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 25000);

  return wss;
}

function handleClientMessage(ws: WebSocket, msg: any) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  switch (msg.type) {
    case 'register': {
      if (msg.familyId && Number.isInteger(msg.familyId) && msg.familyId >= 1 && msg.familyId <= 12) {
        clientInfo.familyId = msg.familyId;
        clientInfo.role = 'family';
      } else if (msg.role === 'steward') {
        clientInfo.role = 'steward';
      }
      ws.send(
        JSON.stringify({
          type: 'register_ack',
          role: clientInfo.role,
          familyId: clientInfo.familyId,
        })
      );
      broadcastClientCount();
      break;
    }

    case 'request_sync': {
      ws.send(
        JSON.stringify({
          type: 'initial_state',
          data: {
            villageName: currentVillageState.villageName,
            featureCollection: currentVillageState.featureCollection,
            summary: currentVillageState.summary,
            activeClients: clients.size,
            timestamp: new Date().toISOString(),
          },
        })
      );
      break;
    }

    case 'validate_edit': {
      // Allow live client to test validation
      const result: SpatialValidationResult = validateSpatialRules(msg.feature, msg.family_id, {
        waterFeatures: currentVillageState.featureCollection.features.filter(
          (f) => f.properties?.layerType === 'water'
        ),
      });
      ws.send(
        JSON.stringify({
          type: 'validation_result',
          requestId: msg.requestId,
          result,
        })
      );
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }
  }
}

function broadcastClientCount() {
  const familyCount: Record<number, number> = {};
  for (let i = 1; i <= 12; i++) familyCount[i] = 0;

  for (const info of clients.values()) {
    if (info.familyId) {
      familyCount[info.familyId] = (familyCount[info.familyId] || 0) + 1;
    }
  }

  const broadcastMsg = JSON.stringify({
    type: 'presence',
    totalConnected: clients.size,
    familiesConnected: familyCount,
  });

  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(broadcastMsg);
    }
  }
}

/**
 * Broadcasts spatial layer update to all connected family and steward dashboards
 */
export function broadcastLayerUpdate(update: Omit<SpatialLayerBroadcast, 'timestamp'>): {
  sentCount: number;
  totalClients: number;
} {
  const fullUpdate: SpatialLayerBroadcast = {
    ...update,
    timestamp: new Date().toISOString(),
  };

  // Update in-memory village state if applicable
  if (update.layer_type === 'plot' && update.action === 'update' && update.payload) {
    applyPlotUpdateToState(update.payload, update.family_id);
  } else if (update.action === 'sync' && update.payload?.featureCollection) {
    currentVillageState.featureCollection = update.payload.featureCollection;
    if (update.payload.summary) {
      currentVillageState.summary = update.payload.summary;
    }
  }

  const message = JSON.stringify({
    type: 'layer_update',
    data: fullUpdate,
  });

  let sentCount = 0;
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }

  return {
    sentCount,
    totalClients: clients.size,
  };
}

function applyPlotUpdateToState(payload: any, familyId?: number) {
  const fId = familyId || payload.properties?.family_id;
  if (!fId) return;

  const idx = currentVillageState.featureCollection.features.findIndex(
    (f) => f.properties?.family_id === fId
  );

  if (idx !== -1) {
    currentVillageState.featureCollection.features[idx] = payload;
  } else {
    currentVillageState.featureCollection.features.push(payload);
  }
}

export function getCurrentVillageState(): GeneratedVillageResult {
  return currentVillageState;
}

export function setCurrentVillageState(newState: GeneratedVillageResult) {
  currentVillageState = newState;
}

export function getConnectedClientsStats() {
  const familyCount: Record<number, number> = {};
  for (let i = 1; i <= 12; i++) familyCount[i] = 0;

  for (const info of clients.values()) {
    if (info.familyId) {
      familyCount[info.familyId] = (familyCount[info.familyId] || 0) + 1;
    }
  }

  return {
    total: clients.size,
    families: familyCount,
  };
}
