import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from '../src/mcp/server.js';
import * as turf from '@turf/turf';

describe('AIGA MCP Tools Integration', () => {
  const mcpServer = createMcpServer();

  test('generate_generative_kml tool is registered and returns valid KML and 12 plots', async () => {
    // Access internal registered tools or invoke directly
    const registeredTools = (mcpServer as any)._registeredTools;
    assert.ok(registeredTools['generate_generative_kml'], 'generate_generative_kml should be registered');

    const result = await registeredTools['generate_generative_kml'].handler({
      plot_count: 12,
      village_name: 'MCP Village Test',
      central_hub: { latitude: -8.5069, longitude: 115.2625 },
      hub_radius_meters: 35,
      plot_radius_meters: 95,
      road_width_meters: 6,
      layout_type: 'radial',
    });

    assert.equal(result.isError, undefined);
    assert.ok(result.content.length > 0);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.summary.plotCount, 12);
    assert.ok(parsed.kml.includes('MCP Village Test'));
  });

  test('validate_spatial_rules tool evaluates JamotLite family plot constraints', async () => {
    const registeredTools = (mcpServer as any)._registeredTools;
    assert.ok(registeredTools['validate_spatial_rules'], 'validate_spatial_rules should be registered');

    // Test compliant plot for Family 1
    const { getCurrentVillageState } = await import('../src/web/websocket.js');
    const f1Plot = getCurrentVillageState().featureCollection.features.find(
      (f) => f.properties?.family_id === 1
    );
    assert.ok(f1Plot, 'Family 1 plot must exist in default village state');

    const result = await registeredTools['validate_spatial_rules'].handler({
      feature: f1Plot,
      family_id: 1,
      constraints: {
        minPlotAreaSqm: 500,
        waterBufferMeters: 10,
      },
    });

    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.family_id, 1);
    assert.equal(parsed.violations.length, 0);

    // Test encroaching plot (encroaches onto Family 11 and 12)
    const encroachingPolygon = turf.polygon([
      [
        [115.262, -8.506],
        [115.2625, -8.506],
        [115.2625, -8.5065],
        [115.262, -8.5065],
        [115.262, -8.506],
      ],
    ]);

    const encroachingResult = await registeredTools['validate_spatial_rules'].handler({
      feature: encroachingPolygon,
      family_id: 1,
      constraints: {
        minPlotAreaSqm: 500,
      },
    });

    const encroachingParsed = JSON.parse(encroachingResult.content[0].text);
    assert.equal(encroachingParsed.passed, false);
    assert.ok(encroachingParsed.violations.some((v: any) => v.rule === 'PLOT_OVERLAP'));
  });

  test('broadcast_layer_update tool triggers WebSocket layer broadcast', async () => {
    const registeredTools = (mcpServer as any)._registeredTools;
    assert.ok(registeredTools['broadcast_layer_update'], 'broadcast_layer_update should be registered');

    const result = await registeredTools['broadcast_layer_update'].handler({
      layer_type: 'plot',
      action: 'update',
      family_id: 4,
      payload: {
        type: 'Feature',
        properties: { family_id: 4, name: 'Family 4 Updated Boundary' },
        geometry: { type: 'Polygon', coordinates: [] },
      },
    });

    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, 'broadcasted');
    assert.equal(parsed.family_id, 4);
    assert.equal(parsed.layer_type, 'plot');
  });

  test('parse_kmz_layers tool extracts features from KML base64 string', async () => {
    const registeredTools = (mcpServer as any)._registeredTools;
    assert.ok(registeredTools['parse_kmz_layers'], 'parse_kmz_layers should be registered');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>MCP Test Layer</name>
    <Placemark>
      <name>Hub Center</name>
      <Point>
        <coordinates>115.2625,-8.5069,250</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const result = await registeredTools['parse_kmz_layers'].handler({
      kmz_base64: Buffer.from(kml).toString('base64'),
    });

    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.summary.totalFeatures, 1);
    assert.equal(parsed.summary.elevation.averageMeters, 250);
  });
});
