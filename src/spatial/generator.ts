import * as turf from '@turf/turf';

export interface VillageGeneratorOptions {
  plot_count?: number; // default: 12
  central_hub?: {
    latitude: number;
    longitude: number;
  };
  hub_radius_meters?: number; // default: 35
  plot_radius_meters?: number; // default: 95
  road_width_meters?: number; // default: 6
  layout_type?: 'radial' | 'cluster' | 'grid';
  village_name?: string;
  family_names?: string[];
}

export interface GeneratedVillageResult {
  villageName: string;
  kml: string;
  featureCollection: GeoJSON.FeatureCollection;
  summary: {
    plotCount: number;
    hubRadiusMeters: number;
    totalVillageAreaSqm: number;
    averagePlotAreaSqm: number;
    plots: Array<{
      family_id: number;
      familyName: string;
      areaSqm: number;
      centroid: [number, number];
      colorHex: string;
    }>;
  };
}

// 12 distinct palette colors for the 12 JamotLite families
export const FAMILY_COLORS = [
  '#E63946', // Family 1: Coral Red
  '#F4A261', // Family 2: Sandy Orange
  '#E76F51', // Family 3: Burnt Sienna
  '#2A9D8F', // Family 4: Persian Green
  '#457B9D', // Family 5: Steel Blue
  '#1D3557', // Family 6: Deep Navy
  '#9B5DE5', // Family 7: Royal Purple
  '#F15BB5', // Family 8: Neon Pink
  '#00BBF9', // Family 9: Sky Cyan
  '#00F5D4', // Family 10: Mint Turquoise
  '#588157', // Family 11: Forest Sage
  '#DDA15E', // Family 12: Earth Gold
];

const DEFAULT_FAMILY_NAMES = [
  'Solomon / Alpha',
  'Chen / Beta',
  'Kovacs / Gamma',
  'Mwangi / Delta',
  'Santos / Epsilon',
  'Dubois / Zeta',
  'Olsen / Eta',
  'Takahashi / Theta',
  'Vargas / Iota',
  'Farah / Kappa',
  'Nakamura / Lambda',
  'Adeyemi / Mu',
];

/**
 * Generates a full permaculture village layout for the 12 JamotLite families
 */
export function generateGenerativeVillage(options: VillageGeneratorOptions = {}): GeneratedVillageResult {
  const plotCount = Math.max(1, Math.min(24, options.plot_count ?? 12));
  const centerLat = options.central_hub?.latitude ?? -8.5069; // Bali Eco-Village
  const centerLng = options.central_hub?.longitude ?? 115.2625;
  const hubRadius = options.hub_radius_meters ?? 35;
  const plotOuterRadius = options.plot_radius_meters ?? 95;
  const roadWidth = options.road_width_meters ?? 6;
  const layoutType = options.layout_type ?? 'radial';
  const villageName = options.village_name ?? 'AIGA Bali Eco-Village';

  const centerPoint = turf.point([centerLng, centerLat]);
  const features: GeoJSON.Feature[] = [];
  const plotSummaries: GeneratedVillageResult['summary']['plots'] = [];

  // 1. Central Hub Polygon (Governance Pavilion, Solar Microgrid & Water Commons)
  const hubPolygon = turf.circle(centerPoint, hubRadius / 1000, {
    steps: 32,
    units: 'kilometers',
    properties: {
      id: 'central-hub',
      name: `${villageName} - Central Commons & Governance Hub`,
      layerType: 'hub',
      description: 'Communal pavilion, solar microgrid battery bank, rainwater cistern, and JamotLite meeting sanctuary.',
      fillColor: '#FFD166',
      strokeColor: '#D4A373',
      strokeWidth: 3,
      extrudeHeightMeters: 8,
    },
  });
  features.push(hubPolygon);

  // 2. Hub Center Marker
  const hubMarker = turf.point([centerLng, centerLat], {
    id: 'hub-marker',
    name: 'Village Zero Point (Hub Center)',
    layerType: 'hub-center',
    latitude: centerLat,
    longitude: centerLng,
  });
  features.push(hubMarker);

  // 3. Water Buffer / River Swale
  // Create an organic riparian stream south-east of the village
  const riverCoords = [
    turf.destination(centerPoint, (plotOuterRadius * 1.5) / 1000, 110, { units: 'kilometers' }).geometry.coordinates,
    turf.destination(centerPoint, (plotOuterRadius * 1.3) / 1000, 135, { units: 'kilometers' }).geometry.coordinates,
    turf.destination(centerPoint, (plotOuterRadius * 1.4) / 1000, 160, { units: 'kilometers' }).geometry.coordinates,
    turf.destination(centerPoint, (plotOuterRadius * 1.6) / 1000, 190, { units: 'kilometers' }).geometry.coordinates,
  ];
  const riverLine = turf.lineString(riverCoords, {
    id: 'ayung-permaculture-stream',
    name: 'Subak River Stream',
    layerType: 'water',
    description: 'Freshwater irrigation swale and riparian ecological preserve.',
    strokeColor: '#0077B6',
    strokeWidth: 4,
  });
  features.push(riverLine);

  // Water 10m buffer zone
  const waterBufferPolygon = turf.buffer(riverLine, 10, {
    units: 'meters',
  });
  if (waterBufferPolygon) {
    waterBufferPolygon.properties = {
      id: 'water-buffer-zone',
      name: '10m Riparian Water Protection Buffer',
      layerType: 'water-buffer',
      description: 'Mandatory 10-meter environmental setback from water line. Building forbidden.',
      fillColor: '#90E0EF',
      fillOpacity: 0.35,
      strokeColor: '#0077B6',
    };
    features.push(waterBufferPolygon);
  }

  // 4. Generate 12 Family Plots
  const angleStep = 360 / plotCount;
  // Angular road gap to separate family plots
  const angularGapDeg = (roadWidth / (2 * Math.PI * ((hubRadius + plotOuterRadius) / 2))) * 360;
  const effectiveAngle = angleStep - Math.max(1.5, angularGapDeg);

  let totalPlotArea = 0;

  for (let i = 0; i < plotCount; i++) {
    const familyId = i + 1;
    const familyName = options.family_names?.[i] || DEFAULT_FAMILY_NAMES[i] || `Family #${familyId}`;
    const startAngle = i * angleStep + angularGapDeg / 2;
    const endAngle = startAngle + effectiveAngle;
    const colorHex = FAMILY_COLORS[i % FAMILY_COLORS.length];

    // Compute sector polygon (wedge between inner hub and outer radius)
    const arcPoints: number[][] = [];
    const steps = 8;

    // Outer arc
    for (let s = 0; s <= steps; s++) {
      const angle = startAngle + (s / steps) * (endAngle - startAngle);
      const pt = turf.destination(centerPoint, (plotOuterRadius / 1000), angle, { units: 'kilometers' });
      arcPoints.push(pt.geometry.coordinates);
    }

    // Inner arc
    for (let s = steps; s >= 0; s--) {
      const angle = startAngle + (s / steps) * (endAngle - startAngle);
      const innerR = (hubRadius + roadWidth) / 1000;
      const pt = turf.destination(centerPoint, innerR, angle, { units: 'kilometers' });
      arcPoints.push(pt.geometry.coordinates);
    }

    // Close the ring
    arcPoints.push(arcPoints[0]);

    const plotPolygon = turf.polygon([arcPoints], {
      id: `family-plot-${familyId}`,
      family_id: familyId,
      familyName,
      layerType: 'plot',
      colorHex,
      fillColor: colorHex,
      fillOpacity: 0.65,
      strokeColor: '#FFFFFF',
      strokeWidth: 2,
      extrudeHeightMeters: 4 + (familyId % 3) * 1.5, // 3D elevation variation
      areaSqm: 0,
    } as Record<string, any>);

    const areaSqm = Math.round(turf.area(plotPolygon) * 100) / 100;
    totalPlotArea += areaSqm;
    plotPolygon.properties.areaSqm = areaSqm;

    const centroid = turf.centroid(plotPolygon);
    const [cLng, cLat] = centroid.geometry.coordinates;

    features.push(plotPolygon);
    plotSummaries.push({
      family_id: familyId,
      familyName,
      areaSqm,
      centroid: [Math.round(cLng * 1000000) / 1000000, Math.round(cLat * 1000000) / 1000000],
      colorHex,
    });
  }

  // 5. Perimeter Ring Road
  const ringRoad = turf.circle(centerPoint, (plotOuterRadius + roadWidth / 2) / 1000, {
    steps: 64,
    units: 'kilometers',
    properties: {
      id: 'perimeter-corridor',
      name: 'Village Perimeter Ring Road',
      layerType: 'road',
      roadWidthMeters: roadWidth,
      strokeColor: '#6C757D',
      strokeWidth: 3,
    },
  });
  features.push(ringRoad);

  const featureCollection = turf.featureCollection(features);
  const kmlXml = generateKmlXml(villageName, features);

  return {
    villageName,
    kml: kmlXml,
    featureCollection,
    summary: {
      plotCount,
      hubRadiusMeters: hubRadius,
      totalVillageAreaSqm: Math.round(totalPlotArea * 100) / 100,
      averagePlotAreaSqm: Math.round((totalPlotArea / plotCount) * 100) / 100,
      plots: plotSummaries,
    },
  };
}

/**
 * Builds standard KML 2.2 XML with 3D extrusions, Placemarks, and styles
 */
function generateKmlXml(villageName: string, features: GeoJSON.Feature[]): string {
  const placemarksXml: string[] = [];
  const stylesXml: string[] = [];
  const seenStyles = new Set<string>();

  for (const feat of features) {
    const props = feat.properties || {};
    const name = props.name || props.id || 'Village Element';
    const desc = props.description || `Area: ${props.areaSqm || 'N/A'} sqm | Family: ${props.familyName || props.family_id || 'Shared'}`;
    const colorHex = props.colorHex || props.fillColor || '#457B9D';
    const styleId = `style-${(props.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    if (!seenStyles.has(styleId)) {
      seenStyles.add(styleId);
      // KML color format is aabbggrr (hex alpha, blue, green, red)
      const kmlColor = hexToKmlColor(colorHex, props.fillOpacity ?? 0.7);
      stylesXml.push(`
    <Style id="${styleId}">
      <LineStyle>
        <color>ff${kmlColor.substring(2)}</color>
        <width>${props.strokeWidth || 2}</width>
      </LineStyle>
      <PolyStyle>
        <color>${kmlColor}</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>`);
    }

    const geomXml = geometryToKml(feat.geometry, props.extrudeHeightMeters || 0);
    placemarksXml.push(`
    <Placemark>
      <name><![CDATA[${name}]]></name>
      <description><![CDATA[${desc}]]></description>
      <styleUrl>#${styleId}</styleUrl>
      ${geomXml}
    </Placemark>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${villageName}</name>
    <description>AIGA Autonomous AI Village Plan generated for JamotLite (12 Families)</description>
    ${stylesXml.join('\n')}
    ${placemarksXml.join('\n')}
  </Document>
</kml>`;
}

function hexToKmlColor(hex: string, opacity: number = 0.7): string {
  const cleanHex = hex.replace('#', '');
  let r = 'ff', g = 'ff', b = 'ff';
  if (cleanHex.length === 6) {
    r = cleanHex.substring(0, 2);
    g = cleanHex.substring(2, 4);
    b = cleanHex.substring(4, 6);
  }
  const a = Math.round(opacity * 255).toString(16).padStart(2, '0');
  // KML uses aabbggrr
  return `${a}${b}${g}${r}`;
}

function geometryToKml(geom: GeoJSON.Geometry | null, extrudeHeight: number = 0): string {
  if (!geom) return '';

  if (geom.type === 'Point') {
    const [lng, lat, alt = 0] = geom.coordinates;
    return `<Point><coordinates>${lng},${lat},${alt}</coordinates></Point>`;
  }

  if (geom.type === 'LineString') {
    const coordsStr = geom.coordinates.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
    return `<LineString><tessellate>1</tessellate><coordinates>${coordsStr}</coordinates></LineString>`;
  }

  if (geom.type === 'Polygon') {
    const ringsXml = geom.coordinates
      .map((ring, idx) => {
        const coordsStr = ring.map((c) => `${c[0]},${c[1]},${c[2] || extrudeHeight}`).join(' ');
        if (idx === 0) {
          return `
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>`;
        }
        return `
        <innerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsStr}</coordinates>
          </LinearRing>
        </innerBoundaryIs>`;
      })
      .join('');

    return `
      <Polygon>
        <extrude>${extrudeHeight > 0 ? 1 : 0}</extrude>
        <altitudeMode>${extrudeHeight > 0 ? 'relativeToGround' : 'clampToGround'}</altitudeMode>
        ${ringsXml}
      </Polygon>`;
  }

  return '';
}
