# AIGA (AI Village & Spatial Planning Engine)

> **Autonomous Model Context Protocol (MCP) Server & 3D Web Platform for JamotLite**

`AIGA` is an open-source geospatial engine and real-time visualization platform built to integrate directly with [JamotLite](https://github.com/jamot-pro/JamotLite). While JamotLite manages the 12 village families, project charters, governance voting, and resource ledgers as an agentic system, `AIGA` serves as the spatial intelligence layer: executing autonomous spatial reasoning, KMZ/KML parsing, permaculture rule verification, and real-time 3D village streaming over WebSockets and SSE MCP transport.

---

## Architecture

```
AIGA/
├── render.yaml               # Render Blueprint deployment specification
├── package.json              # TypeScript, MCP SDK, Turf.js, Express, WS
├── tsconfig.json             # TypeScript compiler configuration
├── tests/                    # Unit and integration test suite
│   ├── spatial.test.ts       # Spatial engine, KML generator & rule tests
│   └── mcp.test.ts           # MCP tool handler integration tests
├── src/
│   ├── index.ts              # Unified HTTP, SSE MCP, and WebSocket server
│   ├── mcp/
│   │   ├── server.ts         # MCP Server setup (SSE transport & stdio mode)
│   │   └── tools.ts          # Core MCP Tools exposed to JamotLite
│   ├── spatial/
│   │   ├── kmzParser.ts      # Unzips KMZ, parses KML XML to GeoJSON & elevations
│   │   ├── ruleValidator.ts  # Spatial rule verification (min area, water buffer, setbacks)
│   │   └── generator.ts      # Generative KML generator for 12 families around central hub
│   └── web/
│       ├── websocket.ts      # WebSocket hub broadcasting spatial updates
│       └── public/           # CesiumJS 3D village viewer
│           ├── index.html    # 3D Cesium viewer HUD & 12 family control panel
│           ├── app.js        # CesiumJS controller & WebSocket client
│           └── style.css     # Dark-mode GIS control panel styling
```

---

## Core MCP Tools

AIGA exposes 4 standardized MCP tools conforming to the `@modelcontextprotocol/sdk`:

### 1. `parse_kmz_layers`
Extracts vector boundaries, plot polygons, and terrain elevations from KMZ archives or KML files.
- **Inputs**:
  - `kmz_base64` (string, optional): Base64-encoded KMZ or KML file buffer.
  - `kmz_url` (string, optional): Public HTTP/HTTPS URL pointing to a KMZ/KML resource.
- **Outputs**:
  - `featureCollection`: Standard GeoJSON FeatureCollection.
  - `summary`: Total feature count, plot count, terrain elevation range (min, max, average).
  - `plots`: Array of extracted plots with surface areas (m²) and elevations.

### 2. `validate_spatial_rules`
Enforces the village spatial constitution and environmental bylaws for the 12 families:
- **Inputs**:
  - `feature` (GeoJSON Feature / Polygon): Proposed plot geometry.
  - `family_id` (number: 1–12): Target JamotLite family identifier.
  - `constraints` (object, optional):
    - `minPlotAreaSqm` (number, default: 500 m²).
    - `waterBufferMeters` (number, default: 10 m riparian reserve).
    - `roadSetbackMeters` (number, default: 5 m).
    - `solarAspectOptimalDeg` (number): Target solar azimuth orientation.
- **Outputs**:
  - `passed` (boolean): Whether all constraints were satisfied.
  - `violations`: List of rule violations (`MIN_PLOT_AREA`, `WATER_BUFFER`, `PLOT_OVERLAP`, etc.).
  - `metrics`: Calculated plot area, distance to water, conflicting family overlap area, solar angle.
  - `corrections`: Suggested geometric adjustments (expand polygon, clip from water buffer, trim overlaps).

### 3. `generate_generative_kml`
Algorithmic layout generator producing a complete permaculture village for the 12 families.
- **Inputs**:
  - `plot_count` (number, default: 12).
  - `central_hub` (`{ latitude, longitude }`, default: Bali Eco-Village `-8.5069, 115.2625`).
  - `hub_radius_meters` (number, default: 35 m).
  - `plot_radius_meters` (number, default: 95 m, ensuring plots >500 m²).
  - `layout_type` (`"radial"` | `"cluster"` | `"grid"`).
  - `village_name` (string).
- **Outputs**:
  - `kml`: Formatted KML 2.2 XML string ready for Google Earth or CesiumJS import.
  - `featureCollection`: GeoJSON geometry with color-coded family plots, central commons, roads, and streams.
  - Automatically updates the live 3D viewer state for all connected browser clients.

### 4. `broadcast_layer_update`
Broadcasts live spatial telemetry to all connected family web browsers in real-time.
- **Inputs**:
  - `layer_type` (`"plot"` | `"water"` | `"road"` | `"hub"` | `"annotation"` | `"village_reset"`).
  - `action` (`"create"` | `"update"` | `"delete"` | `"sync"`).
  - `payload` (GeoJSON Feature, Collection, or metadata).
  - `family_id` (number: 1–12, optional).
- **Outputs**:
  - Broadcast acknowledgment, active viewer count, and recipient confirmation.

---

## Real-Time 3D Web Dashboard

The 3D web platform is served at `/web` and `/`:
- **Engine**: CesiumJS 3D globe with 3D extruded family plots, terrain elevation, and layer toggles.
- **HUD Interface**:
  - Live 12-family indicator bar with real-time WebSocket connection state.
  - Village spatial overview (total area, plot counts, average area, water protection zone).
  - Selected plot inspector with instant compliance audit.
  - Real-time MCP event activity log.
- **WebSockets**:
  - `ws://<host>/ws` handles bidirectional syncing and heartbeat keep-alives.

---

## MCP Server Transports

AIGA supports dual MCP transports:

1. **HTTP / SSE Transport (Remote Cloud / Render)**:
   - SSE connection endpoint: `GET /sse`
   - Message receiver endpoint: `POST /messages?sessionId=<id>`
2. **Standard I/O Transport (Local CLI / Agent Runner)**:
   - Launch with `node dist/index.js --stdio` to run as a local subprocess for Claude Desktop, Cursor, or CLI agents.

---

## Local Development & Testing

```bash
# 1. Install dependencies
npm install

# 2. Run unit and integration tests
npm test

# 3. Build TypeScript and package assets
npm run build

# 4. Start local development server
npm start
```

---

## Deployment to Render

AIGA is pre-configured with a Render Blueprint in `render.yaml`:

```yaml
services:
  - type: web
    name: aiga-mcp
    runtime: node
    plan: starter
    region: singapore
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /health
```

Deploy directly via Render Dashboard using Blueprint or through the Render MCP integration.

---

## License

Apache-2.0 License. Built for the JamotLite ecosystem by electrichains.
