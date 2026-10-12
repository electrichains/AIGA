import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import JSZip from 'jszip';
import { generateGenerativeVillage } from '../src/spatial/generator.js';
import { validateSpatialRules } from '../src/spatial/ruleValidator.js';
import { parseKmzLayers, extractKmlString } from '../src/spatial/kmzParser.js';

describe('AIGA Spatial Engine & Generative Permaculture', () => {
  test('generateGenerativeVillage produces 12 family plots meeting min 500 sqm area', () => {
    const result = generateGenerativeVillage({
      plot_count: 12,
      central_hub: { latitude: -8.5069, longitude: 115.2625 },
      hub_radius_meters: 35,
      plot_radius_meters: 95,
      village_name: 'AIGA Bali Eco-Village Test',
    });

    assert.equal(result.summary.plotCount, 12);
    assert.equal(result.summary.plots.length, 12);
    assert.ok(result.summary.totalVillageAreaSqm > 10000, 'Total village area should exceed 10,000 sqm');

    // Verify all 12 plots exceed 500 sqm
    for (const plot of result.summary.plots) {
      assert.ok(
        plot.areaSqm >= 500,
        `Family #${plot.family_id} plot area ${plot.areaSqm} m² must be >= 500 m²`
      );
    }

    // Verify KML string output
    assert.ok(result.kml.includes('<kml xmlns="http://www.opengis.net/kml/2.2">'));
    assert.ok(result.kml.includes('<Document>'));
    assert.ok(result.kml.includes('AIGA Bali Eco-Village Test'));
    assert.ok(result.kml.includes('family-plot-1'));
  });

  test('validateSpatialRules approves a compliant plot for Family 1', () => {
    const compliantPolygon = turf.polygon([
      [
        [115.262, -8.506],
        [115.2625, -8.506],
        [115.2625, -8.5065],
        [115.262, -8.5065],
        [115.262, -8.506],
      ],
    ]);

    const result = validateSpatialRules(compliantPolygon, 1, {
      minPlotAreaSqm: 500,
    });

    assert.equal(result.passed, true);
    assert.equal(result.family_id, 1);
    assert.equal(result.violations.length, 0);
    assert.ok(result.metrics.plotAreaSqm >= 500);
  });

  test('validateSpatialRules rejects sub-minimum plot area (< 500 sqm)', () => {
    // Tiny polygon (~100 sqm)
    const tinyPolygon = turf.polygon([
      [
        [115.262, -8.506],
        [115.2621, -8.506],
        [115.2621, -8.5061],
        [115.262, -8.5061],
        [115.262, -8.506],
      ],
    ]);

    const result = validateSpatialRules(tinyPolygon, 2, {
      minPlotAreaSqm: 500,
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.rule === 'MIN_PLOT_AREA'));
    assert.ok(result.corrections.some((c) => c.action === 'expand_geometry'));
  });

  test('validateSpatialRules catches water buffer violations (< 10m)', () => {
    // Polygon intersecting the river line
    const river = turf.lineString([
      [115.262, -8.506],
      [115.263, -8.506],
    ]);

    const encroachingPolygon = turf.polygon([
      [
        [115.2622, -8.50595],
        [115.2628, -8.50595],
        [115.2628, -8.5065],
        [115.2622, -8.5065],
        [115.2622, -8.50595],
      ],
    ]);

    const result = validateSpatialRules(encroachingPolygon, 3, {
      minPlotAreaSqm: 500,
      waterBufferMeters: 10,
      waterFeatures: [river],
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.rule === 'WATER_BUFFER'));
  });

  test('validateSpatialRules flags invalid family ID (> 12 or < 1)', () => {
    const polygon = turf.polygon([
      [
        [115.262, -8.506],
        [115.263, -8.506],
        [115.263, -8.507],
        [115.262, -8.507],
        [115.262, -8.506],
      ],
    ]);

    const result = validateSpatialRules(polygon, 13);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.rule === 'FAMILY_ID'));
  });

  test('parseKmzLayers parses KML XML and compressed KMZ archives', async () => {
    const testKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test Subak Watershed</name>
    <Placemark>
      <name>Family 1 Rice Terrace</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              115.262,-8.506,120
              115.263,-8.506,125
              115.263,-8.507,130
              115.262,-8.507,122
              115.262,-8.506,120
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    // 1. Direct KML test
    const rawParsed = await parseKmzLayers({ kmz_base64: Buffer.from(testKml).toString('base64') });
    assert.equal(rawParsed.summary.plotCount, 1);
    assert.ok(rawParsed.summary.totalPlotAreaSqm > 1000);
    assert.equal(rawParsed.summary.elevation.minMeters, 120);
    assert.equal(rawParsed.summary.elevation.maxMeters, 130);

    // 2. Compressed KMZ test (zip containing doc.kml)
    const zip = new JSZip();
    zip.file('doc.kml', testKml);
    const kmzBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const kmzParsed = await parseKmzLayers({ kmz_base64: kmzBuffer.toString('base64') });

    assert.equal(kmzParsed.summary.plotCount, 1);
    assert.equal(kmzParsed.plots[0].name, 'Family 1 Rice Terrace');
  });
});
