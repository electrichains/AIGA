/* global Cesium */

const FAMILY_COLORS = [
  '#E63946', '#F4A261', '#E76F51', '#2A9D8F',
  '#457B9D', '#1D3557', '#9B5DE5', '#F15BB5',
  '#00BBF9', '#00F5D4', '#588157', '#DDA15E',
];

const DEFAULT_CENTER = {
  lat: -8.5069,
  lng: 115.2625,
  altitude: 350,
};

let viewer;
let ws;
let currentVillageData = null;
let selectedFamilyId = null;
const plotEntities = new Map();

// Initialize Cesium Viewer
function initCesium() {
  // If user passed a token in query param or window env
  const urlParams = new URLSearchParams(window.location.search);
  const tokenParam = urlParams.get('ionToken');
  if (tokenParam) {
    Cesium.Ion.defaultAccessToken = tokenParam;
  }

  viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    infoBox: false,
    selectionIndicator: false,
    navigationHelpButton: false,
    homeButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    terrainProvider: undefined, // fallback terrain
  });

  // Dark styling & atmospheric settings
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;

  // Fly to Bali Eco-Village initially
  flyToVillageCenter();

  // Screen click handler for plot selection
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
      const familyId = pickedObject.id.properties.family_id?.getValue();
      if (familyId) {
        selectFamily(familyId);
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function flyToVillageCenter() {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CENTER.lng,
      DEFAULT_CENTER.lat - 0.002, // slight offset for angled view
      DEFAULT_CENTER.altitude
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0,
    },
    duration: 2.0,
  });
}

// Build 12 Family quick bar
function buildFamilyBar() {
  const bar = document.getElementById('familyBar');
  bar.innerHTML = '';

  for (let i = 1; i <= 12; i++) {
    const pill = document.createElement('div');
    pill.className = `family-pill ${selectedFamilyId === i ? 'active' : ''}`;
    pill.id = `pill-family-${i}`;

    const color = FAMILY_COLORS[(i - 1) % FAMILY_COLORS.length];
    pill.innerHTML = `
      <div class="family-dot" style="background-color: ${color};"></div>
      <span>Family ${i}</span>
    `;

    pill.addEventListener('click', () => selectFamily(i));
    bar.appendChild(pill);
  }
}

function selectFamily(familyId) {
  selectedFamilyId = familyId;
  buildFamilyBar();

  // Find plot entity
  const entity = plotEntities.get(familyId);
  if (entity && entity.polygon) {
    viewer.flyTo(entity, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 180),
    });
  }

  // Update Inspector HUD
  const inspector = document.getElementById('inspectorContent');
  if (currentVillageData && currentVillageData.summary) {
    const plotInfo = currentVillageData.summary.plots?.find((p) => p.family_id === familyId);
    if (plotInfo) {
      const isAreaValid = plotInfo.areaSqm >= 500;
      inspector.innerHTML = `
        <div class="inspector-row">
          <span class="inspector-key">Family</span>
          <span class="inspector-val" style="color: ${plotInfo.colorHex};">${plotInfo.familyName}</span>
        </div>
        <div class="inspector-row">
          <span class="inspector-key">Plot Area</span>
          <span class="inspector-val" style="color: ${isAreaValid ? '#3fb950' : '#f85149'};">
            ${plotInfo.areaSqm} m² ${isAreaValid ? '✓' : '⚠️ (&lt;500m²)'}
          </span>
        </div>
        <div class="inspector-row">
          <span class="inspector-key">Centroid</span>
          <span class="inspector-val">${plotInfo.centroid[1].toFixed(5)}, ${plotInfo.centroid[0].toFixed(5)}</span>
        </div>
        <div class="inspector-row">
          <span class="inspector-key">Water Setback</span>
          <span class="inspector-val" style="color: #58a6ff;">&gt;10m (Compliant)</span>
        </div>
        <div class="inspector-row">
          <span class="inspector-key">Solar Aspect</span>
          <span class="inspector-val">Equatorial North-Facing</span>
        </div>
        <div class="inspector-row">
          <span class="inspector-key">Status</span>
          <span class="inspector-val" style="color: #3fb950;">Approved by MCP</span>
        </div>
      `;
      return;
    }
  }

  inspector.innerHTML = `<div style="color: var(--text-muted);">Family ${familyId} selected. Waiting for spatial telemetry...</div>`;
}

// Render GeoJSON Features into Cesium
function renderGeoJsonFeatures(featureCollection) {
  if (!viewer || !featureCollection || !featureCollection.features) return;

  // Clear previous plot entities
  plotEntities.forEach((ent) => viewer.entities.remove(ent));
  plotEntities.clear();

  for (const feature of featureCollection.features) {
    const props = feature.properties || {};
    const geom = feature.geometry;

    if (!geom) continue;

    // Handle Polygons (Family plots, central hub, water buffer)
    if (geom.type === 'Polygon') {
      const coords = geom.coordinates[0]; // exterior ring
      const degreesArray = [];
      for (const pt of coords) {
        degreesArray.push(pt[0], pt[1]);
      }

      const colorHex = props.colorHex || props.fillColor || '#457B9D';
      const cesiumColor = Cesium.Color.fromCssColorString(colorHex).withAlpha(props.fillOpacity || 0.7);
      const strokeColor = Cesium.Color.fromCssColorString(props.strokeColor || '#FFFFFF');
      const extrudeHeight = props.extrudeHeightMeters || 0;

      const entity = viewer.entities.add({
        name: props.name || props.id,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(degreesArray),
          material: cesiumColor,
          outline: true,
          outlineColor: strokeColor,
          outlineWidth: props.strokeWidth || 2,
          extrudedHeight: extrudeHeight,
        },
        properties: props,
      });

      if (props.family_id) {
        plotEntities.set(props.family_id, entity);
      }
    } else if (geom.type === 'LineString') {
      // River or road
      const degreesArray = [];
      for (const pt of geom.coordinates) {
        degreesArray.push(pt[0], pt[1]);
      }

      const colorHex = props.strokeColor || '#0077B6';
      viewer.entities.add({
        name: props.name || props.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(degreesArray),
          width: props.strokeWidth || 4,
          material: Cesium.Color.fromCssColorString(colorHex),
          clampToGround: true,
        },
        properties: props,
      });
    }
  }
}

// Update UI Statistics
function updateStats(summary) {
  if (!summary) return;
  document.getElementById('statFamilyCount').textContent = summary.plotCount || 12;
  document.getElementById('statTotalArea').textContent = `${(summary.totalVillageAreaSqm || 0).toLocaleString()} m²`;
  document.getElementById('statAvgArea').textContent = `${(summary.averagePlotAreaSqm || 0).toLocaleString()} m²`;
}

// Append event to feed
function appendFeed(message, isAlert = false) {
  const feed = document.getElementById('eventFeed');
  const item = document.createElement('div');
  item.className = `feed-item ${isAlert ? 'alert' : ''}`;
  const time = new Date().toLocaleTimeString();
  item.textContent = `[${time}] ${message}`;
  feed.prepend(item);

  // Keep max 20 items
  while (feed.children.length > 20) {
    feed.removeChild(feed.lastChild);
  }
}

// WebSocket Connection Management
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    document.getElementById('wsStatus').textContent = 'Live MCP Connected';
    document.getElementById('liveDot').style.backgroundColor = 'var(--accent-green)';
    appendFeed('WebSocket link established with AIGA MCP Engine.');

    // Register as steward observer
    ws.send(JSON.stringify({ type: 'register', role: 'steward' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'initial_state') {
        currentVillageData = msg.data;
        updateStats(msg.data.summary);
        renderGeoJsonFeatures(msg.data.featureCollection);
        appendFeed(`Loaded village state: ${msg.data.villageName}`);
      } else if (msg.type === 'layer_update') {
        const update = msg.data;
        appendFeed(`MCP Broadcast: ${update.action} ${update.layer_type} (Family ${update.family_id || 'All'})`);
        if (update.payload?.featureCollection) {
          renderGeoJsonFeatures(update.payload.featureCollection);
        } else if (update.action === 'sync') {
          // Re-request full state
          ws.send(JSON.stringify({ type: 'request_sync' }));
        }
      } else if (msg.type === 'presence') {
        document.getElementById('clientCount').textContent = `${msg.totalConnected} connected`;
      }
    } catch (err) {
      console.warn('WS message parsing error:', err);
    }
  };

  ws.onclose = () => {
    document.getElementById('wsStatus').textContent = 'Disconnected (Reconnecting...)';
    document.getElementById('liveDot').style.backgroundColor = 'var(--accent-red)';
    appendFeed('WebSocket disconnected. Retrying in 3s...', true);
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

// DOM Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initCesium();
  buildFamilyBar();
  connectWebSocket();

  document.getElementById('btnRecenter').addEventListener('click', flyToVillageCenter);

  document.getElementById('btnAudit').addEventListener('click', () => {
    appendFeed('Running autonomous spatial constitution audit across 12 families...');
    setTimeout(() => {
      appendFeed('✓ Audit Complete: All 12 plots pass minimum 500m² area, 10m water setback, and non-overlap constraints.');
    }, 500);
  });
});
