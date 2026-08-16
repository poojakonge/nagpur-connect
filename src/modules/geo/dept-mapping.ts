/* ════════════════════════════════════════════════════════
   Geo Engine — Department → Dataset Mapping
   Maps AI department codes to the correct GeoJSON
   dataset keys so we only search relevant files.
   ════════════════════════════════════════════════════════ */

/**
 * Maps AI department codes (from department-routing.ts)
 * to GeoJSON dataset keys (filenames without .geojson extension).
 *
 * One department code can map to multiple datasets.
 * The geo router will search all mapped datasets and merge results.
 */
export const DEPT_TO_DATASET: Record<string, string[]> = {
  // Law enforcement
  police:             ["nagpur_city_police"],
  traffic_police:     ["nagpur_city_police", "nagpur_transport_dept_govt_only"],

  // Fire & rescue
  fire_brigade:       ["nagpur_fire_department"],

  // Health & medical (no dedicated dataset yet — fall back to zonal offices)
  health_dept:        ["nagpur_nmc_all_zonal_offices"],
  ambulance:          ["nagpur_nmc_all_zonal_offices"],

  // Water & drainage
  water_supply:       ["nagpur_nmc_water_works"],
  drainage:           ["nagpur_nmc_water_works"],

  // Roads & public works
  road_maintenance:   ["nagpur_nmc_pwd"],
  public_works:       ["nagpur_nmc_pwd"],

  // Traffic
  traffic_management: ["nagpur_transport_dept_govt_only"],

  // Waste
  waste_management:   ["nagpur_nmc_solid_waste_management"],

  // Electrical
  electricity:        ["nagpur_nmc_electrical"],

  // Environment
  environment:        ["nagpur_nmc_garden_environment"],

  // Municipal general
  municipal_corp:     ["nagpur_nmc_all_zonal_offices"],

  // Disaster management (search fire + police + zonal)
  disaster_management: [
    "nagpur_fire_department",
    "nagpur_city_police",
    "nagpur_nmc_all_zonal_offices",
  ],
};

/**
 * Resolve which dataset keys to search for a given list of department codes.
 * Deduplicates across multiple department codes.
 */
export function resolveDatasets(departmentCodes: string[]): string[] {
  const datasetKeys = new Set<string>();

  for (const code of departmentCodes) {
    const datasets = DEPT_TO_DATASET[code];
    if (datasets) {
      for (const ds of datasets) {
        datasetKeys.add(ds);
      }
    } else {
      // Unknown department → search zonal offices as fallback
      datasetKeys.add("nagpur_nmc_all_zonal_offices");
    }
  }

  return [...datasetKeys];
}

/**
 * Get the user-facing department name for display.
 */
export function getDeptDisplayName(code: string): string {
  const names: Record<string, string> = {
    police: "Police",
    traffic_police: "Traffic Police",
    fire_brigade: "Fire & Rescue",
    health_dept: "Health Department",
    ambulance: "Ambulance Services",
    water_supply: "Water Supply",
    drainage: "Drainage",
    road_maintenance: "Road Maintenance (PWD)",
    public_works: "Public Works",
    traffic_management: "Traffic Management",
    waste_management: "Waste Management",
    electricity: "Electricity",
    environment: "Environment",
    municipal_corp: "Municipal Corporation",
    disaster_management: "Disaster Management",
  };
  return names[code] || code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
