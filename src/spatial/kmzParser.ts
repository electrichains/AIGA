import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import * as toGeoJSON from '@tmcw/togeojson';
import * as turf from '@turf/turf';

export interface ParsedKMZResult {
  featureCollection: GeoJSON.FeatureCollection;
  summary: {
    totalFeatures: number;
    plotCount: number;
    waterFeatureCount: number;
    roadFeatureCount: number;
    elevation: {
      minMeters: number | null;
      maxMeters: number | null;
      averageMeters: number | null;
    };
    totalPlotAreaSqm: number;
  };
  plots: Array<{
    id: string;
    name: string;
    areaSqm: number;
    elevationMeters: number | null;
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  }>;
}

/**
 * Extracts raw KML XML string from KMZ binary buffer or uncompressed KML string
 */
export async function extractKmlString(inputBuffer: Buffer | Uint8Array | string): Promise<string> {
  if (typeof inputBuffer === 'string') {
    // If it's already an XML string
    const trimmed = inputBuffer.trim();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<kml')) {
      return trimmed;
    }
    // Attempt base64 decode if it looks like base64
    try {
      const decodedBuffer = Buffer.from(inputBuffer, 'base64');
      return await extractKmlFromBuffer(decodedBuffer);
    } catch {
      return inputBuffer;
    }
  }

  return await extractKmlFromBuffer(Buffer.from(inputBuffer));
}

async function extractKmlFromBuffer(buf: Buffer): Promise<string> {
  // Check if buffer is a zip file (starts with PK signature 0x50 0x4B 0x03 0x04)
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buf);
    // Find .kml file in archive
    let kmlFileName = Object.keys(zip.files).find((f) => f.toLowerCase().endsWith('.kml'));
    if (!kmlFileName) {
      // Default standard Google Earth name
      kmlFileName = 'doc.kml';
    }
    const file = zip.file(kmlFileName);
    if (!file) {
      throw new Error(`KMZ archive does not contain a valid .kml file. Found: ${Object.keys(zip.files).join(', ')}`);
    }
    return await file.async('string');
  }

  // Otherwise assume raw UTF-8 KML XML
  return buf.toString('utf-8');
}

/**
 * Parses KMZ (from base64 or URL) or KML into standardized GeoJSON and elevation metrics
 */
export async function parseKmzLayers(options: {
  kmz_base64?: string;
  kmz_url?: string;
}): Promise<ParsedKMZResult> {
  let kmlXml: string;

  if (options.kmz_url) {
    const response = await fetch(options.kmz_url);
    if (!response.ok) {
      throw new Error(`Failed to fetch KMZ/KML from ${options.kmz_url}: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    kmlXml = await extractKmlString(Buffer.from(arrayBuffer));
  } else if (options.kmz_base64) {
    kmlXml = await extractKmlString(options.kmz_base64);
  } else {
    throw new Error('Either kmz_base64 or kmz_url must be provided');
  }

  // Parse KML XML with xmldom
  const parser = new DOMParser();
  const dom = parser.parseFromString(kmlXml, 'text/xml');
  const geojson = toGeoJSON.kml(dom) as GeoJSON.FeatureCollection;

  // Process features, compute areas, collect elevation points
  const elevations: number[] = [];
  const plots: ParsedKMZResult['plots'] = [];
  let totalPlotArea = 0;
  let waterFeatureCount = 0;
  let roadFeatureCount = 0;

  for (let i = 0; i < geojson.features.length; i++) {
    const feat = geojson.features[i];
    const geom = feat.geometry;
    const name = String(feat.properties?.name || `Feature-${i + 1}`);
    const lowerName = name.toLowerCase();

    // Check for water / road tags
    if (lowerName.includes('water') || lowerName.includes('river') || lowerName.includes('lake') || lowerName.includes('stream')) {
      waterFeatureCount++;
      feat.properties = { ...feat.properties, layerType: 'water' };
    } else if (lowerName.includes('road') || lowerName.includes('path') || lowerName.includes('corridor')) {
      roadFeatureCount++;
      feat.properties = { ...feat.properties, layerType: 'road' };
    }

    // Extract coordinate elevations if present [lng, lat, elevation]
    extractElevationFromGeometry(geom, elevations);

    // If it's a polygon, treat as potential plot
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
      const area = turf.area(feat);
      totalPlotArea += area;

      // Calculate average elevation for this polygon
      const polyElevations: number[] = [];
      extractElevationFromGeometry(geom, polyElevations);
      const avgElev = polyElevations.length > 0
        ? polyElevations.reduce((a, b) => a + b, 0) / polyElevations.length
        : null;

      feat.properties = {
        ...feat.properties,
        calculatedAreaSqm: Math.round(area * 100) / 100,
        averageElevationMeters: avgElev !== null ? Math.round(avgElev * 10) / 10 : null,
      };

      plots.push({
        id: String(feat.id || feat.properties?.id || `plot-${plots.length + 1}`),
        name,
        areaSqm: Math.round(area * 100) / 100,
        elevationMeters: avgElev !== null ? Math.round(avgElev * 10) / 10 : null,
        feature: feat as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      });
    }
  }

  const minElevation = elevations.length > 0 ? Math.min(...elevations) : null;
  const maxElevation = elevations.length > 0 ? Math.max(...elevations) : null;
  const avgElevation = elevations.length > 0
    ? Math.round((elevations.reduce((a, b) => a + b, 0) / elevations.length) * 10) / 10
    : null;

  return {
    featureCollection: geojson,
    summary: {
      totalFeatures: geojson.features.length,
      plotCount: plots.length,
      waterFeatureCount,
      roadFeatureCount,
      elevation: {
        minMeters: minElevation,
        maxMeters: maxElevation,
        averageMeters: avgElevation,
      },
      totalPlotAreaSqm: Math.round(totalPlotArea * 100) / 100,
    },
    plots,
  };
}

function extractElevationFromGeometry(geom: GeoJSON.Geometry | null, elevations: number[]) {
  if (!geom) return;

  function checkCoord(coord: any) {
    if (Array.isArray(coord) && coord.length >= 3 && typeof coord[2] === 'number' && !isNaN(coord[2])) {
      elevations.push(coord[2]);
    }
  }

  switch (geom.type) {
    case 'Point':
      checkCoord(geom.coordinates);
      break;
    case 'LineString':
    case 'MultiPoint':
      geom.coordinates.forEach(checkCoord);
      break;
    case 'Polygon':
    case 'MultiLineString':
      geom.coordinates.forEach((ring) => ring.forEach(checkCoord));
      break;
    case 'MultiPolygon':
      geom.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(checkCoord)));
      break;
  }
}
