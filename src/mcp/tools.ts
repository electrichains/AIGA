import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseKmzLayers } from '../spatial/kmzParser.js';
import { validateSpatialRules } from '../spatial/ruleValidator.js';
import { generateGenerativeVillage } from '../spatial/generator.js';
import {
  broadcastLayerUpdate,
  getCurrentVillageState,
  setCurrentVillageState,
  getConnectedClientsStats,
} from '../web/websocket.js';

/**
 * Registers all core AIGA spatial planning tools on the MCP server instance
 */
export function registerMcpTools(server: McpServer) {
  // 1. parse_kmz_layers
  server.tool(
    'parse_kmz_layers',
    {
      kmz_base64: z
        .string()
        .optional()
        .describe('Base64-encoded binary string of the KMZ or KML file'),
      kmz_url: z
        .string()
        .url()
        .optional()
        .describe('Public HTTP/HTTPS URL from which to fetch the KMZ or KML archive'),
    },
    async ({ kmz_base64, kmz_url }) => {
      try {
        if (!kmz_base64 && !kmz_url) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: Either kmz_base64 or kmz_url must be provided.',
              },
            ],
          };
        }

        const result = await parseKmzLayers({ kmz_base64, kmz_url });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'success',
                  message: `Successfully parsed KMZ/KML layers. Extracted ${result.summary.plotCount} plots and ${result.summary.totalFeatures} total features.`,
                  summary: result.summary,
                  plots: result.plots.map((p) => ({
                    id: p.id,
                    name: p.name,
                    areaSqm: p.areaSqm,
                    elevationMeters: p.elevationMeters,
                    properties: p.feature.properties,
                  })),
                  featureCollection: result.featureCollection,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to parse KMZ/KML layers: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 2. validate_spatial_rules
  server.tool(
    'validate_spatial_rules',
    {
      feature: z
        .any()
        .describe('Proposed plot geometry as GeoJSON Feature, Polygon, or MultiPolygon'),
      family_id: z
        .number()
        .int()
        .min(1)
        .max(12)
        .describe('Target JamotLite family identifier (1 through 12)'),
      constraints: z
        .object({
          minPlotAreaSqm: z
            .number()
            .optional()
            .describe('Minimum required plot area in square meters (default: 500)'),
          waterBufferMeters: z
            .number()
            .optional()
            .describe('Mandatory riparian protection buffer distance from water bodies in meters (default: 10)'),
          roadSetbackMeters: z
            .number()
            .optional()
            .describe('Minimum setback distance from arterial roads in meters (default: 5)'),
          solarAspectOptimalDeg: z
            .number()
            .optional()
            .describe('Optimal solar azimuth angle in degrees for permaculture design'),
        })
        .optional()
        .describe('Site constraints, setbacks, and village bylaws'),
    },
    async ({ feature, family_id, constraints }) => {
      try {
        const villageState = getCurrentVillageState();

        // Extract existing plots and water/road features from village context
        const existingPlots = villageState.featureCollection.features
          .filter((f) => f.properties?.layerType === 'plot' && f.properties?.family_id)
          .map((f) => ({
            family_id: f.properties!.family_id as number,
            feature: f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
          }));

        const waterFeatures = villageState.featureCollection.features.filter(
          (f) => f.properties?.layerType === 'water' || f.properties?.name?.toLowerCase().includes('water')
        );

        const roadFeatures = villageState.featureCollection.features.filter(
          (f) => f.properties?.layerType === 'road' || f.properties?.name?.toLowerCase().includes('road')
        );

        const validationResult = validateSpatialRules(feature, family_id, {
          ...constraints,
          existingPlots,
          waterFeatures,
          roadFeatures,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: validationResult.passed ? 'passed' : 'violated',
                  family_id: validationResult.family_id,
                  passed: validationResult.passed,
                  violations: validationResult.violations,
                  warnings: validationResult.warnings,
                  metrics: validationResult.metrics,
                  corrections: validationResult.corrections,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error executing validate_spatial_rules: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 3. generate_generative_kml
  server.tool(
    'generate_generative_kml',
    {
      plot_count: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .default(12)
        .describe('Number of family plots to arrange (default: 12)'),
      central_hub: z
        .object({
          latitude: z.number().describe('Latitude of village central hub'),
          longitude: z.number().describe('Longitude of village central hub'),
        })
        .optional()
        .describe('Central commons coordinates (defaults to Bali Eco-Village: lat -8.5069, lng 115.2625)'),
      hub_radius_meters: z
        .number()
        .optional()
        .default(35)
        .describe('Radius of the central community governance commons in meters'),
      plot_radius_meters: z
        .number()
        .optional()
        .default(95)
        .describe('Outer boundary radius of family plots in meters (ensures >500 sqm/plot)'),
      road_width_meters: z
        .number()
        .optional()
        .default(6)
        .describe('Width of arterial access corridors in meters'),
      layout_type: z
        .enum(['radial', 'cluster', 'grid'])
        .optional()
        .default('radial')
        .describe('Permaculture village layout geometry'),
      village_name: z
        .string()
        .optional()
        .default('AIGA Bali Eco-Village (JamotLite)')
        .describe('Descriptive name of the generative eco-village development'),
    },
    async ({
      plot_count,
      central_hub,
      hub_radius_meters,
      plot_radius_meters,
      road_width_meters,
      layout_type,
      village_name,
    }) => {
      try {
        const village = generateGenerativeVillage({
          plot_count,
          central_hub,
          hub_radius_meters,
          plot_radius_meters,
          road_width_meters,
          layout_type,
          village_name,
        });

        // Update in-memory state
        setCurrentVillageState(village);

        // Automatically broadcast the newly generated village to all connected family dashboards
        broadcastLayerUpdate({
          layer_type: 'village_reset',
          action: 'sync',
          payload: {
            villageName: village.villageName,
            featureCollection: village.featureCollection,
            summary: village.summary,
          },
          source: 'mcp',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'success',
                  villageName: village.villageName,
                  summary: village.summary,
                  kml: village.kml,
                  featureCount: village.featureCollection.features.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to generate generative KML village: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 4. broadcast_layer_update
  server.tool(
    'broadcast_layer_update',
    {
      layer_type: z
        .enum(['plot', 'water', 'road', 'hub', 'annotation', 'village_reset'])
        .describe('Type of spatial layer modified'),
      action: z
        .enum(['create', 'update', 'delete', 'sync'])
        .describe('Operation applied to the layer'),
      payload: z
        .any()
        .describe('GeoJSON Feature, FeatureCollection, or plot state dictionary'),
      family_id: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .describe('Target family ID (1 through 12) if update is scoped to a family plot'),
    },
    async ({ layer_type, action, payload, family_id }) => {
      try {
        const broadcastResult = broadcastLayerUpdate({
          layer_type,
          action,
          payload,
          family_id,
          source: 'mcp',
        });

        const clientStats = getConnectedClientsStats();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'broadcasted',
                  layer_type,
                  action,
                  family_id,
                  recipients: broadcastResult.sentCount,
                  totalConnectedClients: broadcastResult.totalClients,
                  familyClientDistribution: clientStats.families,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to broadcast layer update: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
