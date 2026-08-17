/* ════════════════════════════════════════════════════════
   Department Routing Configuration
   AI recommends → App rules finalize
   Configurable, not hard-coded throughout source
   ════════════════════════════════════════════════════════ */

export interface DepartmentInfo {
  code: string;
  name: string;
  description: string;
}

/** All known departments */
export const DEPARTMENTS: DepartmentInfo[] = [
  { code: "police", name: "Police Department", description: "Law enforcement and public safety" },
  { code: "traffic_police", name: "Traffic Police", description: "Traffic regulation and accident response" },
  { code: "fire_brigade", name: "Fire Brigade", description: "Fire suppression and rescue operations" },
  { code: "health_dept", name: "Health Department", description: "Public health and disease control" },
  { code: "ambulance", name: "Ambulance Services", description: "Emergency medical transport" },
  { code: "water_supply", name: "Water Supply Department", description: "Municipal water supply management" },
  { code: "drainage", name: "Drainage Department", description: "Stormwater and sewage drainage" },
  { code: "road_maintenance", name: "Road Maintenance / PWD", description: "Road repair and public works" },
  { code: "traffic_management", name: "Traffic Management", description: "Signal maintenance and traffic flow" },
  { code: "waste_management", name: "Waste Management", description: "Solid waste collection and disposal" },
  { code: "environment", name: "Environmental Department", description: "Environmental protection and green spaces" },
  { code: "electricity", name: "Electricity Department", description: "Power supply and street lighting" },
  { code: "disaster_management", name: "Disaster Management", description: "Natural and man-made disaster response" },
  { code: "municipal_corp", name: "Municipal Corporation", description: "General municipal services (NMC)" },
  { code: "public_works", name: "Public Works Department", description: "Infrastructure and construction" },
  { code: "forest_wildlife", name: "Forest & Wildlife Department", description: "Forest conservation, wildlife protection, tree-related issues" },
  { code: "women_child_dev", name: "Women & Child Development", description: "Women's safety, child protection, domestic issues" },
];

/**
 * Routing rules: subcategory/incident type → required departments
 * AI recommends departments, but these rules ensure completeness
 */
export const ROUTING_RULES: Record<string, string[]> = {
  // Emergency
  medical_emergency: ["ambulance", "health_dept", "police"],
  building_collapse: ["fire_brigade", "police", "ambulance", "disaster_management"],
  drowning: ["fire_brigade", "ambulance", "police"],
  gas_leak: ["fire_brigade", "police"],
  other_emergency: ["police", "ambulance"],

  // Police & Safety
  theft: ["police"],
  harassment: ["police"],
  assault: ["police", "ambulance"],
  suspicious_activity: ["police"],
  cyber_crime: ["police"],
  public_disturbance: ["police"],
  missing_person: ["police"],

  // Fire & Rescue
  active_fire: ["fire_brigade", "police", "ambulance"],
  smoke: ["fire_brigade"],
  gas_leak_fire: ["fire_brigade", "police"],
  rescue_needed: ["fire_brigade", "ambulance", "police"],

  // Health
  contaminated_water: ["health_dept", "water_supply"],
  disease_outbreak: ["health_dept"],
  food_safety: ["health_dept", "municipal_corp"],
  stray_animal: ["municipal_corp", "health_dept"],
  open_defecation: ["health_dept", "municipal_corp"],

  // Water & Drainage
  no_water_supply: ["water_supply"],
  water_leak: ["water_supply"],
  waterlogging: ["drainage", "road_maintenance", "traffic_management"],
  sewage_overflow: ["drainage", "health_dept"],
  blocked_drain: ["drainage"],

  // Roads & Traffic
  pothole: ["road_maintenance"],
  damaged_road: ["road_maintenance"],
  broken_signal: ["traffic_management"],
  road_blockage: ["road_maintenance", "traffic_police"],
  open_manhole: ["road_maintenance", "municipal_corp"],
  road_accident: ["police", "traffic_police", "ambulance"],
  street_light: ["electricity", "municipal_corp"],

  // Waste
  garbage_pile: ["waste_management"],
  missed_collection: ["waste_management"],
  overflowing_bin: ["waste_management"],
  construction_debris: ["waste_management", "municipal_corp"],
  public_toilet: ["municipal_corp", "health_dept"],

  // Environment
  fallen_tree: ["environment", "road_maintenance", "traffic_management"],
  park_damage: ["environment", "municipal_corp"],
  air_pollution: ["environment"],
  noise_pollution: ["environment", "police"],
  encroachment: ["municipal_corp", "police"],
  damaged_public_property: ["municipal_corp", "police"],

  // Forest & Wildlife
  animal_attack: ["forest_wildlife", "police", "ambulance"],
  wild_animal_sighting: ["forest_wildlife", "police"],
  illegal_logging: ["forest_wildlife", "police"],
  forest_fire: ["forest_wildlife", "fire_brigade", "disaster_management"],
  wildlife_conflict: ["forest_wildlife"],
  tree_fall: ["forest_wildlife", "road_maintenance", "municipal_corp"],
  illegal_hunting: ["forest_wildlife", "police"],

  // Women & Child Safety
  domestic_violence: ["women_child_dev", "police"],
  child_abuse: ["women_child_dev", "police"],
  missing_child: ["women_child_dev", "police"],
  eve_teasing: ["women_child_dev", "police"],
  dowry_harassment: ["women_child_dev", "police"],
  child_labor: ["women_child_dev", "police"],
  women_helpline: ["women_child_dev"],
};

/** Priority thresholds — configurable */
export const PRIORITY_BANDS = {
  LOW: { min: 0, max: 30, label: "Low" },
  MEDIUM: { min: 31, max: 60, label: "Medium" },
  HIGH: { min: 61, max: 80, label: "High" },
  CRITICAL: { min: 81, max: 100, label: "Critical" },
} as const;

export type PriorityBand = keyof typeof PRIORITY_BANDS;

/** Determine priority band from score */
export function getPriorityBand(score: number): PriorityBand {
  if (score >= PRIORITY_BANDS.CRITICAL.min) return "CRITICAL";
  if (score >= PRIORITY_BANDS.HIGH.min) return "HIGH";
  if (score >= PRIORITY_BANDS.MEDIUM.min) return "MEDIUM";
  return "LOW";
}

/** Resolve departments for a given subcategory, merging AI recommendations */
export function resolveDepartments(
  subcategorySlug: string | null,
  aiRecommended: string[]
): string[] {
  const rulesDepts = subcategorySlug
    ? ROUTING_RULES[subcategorySlug] || []
    : [];

  // Merge: routing rules + AI recommendations, deduplicated
  const merged = new Set([...rulesDepts, ...aiRecommended]);
  
  // Validate: only allow known department codes
  const validCodes = new Set(DEPARTMENTS.map((d) => d.code));
  return [...merged].filter((code) => validCodes.has(code));
}

/** Get department info by code */
export function getDepartmentByCode(code: string): DepartmentInfo | undefined {
  return DEPARTMENTS.find((d) => d.code === code);
}

/** Format department name from code */
export function formatDepartmentName(code: string): string {
  return getDepartmentByCode(code)?.name || code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
