import * as turf from '@turf/turf';

export interface SiteConstraints {
  minPlotAreaSqm?: number; // default: 500
  maxPlotAreaSqm?: number; // optional upper bound e.g. 5000
  waterBufferMeters?: number; // default: 10
  roadSetbackMeters?: number; // default: 5
  solarAspectOptimalDeg?: number; // 0 = North, 90 = East, 180 = South, default 180 in north hemisphere / 0 in south
  existingPlots?: Array<{
    family_id: number;
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  }>;
  waterFeatures?: Array<GeoJSON.Feature<GeoJSON.Geometry>>;
  roadFeatures?: Array<GeoJSON.Feature<GeoJSON.Geometry>>;
}

export interface RuleViolation {
  rule: 'MIN_PLOT_AREA' | 'MAX_PLOT_AREA' | 'WATER_BUFFER' | 'PLOT_OVERLAP' | 'ROAD_SETBACK' | 'FAMILY_ID' | 'GEOMETRY_INVALID';
  message: string;
  severity: 'error' | 'warning';
  details?: Record<string, any>;
}

export interface SuggestedCorrection {
  rule: string;
  description: string;
  action: 'expand_geometry' | 'shrink_geometry' | 'shift_geometry' | 'reassign_family' | 'buffer_clip';
  adjustedFeature?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

export interface SpatialValidationResult {
  passed: boolean;
  family_id: number;
  violations: RuleViolation[];
  warnings: string[];
  metrics: {
    plotAreaSqm: number;
    minPlotAreaRequiredSqm: number;
    waterProximityMeters: number | null;
    roadProximityMeters: number | null;
    overlappingFamilies: number[];
    solarAngleDegrees: number;
    solarAspectLabel: string;
    centroid: [number, number]; // [lng, lat]
  };
  corrections: SuggestedCorrection[];
}

/**
 * Validates proposed plot geometry against village planning constitution & constraints
 */
export function validateSpatialRules(
  proposedPlot: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | GeoJSON.Polygon | GeoJSON.MultiPolygon,
  family_id: number,
  constraints: SiteConstraints = {}
): SpatialValidationResult {
  const minArea = constraints.minPlotAreaSqm ?? 500;
  const maxArea = constraints.maxPlotAreaSqm ?? 10000;
  const waterBuffer = constraints.waterBufferMeters ?? 10;
  const roadSetback = constraints.roadSetbackMeters ?? 5;

  const violations: RuleViolation[] = [];
  const warnings: string[] = [];
  const corrections: SuggestedCorrection[] = [];

  // Normalize input to GeoJSON Feature
  let feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  if (proposedPlot.type === 'Feature') {
    feature = proposedPlot as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  } else if (proposedPlot.type === 'Polygon' || proposedPlot.type === 'MultiPolygon') {
    feature = turf.feature(proposedPlot);
  } else {
    return {
      passed: false,
      family_id,
      violations: [
        {
          rule: 'GEOMETRY_INVALID',
          message: `Unsupported geometry type: ${(proposedPlot as any)?.type}. Must be Polygon or MultiPolygon.`,
          severity: 'error',
        },
      ],
      warnings: [],
      metrics: {
        plotAreaSqm: 0,
        minPlotAreaRequiredSqm: minArea,
        waterProximityMeters: null,
        roadProximityMeters: null,
        overlappingFamilies: [],
        solarAngleDegrees: 0,
        solarAspectLabel: 'Unknown',
        centroid: [0, 0],
      },
      corrections: [],
    };
  }

  // 1. Family ID check (1-12 as mandated by JamotLite)
  if (!Number.isInteger(family_id) || family_id < 1 || family_id > 12) {
    violations.push({
      rule: 'FAMILY_ID',
      message: `Invalid family_id: ${family_id}. JamotLite village governance assigns plots exclusively to families 1 through 12.`,
      severity: 'error',
    });
    corrections.push({
      rule: 'FAMILY_ID',
      description: `Assign the plot to an active family ID between 1 and 12.`,
      action: 'reassign_family',
    });
  }

  // 2. Plot Area check
  const actualAreaSqm = turf.area(feature);
  const roundedArea = Math.round(actualAreaSqm * 100) / 100;

  if (roundedArea < minArea) {
    const deficit = Math.round((minArea - roundedArea) * 100) / 100;
    violations.push({
      rule: 'MIN_PLOT_AREA',
      message: `Plot area is ${roundedArea} m², which is ${deficit} m² below the required minimum of ${minArea} m².`,
      severity: 'error',
      details: { actualAreaSqm: roundedArea, requiredMinSqm: minArea, deficitSqm: deficit },
    });

    // Provide scaled expansion correction
    try {
      const scaleFactor = Math.sqrt(minArea / actualAreaSqm) * 1.05; // 5% safety margin
      const expanded = turf.transformScale(feature, scaleFactor);
      corrections.push({
        rule: 'MIN_PLOT_AREA',
        description: `Expand plot boundary by a factor of ${Math.round(scaleFactor * 100) / 100}x to reach ~${Math.round(turf.area(expanded))} m².`,
        action: 'expand_geometry',
        adjustedFeature: expanded as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      });
    } catch {
      // ignore transform errors on irregular degenerate geoms
    }
  }

  if (roundedArea > maxArea) {
    warnings.push(`Plot area is ${roundedArea} m², exceeding standard threshold of ${maxArea} m².`);
  }

  // Centroid & solar aspect calculation
  const centroid = turf.centroid(feature);
  const [lng, lat] = centroid.geometry.coordinates;

  // Calculate polygon primary elongation / orientation angle
  const bbox = turf.bbox(feature);
  const widthDeg = bbox[2] - bbox[0];
  const heightDeg = bbox[3] - bbox[1];
  const aspectAngle = Math.round((Math.atan2(heightDeg, widthDeg) * 180) / Math.PI);
  const solarAspectLabel = getAspectLabel(aspectAngle);

  // 3. Water Buffer Zone check
  let waterProximity: number | null = null;
  if (constraints.waterFeatures && constraints.waterFeatures.length > 0) {
    for (let i = 0; i < constraints.waterFeatures.length; i++) {
      const water = constraints.waterFeatures[i];
      // Compute distance from centroid to water
      const distMeters = computeDistanceToFeature(centroid, water);
      if (waterProximity === null || distMeters < waterProximity) {
        waterProximity = distMeters;
      }

      // Check if buffered water intersects the proposed plot
      try {
        const bufferedWater = turf.buffer(water as any, waterBuffer, { units: 'meters' });
        if (bufferedWater) {
          const intersects = turf.booleanIntersects(feature as any, bufferedWater as any);
          if (intersects) {
            violations.push({
              rule: 'WATER_BUFFER',
              message: `Plot encroaches into the ${waterBuffer}m water protection buffer zone (measured proximity: ${distMeters}m).`,
              severity: 'error',
              details: { waterBufferMeters: waterBuffer, measuredProximityMeters: distMeters },
            });

            // Suggest clipping or shifting away
            try {
              const diff = turf.difference(turf.featureCollection([feature as any, bufferedWater as any])) as any;
              if (diff) {
                corrections.push({
                  rule: 'WATER_BUFFER',
                  description: `Clip plot boundary outside the ${waterBuffer}m water riparian reserve.`,
                  action: 'buffer_clip',
                  adjustedFeature: diff as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
                });
              }
            } catch {
              // Difference calculation may throw on complex geometries
            }
          }
        }
      } catch (err) {
        console.warn('Water buffer check error:', err);
      }
    }
  }

  // 4. Overlap with Existing Family Plots
  const overlappingFamilies: number[] = [];
  if (constraints.existingPlots && constraints.existingPlots.length > 0) {
    for (const otherPlot of constraints.existingPlots) {
      if (otherPlot.family_id === family_id) continue; // skip self

      try {
        const intersects = turf.booleanIntersects(feature as any, otherPlot.feature as any);
        if (intersects) {
          overlappingFamilies.push(otherPlot.family_id);
          const overlapAreaSqm = calculateOverlapArea(feature, otherPlot.feature);

          violations.push({
            rule: 'PLOT_OVERLAP',
            message: `Plot encroaches onto Family #${otherPlot.family_id}'s allocated boundary (${Math.round(overlapAreaSqm)} m² overlap).`,
            severity: 'error',
            details: { conflictingFamilyId: otherPlot.family_id, overlapAreaSqm: Math.round(overlapAreaSqm) },
          });

          // Suggest resolving boundary collision
          try {
            const clipped = turf.difference(turf.featureCollection([feature as any, otherPlot.feature as any])) as any;
            if (clipped) {
              corrections.push({
                rule: 'PLOT_OVERLAP',
                description: `Trim boundary overlap with Family #${otherPlot.family_id} to ensure contiguous non-overlapping borders.`,
                action: 'buffer_clip',
                adjustedFeature: clipped as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
              });
            }
          } catch {
            // difference fallback
          }
        }
      } catch (err) {
        console.warn('Overlap check error:', err);
      }
    }
  }

  // 5. Road setback check
  let roadProximity: number | null = null;
  if (constraints.roadFeatures && constraints.roadFeatures.length > 0) {
    for (const road of constraints.roadFeatures) {
      try {
        const distMeters = computeDistanceToFeature(centroid, road);
        if (roadProximity === null || distMeters < roadProximity) {
          roadProximity = distMeters;
        }

        const bufferedRoad = turf.buffer(road as any, roadSetback, { units: 'meters' });
        if (bufferedRoad && turf.booleanIntersects(feature as any, bufferedRoad as any)) {
          warnings.push(`Plot boundary lies within ${roadSetback}m access corridor setback zone.`);
        }
      } catch (err) {
        console.warn('Road setback check error:', err);
      }
    }
  }

  // Solar angle evaluation
  if (lat < 0 && (aspectAngle < 30 || aspectAngle > 150)) {
    warnings.push(`Southern hemisphere permaculture note: Plot orientation at ${aspectAngle}° favors east-west alignment; ensure rooflines point toward equatorial solar path.`);
  }

  const passed = violations.length === 0;

  return {
    passed,
    family_id,
    violations,
    warnings,
    metrics: {
      plotAreaSqm: roundedArea,
      minPlotAreaRequiredSqm: minArea,
      waterProximityMeters: waterProximity,
      roadProximityMeters: roadProximity,
      overlappingFamilies,
      solarAngleDegrees: aspectAngle,
      solarAspectLabel,
      centroid: [Math.round(lng * 1000000) / 1000000, Math.round(lat * 1000000) / 1000000],
    },
    corrections,
  };
}

function calculateOverlapArea(
  f1: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  f2: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): number {
  try {
    const intersection = turf.intersect(turf.featureCollection([f1 as any, f2 as any]));
    if (intersection) {
      return turf.area(intersection);
    }
  } catch {
    // fallback
  }
  return 0;
}

function getAspectLabel(degrees: number): string {
  if (degrees >= 337.5 || degrees < 22.5) return 'North';
  if (degrees >= 22.5 && degrees < 67.5) return 'North-East';
  if (degrees >= 67.5 && degrees < 112.5) return 'East';
  if (degrees >= 112.5 && degrees < 157.5) return 'South-East';
  if (degrees >= 157.5 && degrees < 202.5) return 'South';
  if (degrees >= 202.5 && degrees < 247.5) return 'South-West';
  if (degrees >= 247.5 && degrees < 292.5) return 'West';
  return 'North-West';
}

function computeDistanceToFeature(
  point: GeoJSON.Feature<GeoJSON.Point>,
  targetFeature: any
): number {
  try {
    let target = targetFeature;
    const geomType = targetFeature?.geometry?.type || targetFeature?.type;
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      target = turf.polygonToLine(targetFeature);
    }
    const distKm = turf.pointToLineDistance(point, target as any, { units: 'kilometers' });
    return Math.round(distKm * 1000 * 10) / 10;
  } catch {
    return 0;
  }
}
