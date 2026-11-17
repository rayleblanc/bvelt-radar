export const TENANT_TARGET_MAP: Record<string, string[]> = {
  plumbing: ["property management", "real estate", "hotel", "restaurant", "facility manager", "apartment complex", "hoa"],
  hvac: ["property management", "real estate", "hotel", "facility manager", "general contractor", "apartment complex", "office building"],
  landscaping: ["property management", "real estate", "homeowners association", "commercial developer", "hoa", "apartment complex", "golf course"],
  lawn_care: ["property management", "real estate", "homeowners association", "hoa", "apartment complex", "school"],
  house_cleaning: ["property management", "real estate", "hotel", "airbnb host", "vacation rental", "office building"],
  pool_cleaning: ["property management", "hotel", "gym", "aquatic center", "apartment complex", "hoa"],
  handyman: ["property management", "real estate", "retail store", "restaurant", "hotel", "facility manager"],
  roofing: ["property management", "real estate", "general contractor", "insurance agency", "apartment complex", "hoa"],
  pest_control: ["property management", "restaurant", "hotel", "food processing", "apartment complex", "school"],
  electrical: ["property management", "facility manager", "general contractor", "industrial plant", "office building"],
  cleaning: ["property management", "real estate", "hotel", "office building"],
  "pool service": ["property management", "hotel", "gym", "apartment complex"],
  painting: ["property management", "real estate", "hotel", "apartment complex"],
  flooring: ["property management", "real estate", "hotel", "apartment complex"],
  "water damage": ["property management", "insurance agency", "real estate", "hotel"],
  garage_door: ["property management", "real estate", "facility manager", "apartment complex", "hoa"],
  appliance_repair: ["property management", "apartment complex", "hotel", "facility manager"],
  junk_removal: ["property management", "real estate", "construction company", "facility manager"],
  fencing: ["property management", "real estate", "hoa", "apartment complex"],
  concrete: ["general contractor", "property management", "real estate", "commercial developer"],
  moving: ["property management", "real estate", "apartment complex"],
  commercial_cleaning: ["property management", "office building", "hotel", "gym", "school", "facility manager"],
  janitorial: ["property management", "office building", "hotel", "gym", "school", "facility manager"],
  window_cleaning: ["property management", "office building", "hotel", "retail store", "apartment complex"],
  pressure_washing: ["property management", "hoa", "apartment complex", "retail store", "hotel", "restaurant"],
  tree_service: ["property management", "hoa", "apartment complex", "golf course", "school"],
  paving: ["property management", "general contractor", "commercial developer", "hoa", "retail store"],
  asphalt: ["property management", "general contractor", "commercial developer", "hoa", "retail store"],
  security: ["property management", "hotel", "retail store", "industrial plant", "apartment complex", "school"],
  it_services: ["insurance agency", "real estate", "general contractor", "retail store", "school", "gym"],
  solar: ["property management", "real estate", "general contractor", "commercial developer", "school"],
  fire_protection: ["property management", "hotel", "restaurant", "school", "industrial plant", "apartment complex"],
  carpet_cleaning: ["property management", "hotel", "office building", "apartment complex", "school"],
  signage: ["retail store", "restaurant", "gym", "real estate", "general contractor"],
  locksmith: ["property management", "apartment complex", "hotel", "real estate", "facility manager"],
};


export function resolveTenantBuyerSegments(
  niche: string,
  expandedSegments: Array<string | { label?: string }> = []
): string[] {
  const expanded = Array.from(new Set(
    expandedSegments
      .map(segment => typeof segment === "string" ? segment : String(segment?.label || ""))
      .map(label => label.trim())
      .filter(Boolean)
  ));
  if (expanded.length) return expanded.slice(0, 6);

  const normalized = String(niche || "").trim().toLowerCase();
  const key = normalized.replace(/\s+/g, "_");
  const mapped = TENANT_TARGET_MAP[key] || TENANT_TARGET_MAP[normalized] || [];
  return [...mapped];
}


export function resolveTenantBuyerSegmentsForProfile(
  industry: string,
  niche: string,
  expandedSegments: Array<string | { label?: string }> = []
): string[] {
  const industrySegments = resolveTenantBuyerSegments(industry, expandedSegments);
  return industrySegments.length
    ? industrySegments
    : resolveTenantBuyerSegments(niche, expandedSegments);
}
