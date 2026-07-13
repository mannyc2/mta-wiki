import type { JsonObject, JsonValue, MtaObservationKind } from "@mta-wiki/db/types";
import { normalizeRelationPayload } from "@mta-wiki/pipeline/records/relations";

export type NormalizationContext = {
  raw_text?: string | undefined;
  evidence_quotes?: readonly string[] | undefined;
};

function parseNumber(value: string) {
  const normalized = value.trim().replace(/,/gu, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
  return Number(normalized);
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function normalizedToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function addIfMissing(payload: JsonObject, key: string, value: JsonValue | undefined) {
  if (value !== undefined && payload[key] === undefined) payload[key] = value;
}

function addIfMissingOrOther(payload: JsonObject, key: string, value: JsonValue | undefined) {
  if (value !== undefined && (payload[key] === undefined || payload[key] === "other")) payload[key] = value;
}

function addTreatmentFamily(payload: JsonObject, value: string | undefined) {
  if (value !== undefined && (payload.treatment_family === undefined || payload.treatment_family === "other" || payload.treatment_family === "shelters_and_benches")) {
    payload.treatment_family = value;
  }
}

/** Lowercased, underscore-joined concatenation of the named string fields — a deterministic
 *  substring haystack for the S2.1 keyword-derived companions (cost_type, authority_tier, …).
 *  Substring tests against it are safe because every token is `[a-z0-9_]` only. */
function normalizedHaystack(payload: JsonObject, fields: readonly string[]): string {
  return fields
    .map((field) => payload[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizedToken(value))
    .join(" ");
}

function normalizedMergedHaystack(payload: JsonObject, fields: readonly string[]): string {
  const merged = payload._merged_field_values;
  if (merged === undefined || merged === null || typeof merged !== "object" || Array.isArray(merged)) return "";
  const mergedValues = merged as JsonObject;
  return fields
    .flatMap((field) => stringArrayValues(mergedValues[field]))
    .map((value) => normalizedToken(value))
    .join(" ");
}

function normalizedContextHaystack(context: NormalizationContext | undefined): string {
  if (!context) return "";
  return [context.raw_text, ...(context.evidence_quotes ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizedToken(value))
    .join(" ");
}

function rawContextText(context: NormalizationContext | undefined): string {
  if (!context) return "";
  return [context.raw_text, ...(context.evidence_quotes ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function contextHasCheckedTitle(context: NormalizationContext | undefined, title: string | undefined): boolean {
  if (!title) return false;
  return rawContextText(context).includes(`${title.trim()} \u2713`);
}

function hasAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function hasAnyToken(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => new RegExp(`(^|[_\\s])${needle}([_\\s]|$)`, "u").test(haystack));
}

const UNIT_ALIASES = new Map<string, { unit: string; family: string; scale?: number | undefined }>([
  ["%", { unit: "percent", family: "percentage" }],
  ["percent", { unit: "percent", family: "percentage" }],
  ["percentage point", { unit: "percentage_point", family: "percentage" }],
  ["percentage points", { unit: "percentage_point", family: "percentage" }],
  ["mph", { unit: "mph", family: "speed" }],
  ["miles per hour", { unit: "mph", family: "speed" }],
  ["miles_per_hour", { unit: "mph", family: "speed" }],
  ["minutes", { unit: "minutes", family: "duration" }],
  ["minute", { unit: "minutes", family: "duration" }],
  ["seconds", { unit: "seconds", family: "duration" }],
  ["second", { unit: "seconds", family: "duration" }],
  ["riders", { unit: "riders", family: "ridership" }],
  ["passengers", { unit: "riders", family: "ridership" }],
  ["customers", { unit: "customers", family: "count" }],
  ["people", { unit: "people", family: "population" }],
  ["riders per day", { unit: "riders_per_day", family: "ridership" }],
  ["riders_per_day", { unit: "riders_per_day", family: "ridership" }],
  ["passengers per day", { unit: "riders_per_day", family: "ridership" }],
  ["passengers_per_day", { unit: "riders_per_day", family: "ridership" }],
  ["average_daily_customers", { unit: "riders_per_day", family: "ridership" }],
  ["daily_riders", { unit: "riders_per_day", family: "ridership" }],
  ["riders_per_weekday", { unit: "riders_per_weekday", family: "ridership" }],
  ["passengers per weekday", { unit: "riders_per_weekday", family: "ridership" }],
  ["passengers_per_weekday", { unit: "riders_per_weekday", family: "ridership" }],
  ["passengers_per_saturday", { unit: "riders_per_saturday", family: "ridership" }],
  ["passengers_per_sunday", { unit: "riders_per_sunday", family: "ridership" }],
  ["boardings", { unit: "boardings", family: "ridership" }],
  ["million_passengers", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["million_rides", { unit: "rides", family: "ridership", scale: 1_000_000 }],
  ["million_trips", { unit: "trips", family: "ridership", scale: 1_000_000 }],
  ["million_customers", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["millions_of_trips", { unit: "trips", family: "ridership", scale: 1_000_000 }],
  ["million_passenger_trips", { unit: "trips", family: "ridership", scale: 1_000_000 }],
  ["million_unlinked_trips", { unit: "trips", family: "ridership", scale: 1_000_000 }],
  ["millions_of_riders", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["millions_of_passengers", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["billions_rides", { unit: "rides", family: "ridership", scale: 1_000_000_000 }],
  ["billion_rides", { unit: "rides", family: "ridership", scale: 1_000_000_000 }],
  ["riders_millions", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["million_boardings", { unit: "boardings", family: "ridership", scale: 1_000_000 }],
  ["riders_day", { unit: "riders_per_day", family: "ridership" }],
  ["riders_per_year", { unit: "riders_per_year", family: "ridership" }],
  ["riders_per_game", { unit: "riders_per_game", family: "ridership" }],
  ["riders_per_weekend_day", { unit: "riders_per_weekend_day", family: "ridership" }],
  ["ridership_thousands", { unit: "riders", family: "ridership", scale: 1_000 }],
  ["ridership", { unit: "ridership", family: "ridership" }],
  ["revenue_passengers", { unit: "riders", family: "ridership" }],
  ["completed_weekday_trips", { unit: "trips_per_weekday", family: "ridership" }],
  ["average_trips", { unit: "trips", family: "ridership" }],
  ["trips_per_month", { unit: "trips_per_month", family: "ridership" }],
  ["boardings_per_weekday", { unit: "boardings_per_weekday", family: "ridership" }],
  ["dollars", { unit: "dollars", family: "money" }],
  ["usd", { unit: "dollars", family: "money" }],
  ["$", { unit: "dollars", family: "money" }],
  ["$ (millions)", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["$ millions", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["$ in millions", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["$m", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["$b", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["$ b", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["$ billion", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["$ billions", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["$ bn", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["$ in billions", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["billion $", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["dollars_in_millions", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["dollars_millions", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["million_dollars", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["million_usd", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["millions_usd", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["millions_of_usd", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["millions_of_dollars", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["thousand_usd", { unit: "dollars", family: "money", scale: 1_000 }],
  ["thousands_usd", { unit: "dollars", family: "money", scale: 1_000 }],
  ["usd_thousands", { unit: "dollars", family: "money", scale: 1_000 }],
  ["usd_millions", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["usd_million", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["usd m", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["usd_m", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["m_usd", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["usd $m", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["$ thousands", { unit: "dollars", family: "money", scale: 1_000 }],
  ["thousand_dollars", { unit: "dollars", family: "money", scale: 1_000 }],
  ["thousands_of_dollars", { unit: "dollars", family: "money", scale: 1_000 }],
  ["thousands of $", { unit: "dollars", family: "money", scale: 1_000 }],
  ["$000", { unit: "dollars", family: "money", scale: 1_000 }],
  ["billion_dollars", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["billion_usd", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["billions_usd", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["billions_of_dollars", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["trillion_dollars", { unit: "dollars", family: "money", scale: 1_000_000_000_000 }],
  ["usd_billion", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["usd_b", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["b_usd", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["usd_x1000", { unit: "dollars", family: "money", scale: 1_000 }],
  ["uillion_dollars", { unit: "dollars", family: "money", scale: 1_000_000 }],
  ["b_2019_dollars", { unit: "dollars", family: "money", scale: 1_000_000_000 }],
  ["usd/gallon", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["$/gallon", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["$/gal", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["$ per gallon", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["usd_per_gallon", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["dollars_per_gallon", { unit: "dollars_per_gallon", family: "money_rate" }],
  ["$/passenger", { unit: "dollars_per_passenger", family: "money_rate" }],
  ["$ per passenger", { unit: "dollars_per_passenger", family: "money_rate" }],
  ["usd_per_passenger", { unit: "dollars_per_passenger", family: "money_rate" }],
  ["dollars_per_passenger", { unit: "dollars_per_passenger", family: "money_rate" }],
  ["dollars_per_violation", { unit: "dollars_per_violation", family: "money_rate" }],
  ["usd/year", { unit: "dollars_per_year", family: "money_rate" }],
  ["usd_year", { unit: "dollars_per_year", family: "money_rate" }],
  ["usd_per_year", { unit: "dollars_per_year", family: "money_rate" }],
  ["dollars per year", { unit: "dollars_per_year", family: "money_rate" }],
  ["dollars_per_year", { unit: "dollars_per_year", family: "money_rate" }],
  ["millions_of_dollars_per_year", { unit: "dollars_per_year", family: "money_rate", scale: 1_000_000 }],
  ["$/month", { unit: "dollars_per_month", family: "money_rate" }],
  ["usd_month", { unit: "dollars_per_month", family: "money_rate" }],
  ["usd/month", { unit: "dollars_per_month", family: "money_rate" }],
  ["usd/mo", { unit: "dollars_per_month", family: "money_rate" }],
  ["usd_per_month", { unit: "dollars_per_month", family: "money_rate" }],
  ["usd_month_spot", { unit: "dollars_per_month_per_spot", family: "money_rate" }],
  ["usd_per_1000", { unit: "dollars_per_1000_dollars", family: "money_rate" }],
  ["usd/annum", { unit: "dollars_per_year", family: "money_rate" }],
  ["usd_per_annum", { unit: "dollars_per_year", family: "money_rate" }],
  ["usd/yr", { unit: "dollars_per_year", family: "money_rate" }],
  ["usd_system_year", { unit: "dollars_per_system_year", family: "money_rate" }],
  ["usd/hour", { unit: "dollars_per_hour", family: "money_rate" }],
  ["usd_hour", { unit: "dollars_per_hour", family: "money_rate" }],
  ["usd/day", { unit: "dollars_per_day", family: "money_rate" }],
  ["usd_per_day", { unit: "dollars_per_day", family: "money_rate" }],
  ["usd_day_car", { unit: "dollars_per_day_per_car", family: "money_rate" }],
  ["usd_per_day_per_car", { unit: "dollars_per_day_per_car", family: "money_rate" }],
  ["usd_per_hour", { unit: "dollars_per_hour", family: "money_rate" }],
  ["usd_sf", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_sq_ft", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_sqft", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_per_square_foot", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd/square_foot", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_square_foot", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_per_sq_ft", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_per_square_foot_per_annum", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["usd_per_square_foot_per_year", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["usd_sq_ft_year", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["usd_sqft_year", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["dollars_per_square_foot", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["dollars_per_square_foot_per_annum", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["dollars_per_square_foot_per_year", { unit: "dollars_per_square_foot_per_year", family: "money_rate" }],
  ["dollars_per_week", { unit: "dollars_per_week", family: "money_rate" }],
  ["usd_per_vehicle", { unit: "dollars_per_vehicle", family: "money_rate" }],
  ["$ per vehicle", { unit: "dollars_per_vehicle", family: "money_rate" }],
  ["dollars_per_vehicle", { unit: "dollars_per_vehicle", family: "money_rate" }],
  ["usd/bus", { unit: "dollars_per_bus", family: "money_rate" }],
  ["usd_per_bus", { unit: "dollars_per_bus", family: "money_rate" }],
  ["usd_per_bus_per_month", { unit: "dollars_per_bus_per_month", family: "money_rate" }],
  ["usd_per_sf", { unit: "dollars_per_square_foot", family: "money_rate" }],
  ["usd_per_radio", { unit: "dollars_per_radio", family: "money_rate" }],
  ["usd_license_month", { unit: "dollars_per_license_per_month", family: "money_rate" }],
  ["dollars_per_mmbtu", { unit: "dollars_per_mmbtu", family: "money_rate" }],
  ["dollars_per_barrel", { unit: "dollars_per_barrel", family: "money_rate" }],
  ["dollars_per_bus", { unit: "dollars_per_bus", family: "money_rate" }],
  ["dollars_per_trip", { unit: "dollars_per_trip", family: "money_rate" }],
  ["$ per unlinked trip", { unit: "dollars_per_unlinked_trip", family: "money_rate" }],
  ["dollars_per_person_per_month", { unit: "dollars_per_person_per_month", family: "money_rate" }],
  ["$/bbl", { unit: "dollars_per_barrel", family: "money_rate" }],
  ["gallons", { unit: "gallons", family: "volume" }],
  ["million_gallons", { unit: "gallons", family: "volume", scale: 1_000_000 }],
  ["m_gallons", { unit: "gallons", family: "volume", scale: 1_000_000 }],
  ["cubic_feet", { unit: "cubic_feet", family: "volume" }],
  ["gallons_per_hour", { unit: "gallons_per_hour", family: "volume_rate" }],
  ["metric_tons", { unit: "metric_tons", family: "mass" }],
  ["metric_tons_of_co2", { unit: "metric_tons_co2", family: "mass" }],
  ["metric_tons_per_year", { unit: "metric_tons_per_year", family: "mass_rate" }],
  ["tons", { unit: "tons", family: "mass" }],
  ["tons_co2_per_year", { unit: "tons_co2_per_year", family: "mass_rate" }],
  ["lbs", { unit: "pounds", family: "mass" }],
  ["pounds", { unit: "pounds", family: "mass" }],
  ["degrees_fahrenheit", { unit: "degrees_fahrenheit", family: "temperature" }],
  ["db", { unit: "decibels", family: "sound" }],
  ["kwh_bulb", { unit: "kilowatt_hours_per_bulb", family: "energy_rate" }],
  ["mw", { unit: "megawatts", family: "power" }],
  ["horsepower", { unit: "horsepower", family: "power" }],
  ["miles", { unit: "miles", family: "distance" }],
  ["mi", { unit: "miles", family: "distance" }],
  ["miles_per_year", { unit: "miles_per_year", family: "distance" }],
  ["miles/hour", { unit: "mph", family: "speed" }],
  ["miles_hour", { unit: "mph", family: "speed" }],
  ["feet", { unit: "feet", family: "distance" }],
  ["ft", { unit: "feet", family: "distance" }],
  ["foot", { unit: "feet", family: "distance" }],
  ["linear_feet", { unit: "feet", family: "distance" }],
  ["linear_ft", { unit: "feet", family: "distance" }],
  ["lineal_ft", { unit: "feet", family: "distance" }],
  ["lined_ft", { unit: "feet", family: "distance" }],
  ["inches", { unit: "inches", family: "distance" }],
  ["track_feet", { unit: "track_feet", family: "distance" }],
  ["revenue_car_miles", { unit: "revenue_car_miles", family: "distance" }],
  ["track_miles", { unit: "track_miles", family: "distance" }],
  ["lane_miles", { unit: "lane_miles", family: "distance" }],
  ["square_feet", { unit: "square_feet", family: "area" }],
  ["sq_ft", { unit: "square_feet", family: "area" }],
  ["ft2", { unit: "square_feet", family: "area" }],
  ["square_foot", { unit: "square_feet", family: "area" }],
  ["square_miles", { unit: "square_miles", family: "area" }],
  ["square_yards", { unit: "square_yards", family: "area" }],
  ["rentable_square_feet", { unit: "square_feet", family: "area" }],
  ["acres", { unit: "acres", family: "area" }],
  ["routes", { unit: "routes", family: "count" }],
  ["count", { unit: "count", family: "count" }],
  ["million_vehicles", { unit: "vehicles", family: "count", scale: 1_000_000 }],
  ["million_crossings", { unit: "crossings", family: "count", scale: 1_000_000 }],
  ["million_vehicle_crossings", { unit: "vehicle_crossings", family: "count", scale: 1_000_000 }],
  ["millions_of_vehicles", { unit: "vehicles", family: "count", scale: 1_000_000 }],
  ["millions_of_crossings", { unit: "crossings", family: "count", scale: 1_000_000 }],
  ["thousand_crossings", { unit: "crossings", family: "count", scale: 1_000 }],
  ["vehicles_millions", { unit: "vehicles", family: "count", scale: 1_000_000 }],
  ["crossings", { unit: "crossings", family: "count" }],
  ["incidents", { unit: "incidents", family: "count" }],
  ["complaints", { unit: "complaints", family: "count" }],
  ["stations", { unit: "stations", family: "count" }],
  ["trains", { unit: "trains", family: "count" }],
  ["ties", { unit: "ties", family: "count" }],
  ["spaces", { unit: "spaces", family: "count" }],
  ["felonies", { unit: "felonies", family: "count" }],
  ["projects", { unit: "projects", family: "count" }],
  ["delays", { unit: "delays", family: "count" }],
  ["actions", { unit: "actions", family: "count" }],
  ["lawsuits", { unit: "lawsuits", family: "count" }],
  ["entrapments", { unit: "entrapments", family: "count" }],
  ["switches", { unit: "switches", family: "count" }],
  ["inspections", { unit: "inspections", family: "count" }],
  ["cars", { unit: "cars", family: "count" }],
  ["firms", { unit: "firms", family: "count" }],
  ["contracts", { unit: "contracts", family: "count" }],
  ["tests", { unit: "tests", family: "count" }],
  ["audits", { unit: "audits", family: "count" }],
  ["parking_spaces", { unit: "parking_spaces", family: "count" }],
  ["installations", { unit: "installations", family: "count" }],
  ["tickets", { unit: "tickets", family: "count" }],
  ["defects", { unit: "defects", family: "count" }],
  ["cards", { unit: "cards", family: "count" }],
  ["machines", { unit: "machines", family: "count" }],
  ["locomotives", { unit: "locomotives", family: "count" }],
  ["joints", { unit: "joints", family: "count" }],
  ["cases", { unit: "cases", family: "count" }],
  ["transfers", { unit: "transfers", family: "count" }],
  ["deficiencies", { unit: "deficiencies", family: "count" }],
  ["timbers", { unit: "timbers", family: "count" }],
  ["reports", { unit: "reports", family: "count" }],
  ["assessments", { unit: "assessments", family: "count" }],
  ["work_orders", { unit: "work_orders", family: "count" }],
  ["visits", { unit: "visits", family: "count" }],
  ["invoices", { unit: "invoices", family: "count" }],
  ["loans", { unit: "loans", family: "count" }],
  ["outages", { unit: "outages", family: "count" }],
  ["payments", { unit: "payments", family: "count" }],
  ["businesses", { unit: "businesses", family: "count" }],
  ["depots", { unit: "depots", family: "count" }],
  ["railcars", { unit: "railcars", family: "count" }],
  ["subway_cars", { unit: "subway_cars", family: "count" }],
  ["applications", { unit: "applications", family: "count" }],
  ["elevators", { unit: "elevators", family: "count" }],
  ["substations", { unit: "substations", family: "count" }],
  ["bases", { unit: "bases", family: "count" }],
  ["bicycles", { unit: "bicycles", family: "count" }],
  ["detection_points", { unit: "detection_points", family: "count" }],
  ["errors", { unit: "errors", family: "count" }],
  ["panels", { unit: "panels", family: "count" }],
  ["systems", { unit: "systems", family: "count" }],
  ["taps", { unit: "taps", family: "count" }],
  ["transactions", { unit: "transactions", family: "count" }],
  ["vehicle_crossings", { unit: "vehicle_crossings", family: "count" }],
  ["welds", { unit: "welds", family: "count" }],
  ["buildings", { unit: "buildings", family: "count" }],
  ["bus_depots", { unit: "bus_depots", family: "count" }],
  ["subway_lines", { unit: "subway_lines", family: "count" }],
  ["observations", { unit: "observations", family: "count" }],
  ["circuit_breakers", { unit: "circuit_breakers", family: "count" }],
  ["commitments", { unit: "commitments", family: "count" }],
  ["cvms", { unit: "cvms", family: "count" }],
  ["ea", { unit: "each", family: "count" }],
  ["event_days", { unit: "event_days", family: "count" }],
  ["facilities", { unit: "facilities", family: "count" }],
  ["findings", { unit: "findings", family: "count" }],
  ["notices", { unit: "notices", family: "count" }],
  ["operations", { unit: "operations", family: "count" }],
  ["patrols", { unit: "patrols", family: "count" }],
  ["potholes", { unit: "potholes", family: "count" }],
  ["rail_cars", { unit: "railcars", family: "count" }],
  ["runs", { unit: "runs", family: "count" }],
  ["stops", { unit: "stops", family: "count" }],
  ["uses", { unit: "uses", family: "count" }],
  ["units", { unit: "units", family: "count" }],
  ["able_systems", { unit: "able_systems", family: "count" }],
  ["agencies", { unit: "agencies", family: "count" }],
  ["audit_projects", { unit: "audit_projects", family: "count" }],
  ["bridges", { unit: "bridges", family: "count" }],
  ["bus_routes", { unit: "bus_routes", family: "count" }],
  ["catch_basins", { unit: "catch_basins", family: "count" }],
  ["encampments", { unit: "encampments", family: "count" }],
  ["gates", { unit: "gates", family: "count" }],
  ["items", { unit: "items", family: "count" }],
  ["loading_zones", { unit: "loading_zones", family: "count" }],
  ["accident_reports", { unit: "accident_reports", family: "count" }],
  ["assignments", { unit: "assignments", family: "count" }],
  ["banks", { unit: "banks", family: "count" }],
  ["barriers", { unit: "barriers", family: "count" }],
  ["bathrooms", { unit: "bathrooms", family: "count" }],
  ["bikes", { unit: "bikes", family: "count" }],
  ["bridges_and_viaducts", { unit: "bridges_and_viaducts", family: "count" }],
  ["calculations", { unit: "calculations", family: "count" }],
  ["callouts", { unit: "callouts", family: "count" }],
  ["calls", { unit: "calls", family: "count" }],
  ["calls_emails_letters_and_chats", { unit: "customer_contacts", family: "count" }],
  ["cars_equipped", { unit: "cars_equipped", family: "count" }],
  ["categories", { unit: "categories", family: "count" }],
  ["clients", { unit: "clients", family: "count" }],
  ["close_outs", { unit: "close_outs", family: "count" }],
  ["coastal_mechanical_closure_devices", { unit: "coastal_mechanical_closure_devices", family: "count" }],
  ["completions", { unit: "completions", family: "count" }],
  ["controls", { unit: "controls", family: "count" }],
  ["conversations", { unit: "conversations", family: "count" }],
  ["crosswalks", { unit: "crosswalks", family: "count" }],
  ["curves", { unit: "curves", family: "count" }],
  ["customer_service_centers", { unit: "customer_service_centers", family: "count" }],
  ["daily_trains", { unit: "trains_per_day", family: "count_rate" }],
  ["drains", { unit: "drains", family: "count" }],
  ["eblasts", { unit: "eblasts", family: "count" }],
  ["electric_buses", { unit: "electric_buses", family: "count" }],
  ["extensions", { unit: "extensions", family: "count" }],
  ["failures", { unit: "failures", family: "count" }],
  ["files", { unit: "files", family: "count" }],
  ["firearms", { unit: "firearms", family: "enforcement" }],
  ["functions", { unit: "functions", family: "count" }],
  ["grade_crossings", { unit: "grade_crossings", family: "count" }],
  ["groups", { unit: "groups", family: "count" }],
  ["heaters", { unit: "heaters", family: "count" }],
  ["housing_units", { unit: "housing_units", family: "count" }],
  ["inspections_and_audits", { unit: "inspections_and_audits", family: "count" }],
  ["interdictions", { unit: "interdictions", family: "enforcement" }],
  ["interviews", { unit: "interviews", family: "count" }],
  ["islands", { unit: "islands", family: "count" }],
  ["lanes", { unit: "lanes", family: "count" }],
  ["levels", { unit: "levels", family: "count" }],
  ["licenses", { unit: "licenses", family: "count" }],
  ["lines", { unit: "lines", family: "count" }],
  ["links", { unit: "links", family: "count" }],
  ["medians", { unit: "medians", family: "count" }],
  ["meetings", { unit: "meetings", family: "count" }],
  ["offers", { unit: "offers", family: "count" }],
  ["offices", { unit: "offices", family: "count" }],
  ["pads", { unit: "pads", family: "count" }],
  ["pages", { unit: "pages", family: "count" }],
  ["parking_areas", { unit: "parking_areas", family: "count" }],
  ["partners", { unit: "partners", family: "count" }],
  ["pieces", { unit: "pieces", family: "count" }],
  ["placements", { unit: "placements", family: "count" }],
  ["plazas", { unit: "plazas", family: "count" }],
  ["plans", { unit: "plans", family: "count" }],
  ["protections", { unit: "protections", family: "count" }],
  ["pump_rooms", { unit: "pump_rooms", family: "count" }],
  ["railroad_equipment_platforms", { unit: "railroad_equipment_platforms", family: "count" }],
  ["railroad_substations", { unit: "railroad_substations", family: "count" }],
  ["railroad_ties", { unit: "railroad_ties", family: "count" }],
  ["requests", { unit: "requests", family: "count" }],
  ["reviews", { unit: "reviews", family: "count" }],
  ["sales", { unit: "sales", family: "count" }],
  ["sessions", { unit: "sessions", family: "count" }],
  ["shoes", { unit: "shoes", family: "count" }],
  ["signal_relays", { unit: "signal_relays", family: "count" }],
  ["signals", { unit: "signals", family: "count" }],
  ["siphons", { unit: "siphons", family: "count" }],
  ["site_visits", { unit: "site_visits", family: "count" }],
  ["speed_increases", { unit: "speed_increases", family: "count" }],
  ["station_entrances", { unit: "station_entrances", family: "count" }],
  ["subway_fan_plants", { unit: "subway_fan_plants", family: "count" }],
  ["subway_hatches", { unit: "subway_hatches", family: "count" }],
  ["subway_manholes", { unit: "subway_manholes", family: "count" }],
  ["subway_stairways", { unit: "subway_stairways", family: "count" }],
  ["subway_yards", { unit: "subway_yards", family: "count" }],
  ["tabs", { unit: "tabs", family: "count" }],
  ["terminals", { unit: "terminals", family: "count" }],
  ["track_panels", { unit: "track_panels", family: "count" }],
  ["trainings", { unit: "trainings", family: "count" }],
  ["train_cars", { unit: "train_cars", family: "count" }],
  ["transponders", { unit: "transponders", family: "count" }],
  ["transformers", { unit: "transformers", family: "count" }],
  ["tree_pits", { unit: "tree_pits", family: "count" }],
  ["trucks", { unit: "trucks", family: "count" }],
  ["tubes", { unit: "tubes", family: "count" }],
  ["vehicular_tunnel_flood_doors", { unit: "vehicular_tunnel_flood_doors", family: "count" }],
  ["vending_machines", { unit: "vending_machines", family: "count" }],
  ["wheels", { unit: "wheels", family: "count" }],
  ["yards", { unit: "yards", family: "count" }],
  ["employees", { unit: "employees", family: "workforce" }],
  ["positions", { unit: "positions", family: "workforce" }],
  ["full-time equivalents", { unit: "full_time_equivalents", family: "workforce" }],
  ["full_time_equivalents", { unit: "full_time_equivalents", family: "workforce" }],
  ["fte", { unit: "full_time_equivalents", family: "workforce" }],
  ["full-time equivalents (fte)", { unit: "full_time_equivalents", family: "workforce" }],
  ["full_time_equivalents_fte", { unit: "full_time_equivalents", family: "workforce" }],
  ["full-time positions", { unit: "positions", family: "workforce" }],
  ["full_time_positions", { unit: "positions", family: "workforce" }],
  ["full-time and full-time equivalent positions", { unit: "positions", family: "workforce" }],
  ["full_time_and_full_time_equivalent_positions", { unit: "positions", family: "workforce" }],
  ["operators", { unit: "operators", family: "workforce" }],
  ["headcount", { unit: "headcount", family: "workforce" }],
  ["officers", { unit: "officers", family: "workforce" }],
  ["personnel", { unit: "personnel", family: "workforce" }],
  ["workers", { unit: "workers", family: "workforce" }],
  ["ftes", { unit: "full_time_equivalents", family: "workforce" }],
  ["hires", { unit: "hires", family: "workforce" }],
  ["employees_trained", { unit: "employees_trained", family: "workforce" }],
  ["bus_operators", { unit: "bus_operators", family: "workforce" }],
  ["dispatchers", { unit: "dispatchers", family: "workforce" }],
  ["drivers", { unit: "drivers", family: "workforce" }],
  ["maintainers", { unit: "maintainers", family: "workforce" }],
  ["representatives", { unit: "representatives", family: "workforce" }],
  ["supervisors", { unit: "supervisors", family: "workforce" }],
  ["sworn_officers", { unit: "sworn_officers", family: "workforce" }],
  ["uniform_officers", { unit: "uniform_officers", family: "workforce" }],
  ["vacancies", { unit: "vacancies", family: "workforce" }],
  ["vehicles", { unit: "vehicles", family: "count" }],
  ["cameras", { unit: "cameras", family: "count" }],
  ["violations", { unit: "violations", family: "count" }],
  ["violators", { unit: "violators", family: "enforcement" }],
  ["notices_of_liability", { unit: "notices_of_liability", family: "count" }],
  ["trips", { unit: "trips", family: "count" }],
  ["trips_per_day", { unit: "trips_per_day", family: "service" }],
  ["trips_per_weekday", { unit: "trips_per_weekday", family: "service" }],
  ["rides", { unit: "rides", family: "ridership" }],
  ["rows", { unit: "rows", family: "count" }],
  ["entries", { unit: "entries", family: "count" }],
  ["events", { unit: "events", family: "count" }],
  ["award", { unit: "awards", family: "count" }],
  ["awards", { unit: "awards", family: "count" }],
  ["bus_stops", { unit: "bus_stops", family: "count" }],
  ["bus stops", { unit: "bus_stops", family: "count" }],
  ["dashboards", { unit: "dashboards", family: "count" }],
  ["datasets", { unit: "datasets", family: "data" }],
  ["devices", { unit: "devices", family: "count" }],
  ["distinct_values", { unit: "distinct_values", family: "data" }],
  ["downloads", { unit: "downloads", family: "count" }],
  ["hydrants", { unit: "hydrants", family: "count" }],
  ["locations", { unit: "locations", family: "count" }],
  ["plantings", { unit: "plantings", family: "count" }],
  ["poles", { unit: "poles", family: "count" }],
  ["programs", { unit: "programs", family: "count" }],
  ["ramps", { unit: "ramps", family: "count" }],
  ["signs", { unit: "signs", family: "count" }],
  ["surveys", { unit: "surveys", family: "engagement" }],
  ["teams", { unit: "teams", family: "count" }],
  ["trees", { unit: "trees", family: "count" }],
  ["arrests", { unit: "arrests", family: "enforcement" }],
  ["summons", { unit: "summonses", family: "enforcement" }],
  ["summonses", { unit: "summonses", family: "enforcement" }],
  ["c_summons", { unit: "criminal_summonses", family: "enforcement" }],
  ["criminal_summons", { unit: "criminal_summonses", family: "enforcement" }],
  ["warnings", { unit: "warnings", family: "enforcement" }],
  ["jobs", { unit: "jobs", family: "access" }],
  ["residents", { unit: "residents", family: "population" }],
  ["pedestrians", { unit: "pedestrians", family: "population" }],
  ["scientists", { unit: "scientists", family: "population" }],
  ["students", { unit: "students", family: "population" }],
  ["members", { unit: "members", family: "population" }],
  ["veterans", { unit: "veterans", family: "population" }],
  ["commuters", { unit: "commuters", family: "population" }],
  ["subscribers", { unit: "subscribers", family: "population" }],
  ["users", { unit: "users", family: "population" }],
  ["persons", { unit: "persons", family: "population" }],
  ["cyclists", { unit: "cyclists", family: "population" }],
  ["injuries", { unit: "injuries", family: "safety" }],
  ["fatalities", { unit: "fatalities", family: "safety" }],
  ["fatality", { unit: "fatalities", family: "safety" }],
  ["deaths", { unit: "fatalities", family: "safety" }],
  ["severe_injuries", { unit: "severe_injuries", family: "safety" }],
  ["assaults", { unit: "assaults", family: "safety" }],
  ["accidents", { unit: "accidents", family: "safety" }],
  ["fires", { unit: "fires", family: "safety" }],
  ["derailments", { unit: "derailments", family: "safety" }],
  ["crimes", { unit: "crimes", family: "safety" }],
  ["robberies", { unit: "robberies", family: "safety" }],
  ["collisions", { unit: "collisions", family: "safety" }],
  ["injuries_and_fatalities", { unit: "injuries_and_fatalities", family: "safety" }],
  ["fatalities_and_severe_injuries", { unit: "fatalities_and_severe_injuries", family: "safety" }],
  ["severe_injuries_or_deaths", { unit: "severe_injuries_or_deaths", family: "safety" }],
  ["motorists", { unit: "motorists_harmed", family: "safety" }],
  ["pedestrians_killed", { unit: "pedestrians_killed", family: "safety" }],
  ["pedestrians_severely_injured", { unit: "pedestrians_severely_injured", family: "safety" }],
  ["people_injured", { unit: "people_injured", family: "safety" }],
  ["people_severely_injured", { unit: "severe_injuries", family: "safety" }],
  ["people_killed", { unit: "people_killed", family: "safety" }],
  ["ksi", { unit: "killed_or_severely_injured", family: "safety" }],
  ["ksi_killed_or_severely_injured", { unit: "killed_or_severely_injured", family: "safety" }],
  ["injuries_per_year", { unit: "injuries_per_year", family: "safety_rate" }],
  ["collisions_per_million_vehicles", { unit: "collisions_per_million_vehicles", family: "safety_rate" }],
  ["collisions_per_million_miles", { unit: "collisions_per_million_miles", family: "safety_rate" }],
  ["collisions_per_vrm", { unit: "collisions_per_vehicle_revenue_mile", family: "safety_rate" }],
  ["injury_collisions_per_million_vehicles", { unit: "collisions_with_injury_per_million_vehicles", family: "safety_rate" }],
  ["collisions_with_injuries_per_million_vehicles", { unit: "collisions_with_injury_per_million_vehicles", family: "safety_rate" }],
  ["injuries_per_million_customers", { unit: "injuries_per_million_customers", family: "safety_rate" }],
  ["injuries_per_one_million_customers", { unit: "injuries_per_million_customers", family: "safety_rate" }],
  ["accidents_per_million_customers", { unit: "accidents_per_million_customers", family: "safety_rate" }],
  ["accidents_per_one_million_customers", { unit: "accidents_per_million_customers", family: "safety_rate" }],
  ["accidents_per_million_vehicles", { unit: "accidents_per_million_vehicles", family: "safety_rate" }],
  ["accidents_per_million_miles", { unit: "accidents_per_million_miles", family: "safety_rate" }],
  ["injuries_per_200_000_hours_worked", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_per_200_000_hours", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_per_200_000_work_hours", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_per_200_000_worker_hours", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_per_200_000_working_hours", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_per_vrm", { unit: "injuries_per_vehicle_revenue_mile", family: "safety_rate" }],
  ["injuries_per_million_vehicles", { unit: "injuries_per_million_vehicles", family: "safety_rate" }],
  ["injuries_per_week", { unit: "injuries_per_week", family: "safety_rate" }],
  ["accidents_per_200_000_hours_worked", { unit: "accidents_per_200000_hours_worked", family: "safety_rate" }],
  ["collisions_with_injury_per_million_vehicles", { unit: "collisions_with_injury_per_million_vehicles", family: "safety_rate" }],
  ["assaults_per_1m_rides", { unit: "assaults_per_million_rides", family: "safety_rate" }],
  ["assaults_per_vrm", { unit: "assaults_per_vehicle_revenue_mile", family: "safety_rate" }],
  ["fatalities_per_vrm", { unit: "fatalities_per_vehicle_revenue_mile", family: "safety_rate" }],
  ["ksi_per_mile", { unit: "ksi_per_mile", family: "safety_rate" }],
  ["ksi_mile", { unit: "ksi_per_mile", family: "safety_rate" }],
  ["pedestrians_ksi_per_mile", { unit: "pedestrian_ksi_per_mile", family: "safety_rate" }],
  ["people_per_mile", { unit: "ksi_per_mile", family: "safety_rate" }],
  ["major_crimes_per_million_customers", { unit: "major_crimes_per_million_customers", family: "safety_rate" }],
  ["crimes_per_million_rides", { unit: "crimes_per_million_rides", family: "safety_rate" }],
  ["collisions_per_one_million_vehicles", { unit: "collisions_per_million_vehicles", family: "safety_rate" }],
  ["injuries_per_200000_hours_worked", { unit: "injuries_per_200000_hours_worked", family: "safety_rate" }],
  ["injuries_month", { unit: "injuries_per_month", family: "safety_rate" }],
  ["incident_rate", { unit: "incident_rate", family: "safety_rate" }],
  ["accidents_per_100_employees", { unit: "accidents_per_100_employees", family: "safety_rate" }],
  ["crashes", { unit: "crashes", family: "safety" }],
  ["incidents_per_million_vehicles", { unit: "incidents_per_million_vehicles", family: "count_rate" }],
  ["incidents_per_million_customers", { unit: "incidents_per_million_customers", family: "count_rate" }],
  ["incidents_per_million_miles", { unit: "incidents_per_million_miles", family: "count_rate" }],
  ["felonies_per_day", { unit: "felonies_per_day", family: "count_rate" }],
  ["major_felonies_per_day", { unit: "felonies_per_day", family: "count_rate" }],
  ["incidents_per_day", { unit: "incidents_per_day", family: "count_rate" }],
  ["count_per_day", { unit: "count_per_day", family: "count_rate" }],
  ["crimes_per_day", { unit: "crimes_per_day", family: "count_rate" }],
  ["incidents_per_month", { unit: "incidents_per_month", family: "count_rate" }],
  ["interactions_per_month", { unit: "interactions_per_month", family: "count_rate" }],
  ["events_per_vrm", { unit: "events_per_vehicle_revenue_mile", family: "count_rate" }],
  ["incidents_per_200_000_work_hours", { unit: "incidents_per_200000_hours_worked", family: "count_rate" }],
  ["incidents_per_200_000_hours", { unit: "incidents_per_200000_hours_worked", family: "count_rate" }],
  ["incidents_per_200_000_hours_worked", { unit: "incidents_per_200000_hours_worked", family: "count_rate" }],
  ["incidents_per_200_000_working_hours", { unit: "incidents_per_200000_hours_worked", family: "count_rate" }],
  ["per_million_customers", { unit: "per_million_customers", family: "rate" }],
  ["per_one_million_customers", { unit: "per_million_customers", family: "rate" }],
  ["per_1_million_customers", { unit: "per_million_customers", family: "rate" }],
  ["per_1m_customers", { unit: "per_million_customers", family: "rate" }],
  ["per_million_vehicles", { unit: "per_million_vehicles", family: "rate" }],
  ["per_one_million_vehicles", { unit: "per_million_vehicles", family: "rate" }],
  ["per_1_million_vehicles", { unit: "per_million_vehicles", family: "rate" }],
  ["rate_per_million_vehicles", { unit: "per_million_vehicles", family: "rate" }],
  ["per_1_000_residents", { unit: "per_1000_residents", family: "rate" }],
  ["per_1_million", { unit: "per_million", family: "rate" }],
  ["per_million", { unit: "per_million", family: "rate" }],
  ["per_million_miles", { unit: "per_million_miles", family: "rate" }],
  ["per_200_000_hours_worked", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200_000_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200_000_work_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200_000_worker_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200_000_working_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200k_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200000_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_200000_working_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["rate_per_200_000_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["rate_per_200_000_work_hours", { unit: "per_200000_hours_worked", family: "rate" }],
  ["rate_per_200_000_hours_worked", { unit: "per_200000_hours_worked", family: "rate" }],
  ["per_100_employees", { unit: "per_100_employees", family: "rate" }],
  ["intersections", { unit: "intersections", family: "count" }],
  ["intersections_per_year", { unit: "intersections_per_year", family: "count_rate" }],
  ["activities_per_month", { unit: "activities_per_month", family: "count_rate" }],
  ["applications_per_month", { unit: "applications_per_month", family: "count_rate" }],
  ["awards_per_year", { unit: "awards_per_year", family: "count_rate" }],
  ["calls_per_month", { unit: "calls_per_month", family: "count_rate" }],
  ["cars_per_12_hours", { unit: "cars_per_12_hours", family: "count_rate" }],
  ["completions_per_year", { unit: "completions_per_year", family: "count_rate" }],
  ["downloads_week", { unit: "downloads_per_week", family: "count_rate" }],
  ["locations_per_week", { unit: "locations_per_week", family: "count_rate" }],
  ["requests_per_month", { unit: "requests_per_month", family: "count_rate" }],
  ["rows_per_day", { unit: "rows_per_day", family: "count_rate" }],
  ["spaces_per_hour", { unit: "spaces_per_hour", family: "count_rate" }],
  ["stations_per_month", { unit: "stations_per_month", family: "count_rate" }],
  ["summons_per_quarter", { unit: "summonses_per_quarter", family: "count_rate" }],
  ["taps_per_day", { unit: "taps_per_day", family: "count_rate" }],
  ["track_outages_per_year", { unit: "track_outages_per_year", family: "count_rate" }],
  ["trains_per_day", { unit: "trains_per_day", family: "count_rate" }],
  ["trains_per_peak_period", { unit: "trains_per_peak_period", family: "count_rate" }],
  ["trains_per_week", { unit: "trains_per_week", family: "count_rate" }],
  ["transfers_per_day", { unit: "transfers_per_day", family: "count_rate" }],
  ["blocks", { unit: "blocks", family: "count" }],
  ["buses", { unit: "buses", family: "count" }],
  ["corridors", { unit: "corridors", family: "count" }],
  ["proposers", { unit: "proposers", family: "count" }],
  ["proposals", { unit: "proposals", family: "count" }],
  ["recommendations", { unit: "recommendations", family: "count" }],
  ["remarketing_agents", { unit: "remarketing_agents", family: "count" }],
  ["scenarios", { unit: "scenarios", family: "count" }],
  ["seats", { unit: "seats", family: "count" }],
  ["service_updates", { unit: "service_updates", family: "count" }],
  ["shops_and_yards", { unit: "shops_and_yards", family: "count" }],
  ["sites", { unit: "sites", family: "count" }],
  ["submissions", { unit: "submissions", family: "count" }],
  ["time_periods", { unit: "time_periods", family: "count" }],
  ["transports", { unit: "transports", family: "count" }],
  ["venues", { unit: "venues", family: "count" }],
  ["work_plans", { unit: "work_plans", family: "count" }],
  ["zones", { unit: "zones", family: "count" }],
  ["attendees", { unit: "attendees", family: "engagement" }],
  ["respondents", { unit: "respondents", family: "engagement" }],
  ["votes", { unit: "votes", family: "engagement" }],
  ["comments", { unit: "comments", family: "engagement" }],
  ["contacts", { unit: "contacts", family: "engagement" }],
  ["in_person_contacts", { unit: "contacts", family: "engagement" }],
  ["interactions", { unit: "interactions", family: "engagement" }],
  ["impressions", { unit: "impressions", family: "engagement" }],
  ["m_impressions", { unit: "impressions", family: "engagement", scale: 1_000_000 }],
  ["m_engagements", { unit: "engagements", family: "engagement", scale: 1_000_000 }],
  ["followers", { unit: "followers", family: "engagement" }],
  ["engagements", { unit: "engagements", family: "engagement" }],
  ["speakers", { unit: "speakers", family: "engagement" }],
  ["views", { unit: "views", family: "engagement" }],
  ["enrollees", { unit: "enrollees", family: "participation" }],
  ["participants", { unit: "participants", family: "participation" }],
  ["registrants", { unit: "registrants", family: "participation" }],
  ["data assets", { unit: "data_assets", family: "data" }],
  ["hours", { unit: "hours", family: "duration" }],
  ["person_hours", { unit: "person_hours", family: "duration" }],
  ["weeks", { unit: "weeks", family: "duration" }],
  ["workdays", { unit: "workdays", family: "duration" }],
  ["business_days", { unit: "business_days", family: "duration" }],
  ["calendar_days", { unit: "calendar_days", family: "duration" }],
  ["hours_per_day", { unit: "hours_per_day", family: "duration_rate" }],
  ["hours_per_weekday", { unit: "hours_per_weekday", family: "duration_rate" }],
  ["years", { unit: "years", family: "duration" }],
  ["months", { unit: "months", family: "duration" }],
  ["month", { unit: "months", family: "duration" }],
  ["days", { unit: "days", family: "duration" }],
  ["min", { unit: "minutes", family: "duration" }],
  ["days_per_year", { unit: "days_per_year", family: "duration_rate" }],
  ["days_per_employee", { unit: "days_per_employee", family: "duration_rate" }],
  ["days_per_injury", { unit: "days_per_injury", family: "duration_rate" }],
  ["minutes_per_day", { unit: "minutes_per_day", family: "duration_rate" }],
  ["no_shows_per_trip", { unit: "no_shows_per_trip", family: "rate" }],
  ["inches_per_hour", { unit: "inches_per_hour", family: "rate" }],
  ["million", { unit: "million", family: "scale", scale: 1_000_000 }],
  ["million_riders", { unit: "riders", family: "ridership", scale: 1_000_000 }],
  ["thousand", { unit: "thousand", family: "scale", scale: 1_000 }],
  ["1_10_scale", { unit: "score_1_to_10", family: "rating" }],
  ["1-10 scale", { unit: "score_1_to_10", family: "rating" }],
  ["stars", { unit: "stars", family: "rating" }],
  ["rank", { unit: "rank", family: "rating" }],
  ["ranking", { unit: "rank", family: "rating" }],
  ["percentile", { unit: "percentile", family: "rating" }],
  ["star_rating", { unit: "stars", family: "rating" }],
  ["scale", { unit: "score", family: "rating" }],
  ["scale_1_10", { unit: "score_1_to_10", family: "rating" }],
  ["score_1_10", { unit: "score_1_to_10", family: "rating" }],
  ["score_1_to_10", { unit: "score_1_to_10", family: "rating" }],
  ["load_factor", { unit: "load_factor", family: "ratio" }],
  ["bps", { unit: "basis_points", family: "percentage" }],
  ["percent_per_year", { unit: "percent_per_year", family: "rate" }],
  ["decimal_fraction", { unit: "fraction", family: "ratio" }],
  ["fraction", { unit: "fraction", family: "ratio" }],
  ["times_more_likely", { unit: "times_more_likely", family: "ratio" }],
  ["multiples", { unit: "multiple", family: "ratio" }],
  ["per 1,000 trips", { unit: "per_1000_trips", family: "rate" }],
  ["per_1_000_trips", { unit: "per_1000_trips", family: "rate" }],
  ["per_1000_trips", { unit: "per_1000_trips", family: "rate" }],
  ["per_1_000_scheduled_trips", { unit: "per_1000_scheduled_trips", family: "rate" }],
  ["percent_of_prepandemic", { unit: "percent", family: "percentage" }],
  ["percent_of_gross_sales", { unit: "percent", family: "percentage" }],
  ["percent_point_increase", { unit: "percentage_point", family: "percentage" }],
  ["percent_improvement", { unit: "percent", family: "percentage" }],
  ["percent_reduction", { unit: "percent", family: "percentage" }],
  ["percentage_points", { unit: "percentage_point", family: "percentage" }],
  ["percentage", { unit: "percent", family: "percentage" }],
  ["% of 2019", { unit: "percent_of_2019", family: "percentage" }],
  ["% of jan 2017 baseline", { unit: "percent_of_jan_2017_baseline", family: "percentage" }],
  ["normalized_index", { unit: "index", family: "scale" }],
  ["index_points", { unit: "index_points", family: "scale" }],
  ["cpi_index_points", { unit: "cpi_index_points", family: "scale" }],
  ["cpi_u_index", { unit: "cpi_u_index", family: "scale" }],
  ["cpi_u", { unit: "cpi_u_index", family: "scale" }],
  ["index", { unit: "index", family: "scale" }],
  ["ratio", { unit: "ratio", family: "ratio" }],
  ["proportion", { unit: "proportion", family: "ratio" }],
  ["times", { unit: "times", family: "frequency" }],
  ["trains_per_hour", { unit: "trains_per_hour", family: "frequency" }],
  ["vehicles_per_day", { unit: "vehicles_per_day", family: "count_rate" }],
  ["vehicles_day", { unit: "vehicles_per_day", family: "count_rate" }],
  ["vehicles_per_hour", { unit: "vehicles_per_hour", family: "count_rate" }],
  ["vehicles_per_weekday", { unit: "vehicles_per_weekday", family: "count_rate" }],
  ["vehicles_per_quarter", { unit: "vehicles_per_quarter", family: "count_rate" }],
  ["vehicles_per_direction", { unit: "vehicles_per_direction", family: "count_rate" }],
  ["vehicles_per_year", { unit: "vehicles_per_year", family: "count_rate" }],
  ["seats_per_car", { unit: "seats_per_car", family: "count_rate" }],
  ["transactions_per_quarter", { unit: "transactions_per_quarter", family: "count_rate" }],
  ["trucks_per_day", { unit: "trucks_per_day", family: "count_rate" }],
  ["buses_per_day", { unit: "buses_per_day", family: "count_rate" }],
  ["buses_per_hour", { unit: "buses_per_hour", family: "count_rate" }],
  ["buses_per_peak_hour", { unit: "buses_per_peak_hour", family: "count_rate" }],
  ["buses_per_weekday", { unit: "buses_per_weekday", family: "count_rate" }],
  ["buses_per_direction_daily", { unit: "buses_per_direction_per_day", family: "count_rate" }],
  ["buses_per_direction_per_day", { unit: "buses_per_direction_per_day", family: "count_rate" }],
  ["buses_per_hour_per_direction", { unit: "buses_per_hour_per_direction", family: "count_rate" }],
  ["pedestrians_per_hour", { unit: "pedestrians_per_hour", family: "count_rate" }],
  ["pedestrians_hour", { unit: "pedestrians_per_hour", family: "count_rate" }],
  ["movements_per_hour", { unit: "movements_per_hour", family: "count_rate" }],
  ["bus_trips_per_peak_hour", { unit: "bus_trips_per_peak_hour", family: "count_rate" }],
  ["bus_trips_per_day", { unit: "bus_trips_per_day", family: "count_rate" }],
  ["pedestrians_per_hour_per_block", { unit: "pedestrians_per_hour_per_block", family: "count_rate" }],
  ["cyclists_per_12_hours", { unit: "cyclists_per_12_hours", family: "count_rate" }],
  ["cyclists_per_12_hour_weekday", { unit: "cyclists_per_12_hour_weekday", family: "count_rate" }],
  ["customers_per_day", { unit: "riders_per_day", family: "ridership" }],
  ["customers_day", { unit: "riders_per_day", family: "ridership" }],
  ["customers_per_weekend_day", { unit: "riders_per_weekend_day", family: "ridership" }],
  ["customers_per_weekday", { unit: "riders_per_weekday", family: "ridership" }],
  ["passengers_per_year", { unit: "riders_per_year", family: "ridership" }],
  ["passengers_day", { unit: "riders_per_day", family: "ridership" }],
  ["people_per_day", { unit: "riders_per_day", family: "ridership" }],
  ["people_per_weekday", { unit: "riders_per_weekday", family: "ridership" }],
  ["riders_per_peak_hour", { unit: "riders_per_peak_hour", family: "ridership" }],
  ["riders_per_half_hour", { unit: "riders_per_half_hour", family: "ridership" }],
  ["riders_per_car", { unit: "riders_per_car", family: "ridership" }],
  ["passengers_per_car", { unit: "riders_per_car", family: "ridership" }],
  ["thousands_of_riders", { unit: "riders", family: "ridership", scale: 1_000 }],
  ["thousand_riders", { unit: "riders", family: "ridership", scale: 1_000 }],
  ["thousand_trips", { unit: "trips", family: "ridership", scale: 1_000 }],
  ["alightings", { unit: "alightings", family: "ridership" }],
  ["daily_bus_riders", { unit: "riders_per_day", family: "ridership" }],
  ["daily_ridership", { unit: "riders_per_day", family: "ridership" }],
  ["visitors_per_year", { unit: "visitors_per_year", family: "visitor_count" }],
]);

const METRIC_DIMENSION_FIELDS = [
  "direction",
  "day_type",
  "mode",
  "scenario",
  "demographic_group",
  "comparison",
  "time_period",
  "service_type",
] as const;

const METRIC_UNIT_ALIAS_FIELDS = ["units", "value_unit"] as const;

const METRIC_DIMENSION_ALIASES = new Map<string, string>([
  ["am_peak", "am_peak"],
  ["average_weekday", "weekday"],
  ["bus", "bus"],
  ["buses", "bus"],
  ["eastbound", "eastbound"],
  ["eb", "eastbound"],
  ["evening_peak", "pm_peak"],
  ["local_bus", "local_bus"],
  ["nb", "northbound"],
  ["northbound", "northbound"],
  ["off_peak", "off_peak"],
  ["peak", "peak"],
  ["pm_peak", "pm_peak"],
  ["rush_hour", "peak"],
  ["sb", "southbound"],
  ["southbound", "southbound"],
  ["weekday", "weekday"],
  ["weekdays", "weekday"],
  ["weekend", "weekend"],
  ["weekends", "weekend"],
  ["westbound", "westbound"],
  ["wb", "westbound"],
]);

function normalizeUnit(value: string): JsonObject {
  const raw = value.trim();
  const match = UNIT_ALIASES.get(raw.toLowerCase()) ?? UNIT_ALIASES.get(normalizedToken(raw));
  if (!match) {
    return {
      raw_text: raw,
      normalized_unit: normalizedToken(raw) || raw,
      unit_family: "other",
    };
  }

  return {
    raw_text: raw,
    normalized_unit: match.unit,
    unit_family: match.family,
    ...(match.scale ? { scale: match.scale } : {}),
  };
}

function payloadHasMoneyEvidence(payload: JsonObject): boolean {
  if (typeof payload.currency === "string" && payload.currency.trim().toUpperCase() === "USD") return true;
  return [payload.raw_value_text, payload.description, payload.category]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => /(?:\$|\bUSD\b|\bdollars?\b)/iu.test(value));
}

function payloadHasRidershipEvidence(payload: JsonObject): boolean {
  return /(^|[\s_])((monthly|daily|annual|weekday|weekend|event|average)_)?(ridership|riders|passengers|passenger_trips|boardings|alightings|trips|paid_customers|revenue_passengers)($|[\s_])/u.test(
    normalizedHaystack(payload, ["metric_name", "description", "category", "label"]),
  );
}

function scaleOnlyMoneyUnitFromPayload(rawUnit: string, normalizedUnit: JsonObject, payload: JsonObject): JsonObject | undefined {
  if (normalizedUnit.unit_family !== "other") return undefined;

  const raw = rawUnit.trim();
  const scale =
    raw === "M" || raw.toLowerCase() === "millions" ? 1_000_000 : raw === "B" ? 1_000_000_000 : raw.toLowerCase() === "thousands" ? 1_000 : undefined;
  if (scale === undefined) return undefined;

  return payloadHasMoneyEvidence(payload) ? { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale } : undefined;
}

const SCALE_ONLY_FINANCE_METRIC_SIGNALS = [
  "assets",
  "capital_program",
  "cash",
  "debt",
  "deficit",
  "expense",
  "expenses",
  "fare_revenue",
  "farebox",
  "gross_subsidies",
  "income",
  "labor",
  "liabilities",
  "loss",
  "losses_and_lae",
  "mass_transit",
  "net_position",
  "revenue",
  "subsidies",
  "subsidy",
  "surplus",
  "tax_receipts",
  "wage",
] as const;

function scaleOnlyContextUnitFromPayload(rawUnit: string, normalizedUnit: JsonObject, payload: JsonObject): JsonObject | undefined {
  if (normalizedUnit.unit_family !== "other") return undefined;

  const raw = rawUnit.trim();
  const key = raw.toLowerCase();
  const scale = key === "millions" ? 1_000_000 : key === "thousands" ? 1_000 : undefined;
  if (scale === undefined) return undefined;

  const metricHay = normalizedHaystack(payload, ["metric_name"]);
  const contextHay = normalizedHaystack(payload, ["metric_name", "description", "category", "label", "scope", "entity"]);

  if (hasAny(metricHay, ["traffic_volume", "total_traffic_volume"]) && hasAny(contextHay, ["mta_bridges_and_tunnels", "bridges_and_tunnels"])) {
    return { raw_text: raw, normalized_unit: "vehicle_crossings", unit_family: "count", scale };
  }
  if (metricHay === "traffic" && hasAny(contextHay, ["mta_bridges_and_tunnels", "bridges_and_tunnels"])) {
    return { raw_text: raw, normalized_unit: "vehicle_crossings", unit_family: "count", scale };
  }

  if (key === "thousands" && metricHay === "customers_gated") {
    return { raw_text: raw, normalized_unit: "customers", unit_family: "count", scale };
  }

  if (key === "thousands" && hasAny(contextHay, ["novis", "notice_of_violation", "notices_of_violation", "warning", "warnings"])) {
    return {
      raw_text: raw,
      normalized_unit: hasAny(contextHay, ["warning", "warnings"]) ? "warnings" : "notices_of_violation",
      unit_family: "count",
      scale,
    };
  }

  if (hasAny(metricHay, SCALE_ONLY_FINANCE_METRIC_SIGNALS)) {
    return { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale };
  }
  if (metricHay === "variance" && hasAny(contextHay, ["debt_service", "subsidies", "expenses", "revenue"])) {
    return { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale };
  }

  return undefined;
}

function ridershipUnitFromPayload(rawUnit: string, normalizedUnit: JsonObject, payload: JsonObject): JsonObject | undefined {
  const raw = rawUnit.trim();
  const key = raw.toLowerCase();
  const canOverride = normalizedUnit.unit_family === "other" || (key === "customers" && normalizedUnit.unit_family === "count");
  if (!canOverride || !payloadHasRidershipEvidence(payload)) return undefined;

  if (key === "millions") return { raw_text: raw, normalized_unit: "riders", unit_family: "ridership", scale: 1_000_000 };
  if (key === "thousands") return { raw_text: raw, normalized_unit: "riders", unit_family: "ridership", scale: 1_000 };
  if (key === "customers") return { raw_text: raw, normalized_unit: "riders", unit_family: "ridership" };
  return undefined;
}

function moneyRateUnitFromPayload(rawUnit: string, normalizedUnit: JsonObject, payload: JsonObject): JsonObject | undefined {
  if (normalizedUnit.unit_family !== "other" || !payloadHasMoneyEvidence(payload)) return undefined;

  const raw = rawUnit.trim();
  const unit =
    normalizedToken(raw) === "per_annum"
      ? "dollars_per_year"
      : normalizedToken(raw) === "per_month"
        ? "dollars_per_month"
        : normalizedToken(raw) === "per_square_foot"
          ? "dollars_per_square_foot"
          : undefined;
  return unit ? { raw_text: raw, normalized_unit: unit, unit_family: "money_rate" } : undefined;
}

function contextualOtherMetricUnitFromPayload(rawUnit: string, normalizedUnit: JsonObject, payload: JsonObject): JsonObject | undefined {
  if (normalizedUnit.unit_family !== "other") return undefined;

  const raw = rawUnit.trim();
  const key = normalizedToken(raw);
  const metricHay = normalizedHaystack(payload, ["metric_name"]);
  const contextHay = normalizedHaystack(payload, ["metric_name", "description", "category", "label", "scope", "entity", "raw_value_text"]);

  if (hasAnyToken(metricHay, ["employment"]) && ["thousands", "thousand_jobs", "millions_of_jobs"].includes(key)) {
    return {
      raw_text: raw,
      normalized_unit: "jobs",
      unit_family: "access",
      scale: key === "millions_of_jobs" ? 1_000_000 : 1_000,
    };
  }

  if (key === "rate" && ["lost_time_injury_rate", "lost_time_incident_rate", "total_recordable_incident_rate"].includes(metricHay)) {
    return { raw_text: raw, normalized_unit: metricHay, unit_family: "safety_rate" };
  }

  if (key === "individuals" && metricHay === "tracks_program_outreach" && hasAny(contextHay, ["individuals", "outreach", "reached", "tracks_program"])) {
    return { raw_text: raw, normalized_unit: "people", unit_family: "population" };
  }

  if (key === "2027_m" && metricHay === "cost_per_daily_rider" && payloadHasMoneyEvidence(payload) && hasAny(contextHay, ["second_avenue_subway_phase_2"])) {
    return { raw_text: raw, normalized_unit: "dollars_per_average_daily_rider", unit_family: "money_rate" };
  }

  if (key === "billions" && hasAny(metricHay, ["funding"]) && hasAny(contextHay, ["funding", "relief", "fta", "federal"])) {
    return { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale: 1_000_000_000 };
  }

  if (key === "uillions" && hasAny(metricHay, SCALE_ONLY_FINANCE_METRIC_SIGNALS)) {
    return { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale: 1_000_000 };
  }

  if (key === "million_dollars_wait_the_table_shows_amounts_in_millions_let_me_re_read" && hasAny(metricHay, SCALE_ONLY_FINANCE_METRIC_SIGNALS)) {
    return { raw_text: raw, normalized_unit: "dollars", unit_family: "money", scale: 1_000_000 };
  }

  if (key === "crossings_per_hour" && hasAny(metricHay, ["pedestrian_crossings"])) {
    return { raw_text: raw, normalized_unit: "pedestrians_per_hour", unit_family: "count_rate" };
  }

  if (key === "daily_crossings" && hasAny(contextHay, ["mta_bridges_and_tunnels", "bridges_and_tunnels"])) {
    return { raw_text: raw, normalized_unit: "vehicle_crossings_per_day", unit_family: "count_rate" };
  }

  if (key === "per_1m_riders" && hasAny(metricHay, ["major_felonies"])) {
    return { raw_text: raw, normalized_unit: "felonies_per_million_riders", unit_family: "safety_rate" };
  }

  if (key === "weekends" && hasAny(metricHay, ["above_baseline_count", "count"])) {
    return { raw_text: raw, normalized_unit: "weekends", unit_family: "count" };
  }

  if (key === "year" && hasAny(metricHay, ["agreement_term", "license_term"]) && hasAny(contextHay, ["agreement", "license", "term"])) {
    return { raw_text: raw, normalized_unit: "years", unit_family: "duration" };
  }

  if (key === "x" && hasAny(metricHay, ["market_share_change"])) {
    return { raw_text: raw, normalized_unit: "multiple", unit_family: "ratio" };
  }

  return undefined;
}

function normalizeMetricDimensionValue(value: string): JsonObject {
  const raw = value.trim();
  const key = normalizedToken(raw);
  return {
    raw_text: raw,
    normalized_value: METRIC_DIMENSION_ALIASES.get(key) ?? key,
  };
}

function normalizeMetricDimensionFields(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  for (const field of METRIC_DIMENSION_FIELDS) {
    const value = payload[field];
    const normalizedKey = `${field}_normalized`;
    if (typeof value === "string" && value.trim()) {
      addIfMissing(next, normalizedKey, normalizeMetricDimensionValue(value));
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      addIfMissing(next, normalizedKey, value.map((item) => normalizeMetricDimensionValue(item as string)) as JsonValue);
    }
  }
  return next;
}

// ---- C4 cost & service-delivery companions (S2.1) -------------------------------------------
// Derived from existing metric signals only (no new raw fields, no overwrite of literals). The
// board-book OCR tranche supplies the density; on today's corpus these fire only on strong
// signals. Taxonomies are open and C5-governed (zero CHECK enums this step).

const COST_SIGNAL = ["cost", "capital", "operating", "budget", "expenditure", "capex", "opex", "funding", "funded", "revenue", "subsidy", "fare_revenue"] as const;
const CAPITAL_SIGNAL = ["capital", "capex", "construction", "infrastructure"] as const;
const OPERATING_SIGNAL = ["operating", "opex", "operation", "maintenance"] as const;

function unitFamily(payload: JsonObject): string {
  const unitNormalized = payload.unit_normalized;
  return unitNormalized && typeof unitNormalized === "object" && !Array.isArray(unitNormalized) && typeof unitNormalized.unit_family === "string"
    ? unitNormalized.unit_family
    : "";
}

/** Cost/funding companions are dimensions of *cost* metrics (parent plan C4: metric_family = cost).
 *  Gate on a money unit family or an explicit cost keyword so they never fire on a metric merely
 *  scoped to a place ("NYC") or measured per day — that conflation is what made them noise. */
function isCostMetric(payload: JsonObject): boolean {
  const family = unitFamily(payload);
  if (family === "money" || family === "money_rate") return true;
  return hasAny(normalizedHaystack(payload, ["metric_name", "category", "label", "description"]), COST_SIGNAL);
}

function deriveCostType(payload: JsonObject): string | undefined {
  if (!isCostMetric(payload)) return undefined;
  const hay = normalizedHaystack(payload, ["metric_name", "category", "label", "description", "unit"]);
  if (hasAny(hay, CAPITAL_SIGNAL)) return "capital";
  if (hasAny(hay, OPERATING_SIGNAL)) return "operating";
  return undefined; // a cost metric whose type is unclear → left for the board-book extractor
}

function deriveFundingSource(payload: JsonObject): string | undefined {
  if (!isCostMetric(payload)) return undefined;
  const hay = normalizedHaystack(payload, ["metric_name", "scope", "source_system", "category", "label", "description", "funding_source"]);
  if (hasAny(hay, ["federal", "fta", "usdot", "tiger", "raise_grant"])) return "federal";
  if (hasAny(hay, ["new_york_state", "nys", "nysdot", "albany", "state_funded", "state_grant"])) return "state";
  if (hasAny(hay, ["municipal", "city_funded", "city_capital", "council"])) return "city";
  if (hasAny(hay, ["grant", "philanthrop", "foundation"])) return "grant";
  if (hasAny(hay, ["mta", "nyct", "transit_authority"])) return "mta";
  return undefined;
}

function deriveTimeHorizon(payload: JsonObject): string | undefined {
  if (!isCostMetric(payload)) return undefined;
  const hay = normalizedHaystack(payload, ["period", "time_period", "unit", "metric_name", "frequency", "time_horizon"]);
  if (hasAny(hay, ["per_year", "annual", "yearly", "per_annum", "annually"])) return "annual";
  if (hasAny(hay, ["multi_year", "multiyear", "five_year", "ten_year", "capital_program"])) return "multi_year";
  if (hasAny(hay, ["one_time", "onetime", "total_project", "lifetime", "upfront"])) return "one_time";
  return undefined;
}

const RATE_UNIT_FAMILIES = new Set(["money_rate", "safety_rate", "count_rate", "duration_rate", "rate"]);

function deriveBenefitDenominatorStated(payload: JsonObject): string | undefined {
  if (!isCostMetric(payload)) return undefined;
  const hay = normalizedHaystack(payload, ["unit", "metric_name"]);
  if (RATE_UNIT_FAMILIES.has(unitFamily(payload)) || hasAny(hay, ["per_capita", "per_rider", "per_trip", "per_passenger", "per_mile", "per_violation"])) {
    return "stated";
  }
  return undefined; // mechanism only — "not_stated" on every non-rate row would be noise
}

function deriveCauseAttribution(payload: JsonObject): string | undefined {
  const hay = normalizedHaystack(payload, ["metric_name", "category", "label", "description", "cause_attribution", "reason"]);
  if (!hay) return undefined;
  if (hasAny(hay, ["no_operator", "missing_operator", "crew_availability", "operator_availability", "open_run"])) return "no_operator";
  if (hasAny(hay, ["no_vehicle", "equipment", "vehicle_availability", "bus_availability", "no_bus"])) return "no_vehicle";
  return undefined;
}

function normalizeMetricCostCompanions(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  addIfMissing(next, "cost_type", deriveCostType(payload));
  addIfMissing(next, "funding_source", deriveFundingSource(payload));
  addIfMissing(next, "time_horizon", deriveTimeHorizon(payload));
  addIfMissing(next, "benefit_denominator_stated", deriveBenefitDenominatorStated(payload));
  addIfMissing(next, "cause_attribution", deriveCauseAttribution(payload));
  return next;
}

// Socrata data-dictionary top-value histograms; values count matching dataset rows.
const EXACT_MISSING_DATA_DICTIONARY_ROW_COUNT_METRICS = new Set<string>([
  "TrafDir_A_count",
  "TrafDir_T_count",
  "TrafDir_W_count",
  "boro_count_BK",
  "boro_count_BX",
  "boro_count_BX_MN",
  "boro_count_MAN",
  "boro_count_QNS",
  "boro_count_SI",
  "days_count_7",
  "direction_count_EB",
  "direction_count_NB",
  "direction_count_SB",
  "direction_count_WB",
  "hours_count_24",
  "lane_color_count_Red",
  "lane_type_count_Curbside",
  "lane_type_count_Offset",
  "lane_type1_count_BusLane",
  "lane_type1_count_SharedLane",
  "lane_width_count_Double",
  "lane_width_count_Single",
  "sbs_route1_count_BX41",
  "sbs_route1_count_M15",
  "sbs_route1_count_Q52",
  "sbs_route1_count_S79",
]);

const EXACT_MISSING_TRAFFIC_CROSSING_COUNT_METRICS = new Set<string>([
  "ezpass_traffic",
  "paid_traffic_volume",
  "tolls_by_mail_traffic",
  "total_paid_traffic",
]);

const EXACT_MISSING_COUNT_METRIC_UNITS = new Map<string, string>([
  ["ac_roadcalls", "roadcalls"],
  ["ada_ramps_count", "ramps"],
  ["additional_trains_operated", "trains"],
  ["audit_claims", "claims"],
  ["audit_contract_close_outs", "closeouts"],
  ["audit_contracts_completed", "contracts"],
  ["audit_findings", "findings"],
  ["audit_findings_identified", "findings"],
  ["audit_findings_with_recommendations", "findings"],
  ["audit_overhead_reviews", "reviews"],
  ["audit_pre_award_reviews", "reviews"],
  ["audible_pedestrian_turn_warning_systems_installed", "systems"],
  ["assault_count", "count"],
  ["assaults_on_transit_workers", "incidents"],
  ["audit_projects_completed", "projects"],
  ["avps_signs_count", "signs"],
  ["bathrooms_count", "bathrooms"],
  ["bridge_strikes", "bridge_strikes"],
  ["branches_above_otp_goal", "branches"],
  ["budgeted_resources", "resources"],
  ["business_survey_count", "businesses"],
  ["bus_count", "buses"],
  ["bus_route_count", "routes"],
  ["bus_stops_removed", "stops"],
  ["burglary_count", "incidents"],
  ["cancellations_and_terminations", "cancellations_and_terminations"],
  ["capital_project_audit_reviews", "reviews"],
  ["care_program_requests", "requests"],
  ["cases_adjudicated", "cases"],
  ["completed_audits", "audits"],
  ["completions_count", "completions"],
  ["compliance_site_visits", "visits"],
  ["complaint_bases_count", "bases"],
  ["contracts_closed_compliance", "contracts"],
  ["contracts_monitored_compliance", "contracts"],
  ["contracts_with_dbe_goals", "contracts"],
  ["control_assessments_results", "assessments"],
  ["controlled_self_assessments", "assessments"],
  ["controlled_self_assessments_failed", "assessments"],
  ["control_self_assessments_completed", "assessments"],
  ["control_self_assessments_failed", "assessments"],
  ["control_self_assessments_passed", "assessments"],
  ["contract_audit_projects_completed", "projects"],
  ["corridors_analyzed", "corridors"],
  ["corridors_selected_for_bus_priority", "corridors"],
  ["customer_count", "customers"],
  ["customer_stations_count", "stations"],
  ["customers_benefited", "customers"],
  ["cvm_installations", "cvms"],
  ["cvm_planned", "cvms"],
  ["data stewards identified", "data_stewards"],
  ["dbe_applications_received", "applications"],
  ["dbe_firms_certified", "firms"],
  ["dbe_new_applications", "applications"],
  ["direct_payments", "payments"],
  ["direct_payments_regular_count", "payments"],
  ["downloads of most popular dataset (Daily Ridership)", "downloads"],
  ["eeo_complaint_bases", "bases"],
  ["elevator_count", "elevators"],
  ["elevators_count", "elevators"],
  ["elevators_under_rehabilitation", "elevators"],
  ["enrolled_firms", "firms"],
  ["enforcement_operations", "operations"],
  ["enforcement_vehicles_towed", "vehicles"],
  ["equipment_count", "equipment_items"],
  ["enterprise_risk_changes", "changes"],
  ["escalators_count", "escalators"],
  ["estimated_annual_transponder_volume", "transponders"],
  ["events_held", "events"],
  ["existing_routes", "routes"],
  ["express_bus_route_count", "routes"],
  ["express_bus_routes", "routes"],
  ["express_routes", "routes"],
  ["federally_funded_contracts", "contracts"],
  ["felonies_in_major_crime_categories", "felonies"],
  ["felony_assault_count", "incidents"],
  ["felony_assault", "incidents"],
  ["firms_interested_doing_business", "firms"],
  ["firms_selected", "firms"],
  ["first_responders_trained", "first_responders"],
  ["fleet_preventative_maintenance_inspections", "inspections"],
  ["frequent_route_counts", "routes"],
  ["friction_pads_installed", "pads"],
  ["gate_guard_stations", "stations"],
  ["gct_accessibility_requests", "requests"],
  ["grade_crossing_incidents", "incidents"],
  ["grand_larceny", "incidents"],
  ["grand_larceny_count", "incidents"],
  ["grand_larceny_incidents", "incidents"],
  ["hate_crime_by_crime_count", "incidents"],
  ["hate_crime_by_crime_name", "incidents"],
  ["hate_crime_count_by_crime", "incidents"],
  ["hate_crime_count_by_crime_name", "incidents"],
  ["hate_crime_count_by_motivation", "incidents"],
  ["hate_crime_count_by_type", "incidents"],
  ["hate_crime_incidents", "incidents"],
  ["hate_crime_incidents_by_crime_name", "incidents"],
  ["hate_crimes", "incidents"],
  ["hate_crimes_by_crime", "incidents"],
  ["hate_crimes_by_crime_name", "incidents"],
  ["hate_crimes_by_crime_name_count", "incidents"],
  ["hate_crimes_by_crime_type", "incidents"],
  ["hate_crimes_by_motivation", "incidents"],
  ["hate_crimes_by_motivation_count", "incidents"],
  ["hate_crimes_count", "incidents"],
  ["hate_crimes_total", "incidents"],
  ["hedge_counterparty_count", "counterparties"],
  ["help_points_count", "help_points"],
  ["historical_january_crime_count", "incidents"],
  ["index_crimes", "incidents"],
  ["incidents_causing_delays", "incidents"],
  ["inspections", "inspections"],
  ["inspections_audits_external", "inspections_audits"],
  ["inspections_audits_internal", "inspections_audits"],
  ["insulated_rail_joints_installed", "joints"],
  ["joint_track_safety_audits", "audits"],
  ["joint_track_safety_audits_actual", "audits"],
  ["joint_track_safety_audits_target", "audits"],
  ["lawsuits_filed", "lawsuits"],
  ["locomotive quantity", "locomotives"],
  ["local_bus_route_count", "routes"],
  ["local_routes", "routes"],
  ["lost_time_incidents", "incidents"],
  ["lost_time_incidents_ytd", "incidents"],
  ["major_felony_count_change", "incidents"],
  ["major_completions", "completions"],
  ["major_events", "events"],
  ["major_felonies_count", "felonies"],
  ["major_felonies_annual", "felonies"],
  ["major_felony_incidents", "incidents"],
  ["major_routing_changes", "routing_changes"],
  ["management_interviews_conducted", "interviews"],
  ["murder", "incidents"],
  ["murder_count", "incidents"],
  ["mwbe_firms_selected", "firms"],
  ["mwbe_proposals_received", "proposals"],
  ["number_of_payments", "payments"],
  ["number_of_payments_ytd", "payments"],
  ["onboard_revenue_tests", "tests"],
  ["on_board_fare_collection_tests", "tests"],
  ["open_data_assets_count", "assets"],
  ["outstanding_hedges", "hedges"],
  ["outstanding_hedges_count", "hedges"],
  ["payments_count", "payments"],
  ["parking_spaces_change", "parking_spaces"],
  ["parking_spaces_count", "spaces"],
  ["pension_calculation_errors_identified", "errors"],
  ["pension_calculations_reviewed", "calculations"],
  ["pension_files_reviewed", "files"],
  ["planned_audits", "audits"],
  ["planned_operational_audits", "audits"],
  ["plan_enrollees", "enrollees"],
  ["platform_barrier_goal", "stations"],
  ["platform_barrier_installations", "stations"],
  ["potential_audits_identified", "audits"],
  ["priority_corridor_count", "corridors"],
  ["procurement_actions_count", "actions"],
  ["project_variances", "projects"],
  ["projects_awarded", "projects"],
  ["projects_completed", "projects"],
  ["projects_for_award", "projects"],
  ["projects_reviewed", "projects"],
  ["proposals_received", "proposals"],
  ["proposed_audits", "audits"],
  ["proposed_express_routes", "routes"],
  ["proposed_local_routes", "routes"],
  ["proposed_new_rush_route_count", "routes"],
  ["rape_count", "incidents"],
  ["recordable_incidents", "incidents"],
  ["recordable_incidents_ytd", "incidents"],
  ["regular_payments", "payments"],
  ["regular_payments_count", "payments"],
  ["regular_payments_count_ytd", "payments"],
  ["recommendations_count", "recommendations"],
  ["recommendations_implemented", "recommendations"],
  ["recommendations_issued", "recommendations"],
  ["recommendations_pending", "recommendations"],
  ["remediation_plans_closed", "plans"],
  ["remediation_plans_opened", "plans"],
  ["remediation_plans_six_months_past_due", "plans"],
  ["reports_issued", "reports"],
  ["reported_incidents", "incidents"],
  ["risk_assessments_conducted", "assessments"],
  ["risk_assessments_changes_identified", "assessments"],
  ["risk_assessments_completed", "assessments"],
  ["rfp_procurement_counts", "firms"],
  ["rfp_response_counts", "proposals"],
  ["robbery_count", "incidents"],
  ["robbery", "incidents"],
  ["route_count", "routes"],
  ["route_count_change", "routes"],
  ["routes_with_increased_frequencies", "routes"],
  ["routes_with_increased_spans", "routes"],
  ["safety_taskforce_inspections", "inspections"],
  ["sandy_audit_projects_completed", "projects"],
  ["sandy_audit_recommendations", "recommendations"],
  ["safety_incident_count", "incidents"],
  ["safety_incidents", "incidents"],
  ["safety_incidents_ytd", "incidents"],
  ["safety_task_force_audits", "audits"],
  ["sbdp_enrolled_firms", "firms"],
  ["sbs_routes_count", "routes"],
  ["scheduled_trains", "trains"],
  ["stairs_count", "stairs"],
  ["stairs_per_station", "stairs"],
  ["state_tax_refund_count", "payments"],
  ["state_tax_refund_payments", "payments"],
  ["state_tax_refund_payments_count", "payments"],
  ["state_tax_refund_payments_count_ytd", "payments"],
  ["substations_count", "substations"],
  ["switch_count", "switches"],
  ["ticket_office_machines_quantity", "machines"],
  ["ticket_selling_machines_count", "machines"],
  ["ticket_vending_machines_quantity", "machines"],
  ["tickets_sold", "tickets"],
  ["ties_installed", "ties"],
  ["title_vi_basis_count", "bases"],
  ["title_vi_complaint_bases", "bases"],
  ["title_vi_lawsuits_filed", "lawsuits"],
  ["title_vii_lawsuits", "lawsuits"],
  ["title_vii_lawsuits_filed", "lawsuits"],
  ["total_cases_adjudicated", "cases"],
  ["total_cases_adjudicated_ytd", "cases"],
  ["total_delay_incidents", "incidents"],
  ["total_federally_funded_contracts", "contracts"],
  ["total_major_felonies", "incidents"],
  ["total_proposed_routes", "routes"],
  ["total_risk_assessments", "assessments"],
  ["total_routes", "routes"],
  ["track_intrusion_incidents", "incidents"],
  ["track_trespassing_incidents_by_quarter", "incidents"],
  ["trains_canceled", "trains_canceled"],
  ["track_trespassing_incidents", "incidents"],
  ["trains_over_15_min_late", "trains"],
  ["trains_over_15_minutes_late", "trains"],
  ["trains_scheduled", "trains"],
  ["trains_scheduled_annual", "trains"],
  ["trains_terminated", "trains_terminated"],
  ["traffic_light_report_projects_reviewed", "projects"],
  ["toll_evasion_interdictions", "vehicles"],
  ["persistent_toll_violator_interdictions", "vehicles"],
  ["trash_receptacles_count", "receptacles"],
  ["vehicles_interdicted", "vehicles"],
  ["vehicles_towed", "vehicles"],
  ["violations_issued", "violations"],
  ["violations_issued_ytd", "violations"],
  ["waiting_rooms_per_station", "waiting_rooms"],
  ["vision_zero_employee_trainings", "trainings"],
  ["vision_zero_employee_trainings_conducted", "trainings"],
  ["visualizations built on metrics.mta.info", "visualizations"],
  ["waiting_rooms_count", "waiting_rooms"],
]);

const EXACT_MISSING_WORKFORCE_METRIC_UNITS = new Map<string, string>([
  ["employee_separations", "employees"],
  ["employees_by_job_category", "employees"],
  ["employees_trained", "employees"],
  ["ethnicity_workforce_count", "employees"],
  ["female_employee_change", "employees"],
  ["female_employee_net_change", "employees"],
  ["female_representation_change", "employees"],
  ["female_workforce_count", "employees"],
  ["headcount", "employees"],
  ["hires", "hires"],
  ["hires_count", "hires"],
  ["male_workforce_count", "employees"],
  ["minority_employee_change", "employees"],
  ["minority_employee_net_change", "employees"],
  ["minority_representation_change", "employees"],
  ["minority_workforce_count", "employees"],
  ["net_change", "employees"],
  ["net_change_female", "employees"],
  ["net_change_female_employees", "employees"],
  ["net_change_male", "employees"],
  ["net_change_male_employees", "employees"],
  ["net_change_by_sex", "employees"],
  ["net_change_minorities", "employees"],
  ["net_change_minority", "employees"],
  ["net_change_non_minorities", "employees"],
  ["net_change_pwd_employees", "employees"],
  ["net_change_veteran_employees", "employees"],
  ["net_employee_change", "employees"],
  ["net_minority_employee_change", "employees"],
  ["net_increase_female_employees", "employees"],
  ["net_increase_minority_employees", "employees"],
  ["new_hires", "hires"],
  ["new_hires_by_race", "hires"],
  ["new_hires_by_sex", "employees"],
  ["new_hires_count", "employees"],
  ["new_hires_female", "employees"],
  ["new_hires_female_count", "employees"],
  ["new_hires_male", "employees"],
  ["new_hires_male_count", "employees"],
  ["new_hires_minority", "employees"],
  ["new_hires_minority_count", "employees"],
  ["new_hires_minorities", "employees"],
  ["new_hires_non_minorities", "employees"],
  ["new_hires_total", "employees"],
  ["non_reimbursable_headcount", "full_time_equivalents"],
  ["positions_variance", "positions"],
  ["reimbursable_headcount", "full_time_equivalents"],
  ["separations_count", "employees"],
  ["separations_female", "employees"],
  ["separations_male", "employees"],
  ["separations_minorities", "employees"],
  ["separations_minority", "employees"],
  ["separations_minority_count", "employees"],
  ["separations_non_minorities", "employees"],
  ["separations_total", "employees"],
  ["team_size", "personnel"],
  ["total_employees", "employees"],
  ["total_full_time_equivalent_positions", "full_time_equivalents"],
  ["total_full_time_equivalents", "full_time_equivalents"],
  ["total_full_time_positions", "positions"],
  ["total_hires", "employees"],
  ["total_hires_count", "employees"],
  ["total_position_vacancies", "positions"],
  ["total_positions_budgeted", "positions"],
  ["total_positions_filled", "positions"],
  ["total_positions_variance", "positions"],
  ["total_separations", "employees"],
  ["total_separations_count", "employees"],
  ["total_workforce", "employees"],
  ["veteran_employee_count", "employees"],
  ["veterans_hired", "employees"],
  ["workforce_by_race", "employees"],
  ["workforce_by_sex_ethnicity", "employees"],
  ["workforce_change", "employees"],
  ["workforce_net_change", "employees"],
  ["workforce_size", "employees"],
  ["workforce_total", "employees"],
]);

const EXACT_MISSING_SAFETY_METRIC_UNITS = new Map<string, string>([
  ["bicyclist_traffic_injuries", "injuries"],
  ["collisions", "collisions"],
  ["crash fatalities", "fatalities"],
  ["crash severe injuries", "severe_injuries"],
  ["crash_fatalities_and_severe_injuries", "fatalities_and_severe_injuries"],
  ["crash_fatalities", "fatalities"],
  ["crashes_with_injuries", "crashes"],
  ["fatalities", "fatalities"],
  ["injuries", "injuries"],
  ["motor_vehicle_occupant_traffic_injuries", "injuries"],
  ["pedestrian_crashes", "crashes"],
  ["pedestrian_fatalities", "fatalities"],
  ["pedestrian_injuries", "injuries"],
  ["pedestrian killed or severely injured", "killed_or_severely_injured"],
  ["pedestrian_traffic_injuries", "injuries"],
  ["safety_incidents_by_hazard_type", "incidents"],
  ["severe_injuries", "severe_injuries"],
  ["serious_injuries", "injuries"],
  ["track_trespassing_fatalities", "fatalities"],
  ["total_crashes", "crashes"],
  ["total_injuries", "injuries"],
  ["trespasser_injuries_and_fatalities", "injuries_and_fatalities"],
  ["Workplace Violence Case Count Comparison", "cases"],
  ["workplace_violence_assault_cases", "cases"],
  ["workplace_violence_harassment_cases", "cases"],
]);

const EXACT_MISSING_GATED_SAFETY_METRIC_UNITS = new Map<string, { unit: string; evidence: readonly string[] }>([
  ["customer_reportable_injuries", { unit: "injuries", evidence: ["injury", "injuries"] }],
  ["employee_reportable_injuries_with_lost_time", { unit: "injuries", evidence: ["injury", "injuries"] }],
  ["injuries_by_year", { unit: "injuries", evidence: ["injury", "injuries", "peds", "cyclists", "motor_vehicles"] }],
  ["subway_fires", { unit: "fires", evidence: ["fire", "fires"] }],
  ["subway_fires_12mo_rolling", { unit: "fires", evidence: ["subway", "systemwide"] }],
  ["subway_derailments", { unit: "derailments", evidence: ["derailment", "derailments"] }],
  ["train_collisions", { unit: "collisions", evidence: ["collision", "collisions"] }],
  ["train_derailments", { unit: "derailments", evidence: ["derailment", "derailments"] }],
]);

const EXACT_MISSING_CHANGE_METRIC_UNITS = new Map<string, { unit: string; family: string }>([
  ["hate_crime_count_change", { unit: "incidents", family: "count" }],
  ["hate_crimes_change", { unit: "incidents", family: "count" }],
  ["major_felony_change", { unit: "felonies", family: "count" }],
  ["total_arrests_change", { unit: "arrests", family: "enforcement" }],
  ["total_major_felonies_change", { unit: "felonies", family: "count" }],
  ["tos_arrests_change", { unit: "arrests", family: "enforcement" }],
]);

const EXACT_MISSING_POPULATION_METRIC_UNITS = new Map<string, string>([
  ["additional_residents_with_frequent_service", "residents"],
  ["additional_residents_with_overnight_service", "residents"],
  ["bicyclist killed or severely injured", "people"],
  ["covered_individuals", "people"],
  ["covered_population", "people"],
  ["crash injuries", "people"],
  ["cyclist_injuries_or_killed", "people"],
  ["killed_or_severely_injured", "people"],
  ["KSI total (killed or severely injured)", "people"],
  ["ksi", "people"],
  ["ksi_crashes", "people"],
  ["motor_vehicle_occupant_injuries_or_killed", "people"],
  ["pedestrian_injuries_or_killed", "people"],
  ["people_reached", "people"],
  ["plan_members", "members"],
  ["population", "residents"],
  ["people_injured_or_killed", "people"],
  ["population_within_walk", "residents"],
  ["residents", "residents"],
  ["severe_injuries_fatalities_crash", "people"],
  ["users_served", "users"],
]);

const EXACT_MISSING_COMPLAINT_METRICS = new Set([
  "complaints_filed",
  "complaints_received",
  "discrimination_complaints",
  "eeo_complaints",
  "eeo_complaints_external",
  "eeo_complaints_received",
  "eeo_complaints_filed",
  "eeo_complaints_handled",
  "eeo_complaints_handled_total",
  "eeo_complaints_internal",
  "eeo_complaints_total",
  "eeo_total_complaints",
  "eeo_external_complaints",
  "eeo_internal_complaints",
  "employment_complaints_internal",
  "employment_discrimination_complaints_count",
  "employment_discrimination_complaints_by_basis",
  "external_eeo_complaints_by_basis",
  "external_eeo_complaints",
  "external_eeo_complaints_filed",
  "internal_eeo_complaints_by_basis",
  "internal_eeo_complaints",
  "internal_eeo_complaints_filed",
  "related_discrimination_complaints",
  "title_vi_complaints_by_basis",
  "title_vi_complaints",
  "title_vi_complaints_count",
  "title_vi_complaints_filed",
  "title_vi_complaints_handled",
  "title_vi_complaints_internal",
  "title_vi_complaints_total",
  "title_vii_complaints_total",
  "title_vii_external_complaints_by_basis",
  "title_vii_internal_complaints_by_basis",
]);

const EXACT_MISSING_MONEY_METRICS = new Set([
  "access_a_ride_impact",
  "acquisition_amount",
  "adjusted_mrt_receipts",
  "amount_paid",
  "amount_paid_regular",
  "amount_paid_state_tax_refund",
  "amount_paid_ytd",
  "annual_cost_savings",
  "annual_savings",
  "appraised_value",
  "average_payment",
  "average_payment_amount",
  "average_payment_ytd",
  "base_fare",
  "base_rent",
  "base_rent_year_1",
  "base_year_mrt_receipts",
  "budget_impact",
  "camera_violation_fine",
  "camera_violation_fine_max",
  "capital_funding_increase",
  "capital_improvements",
  "capital_investment",
  "capital_transaction_payment",
  "change_order_value",
  "common_area_maintenance",
  "compensation_amount",
  "construction_cost",
  "construction_period_rent",
  "contract_amount",
  "contract amount",
  "contract award amount - base term",
  "contract award amount - options",
  "contract award amount - total",
  "contract_modification_amount",
  "contract_negotiated_amount",
  "cost_impact",
  "cost_savings",
  "current_contract_amount",
  "easement_appraisal_value",
  "easement_compensation",
  "easement_consideration",
  "escalator_payment",
  "expenses",
  "expenses_ytd",
  "fare",
  "fare_evasion_loss",
  "fare_price",
  "farebox_revenue_loss",
  "fine_amount",
  "fundraising_goal",
  "funds_raised",
  "gross_mrt_receipts",
  "improvement_cost_estimate",
  "internal_estimate",
  "lease_net_present_value",
  "license_annual_rental",
  "license_rental_total",
  "median_household_income",
  "minimum_annual_guarantee",
  "money_recouped",
  "money_saved",
  "monthly_revenue_threshold",
  "nearby_service_revenue_loss",
  "net_earnings",
  "net_present_value",
  "net_worth",
  "nypd_moving_violation_fine",
  "one_time_upfront_costs",
  "operating savings target",
  "original_contract_amount",
  "overall_total_revenue",
  "passenger_revenue_change_vs_prepandemic",
  "past_due_payment_amount",
  "prior_modifications_amount",
  "procurement modification amount",
  "procurement_actions_value",
  "procurement_amount",
  "procurement_package_amount",
  "procurement_value",
  "property_value",
  "proposal_present_value",
  "proposed estimated expenditure",
  "purchase_price",
  "questioned_costs_lost_revenue",
  "regular_amount_paid",
  "regular_amount_paid_ytd",
  "reimbursement_amount_max",
  "renovation_investment",
  "rent_credits",
  "revenue",
  "revenue_excess_over_expenses",
  "revenue_minus_expenses",
  "revenue_ytd",
  "sales_vs_2019_peak",
  "staffing_cost",
  "statutory_minimum_payment",
  "state_tax_refund_amount",
  "state_tax_refund_amount_paid",
  "state_tax_refund_amount_paid_ytd",
  "toll_evasion_amount_owed",
  "toll_revenue_change_vs_prepandemic",
  "total_cost_savings",
  "total_escalator_payments",
  "total_payment",
  "total_pilot_cost",
  "total_revenue",
  "yield_per_nov",
  "yield_per_nov_ytd",
]);

const EXACT_MISSING_MONEY_RATE_METRIC_UNITS = new Map<string, string>([
  ["annual_base_rent", "dollars_per_year"],
  ["annual_funding", "dollars_per_year"],
]);

const EXACT_MISSING_PERCENT_METRICS = new Set([
  "bus_operator_assaults_percent_change",
  "customer_collision_yoy_reduction",
  "dwell_time_percent_change",
  "injury_collision_yoy_reduction",
  "mask usage rate",
  "on-time performance",
  "pct_days_over_3min_free_flow",
  "ridership as percent of pre-COVID baseline",
  "ridership change",
  "subway_fires_change",
  "summonses_total_increase_pct",
  "weekday_ridership_percent_increase",
  "weekend_ridership_percent_increase",
]);

const EXACT_MISSING_RIDERSHIP_METRIC_UNITS = new Map<string, string>([
  ["average daily ridership", "riders_per_day"],
  ["average_weekday_passengers", "riders_per_day"],
  ["average_weekend_ridership", "riders"],
  ["crosstown transit passengers per day", "riders_per_day"],
  ["daily bus passengers", "riders"],
  ["daily_boardings", "boardings"],
  ["daily_bus_passengers", "riders"],
  ["daily_bus_riders", "riders"],
  ["daily_alightings", "riders"],
  ["daily_passengers", "riders_per_day"],
  ["daily_riders", "riders_per_day"],
  ["express bus passengers per day", "riders_per_day"],
  ["hourly_ridership", "riders"],
  ["monthly_ridership", "riders"],
  ["monthly_revenue_passengers", "riders"],
  ["paid_rides", "rides"],
  ["peak_daily_ridership", "riders"],
  ["peak weekday ridership", "riders_per_weekday"],
  ["ridership_total", "riders"],
  ["total_daily_ridership", "riders_per_day"],
  ["total_ridership", "riders"],
  ["total_weekday_bus_boardings", "boardings_per_weekday"],
  ["weekday_average_ridership", "riders"],
  ["weekday_bus_boardings_total", "boardings_per_weekday"],
  ["weekday_riders", "riders_per_weekday"],
  ["weekday_ridership", "riders_per_weekday"],
  ["weekday_bus_boardings", "boardings_per_weekday"],
  ["weekday_ridership_pilot_increase", "riders_per_weekday"],
  ["weekday_ridership_pre_pilot", "riders_per_weekday"],
  ["weekday_ridership_total_pilot", "riders_per_weekday"],
]);

const EXACT_MISSING_ENFORCEMENT_METRIC_UNITS = new Map<string, string>([
  ["arrest_count", "arrests"],
  ["arrests_made", "arrests"],
  ["criminal_summonses_count", "summonses"],
  ["enforcement_arrests", "arrests"],
  ["enforcement_summonses", "summonses"],
  ["summons_issued", "summonses"],
  ["summonses_issued", "summonses"],
  ["tab_summonses", "summonses"],
  ["tos_c_summ", "summonses"],
  ["tos_csumm", "summonses"],
  ["tos_arrest_count", "arrests"],
  ["tos_criminal_summons_count", "summonses"],
  ["tos_tablet_count", "summonses"],
  ["tos_tabs", "summonses"],
  ["violations_issued_annual", "violations"],
]);

const EXACT_MISSING_SCALE_METRIC_UNITS = new Map<string, string>([
  ["consumer_price_index", "cpi_u_index"],
]);

const EXACT_MISSING_RATING_GATED_METRIC_UNITS = new Map<string, { unit: string; evidence: readonly string[]; min?: number; max?: number }>([
  ["Bell-Curve Grade Threshold - A", { unit: "score_4_point_gpa", evidence: ["gpa", "4_0"], min: 0, max: 4 }],
]);

const EXACT_MISSING_RATE_METRIC_UNITS = new Map<string, { unit: string; family: string }>([
  ["average_homeless_arriving_per_train", { unit: "people_per_train", family: "count_rate" }],
  ["average_major_felonies_per_day", { unit: "felonies_per_day", family: "count_rate" }],
  ["daily_users", { unit: "users_per_day", family: "count_rate" }],
  ["felony_crimes_per_day", { unit: "crimes_per_day", family: "count_rate" }],
  ["felony_rate_per_1m_riders", { unit: "felonies_per_million_riders", family: "safety_rate" }],
  ["Lost Time Incident Rate (LTIR)", { unit: "lost_time_incident_rate", family: "safety_rate" }],
  ["Total Recordable Incident Rate (TRIR)", { unit: "total_recordable_incident_rate", family: "safety_rate" }],
  ["daily_vehicle_volume", { unit: "vehicles_per_day", family: "count_rate" }],
  ["lost_time_incident_rate", { unit: "lost_time_incident_rate", family: "safety_rate" }],
  ["lost_time_injury_rate", { unit: "lost_time_injury_rate", family: "safety_rate" }],
  ["total_recordable_incident_rate", { unit: "total_recordable_incident_rate", family: "safety_rate" }],
]);

const EXACT_MISSING_PARTICIPATION_METRIC_UNITS = new Map<string, string>([
  ["plan_participants", "participants"],
  ["workforce_development_participants", "participants"],
]);

const EXACT_MISSING_RATING_METRIC_UNITS = new Map<string, string>([
  ["ridership_ranking", "rank"],
]);

const EXACT_MISSING_ENGAGEMENT_METRIC_UNITS = new Map<string, string>([
  ["attendees at Open Data events", "attendees"],
  ["customer_comments_collected", "comments"],
  ["customer_community_outreach", "people_reached"],
  ["customer_feedback_count", "customers"],
  ["in_person_grade_crossing_outreach_contacts", "contacts"],
  ["outreach_customers_reached", "customers"],
  ["public_comment_count", "comments"],
  ["speaking engagements in 2024", "engagements"],
  ["submissions to Open Data Challenge", "submissions"],
  ["survey_respondent_count", "respondents"],
  ["survey_respondents", "respondents"],
]);

const EXACT_MISSING_DATA_METRIC_UNITS = new Map<string, string>([
  ["new datasets published", "datasets"],
  ["new datasets published in 2024", "datasets"],
  ["records in largest dataset (Bus Hourly Ridership)", "records"],
  ["supported open datasets", "datasets"],
  ["total open datasets portfolio", "datasets"],
]);

const EXACT_MISSING_DISTANCE_METRIC_UNITS = new Map<string, { unit: string; evidence: readonly string[] }>([
  ["track_miles", { unit: "track_miles", evidence: ["track_miles", "track_mile", "miles_of_track"] }],
]);

function payloadRawTextContainsStoredCount(payload: JsonObject, value: number): boolean {
  if (!Number.isInteger(value)) return false;
  const rawValueText = stringValue(payload.raw_value_text);
  if (!rawValueText) return false;

  const normalized = rawValueText.replace(/,/gu, "");
  const token = String(value);
  const pattern = new RegExp(`(^|[^\\d.])${token}(?!\\s*%)(?=$|[^\\d.])`, "u");
  if (pattern.test(normalized)) return true;

  const countTokens = [...normalized.matchAll(/(^|[^\d.])(\d+)(?!\s*%)(?=$|[^\d.])/gu)].map((match) => Number(match[2]));
  return countTokens.length > 1 && countTokens.length <= 3 && countTokens.reduce((sum, count) => sum + count, 0) === value;
}

function payloadHasChangeComparisonEvidence(payload: JsonObject): boolean {
  if (typeof payload.change === "number" && Number.isFinite(payload.change)) return true;
  const hay = normalizedHaystack(payload, ["comparison", "comparison_period", "period", "category", "scope"]);
  return hasAny(hay, ["diff", "change", "year_over_year", "year_to_year", "vs"]);
}

function payloadHasPopulationEvidence(payload: JsonObject): boolean {
  const hay = normalizedHaystack(payload, ["metric_name", "raw_value_text", "description", "category", "label", "scope"]);
  return hasAny(hay, [
    "crash",
    "crashes",
    "fatalities",
    "fatality",
    "individual",
    "individuals",
    "injured",
    "injuries",
    "injury",
    "killed",
    "ksi",
    "people",
    "population",
    "resident",
    "residents",
    "retiree",
    "retirees",
    "severely_injured",
    "user",
    "users",
  ]);
}

function payloadHasNonNameEvidence(payload: JsonObject, needles: readonly string[], context?: NormalizationContext): boolean {
  return hasAny(normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope"]), needles) || hasAny(normalizedContextHaystack(context), needles);
}

function payloadExtraFieldsHasToken(payload: JsonObject, needles: readonly string[]): boolean {
  const extraFields = payload.extra_fields;
  if (extraFields === undefined || extraFields === null || typeof extraFields !== "object" || Array.isArray(extraFields)) return false;
  const hay = Object.keys(extraFields as JsonObject)
    .map((key) => normalizedToken(key))
    .join(" ");
  return hasAny(hay, needles);
}

function payloadHasSimpleCrashInjuryEvidence(payload: JsonObject): boolean {
  const hay = normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope"]);
  if (hasAny(hay, ["fatalities", "fatality", "killed", "severe_injuries", "severe_injury", "severely_injured", "ksi"])) return false;
  return hasAny(hay, ["injured", "injuries", "injury"]);
}

function payloadHasSignedPercentValue(payload: JsonObject): boolean {
  const rawValueText = stringValue(payload.raw_value_text);
  return rawValueText !== undefined && /^[+-]?(?:\d+\.?\d*|\.\d+)\s*%$/u.test(rawValueText.trim());
}

function payloadRawTextContainsStoredPercent(payload: JsonObject, value: number): boolean {
  const rawValueText = stringValue(payload.raw_value_text);
  if (!rawValueText) return false;
  const normalized = rawValueText.replace(/,/gu, "");
  const valueText = String(value).replace(/\.0+$/u, "");
  const pattern = new RegExp(`(^|[^\\d.])${valueText}(?:\\.0+)?\\s*%`, "u");
  return pattern.test(normalized);
}

function payloadHasDailyRidershipEvidence(payload: JsonObject): boolean {
  const metricName = stringValue(payload.metric_name);
  const hay = normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope", "period", "day_type", "time_period"]);
  return (
    hasAny(hay, ["daily_ridership", "daily_riders", "daily_bus_passengers", "riders_per_day", "passengers_per_day", "customers_per_day", "one_day_record"]) ||
    (hasAny(hay, ["daily", "per_day", "weekday", "weekend", "average_weekday", "single_day_record"]) &&
      hasAny(hay, ["ridership", "riders", "passengers", "customers", "boardings"])) ||
    (metricName === "daily_ridership" && hasAny(hay, ["daily", "per_day", "weekday", "weekend", "average_weekday", "single_day_record", "one_day_record"]))
  );
}

function payloadHasRidershipCountEvidence(payload: JsonObject, context?: NormalizationContext): boolean {
  const hay = normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope", "period", "day_type", "time_period"]);
  return hasAny(hay, ["rider", "riders", "ridership", "passenger", "passengers", "boardings"]) || hasAny(normalizedContextHaystack(context), ["rider", "riders", "ridership", "passenger", "passengers", "boardings"]);
}

function payloadHasDateOrPeriod(payload: JsonObject): boolean {
  return stringValue(payload.date) !== undefined || stringValue(payload.period) !== undefined;
}

function payloadHasRawMillionStoredValue(payload: JsonObject, value: number): boolean {
  const rawValueText = stringValue(payload.raw_value_text);
  if (!rawValueText || !Number.isFinite(value) || value < 1_000_000) return false;
  const match = rawValueText.replace(/,/gu, "").match(/^\s*(\d+(?:\.\d+)?)\s+million\s*$/iu);
  return match !== null && Math.round(Number(match[1]) * 1_000_000) === value;
}

function payloadHasTransitAgencyContext(payload: JsonObject): boolean {
  const hay = normalizedHaystack(payload, ["entity", "scope"]);
  return hasAny(hay, [
    "long_island_rail_road",
    "lirr",
    "metro_north",
    "mta_metro_north",
    "nyct",
    "nyc_transit",
    "new_york_city_transit",
    "mta_bus",
    "staten_island_railway",
  ]);
}

function payloadHasTransitAgencyMillionRidershipPayload(payload: JsonObject, value: number): boolean {
  return payloadHasDateOrPeriod(payload) && payloadHasTransitAgencyContext(payload) && payloadHasRawMillionStoredValue(payload, value);
}

function payloadHasBridgeTunnelContext(payload: JsonObject): boolean {
  const hay = normalizedHaystack(payload, ["entity", "scope"]);
  return hasAny(hay, ["mta_bridges_and_tunnels", "bridges_and_tunnels", "bridges_tunnels", "tbta", "triborough_bridge_and_tunnel"]);
}

function payloadHasBridgeTunnelRevenueVehiclePayload(payload: JsonObject, value: number): boolean {
  return payloadHasBridgeTunnelContext(payload) && payloadHasDateOrPeriod(payload) && Number.isInteger(value) && value >= 0 && payloadRawTextContainsStoredCount(payload, value);
}

function payloadHasAllAgencyVacancyCountPayload(payload: JsonObject, value: number): boolean {
  const hay = normalizedHaystack(payload, ["entity", "scope"]);
  if (!hasAny(hay, ["mta_all_agencies", "mta_wide", "all_agencies"])) return false;
  return payloadHasDateOrPeriod(payload) && Number.isInteger(value) && value >= 0 && payloadRawTextContainsStoredCount(payload, value);
}

function payloadHasSubwayFireCountPayload(payload: JsonObject, value: number): boolean {
  const hay = normalizedHaystack(payload, ["entity", "scope", "mode"]);
  if (!hasAny(hay, ["nyct_subway", "subway", "department_of_subways"])) return false;
  return payloadHasDateOrPeriod(payload) && Number.isInteger(value) && value >= 0 && payloadRawTextContainsStoredCount(payload, value);
}

function inferMissingMetricUnit(payload: JsonObject, context?: NormalizationContext): JsonObject | undefined {
  if (payload.unit_normalized !== undefined || stringValue(payload.unit) !== undefined) return undefined;

  const metricName = stringValue(payload.metric_name);
  const value = payload.value;
  const hasFiniteValue = typeof value === "number" && Number.isFinite(value);
  const hasFiniteMoneyRange = typeof payload.value_min === "number" && Number.isFinite(payload.value_min) && typeof payload.value_max === "number" && Number.isFinite(payload.value_max);
  const allowsMissingStoredValue = metricName === "debt_service_monthly_by_agency" || metricName === "revenue_observation_tests_completed";
  if (!hasFiniteValue && !hasFiniteMoneyRange && !allowsMissingStoredValue) return undefined;
  const numericValue = hasFiniteValue ? value : 0;

  const rawValueText = stringValue(payload.raw_value_text);
  const rawText = rawValueText ?? metricName;

  if (metricName === "farebox_recovery_ratio" || metricName === "farebox_operating_ratio") {
    if (!rawValueText) return undefined;

    const ratioText = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:\s*\([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\))?$/iu;
    if (!ratioText.test(rawValueText)) return undefined;

    return { raw_text: rawValueText, normalized_unit: "ratio", unit_family: "ratio" };
  }

  if (metricName === "major_felony_count" || metricName === "major_felonies" || metricName === "hate_crime_count") {
    return { raw_text: rawText, normalized_unit: "incidents", unit_family: "count" };
  }

  if (metricName === "major_felonies_per_day") {
    return { raw_text: rawText, normalized_unit: "felonies_per_day", unit_family: "count_rate" };
  }

  if (metricName === "track_trespassing_winter_comparison") {
    if (!payloadHasNonNameEvidence(payload, ["incident", "incidents"], context)) return undefined;
    return { raw_text: rawText, normalized_unit: "incidents", unit_family: "count" };
  }

  if (metricName && EXACT_MISSING_DATA_DICTIONARY_ROW_COUNT_METRICS.has(metricName)) {
    if (!hasFiniteValue || !Number.isInteger(numericValue) || numericValue < 0 || !payloadRawTextContainsStoredCount(payload, numericValue)) return undefined;
    return { raw_text: rawText, normalized_unit: "rows", unit_family: "count" };
  }

  if (metricName && EXACT_MISSING_TRAFFIC_CROSSING_COUNT_METRICS.has(metricName)) {
    if (!hasFiniteValue || !Number.isInteger(numericValue) || numericValue < 0 || !payloadRawTextContainsStoredCount(payload, numericValue)) return undefined;
    return { raw_text: rawText, normalized_unit: "crossings", unit_family: "count" };
  }

  const exactCountUnit = metricName ? EXACT_MISSING_COUNT_METRIC_UNITS.get(metricName) : undefined;
  if (exactCountUnit) {
    return { raw_text: rawText, normalized_unit: exactCountUnit, unit_family: "count" };
  }

  if (metricName === "pension_errors_financial_impact") {
    if (!hasFiniteValue || !Number.isInteger(numericValue) || numericValue < 0 || !payloadHasNonNameEvidence(payload, ["error", "errors"], context)) return undefined;
    return { raw_text: rawText, normalized_unit: "errors", unit_family: "count" };
  }

  if (metricName === "revenue_observation_tests_completed") {
    if (!payloadHasNonNameEvidence(payload, ["test", "tests"], context) && !payloadExtraFieldsHasToken(payload, ["test", "tests"])) return undefined;
    return { raw_text: rawText, normalized_unit: "tests", unit_family: "count" };
  }

  if (metricName === "crash_injuries") {
    if (!payloadHasSimpleCrashInjuryEvidence(payload)) return undefined;
    return { raw_text: rawText, normalized_unit: "injuries", unit_family: "safety" };
  }

  const exactSafetyUnit = metricName ? EXACT_MISSING_SAFETY_METRIC_UNITS.get(metricName) : undefined;
  if (exactSafetyUnit) {
    return { raw_text: rawText, normalized_unit: exactSafetyUnit, unit_family: "safety" };
  }

  const exactGatedSafetyUnit = metricName ? EXACT_MISSING_GATED_SAFETY_METRIC_UNITS.get(metricName) : undefined;
  if (exactGatedSafetyUnit) {
    if (metricName === "subway_fires" && payloadHasSubwayFireCountPayload(payload, numericValue)) {
      return { raw_text: rawText, normalized_unit: "fires", unit_family: "safety" };
    }
    if (!payloadHasNonNameEvidence(payload, exactGatedSafetyUnit.evidence, context)) return undefined;
    return { raw_text: rawText, normalized_unit: exactGatedSafetyUnit.unit, unit_family: "safety" };
  }

  if (metricName === "traffic_fatalities_and_injuries") {
    const hay = `${normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope"])} ${normalizedContextHaystack(context)}`;
    if (!hasAny(hay, ["fatalities", "fatality", "killed"]) || !hasAny(hay, ["injuries", "injury", "injured"])) return undefined;
    return { raw_text: rawText, normalized_unit: "injuries_and_fatalities", unit_family: "safety" };
  }

  const exactChangeUnit = metricName ? EXACT_MISSING_CHANGE_METRIC_UNITS.get(metricName) : undefined;
  if (exactChangeUnit) {
    if (!hasFiniteValue || !Number.isInteger(numericValue) || !payloadRawTextContainsStoredCount(payload, numericValue)) return undefined;
    if (!payloadHasChangeComparisonEvidence(payload)) return undefined;
    return { raw_text: rawText, normalized_unit: exactChangeUnit.unit, unit_family: exactChangeUnit.family };
  }

  const exactPopulationUnit = metricName ? EXACT_MISSING_POPULATION_METRIC_UNITS.get(metricName) : undefined;
  if (exactPopulationUnit) {
    if (!payloadHasPopulationEvidence(payload)) return undefined;
    return { raw_text: rawText, normalized_unit: exactPopulationUnit, unit_family: "population" };
  }

  if (metricName && EXACT_MISSING_COMPLAINT_METRICS.has(metricName) && hasFiniteValue && payloadRawTextContainsStoredCount(payload, numericValue)) {
    return { raw_text: rawText, normalized_unit: "complaints", unit_family: "count" };
  }

  if (metricName === "enforcement_activity" || metricName === "enforcement_activity_count") {
    const category = normalizedToken(stringValue(payload.category) ?? "");
    if (category === "tos_arrests" || category === "total_arrests") {
      return { raw_text: rawText, normalized_unit: "arrests", unit_family: "enforcement" };
    }
    if (category === "tos_c_summ" || category === "tos_tabs" || category === "total_summons") {
      return { raw_text: rawText, normalized_unit: "summonses", unit_family: "enforcement" };
    }
    return undefined;
  }

  if (metricName === "total_arrests") {
    return { raw_text: rawText, normalized_unit: "arrests", unit_family: "enforcement" };
  }

  if (metricName === "total_summons") {
    return { raw_text: rawText, normalized_unit: "summonses", unit_family: "enforcement" };
  }

  const exactEnforcementUnit = metricName ? EXACT_MISSING_ENFORCEMENT_METRIC_UNITS.get(metricName) : undefined;
  if (exactEnforcementUnit) {
    return { raw_text: rawText, normalized_unit: exactEnforcementUnit, unit_family: "enforcement" };
  }

  if (metricName === "activity_count" || metricName === "enforcement_action_count") {
    const category = normalizedToken(stringValue(payload.category) ?? "");
    if (category === "tos_arrests" || category === "total_arrests") {
      return { raw_text: rawText, normalized_unit: "arrests", unit_family: "enforcement" };
    }
    if (category === "tos_c_summ" || category === "tos_tabs" || category === "total_summons") {
      return { raw_text: rawText, normalized_unit: "summonses", unit_family: "enforcement" };
    }
    return undefined;
  }

  if (metricName === "tos_arrests") {
    return { raw_text: rawText, normalized_unit: "arrests", unit_family: "enforcement" };
  }

  if (metricName === "summons_count") {
    return { raw_text: rawText, normalized_unit: "summonses", unit_family: "enforcement" };
  }

  if (metricName === "pedestrian_ksi") {
    const category = normalizedToken(stringValue(payload.category) ?? "");
    if (category === "pedestrian_fatalities") {
      return { raw_text: rawText, normalized_unit: "fatalities", unit_family: "safety" };
    }
    if (category === "pedestrian_killed_or_severely_injured") {
      return { raw_text: rawText, normalized_unit: "killed_or_severely_injured", unit_family: "safety" };
    }
    return undefined;
  }

  if (metricName === "total_positions") {
    return { raw_text: rawText, normalized_unit: "positions", unit_family: "workforce" };
  }

  const exactWorkforceUnit = metricName ? EXACT_MISSING_WORKFORCE_METRIC_UNITS.get(metricName) : undefined;
  if (exactWorkforceUnit) {
    if (
      (metricName === "workforce_change" || metricName === "net_change_by_sex") &&
      !hasAny(normalizedHaystack(payload, ["raw_value_text", "description", "category", "label"]), ["employee", "employees", "workforce"])
    ) {
      return undefined;
    }
    return { raw_text: rawText, normalized_unit: exactWorkforceUnit, unit_family: "workforce" };
  }

  if (metricName === "vacancies") {
    if (!payloadHasNonNameEvidence(payload, ["vacancy", "vacancies"], context) && !payloadHasAllAgencyVacancyCountPayload(payload, numericValue)) return undefined;
    return { raw_text: rawText, normalized_unit: "vacancies", unit_family: "workforce" };
  }

  if (metricName === "hires_separations_count") {
    if (!hasFiniteValue || !Number.isInteger(numericValue) || numericValue < 0) return undefined;
    const hay = normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope"]);
    if (!hasAny(hay, ["hire", "hires", "separation", "separations"]) && !payloadRawTextContainsStoredCount(payload, numericValue)) return undefined;
    return { raw_text: rawText, normalized_unit: "employees", unit_family: "workforce" };
  }

  if (metricName === "separations") {
    const contextHay = normalizedHaystack(payload, ["metric_name", "description", "category", "label", "scope", "entity", "raw_value_text"]);
    if (hasAnyToken(contextHay, ["veteran", "veterans"])) return undefined;
    return { raw_text: rawText, normalized_unit: "employees", unit_family: "workforce" };
  }

  if (metricName && EXACT_MISSING_MONEY_METRICS.has(metricName)) {
    if (!payloadHasMoneyEvidence(payload)) return undefined;
    return { raw_text: rawText, normalized_unit: "dollars", unit_family: "money" };
  }

  if (metricName === "debt_service_monthly_by_agency") {
    const hasExplicitCurrency = [payload.raw_value_text, payload.description, payload.category].some(
      (value) => typeof value === "string" && /(?:\$|\bUSD\b)/iu.test(value),
    );
    if (!hasExplicitCurrency) return undefined;
    return { raw_text: rawText, normalized_unit: "dollars", unit_family: "money", scale: 1_000_000 };
  }

  const exactMoneyRateUnit = metricName ? EXACT_MISSING_MONEY_RATE_METRIC_UNITS.get(metricName) : undefined;
  if (exactMoneyRateUnit) {
    if (!payloadHasMoneyEvidence(payload)) return undefined;
    return { raw_text: rawText, normalized_unit: exactMoneyRateUnit, unit_family: "money_rate" };
  }

  if (metricName && EXACT_MISSING_PERCENT_METRICS.has(metricName)) {
    const hasFiniteMin = typeof payload.value_min === "number" && Number.isFinite(payload.value_min);
    const hasFiniteMax = typeof payload.value_max === "number" && Number.isFinite(payload.value_max);
    const hasMatchingPercent =
      (hasFiniteValue && (payloadHasSignedPercentValue(payload) || payloadRawTextContainsStoredPercent(payload, numericValue))) ||
      (hasFiniteMin && payloadRawTextContainsStoredPercent(payload, payload.value_min as number)) ||
      (hasFiniteMax && payloadRawTextContainsStoredPercent(payload, payload.value_max as number));
    if (!hasMatchingPercent) return undefined;
    return { raw_text: rawText, normalized_unit: "percent", unit_family: "percentage" };
  }

  const exactScaleUnit = metricName ? EXACT_MISSING_SCALE_METRIC_UNITS.get(metricName) : undefined;
  if (exactScaleUnit) {
    return { raw_text: rawText, normalized_unit: exactScaleUnit, unit_family: "scale" };
  }

  const exactRateUnit = metricName ? EXACT_MISSING_RATE_METRIC_UNITS.get(metricName) : undefined;
  if (exactRateUnit) {
    return { raw_text: rawText, normalized_unit: exactRateUnit.unit, unit_family: exactRateUnit.family };
  }

  const exactParticipationUnit = metricName ? EXACT_MISSING_PARTICIPATION_METRIC_UNITS.get(metricName) : undefined;
  if (exactParticipationUnit) {
    return { raw_text: rawText, normalized_unit: exactParticipationUnit, unit_family: "participation" };
  }

  const exactRatingUnit = metricName ? EXACT_MISSING_RATING_METRIC_UNITS.get(metricName) : undefined;
  if (exactRatingUnit) {
    return { raw_text: rawText, normalized_unit: exactRatingUnit, unit_family: "rating" };
  }

  const exactGatedRatingUnit = metricName ? EXACT_MISSING_RATING_GATED_METRIC_UNITS.get(metricName) : undefined;
  if (exactGatedRatingUnit) {
    const comparableValue = hasFiniteValue ? numericValue : typeof payload.value_min === "number" && Number.isFinite(payload.value_min) ? payload.value_min : undefined;
    if (comparableValue === undefined) return undefined;
    if (exactGatedRatingUnit.min !== undefined && comparableValue < exactGatedRatingUnit.min) return undefined;
    if (exactGatedRatingUnit.max !== undefined && comparableValue > exactGatedRatingUnit.max) return undefined;
    if (!payloadHasNonNameEvidence(payload, exactGatedRatingUnit.evidence, context)) return undefined;
    return { raw_text: rawText, normalized_unit: exactGatedRatingUnit.unit, unit_family: "rating" };
  }

  if (metricName === "Secondary Screening Score") {
    if (!payloadHasNonNameEvidence(payload, ["point", "points"], context)) return undefined;
    return { raw_text: rawText, normalized_unit: "score", unit_family: "rating" };
  }

  const exactEngagementUnit = metricName ? EXACT_MISSING_ENGAGEMENT_METRIC_UNITS.get(metricName) : undefined;
  if (exactEngagementUnit) {
    return { raw_text: rawText, normalized_unit: exactEngagementUnit, unit_family: "engagement" };
  }

  const exactDataUnit = metricName ? EXACT_MISSING_DATA_METRIC_UNITS.get(metricName) : undefined;
  if (exactDataUnit) {
    return { raw_text: rawText, normalized_unit: exactDataUnit, unit_family: "data" };
  }

  const exactDistanceUnit = metricName ? EXACT_MISSING_DISTANCE_METRIC_UNITS.get(metricName) : undefined;
  if (exactDistanceUnit) {
    const hay = normalizedHaystack(payload, ["raw_value_text", "description", "category", "label", "scope"]);
    if (!hasAny(hay, exactDistanceUnit.evidence)) return undefined;
    return { raw_text: rawText, normalized_unit: exactDistanceUnit.unit, unit_family: "distance" };
  }

  if (metricName === "average_weekday_ridership" || metricName === "revenue_passengers") {
    return { raw_text: rawText, normalized_unit: "riders", unit_family: "ridership" };
  }

  if (metricName === "revenue_vehicles") {
    if (!payloadHasBridgeTunnelRevenueVehiclePayload(payload, numericValue)) return undefined;
    return { raw_text: rawText, normalized_unit: "vehicles", unit_family: "count" };
  }

  if (metricName === "ridership" && payloadHasRidershipCountEvidence(payload, context)) {
    return { raw_text: rawText, normalized_unit: "riders", unit_family: "ridership" };
  }

  if (metricName === "ridership" && payloadHasTransitAgencyMillionRidershipPayload(payload, numericValue)) {
    return { raw_text: rawText, normalized_unit: "riders", unit_family: "ridership" };
  }

  const exactRidershipUnit = metricName ? EXACT_MISSING_RIDERSHIP_METRIC_UNITS.get(metricName) : undefined;
  if (exactRidershipUnit) {
    return { raw_text: rawText, normalized_unit: exactRidershipUnit, unit_family: "ridership" };
  }

  if (metricName === "daily_ridership" && payloadHasDailyRidershipEvidence(payload)) {
    return { raw_text: rawText, normalized_unit: "riders_per_day", unit_family: "ridership" };
  }

  return undefined;
}

function normalizeMetricPayload(payload: JsonObject, context?: NormalizationContext): JsonObject {
  const next: JsonObject = { ...payload };
  const rawValue = next.value;

  for (const field of METRIC_UNIT_ALIAS_FIELDS) {
    if (next.unit === undefined && typeof next[field] === "string" && next[field].trim()) {
      next.unit = next[field];
    }
  }

  const rawUnit = stringValue(next.unit);
  if (rawUnit) {
    const normalizedUnit = normalizeUnit(rawUnit);
    next.unit_normalized =
      scaleOnlyMoneyUnitFromPayload(rawUnit, normalizedUnit, next) ??
      scaleOnlyContextUnitFromPayload(rawUnit, normalizedUnit, next) ??
      ridershipUnitFromPayload(rawUnit, normalizedUnit, next) ??
      moneyRateUnitFromPayload(rawUnit, normalizedUnit, next) ??
      contextualOtherMetricUnitFromPayload(rawUnit, normalizedUnit, next) ??
      normalizedUnit;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    const range = /^([+-]?\d+(?:\.\d+)?)\s*(?:-|to|–)\s*([+-]?\d+(?:\.\d+)?)(%)?$/iu.exec(trimmed.replace(/,/gu, ""));
    const numeric = parseNumber(trimmed.replace(/%$/u, ""));

    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      delete next.value;
      next.raw_value_text ??= rawValue;
      next.value_min ??= min;
      next.value_max ??= max;
      if (range[3] && next.unit === undefined) next.unit = "percent";
    } else if (numeric !== undefined) {
      next.raw_value_text ??= rawValue;
      next.value = numeric;
    }
  }

  const inferredUnit = inferMissingMetricUnit(next, context);
  if (inferredUnit !== undefined) next.unit_normalized = inferredUnit;

  return normalizeMetricCostCompanions(normalizeMetricDimensionFields(next));
}

function normalizeClaimOpenValue(value: string): JsonObject {
  const raw = value.trim();
  return {
    raw_text: raw,
    normalized_value: normalizedToken(raw) || raw,
  };
}

function normalizeClaimPayload(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  for (const field of ["data_type", "change_type"] as const) {
    const value = payload[field];
    const normalizedKey = `${field}_normalized`;
    if (typeof value === "string" && value.trim()) {
      addIfMissing(next, normalizedKey, normalizeClaimOpenValue(value));
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      addIfMissing(next, normalizedKey, value.map((item) => normalizeClaimOpenValue(item as string)) as JsonValue);
    }
  }
  return next;
}

const BOROUGH_ALIASES = new Map<string, string>([
  ["bronx", "bronx"],
  ["the_bronx", "bronx"],
  ["brooklyn", "brooklyn"],
  ["manhattan", "manhattan"],
  ["queens", "queens"],
  ["staten_island", "staten_island"],
  ["staten_is", "staten_island"],
]);

function normalizeBoroughValue(value: string) {
  return BOROUGH_ALIASES.get(normalizedToken(value)) ?? normalizedToken(value);
}

function normalizeBoroughFields(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  const borough = payload.borough;
  if (typeof borough === "string" && borough.trim()) {
    addIfMissing(next, "borough_normalized", normalizeBoroughValue(borough));
  } else if (Array.isArray(borough) && borough.every((item) => typeof item === "string")) {
    addIfMissing(next, "boroughs_normalized", borough.map((item) => normalizeBoroughValue(item as string)) as JsonValue);
  }

  const boroughs = payload.boroughs;
  if (Array.isArray(boroughs) && boroughs.every((item) => typeof item === "string")) {
    addIfMissing(next, "boroughs_normalized", boroughs.map((item) => normalizeBoroughValue(item as string)) as JsonValue);
  }
  return next;
}

function normalizeRouteTypeValue(value: string) {
  const key = normalizedToken(value);
  if (key === "local" || key === "local_bus") return "local";
  if (key === "local_limited" || key === "local_and_limited" || key === "limited_local" || key === "limited_and_local") return "local_limited";
  if (key === "express" || key === "express_bus") return "express";
  if (key === "limited" || key === "limited_stop" || key === "limited_stop_bus") return "limited_stop";
  if (key === "select_bus_service" || key === "sbs") return "select_bus_service";
  if (key === "rush") return "rush";
  return key;
}

function serviceVariantForRouteType(normalized: string | undefined) {
  if (normalized === "select_bus_service") return "sbs";
  if (normalized && ["local", "local_limited", "limited_stop", "express", "rush"].includes(normalized)) return normalized;
  return undefined;
}

function plusRouteId(value: string) {
  return /\b(?:BX|[BMQS])\s*-?\s*\d{1,3}[A-Z]?\+(?:\W|$)/iu.test(value.trim());
}

function routeIdentityStrings(payload: JsonObject) {
  return [
    stringValue(payload.route_id),
    stringValue(payload.route_label),
    stringValue(payload.route_name),
    stringValue(payload.route),
    stringValue(payload.branding_label),
  ].filter((value): value is string => value !== undefined);
}

function exactBusRouteId(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return /^(?:B|Bx|M|Q|S)\d{1,3}[A-Z]?$/iu.test(normalized) || /^Bee-Line\s+\d{1,3}[A-Z]?$/iu.test(normalized);
}

const SUBWAY_ROUTE_IDS = new Set(["A", "C", "E", "F", "G", "J", "L", "N", "Q", "R", "W", "Z", "1", "2", "3", "4", "5", "6", "7"]);

function exactSubwayRouteId(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, "");
  return SUBWAY_ROUTE_IDS.has(compact);
}

function inferRouteTypeFromPayload(payload: JsonObject) {
  const identities = routeIdentityStrings(payload);
  const hay = normalizedHaystack(payload, ["mode", "route_id", "route_label", "route_name", "route", "branding_label", "description"]);
  const mode = stringValue(payload.mode);
  const modeKey = mode ? normalizedToken(mode) : undefined;

  if (
    hasAny(hay, ["select_bus_service"]) ||
    (hasAnyToken(hay, ["sbs"]) && hasAnyToken(hay, ["bus", "route", "service"]))
  ) {
    return "select_bus_service";
  }

  if (modeKey === "subway") return "subway";
  if (["commuter_rail", "rail"].includes(modeKey ?? "")) return "commuter_rail";
  if (modeKey === "ferry") return "ferry";
  if (modeKey === "bus") return "bus";

  if (identities.some(exactBusRouteId)) return "bus";
  if (identities.some(exactSubwayRouteId) && hasAnyToken(hay, ["subway", "train", "line"])) return "subway";
  if (hasAny(hay, ["penn_station_access_line"]) && hasAny(hay, ["metro_north", "railroad_line", "new_haven_line"])) return "commuter_rail";

  return undefined;
}

function normalizeRoutePayload(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  const routeType = stringValue(payload.route_type);
  const sourceRouteTypePhrase = stringValue(payload.source_route_type_phrase);
  const sourceRouteTypeNormalized = sourceRouteTypePhrase ? normalizeRouteTypeValue(sourceRouteTypePhrase) : undefined;
  if (routeType) {
    const normalized = normalizeRouteTypeValue(routeType);
    const sourceBackedBundle = sourceRouteTypeNormalized === "local_limited" ? sourceRouteTypeNormalized : undefined;
    const normalizedForStorage = sourceBackedBundle ?? normalized;
    addIfMissing(next, "route_type_normalized", normalizedForStorage);
    const variant = serviceVariantForRouteType(normalizedForStorage);
    if (variant) addIfMissing(next, "service_variant", variant);
  } else {
    const variant = serviceVariantForRouteType(sourceRouteTypeNormalized);
    if (variant) {
      addIfMissing(next, "route_type_normalized", sourceRouteTypeNormalized);
      addIfMissing(next, "service_variant", variant);
    }
  }

  const inferredRouteType = inferRouteTypeFromPayload(payload);
  addIfMissing(next, "route_type_normalized", inferredRouteType);
  const inferredVariant = serviceVariantForRouteType(inferredRouteType);
  if (inferredVariant) addIfMissing(next, "service_variant", inferredVariant);

  for (const value of stringArrayValues(payload.route_id)) {
    if (!plusRouteId(value)) continue;
    addIfMissing(next, "internal_route_id", value);
    addIfMissing(next, "route_id_authority", "mta_internal");
    addIfMissing(next, "source_route_surface", "mta_route_id");
    addIfMissing(next, "service_variant", "sbs");
  }

  return next;
}

function normalizeProjectStatus(value: string) {
  const key = normalizedToken(value);
  if (key.includes("abandoned") || key.includes("canceled") || key.includes("cancelled")) return "abandoned";
  if (
    key.includes("under_construction") ||
    key.includes("in_construction") ||
    key.includes("construction_started") ||
    key.includes("construction_began") ||
    key.includes("construction_commenced") ||
    key === "early_construction_stages" ||
    key === "groundbreaking" ||
    key.includes("groundbreaking_occurred") ||
    key === "about_to_begin_work" ||
    key === "begun"
  ) return "under_construction";
  if (key.includes("monitoring")) return "monitoring";
  if (
    key.includes("study") ||
    key.includes("planning") ||
    key.includes("preliminary") ||
    key === "draft" ||
    key === "draft_proposal" ||
    key === "concept_phase" ||
    key === "conceptual" ||
    key === "design" ||
    key === "design_phase" ||
    key === "in_design" ||
    key === "in_design_phase" ||
    key === "in_final_stages_of_design" ||
    key === "pre_implementation" ||
    key === "public_workshop" ||
    key === "public_workshop_conducted" ||
    key === "outreach" ||
    key === "hearings" ||
    key === "existing_conditions" ||
    key === "existing_conditions_meeting" ||
    key === "scoping"
  ) return "study";
  if (key === "proof_of_concept" || key.includes("pilot")) return "pilot";
  if (
    key.includes("pending_board_approval") ||
    key.includes("pending_mta_board_approval") ||
    key.includes("pending_board_authorization") ||
    key.includes("pending_board_ratification") ||
    key.includes("pending_approval") ||
    key.includes("pending_authorization") ||
    key.includes("pending_award") ||
    key.includes("award_pending") ||
    key.includes("awaiting_board_approval") ||
    key.includes("award_recommended_for_board_approval") ||
    key === "award_recommended" ||
    key.includes("board_approval_to_award") ||
    key.includes("board_approval_sought") ||
    key.includes("board_approval_requested") ||
    key.includes("committee_recommended_board_approval") ||
    key.includes("authorization_requested") ||
    key.includes("requesting_authorization") ||
    key.includes("requesting_board_approval") ||
    key.includes("submitted_for_board_approval") ||
    key.includes("submitted_for_mta_board_approval") ||
    key.includes("seeking_board_approval") ||
    key === "ratification_requested" ||
    key === "rfp" ||
    key === "rfp_pending" ||
    key === "rfp_released" ||
    key === "pending_rfp_authorization" ||
    key === "recommended_for_approval" ||
    key === "recommended_for_board_approval" ||
    key === "under_procurement" ||
    key === "under_solicitation" ||
    key === "public_solicitation_of_bids" ||
    key === "packages_of_already_designed_stations_to_begin_procurement" ||
    key === "in_negotiations_with_multiple_developers_selection_expected_by_summer_2021" ||
    key === "conditional_designation_pending" ||
    key === "crisi_grant_application_submitted_to_fra" ||
    key === "future" ||
    key === "next_project_to_advance" ||
    key === "upcoming" ||
    key === "upcoming_q1_2025" ||
    key === "upcoming_six_weekend_project_spanning_july_and_august" ||
    key === "beginning_in_q2_2025_through_2027" ||
    key === "implementation_begins_mid_july" ||
    key === "coming_expansion" ||
    key === "coming_in_may_2014" ||
    key === "work_currently_anticipated_to_begin_by_the_second_quarter_of_2024" ||
    key === "next_steps_upcoming_projects" ||
    key === "transmitted_to_ddc_for_design_and_construction" ||
    key === "supported_during_may_2025_timetable" ||
    key === "expected_to_open_in_march_2021" ||
    key === "forecasted_completion_march_2024" ||
    key === "forecast_award_december_2022_substantial_completion_forecasted_december_2024_on_target" ||
    key === "fulton_avenue_and_south_street_bridges_slated_to_be_fully_replaced_by_may_2025"
  ) {
    return "planned";
  }
  if (key.includes("proposed") || key.includes("planned") || key.includes("scheduled") || key.includes("starting")) return "planned";
  if (/\b100_complete\b/u.test(key) || /\b100_percent_complete\b/u.test(key)) return "implemented";
  if (/\b\d{1,2}_complete\b/u.test(key) || /\b\d{1,2}_percent_complete\b/u.test(key)) return "active";
  if (key.includes("nearing_substantial_completion")) return "active";
  if (key === "substantial_completion" || key.includes("substantial_completion_at_end")) return "implemented";
  if (
    key.includes("completed") ||
    key.includes("complete") ||
    key.includes("opened") ||
    key.includes("operational") ||
    key.includes("implemented") ||
    key.includes("permanent") ||
    key.includes("launched") ||
    key.includes("activated") ||
    key.includes("substantially_complete") ||
    key.includes("beneficial_use") ||
    key === "concluded" ||
    key === "deployed_april_2026" ||
    key === "existing" ||
    key === "expanded" ||
    key === "expanded_beyond_gct_to_north_white_plains" ||
    key === "expanded_from_7_to_45_locations" ||
    key === "in_service" ||
    key === "fully_back_in_service" ||
    key === "closed_out" ||
    key === "live" ||
    key === "post_implementation_evaluation" ||
    key === "superseded" ||
    key === "all_trains_operating_with_full_ptc_functionality" ||
    key === "deployed_successfully_used_during_two_past_snow_events"
  ) {
    return "implemented";
  }
  if (
    key.includes("active") ||
    key.includes("ongoing") ||
    key.includes("rollout") ||
    key.includes("in_progress") ||
    key.includes("underway") ||
    key.includes("continuing") ||
    key.includes("advancing") ||
    key === "early_phase" ||
    key === "in_development" ||
    key === "in_development_roll_out" ||
    key === "in_procurement" ||
    key === "in_its_early_stages" ||
    key === "kick_off" ||
    key === "moving_forward" ||
    key === "on_schedule_and_on_budget" ||
    key === "on_going" ||
    key === "implementation" ||
    key === "expanding_to_27_additional_platforms" ||
    key === "phasing_in_early_2023" ||
    key === "project_completion_slated_for_july_2023_currently_in_last_phase_of_construction" ||
    key === "property_acquisition_phase" ||
    key === "restart_station_reconstruction_and_ada_upgrades_at_hollis_lirr_procurement_for_subway_station_renewals_at_briarwood_ef" ||
    key === "resume_procurements_on_verrazzano_narrows_bridge_ramp_reconstruction_and_main_cable_dehumidification" ||
    key === "service_restored_september_3_2024_continues_until_q3_2027" ||
    key === "scaling_up" ||
    key === "expanding" ||
    key === "extended" ||
    key === "supported_during_this_timetable" ||
    key === "supported_during_this_timetable_to_improve_state_of_good_repair_and_reliability" ||
    key === "partially_in_service" ||
    key === "testing" ||
    key === "nearing_completion" ||
    key.includes("installation_is_progressing") ||
    key.includes("nearing_end_of_civil_work") ||
    key === "wrapping_up" ||
    key.includes("wrapping_up_as_of") ||
    key === "finishing_up" ||
    key === "implementation_started_january_2024"
  ) return "active";
  if (key.includes("program_context")) return "program_context";
  if (key.includes("stalled") || key.includes("resuming") || key.includes("on_hold") || key.includes("suspended") || key.includes("work_stopped")) return "stalled_resuming";
  if (
    key.includes("enacted") ||
    key.includes("final_plan_published") ||
    key.includes("approved") ||
    key.includes("adopted") ||
    key.includes("ratified") ||
    key.includes("awarded") ||
    key === "directed_by_law" ||
    key === "fema_reimbursement_secured" ||
    key === "fonsi_secured" ||
    key === "funding_added" ||
    key === "initial_investment_received" ||
    key === "lease_authorized" ||
    key === "option_exercised" ||
    key === "ordered" ||
    key === "purchase_authorized" ||
    key === "locally_preferred_alternative" ||
    key === "ratification_of_ion_declaration_and_contract_award"
  ) return "approved";
  return "other";
}

function normalizeProjectType(value: string) {
  const key = normalizedToken(value);
  const capitalInfrastructureProjectTypes = new Set([
    "ada_station_rehabilitation",
    "bridge",
    "bridge_sgr",
    "bridge_maintenance",
    "bridge_preservation",
    "bridge_rehabilitation",
    "bridge_repair",
    "bridge_repair_program",
    "bridge_replacement",
    "bridge_timber_replacement",
    "bridge_waterproofing",
    "bus_procurement",
    "cbtc_signal_modernization",
    "communications_and_signal_upgrade",
    "communications_based_train_control",
    "component_repairs",
    "concrete_coring",
    "concrete_tie_installation",
    "concrete_tie_installation_and_rail_replacement",
    "crossing_rehabilitation",
    "crossing_renewal",
    "depot_redevelopment",
    "design_build_bridge_replacement",
    "elevated_structure_steel_repairs_and_painting",
    "facility_improvement",
    "facility_upgrade",
    "electric_bus_procurement",
    "fleet_electrification",
    "fleet_conversion",
    "fleet_replacement",
    "fleet_transformation",
    "fleet_transition",
    "flag_repair",
	    "flood_mitigation_and_signal_repair",
	    "flood_protection",
	    "flood_protection_resiliency",
	    "fueling_station",
	    "geometry_improvement",
	    "grade_separation",
    "grade_crossing_elimination",
    "locomotive_acquisition_and_replacement",
    "locomotive_procurement",
    "network_expansion",
    "pocket_track",
    "pocket_track_and_bridge",
    "rail_expansion",
    "rail_car_procurement",
    "rail_replacement",
    "rail_replacement_and_maintenance",
    "railcar_procurement",
    "rolling_stock",
    "rolling_stock_procurement",
    "roadway_widening",
    "new_station",
    "platform_repair",
    "signal_cutover",
    "signal_and_communications_upgrade",
    "signal_modernization",
    "signal_replacement",
    "signal_system_modernization",
    "signal_upgrade",
    "signalization",
    "signals",
	    "signals_train_control",
	    "system_expansion",
	    "structural_repair",
		    "yard_expansion",
    "state_of_good_repair",
    "platform_refurbishment",
    "station_enhancement",
    "station_improvement",
    "station_improvements",
    "station_modernization",
    "station_redevelopment",
    "station_rehabilitation",
    "station_repair",
    "station_renewal",
    "station_renovation",
    "station_sgr",
    "station_upgrade",
    "station_upgrades",
    "subway_expansion",
    "subway_car_procurement",
    "switch_maintenance",
    "switch_and_signal_work",
    "track_and_power_maintenance",
    "track_and_signal_repair",
    "track_extension_and_signal_cutover",
    "track_maintenance",
    "track_maintenance_and_signal_cutover",
    "track_renewal",
    "track_surfacing",
    "track_switch_and_signal_project",
    "track_work",
    "track_work_and_maintenance",
    "track_rehabilitation",
    "track_replacement",
    "trackwork",
    "trackwork_and_schedule_adjustment",
    "trackwork_program",
	    "structural_repairs_design_bid_build",
	    "tunnel_lighting_installation",
	    "zero_emission_bus_deployment",
	    "zero_emission_buses",
	  ]);
  if (key.includes("bus_priority") || key.includes("bus_improvement")) return "bus_priority";
  if (key.includes("busway")) return "busway";
  if (key.includes("bus_lane")) return "bus_lane";
  if (key.includes("network_redesign")) return "bus_network_redesign";
  if (key.includes("transit_signal_priority") || key === "tsp") return "signal_priority";
  if (key.includes("enforcement") || key.includes("camera")) return "enforcement_program";
  if (key.includes("select_bus_service") || key === "sbs" || key === "sbs_upgrade" || key === "sbs_launch" || key.includes("bus_rapid_transit")) return "sbs_or_brt";
  if (key.includes("open_data") || key.includes("data_program")) return "data_program";
  if (key.includes("fare") || key === "tolling_program") return "fare_program";
  if (capitalInfrastructureProjectTypes.has(key)) return "capital_or_infrastructure";
  if (key.includes("capital") || key.includes("construction") || key.includes("infrastructure")) return "capital_or_infrastructure";
  if (
    key.includes("service_increase") ||
    key.includes("service_adjustment") ||
    key.includes("service_change") ||
    key === "service_enhancement" ||
    key === "service_expansion" ||
    key === "service_improvement"
  ) return "service_change";
  if (key.includes("traffic_flow") || key.includes("street_redesign")) return "street_redesign";
  if (key === "procurement_guidelines") return "policy_program";
  if (
    key === "access_solution" ||
    key === "ada_enhancements" ||
    key === "ada_improvement" ||
    key === "ada_improvements" ||
    key === "ada_rehabilitation" ||
    key === "ada_upgrades" ||
    key === "elevator" ||
    key === "elevator_installation" ||
    key === "elevator_rehabilitation" ||
    key === "elevator_replacement" ||
    key === "escalator_replacement"
  ) return "accessibility_or_safety";
  if (key.includes("intersection_improvement") || key.includes("accessibility") || key.includes("safety") || key.includes("pedestrian")) return "accessibility_or_safety";
  if (key === "bicycle_network" || key.includes("bike_boulevard") || key.includes("greenway") || key.includes("bike")) return "bike_facility";
  if (key.includes("executive_initiative") || key.includes("policy")) return "policy_program";
  if (key === "proof_of_concept" || key.includes("pilot")) return "pilot";
  if (key === "alternatives_analysis" || key.includes("report") || key.includes("study") || key.includes("plan")) return "planning_or_report";
  if (key.includes("legislation") || key.includes("legislative")) return "legislation";
  return "other";
}

function hasRailSignalInfrastructureProjectEvidence(hay: string) {
  const hasBusOrTrafficSignalContext =
    hasAny(hay, [
      "bus_signal_priority",
      "pedestrian_signal",
      "queue_jump_signal",
      "signal_timing",
      "traffic_signal_priority",
      "transit_signal_priority",
    ]) || hasAnyToken(hay, ["tsp"]);
  if (hasBusOrTrafficSignalContext) return false;
  if (hasAny(hay, ["software_support", "software_support_services"])) return false;

  if (
    hasAny(hay, [
      "cbtc",
      "communication_based_train_control",
      "communications_based_train_control",
      "modern_signals",
      "new_signals",
      "resignaling",
      "signal_box",
      "signal_houses",
      "signal_modernization",
      "signal_renewal",
      "signal_upgrades",
    ])
  ) {
    return true;
  }
  return hay.includes("signal_testing") && hasAnyToken(hay, ["interlocking", "line", "railroad", "station"]);
}

function hasMixedCurbsideParkingBundle(hay: string) {
  return (
    hasAny(hay, ["bus_lane", "bus_lanes", "truck_loading_zone", "truck_loading_zones"]) &&
    hasAny(hay, ["parking", "parking_changes", "taxi_stand", "taxi_stand_relocation", "turn_bay", "turn_bays"])
  );
}

function hasNoTypeBusFamilyExclusion(hay: string) {
  return (
    hasMixedCurbsideParkingBundle(hay) ||
    hasAny(hay, [
      "bicycle_racks",
      "bike_racks",
      "cashless_tolling",
      "congestion_pricing",
      "fare",
      "shuttle_bus",
      "shuttle_buses",
      "track_outage",
      "track_outages",
      "tracks_out_of_service",
      "toll",
      "tolling",
    ])
  );
}

function hasNoTypeBusPriorityProjectEvidence(hay: string) {
  if (hasNoTypeBusFamilyExclusion(hay)) return false;
  if (
    hay.includes("woodhaven_boulevard_queens_boulevard_to_107th_avenue") &&
    hasAny(hay, ["transit_and_pedestrian_safety_improvements"]) &&
    hasAny(hay, ["curb_extensions", "median_widenings", "raised_crosswalks"])
  ) {
    return true;
  }
  return (
    hasAny(hay, ["bus_service", "bus_services", "bus_speed", "bus_speeds", "bus_reliability", "bus_routes", "bus_stops"]) ||
    (hasAnyToken(hay, ["bus", "buses"]) && hasAny(hay, ["reliability", "service", "speeds"])) ||
    (hasAnyToken(hay, ["b14", "b38"]) && hasAny(hay, ["reliability", "service"]))
  );
}

function hasNoTypeConcreteAccessibilityProject(hay: string) {
  return (
    (hasAny(hay, ["42nd_street_corridor", "42nd_st_corridor"]) &&
      hasAny(hay, ["circulation_improvements", "escalator_replacement", "new_elevators"])) ||
    (hasAny(hay, ["rfk_bridge", "robert_f_kennedy_bridge"]) &&
      hasAny(hay, ["ada_ramp"]) &&
      hasAny(hay, ["fender_rehab", "fender_rehabilitation"]) &&
      hasAny(hay, ["completed", "on_time", "under_budget"])) ||
    (hasAnyToken(hay, ["ada", "accessibility", "accessible"]) &&
      hasAnyToken(hay, ["station", "stations", "lirr", "long_island_rail_road", "subway"]) &&
      hasAny(hay, [
        "ada_accessibility_project",
        "ada_project",
        "ada_stations_project",
        "awarded",
        "detectable_warning_surfaces",
        "dws",
        "elevator_replacement",
        "elevators_and_escalator_replacements",
        "fully_accessible_station_improvements",
        "fully_accessible_amityville_and_lindenhurst",
        "grand_st_station",
        "install",
        "installation",
        "new_elevators",
        "new_ada_accessible_stations",
        "opened_new_elevators",
        "project_award",
        "six_new_elevators",
        "williams_bridge_station",
      ]))
    ||
    (hasAny(hay, ["capital_program_ada_accessibility", "mets_willets_point_station_ada_accessibility_improvements"]) &&
      hasAny(hay, ["ada_accessibility", "developer_at_own_expense", "new_stations_completed", "station", "stations"]))
  );
}

function hasNoTypeCapitalCleanupProject(hay: string, mergedHay: string) {
  const combined = `${hay} ${mergedHay}`;
  return (
    (hay.includes("east_end_gateway_33_st_entrance") && hasAny(hay, ["completed", "completion_project"])) ||
    (hay.includes("grand_central_terminal_and_east_side_access_unified_trash_facility") && hasAny(hay, ["awarded", "project_award"])) ||
    (hay.includes("grand_central_terminal_improvements_to_terminal_building") && hasAny(hay, ["mta_metro_north_railroad", "proposed"])) ||
    (hay.includes("infrastructure_refurb_hudson_line") && hasAny(hay, ["oysterland_state_of_good_repair", "state_of_good_repair"])) ||
    (hay.includes("track_1_times_square_shuttle") && hasAny(hay, ["strengthen_and_expand_network", "strengthen_expand_network"])) ||
    (hasAny(hay, ["rfk_bridge", "robert_f_kennedy_bridge"]) &&
      hasAny(hay, ["approaches_on_randall_s_island", "randall_s_island"]) &&
      hasAny(hay, ["ongoing_improvements", "property_interests", "option_agreement"])) ||
    (hasAny(combined, ["grand_concourse_line"]) && hasAny(combined, ["defect", "defects", "repairing", "worksite_access_improvement"])) ||
    (hay.includes("elmont_ubs_arena_station") && hasAny(hay, ["first_new_lirr_station", "full_time_year_round_service", "two_way_service"])) ||
    (hay.includes("saga_nh_44_32") && hasAny(hay, ["bascule_support_framing", "interim_repair"])) ||
    (hay.includes("mott_haven_yard") && hasAny(hay, ["design_improvements", "fueling_time"])) ||
    (hay.includes("moving_ny_forward_program") && hasAny(hay, ["b_t", "traffic_volumes", "144_m", "work_in_2020"])) ||
    (hay.includes("park_avenue_viaduct_update") && hasAny(hay, ["in_progress", "update"])) ||
    (hasAny(hay, ["sandy_recovery_and_resilience_program", "sandy_recovery_resilience_program"]) &&
      hasAny(hay, ["coastal_surge_protections", "post_sandy"])) ||
    (hay.includes("transforming_42_st_grand_central") && hasAny(hay, ["grand_central_subway_transformation", "subway_transformation"])) ||
    (hay.includes("brewster_yard_union_depot_reorganization") && hasAny(hay, ["mta_metro_north_railroad", "proposed"])) ||
    (hay.includes("white_plains_station_project") && hasAny(hay, ["metro_north", "transformative_project", "white_plains_station"]))
  );
}

function normalizeProjectFamilyFromPayload(payload: JsonObject) {
  const hay = normalizedHaystack(payload, ["project_type", "project_name", "name", "description", "program"]);
  if (hasRailSignalInfrastructureProjectEvidence(hay)) return "capital_or_infrastructure";

  const projectType = stringValue(payload.project_type);
  if (!projectType) {
    const noTypeHay = normalizedHaystack(payload, ["project_name", "name", "description", "program", "status"]);
    const noTypeMergedHay = normalizedMergedHaystack(payload, ["project_name", "name", "description", "program", "status"]);
    if (hasNoTypeConcreteAccessibilityProject(noTypeHay)) {
      return "accessibility_or_safety";
    }
    if (
      hasAny(hay, ["public_transportation_agency_safety_plan", "ptasp", "agency_safety_plan"]) &&
      hasAny(hay, ["nyct", "department_of_buses", "department_of_subways", "system_safety", "safety_plan"])
    ) {
      return "accessibility_or_safety";
    }
    if (
      (hasAny(hay, ["joint_track_safety_audit"]) || hasAnyToken(hay, ["jtsa"])) &&
      ((hasAny(hay, ["work_zone", "work_zones"]) && hasAny(hay, ["compliance", "roadway_worker_protection"])) ||
        (hasAny(hay, ["team_expansion", "additional_auditors"]) && hasAny(hay, ["select_audit_types", "trend_analyses"])))
    ) {
      return "accessibility_or_safety";
    }
    if (
      noTypeHay.includes("ntsb_recommendations_update") &&
      noTypeHay.includes("recommendations_issued_to_the_mta_by_the_ntsb") &&
      hasAny(noTypeMergedHay, ["open_acceptable_action", "open_investigations"])
    ) {
      return "accessibility_or_safety";
    }
    if (
      hasAny(noTypeHay, ["metro_north_laser_train_technology_adoption"]) &&
      hasAny(noTypeHay, ["remove_leaf_debris_from_tracks", "leaf_debris"]) &&
      (hasAny(noTypeHay, ["will_pilot_it_at_higher_speeds", "pilot_it_at_higher_speeds"]) ||
        (hasAny(noTypeHay, ["will_pilot", "pilot"]) && hasAny(noTypeHay, ["higher_speeds"]))) &&
      hasAny(noTypeHay, ["high_pressure_rail_washer_trains", "rail_washer_trains"])
    ) {
      return "accessibility_or_safety";
    }
    if (
      hasAny(hay, ["bus_lane", "bus_lanes", "offset_bus_lane", "curbside_bus_lane", "bus_priority_lane", "dedicated_bus_lane", "dedicated_bus_lanes"]) &&
      hasAnyToken(hay, ["bus", "buses", "route", "routes", "riders", "passengers"]) &&
      !hasNoTypeBusFamilyExclusion(noTypeHay)
    ) {
      return "bus_lane";
    }
    if (
      hasAny(noTypeHay, ["battery_electric_access_a_ride_aar_van", "battery_electric_aar_van"]) &&
      hasAny(noTypeHay, ["pilot_program"])
    ) {
      return "pilot";
    }
    if (
      hasAny(noTypeHay, ["route_improvement_initiative"]) &&
      hasAny(noTypeHay, ["historically_low_performing_bus_routes", "low_performing_bus_routes"]) &&
      hasAnyToken(noTypeHay, ["b12", "bus", "routes"])
    ) {
      return "service_change";
    }
    if (
      hasAny(noTypeHay, ["e_hail_service_expansion", "expanding_e_hail_service"]) &&
      hasAny(noTypeHay, ["access_a_ride", "aar", "paratransit"]) &&
      !hasAny(noTypeHay, ["procurement", "contract", "contracts"])
    ) {
      return "service_change";
    }
    if (
      hasAny(noTypeHay, ["daily_roundtrip", "one_daily_roundtrip"]) &&
      hasAny(noTypeHay, ["albany", "grand_central_terminal", "metro_north"]) &&
      hasAny(noTypeHay, ["launch", "to_launch"])
    ) {
      return "service_change";
    }
    if (
      hasAny(hay, ["bus_priority", "select_bus_service", "sbs", "bus_rapid_transit"]) &&
      hasAnyToken(hay, ["bus", "buses", "route", "routes", "riders", "passengers"]) &&
      !hasNoTypeBusFamilyExclusion(noTypeHay)
    ) {
      return "bus_priority";
    }
    if (hasNoTypeBusPriorityProjectEvidence(noTypeHay)) {
      return "bus_priority";
    }
    if (hasAny(noTypeHay, ["city_ticket_expansion", "cityticket_expansion"])) {
      return "fare_program";
    }
    if (hasAny(noTypeHay, ["advance_congestion_pricing", "advancing_congestion_pricing", "congestion_pricing"])) {
      return "fare_program";
    }
    if (
      hasAny(noTypeHay, ["student_metrocard_incentive_program"]) &&
      hasAny(noTypeHay, ["student_metrocard", "student_metrocards"]) &&
      hasAny(noTypeHay, ["swipe", "raffle"]) &&
      hasAny(noTypeHay, ["travel_to_or_from_school"])
    ) {
      return "fare_program";
    }
    if (
      (hasAny(noTypeHay, ["verrazano_bridge_bi_directional_cashless_tolling", "verrazzano_bridge_bi_directional_cashless_tolling"]) &&
        hasAny(noTypeHay, ["cashless_tolling", "bi_directional_cashless_tolling"])) ||
      (hasAny(noTypeHay, ["two_way_tolling_at_the_verrazzano_narrows_bridge", "two_way_tolling_at_the_verrazano_narrows_bridge"]) &&
        hasAny(noTypeHay, ["two_way_tolling", "tolling_area"]))
    ) {
      return "fare_program";
    }
    if (
      hasAny(noTypeHay, ["curb_regulation", "curb_regulations"]) &&
      hasAny(noTypeHay, ["truck_loading_zone", "truck_loading_zones"]) &&
      hasAny(noTypeHay, ["parking", "parking_changes"])
    ) {
      return "street_redesign";
    }
    if (hasAny(noTypeHay, ["cracking_down_on_toll_evasion", "toll_evasion"]) && hasAny(noTypeHay, ["cracking_down", "enforcement"])) {
      return "enforcement_program";
    }
    if (hasAny(noTypeHay, ["fema_reimbursement"]) && hasAny(noTypeHay, ["secured"])) {
      return "finance_or_funding";
    }
    if (
      hasAny(noTypeHay, ["department_of_buses_north_star", "department_of_subways_north_star"]) &&
      hasAny(noTypeHay, ["increase_overall_customer_satisfaction_10_by_june_2024"])
    ) {
      return "customer_experience";
    }
    if (
      hasAny(noTypeHay, ["five_year_diversity_equity_and_inclusion_dei_strategic_plan_nyct_initiatives", "five_year_dei_strategic_plan_nyct_initiatives"]) &&
      hasAny(noTypeHay, ["year_1_progress_report"])
    ) {
      return "planning_or_report";
    }
    if (hasAny(noTypeHay, ["transforming_jamaica"]) && hasAny(noTypeHay, ["take_the_survey_online"])) {
      return "planning_or_report";
    }
    if (hasAny(noTypeHay, ["mymta_app_for_paratransit"]) && hasAny(noTypeHay, ["launch", "launched", "increase_in_usage"])) {
      return "technology_system";
    }
    if (
      hasAny(noTypeHay, ["promoting_public_safety"]) &&
      hasAny(noTypeHay, ["homeless_outreach"]) &&
      hasAny(noTypeHay, ["department_of_homeless_services"])
    ) {
      return "accessibility_or_safety";
    }
    if (
      (hasAny(noTypeHay, ["achieve_financial_stability"]) && hasAny(noTypeHay, ["nys_budget", "projected_deficits"])) ||
      (hasAny(noTypeHay, ["saving_taxpayer_money"]) && hasAny(noTypeHay, ["financial_stability_and_viability"]))
    ) {
      return "finance_or_funding";
    }
    if (
      hasAny(noTypeHay, ["gct_short_term_retail_licensing_program_modification", "short_term_retail_licensing_program"]) &&
      hasAny(noTypeHay, ["retail_kiosks", "rmu_term", "licensing_program"]) &&
      hasAny(noTypeHay, ["expansion", "modification", "removes_rental_range"])
    ) {
      return "real_estate_or_property";
    }
    if (
      hasAny(noTypeHay, ["east_new_york_central_maintenance_facility"]) &&
      hasAny(noTypeHay, ["lease"]) &&
      hasAny(noTypeHay, ["funded", "funding", "final_proposed_budget"])
    ) {
      return "real_estate_or_property";
    }
    if (
      hasAny(noTypeHay, ["jamaica_terminal_relocation"]) &&
      hasAny(noTypeHay, ["lease", "rent", "swing_room", "terminal_and_swing_room_space"]) &&
      hasAny(noTypeHay, ["funded", "funding", "final_proposed_budget"])
    ) {
      return "real_estate_or_property";
    }
    if (hasNoTypeCapitalCleanupProject(noTypeHay, noTypeMergedHay)) {
      return "capital_or_infrastructure";
    }
    if (
      hasAny(noTypeHay, ["metro_north_virtual_reality_training_program", "vr_training_program"]) &&
      hasAny(noTypeHay, ["operations_training_department"]) &&
      hasAny(noTypeHay, ["employee_training", "immersive_modules", "trained"])
    ) {
      return "internal_operations";
    }
    const hasVehicleFleetAsset = hasAny(hay, [
      "battery_electric_bus",
      "battery_electric_buses",
      "dual_mode_locomotive",
      "dual_mode_locomotives",
      "electric_bus",
      "electric_buses",
      "electric_bus_order",
      "fleet_by_2040",
      "hybrid_electric_bus",
      "hybrid_electric_buses",
      "open_gangway_subway_car",
      "open_gangway_subway_cars",
      "r211",
      "railcar",
      "railcars",
      "rolling_stock",
      "subway_car",
      "subway_cars",
      "train_car",
      "train_cars",
      "zero_emission_bus",
      "zero_emission_buses",
      "zero_emission_fleet",
    ]);
    const hasVehicleFleetAction = hasAny(hay, [
      "completion_goal",
      "delivery",
      "deliver",
      "delivered",
      "deployment",
      "deployed",
      "design_manufacturing_testing_and_delivery",
      "fleet_by_2040",
      "introduced",
      "introduction",
      "order",
      "ordered",
      "procure",
      "procurement",
      "purchase",
      "replacing",
      "replacement",
    ]);
    const hasVehicleFleetExclusion = hasAny(hay, [
      "access_a_ride",
      "aar",
      "emergency_bus_services",
      "heritage_series",
      "inaugural_run",
      "laser_train",
      "pilot",
      "rail_washer",
      "rebrand",
      "rebranding",
      "replacement_parts",
      "restoration",
      "scheduled_bus_services",
      "service_contract",
      "simulator",
      "training",
      "tribute",
      "van",
      "vans",
      "vinyl_wrap",
    ]);
    if (hasVehicleFleetAsset && hasVehicleFleetAction && !hasVehicleFleetExclusion) {
      return "capital_or_infrastructure";
    }
    const hasFixedGuidewayAssetWork =
      hasAny(hay, [
        "track_reconstruction",
        "track_replacement",
        "track_maintenance",
        "track_improvement",
        "realignment_of_track",
        "third_rail_infrastructure",
        "third_rail_maintenance",
        "rail_and_crossing_maintenance",
        "rail_crossing_maintenance",
        "rail_integrity",
        "track_and_rail_integrity",
        "rail_testing",
        "ultrasonic_rail",
        "rail_flaw",
        "track_geometry",
        "switch_installation",
        "switch_replacement",
        "removal_installation_of_switches",
        "crossing_renewal",
        "railroad_crossing_rehabilitation",
        "substation_replacement",
        "substation_upgrade",
        "substation_hardening",
        "mainline_expansion",
        "main_line_expansion",
        "third_track",
      ]) ||
      (hasAny(hay, ["interlocking", "interlockings"]) &&
        hasAny(hay, ["modification", "realignment", "reconstruction", "removing", "switch", "station_tracks", "railroad_infrastructure", "main_line_expansion"]));
    const hasFixedGuidewayExclusion = hasAny(hay, [
      "joint_track_safety_audit",
      "safety_audit",
      "auditor",
      "auditors",
      "track_outage",
      "tracks_out_of_service",
      "shuttle_bus",
      "bus_services",
      "service_disruptions",
      "track_intrusion",
      "track_trespassing",
      "trespassing",
    ]);
    if (hasFixedGuidewayAssetWork && !hasFixedGuidewayExclusion) {
      return "capital_or_infrastructure";
    }
    if (
      hasAny(hay, ["fare_gate", "fare_gates"]) &&
      hasAny(hay, ["fare_gate_strategy", "safe_accessible_and_modern_fare_gate_rfi", "rfi_submissions", "in_lab_testing", "in_system_testing"])
    ) {
      return "fare_program";
    }
    const hasStationContext = hasAnyToken(hay, ["station", "stations"]) || hasAny(hay, ["subway_station", "subway_stations"]);
    const hasLedLighting = (hasAnyToken(hay, ["led", "leds"]) && hasAnyToken(hay, ["light", "lights", "lighting"])) || hasAny(hay, ["led_light", "led_lighting", "led_lights"]);
    const hasLightingReplacementConversion = hasAnyToken(hay, ["conversion", "conversions", "convert", "converting", "replace", "replacing", "replacement"]);
    if (hasStationContext && hasLedLighting && hasLightingReplacementConversion) {
      return "capital_or_infrastructure";
    }
    const hasLineStructureRepair =
      (hasAny(hay, ["line_structure", "line_structures"]) || (hay.includes("eastern_parkway_line") && hasAny(hay, ["structural_repair", "structural_repairs"]))) &&
      hasAny(hay, ["closed_out", "concrete", "defect", "defects", "repair", "repairs", "steel"]);
    const hasLineStructureRepairExclusion = hasAny(hay, [
      "ada",
      "accessibility",
      "accessible",
      "bike",
      "bicycle",
      "bus_lane",
      "bus_priority",
      "customer_service",
      "fare",
      "pedestrian",
      "service_contract",
      "toll",
    ]);
    if (hasLineStructureRepair && !hasLineStructureRepairExclusion) {
      return "capital_or_infrastructure";
    }
    const hasBikeFacilityEvidence =
      hasAnyToken(hay, ["bike", "bicycle", "bicyclists", "cycling", "micromobility"]) ||
      hasAny(hay, ["bicycle_and_pedestrian", "bicycle_pedestrian", "bike_racks", "bike_storage", "bpm_access", "secure_bike_storage", "shared_use_path"]);
    const hasPermanentBikeRacks =
      hasAny(hay, ["bike_racks", "bicycle_racks"]) && hasAnyToken(hay, ["permanent"]) && hasAnyToken(hay, ["bridge", "bridges", "route", "routes", "station", "stations"]);
    const hasBridgeBikePedCapitalWork =
      hasAnyToken(hay, ["bridge", "bridges"]) &&
      (hasAny(hay, ["bicycle_and_pedestrian", "bicycle_pedestrian"]) || hasAnyToken(hay, ["bicycle", "cycling", "micromobility"])) &&
      hasAnyToken(hay, ["access", "capital", "improvement", "improvements", "path", "planning", "ramp", "walkway"]);
    const hasBikeFacilityAsset =
      hasAny(hay, ["bike_storage", "bpm_access", "grand_central_terminal", "oonee", "secure_bike_storage", "shared_use_path"]) ||
      hasPermanentBikeRacks ||
      hasBridgeBikePedCapitalWork;
    const hasBikeFacilityExclusion = hasAny(hay, ["bus_lane", "bus_priority", "fare", "sbs", "select_bus_service", "service_contract", "toll"]);
    if (hasBikeFacilityEvidence && hasBikeFacilityAsset && !hasBikeFacilityExclusion) {
      return "bike_facility";
    }
    const hasStructuralBridgeAsset =
      hasAnyToken(hay, ["bridge", "bridges", "viaduct", "viaducts", "skewbacks", "anchorage"]) ||
      hasAny(hay, ["hammels_wye", "south_channel_bridge", "suspended_span"]);
    const hasStructuralBridgeWork = hasAny(hay, [
      "anchorage_structures",
      "approach_structures",
      "bridge_timbers",
      "deck_replacement",
      "hammels_wye",
      "rehab",
      "rehabilitation",
      "reconstruction",
      "replacement",
      "south_channel_bridge",
      "steel_arch",
      "structural_rehabilitation",
      "structural_repair",
      "structural_repairs",
    ]);
    const hasBridgeContextExclusion =
      hasAnyToken(hay, ["ada", "accessible", "accessibility", "bike", "bicycle", "pedestrian", "micromobility", "ramp", "monitoring", "detection", "tolling", "cashless", "fare", "elevator", "escalator", "fender"]) ||
      hasAny(hay, ["bike_racks", "safety_fence"]);
	    if (hasStructuralBridgeAsset && hasStructuralBridgeWork && !hasBridgeContextExclusion) {
	      return "capital_or_infrastructure";
	    }
    const hasNoTypeNamedInfrastructureExclusion = hasAny(hay, [
      "access_a_ride",
      "aar",
      "blueprint",
      "cashless_tolling",
      "cell_connectivity",
      "cell_service",
      "cellular",
      "connectivity",
      "detection",
      "fare",
      "license",
      "licensing",
      "model_train",
      "monitoring",
      "planning",
      "retail",
      "safety_fence",
      "service_launch",
      "telecom",
      "telecommunications",
      "toll",
      "tolling",
      "westward_extension",
      "wifi",
      "will_rebuild",
      "wireless",
    ]);
    const hasNoTypeNamedStationOrConcourseWork =
      (hay.includes("babylon_station") && hasAny(hay, ["platforms", "reconstruction", "rehabilitating"])) ||
      (hay.includes("expanded_lirr_concourse") && hasAny(hay, ["expanded", "under_construction"])) ||
      ((hay.includes("lirr_33rd_st_concourse") || hay.includes("lirr_33rd_street_concourse")) &&
        hasAny(hay, ["new_lirr_concourse", "opening", "under_construction"])) ||
      (hay.includes("fleetwood_parking_lot") && hasAny(hay, ["construction_contract", "repair", "state_of_good_repair"])) ||
      (hay.includes("ronkonkoma_station_parking_garage") && hasAny(hay, ["rehabilitation", "repairs", "structural_repairs"])) ||
      (hay.includes("white_plains_station") && hasAny(hay, ["gut_rehabilitation", "rehabilitation", "renovations"])) ||
      (hay.includes("yaphank_station") && hasAny(hay, ["relocation", "relocation_project"]));
    const hasNoTypeNamedTunnelWork =
      (hasAny(hay, ["canarsie_l_train_tunnel", "canarsie_tube", "canarsie_tunnel"]) && hasAny(hay, ["completed", "completion", "improvements", "project", "under_budget"])) ||
      (hay.includes("rutgers_tunnel") && hasAny(hay, ["repair", "rehab", "rehabilitation", "sandy_damage"])) ||
      (hay.includes("queens_midtown_tunnel") && hasAny(hay, ["communication_systems", "control", "controls", "modernization", "tunnel_controls"]));
    const hasNoTypeNamedBridgeWork =
      (hay.includes("harlem_river_lift_bridge") && hasAny(hay, ["award", "project", "project_award"])) ||
      (hasAny(hay, ["jfk_bridge_harlem_river_drive", "rfk_bridge_to_harlem_river_drive", "rfk_bridge_to_the_harlem_river_drive"]) &&
        hasAny(hay, ["completion_project", "connect", "connection", "constructing", "design_build", "ramp"])) ||
      (hasAny(hay, ["anchor_spans", "staten_island_approach", "upper_level_brooklyn", "vnb_upper_level"]) &&
        hasAny(hay, ["critical_repairs", "deck", "replace_deck", "structural_steel"]));
    const hasNoTypeNamedAssetWork =
      (hay.includes("dobbs_ferry_culvert") && hasAny(hay, ["constructing", "new_culvert", "replacement"])) ||
      (hay.includes("pleasantville_substation") && hasAny(hay, ["construction", "new_electrical_substation", "traction_power"])) ||
      (hay.includes("grand_central_artery") && hasAny(hay, ["improvements", "initiative", "sgr", "state_of_good_repair", "structural"]));
    if (
      !hasNoTypeNamedInfrastructureExclusion &&
      (hasNoTypeNamedStationOrConcourseWork || hasNoTypeNamedTunnelWork || hasNoTypeNamedBridgeWork || hasNoTypeNamedAssetWork)
    ) {
      return "capital_or_infrastructure";
    }
    const hasNoTypePlanningOrReport =
      (hay.includes("corporate_governance_committee_work_plan") &&
        hasAny(hay, ["recurring_and_specific_agenda_items", "work_plan_approval", "2025_work_plan_approval"])) ||
      (hay.includes("second_avenue_subway") &&
        hay.includes("125th_street_westward_extension") &&
        hay.includes("analysis") &&
        hay.includes("tunnel_boring_machines")) ||
      (hay.includes("potential_expansion_project") &&
        hay.includes("advancing_planning") &&
        hasAny(hay, ["2025_2029_capital_plan", "2025_29_capital_plan"]) &&
        !hay.includes("interboro_express"));
    if (hasNoTypePlanningOrReport) {
      return "planning_or_report";
    }
    if (
      hay.includes("governance_guidelines") &&
      hay.includes("public_authorities_law") &&
      hay.includes("conflict_of_interest") &&
      (hay.includes("ethics_commission_reform_act") || hay.includes("coelig"))
    ) {
      return "policy_program";
    }
    const hasNoTypeTechnologySystem =
      (hay.includes("boldyn_networks") &&
        hay.includes("continuous_cell_connectivity") &&
        hay.includes("250_miles") &&
        hay.includes("subway_tunnels")) ||
      (hasAny(hay, ["governance_risk_and_compliance_system", "grc_system"]) && hay.includes("saas") && hay.includes("technical_support")) ||
      (hay.includes("tbta_drone_program") && hay.includes("advanced_technologies") && hay.includes("security") && hay.includes("operational_excellence"));
    if (hasNoTypeTechnologySystem) {
      return "technology_system";
    }
    const hasNoTypeClimateInfrastructure =
      (hay.includes("hudson_line_climate_resilience_blueprint") &&
        hay.includes("will_rebuild_critical_infrastructure") &&
        hasAny(hay, ["culverts", "drainage", "retaining_walls", "shorelines", "track"])) ||
      (hay.includes("climate_resilience_hudson_line") && (hay.includes("design_stabilization") || hay.includes("road_protections"))) ||
      (hay.includes("hudson_line_resiliency") && hasAny(hay, ["initial_investment", "design_entering_procurement"]));
    const hasNoTypeMajorCapitalInfrastructure =
      (hay.includes("interboro_express") && hay.includes("major_capital_project")) ||
      (hay.includes("tibbets_brook_daylighting") && hay.includes("open_channel") && hay.includes("closed_conduit") && hay.includes("broadway_sewer")) ||
      (hasAny(hay, ["verrazzano_narrows_bridge_safety_fence", "vnb_safety_fence"]) &&
        hasAny(hay, ["upper_and_lower_level_suspended_spans", "upper_and_lower_levels_of_suspended_spans"]));
    if (hasNoTypeClimateInfrastructure || hasNoTypeMajorCapitalInfrastructure) {
      return "capital_or_infrastructure";
    }
    const hasNoTypeAccessibilityOrSafety =
      (hasAny(hay, ["detectable_warning_surfaces", "dws"]) && hay.includes("install") && hay.includes("remaining_stations")) ||
      (hay.includes("metropolitan_av") && hay.includes("lorimer_st") && hay.includes("six_new_elevators")) ||
      (hasAny(hay, ["elevators_and_escalator_replacements_citywide", "elevators_and_escalators_citywide"]) && hasAny(hay, ["project_award", "awarded"])) ||
      (hasAny(hay, ["bronx_whitestone_bridge", "bwb"]) &&
        hasAny(hay, ["rfk_bridge", "robert_f_kennedy_bridge"]) &&
        hay.includes("electronic_traffic_monitoring") &&
        hay.includes("fire_detection"));
    if (hasNoTypeAccessibilityOrSafety) {
      return "accessibility_or_safety";
    }
    if (hay.includes("crz_timepoint_pilot") && hay.includes("pilot") && hay.includes("removal_of_timepoints")) {
      return "pilot";
    }
	  }
  if (!projectType) return undefined;

  const typeKey = normalizedToken(projectType);
  const projectName = stringValue(payload.project_name) ?? stringValue(payload.name);
  const projectNameKey = projectName ? normalizedToken(projectName) : undefined;
  if (typeKey === "shuttle" && projectNameKey === "a_shuttle") {
    return "service_change";
  }
  if (typeKey === "track_outage" && projectNameKey === "harlem_line_planned_track_outage" && hay.includes("harlem_line")) {
    return "service_change";
  }
  if (typeKey === "data_initiative" && hasAny(hay, ["open_data", "mta_open_data"])) {
    return "data_program";
  }
  if (typeKey === "challenge" && hasAny(hay, ["open_data", "open_data_library", "mta_open_data"])) {
    return "data_program";
  }
  if (typeKey === "dashboard" && hasAny(hay, ["capital_program_dashboard"]) && hasAny(hay, ["capital_program", "2025_2029"])) {
    return "data_program";
  }
  if (
    typeKey === "license_agreement" &&
    hasAny(hay, ["signal_tower"]) &&
    hasAny(hay, ["constructing", "construction", "staging_area"]) &&
    hasAny(hay, ["rockaway_line", "resiliency"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "license_agreement" &&
    hasAny(hay, ["temporary_parking"]) &&
    hasAnyToken(hay, ["bus", "buses"]) &&
    hasAny(hay, ["construction", "during_ongoing_construction", "ongoing_construction"]) &&
    hasAny(hay, ["bus_depot", "depot", "kingsbridge"])
  ) {
    return "capital_or_infrastructure";
  }
  const contractDeliveryTypes = new Set(["design_build", "design_build_contract", "design_bid_build", "design_bid_build_a_b", "design_build_public_works"]);
  if (
    (contractDeliveryTypes.has(typeKey) || typeKey === "public_private_partnership") &&
    hasAnyToken(hay, ["ada", "accessibility", "accessible", "elevator", "elevators", "escalator", "escalators", "ramp", "ramps"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "design_build_finance_maintain_p3" &&
    hasAnyToken(hay, ["ada", "accessibility", "elevator", "elevators"]) &&
    hasAny(hay, ["subway_stations", "nyct_subway_stations"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "viaduct_rehabilitation_public_private_partnership" &&
    hasAny(hay, ["grand_central_terminal_train_shed", "train_shed"]) &&
    hasAny(hay, ["jpmc", "rehabilitation_work", "sector_2"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "design_build" &&
    (hasAny(hay, ["laser_intrusion", "laser_intrusion_detection"]) ||
      (hasAny(hay, ["intrusion_detection"]) && hasAny(hay, ["subway_tube", "subway_tubes", "under_river", "under_river_tubes"])))
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "design_build" &&
    hasAny(hay, ["electronic_monitoring", "monitoring_detection"]) &&
    hasAny(hay, ["detection", "detection_systems"]) &&
    hasAny(hay, ["bridge", "bridges", "bronx_whitestone", "robert_f_kennedy", "rfk"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "design_build" &&
    hasAny(hay, ["facility_monitoring", "monitoring_and_safety_systems", "safety_systems"]) &&
    hasAny(hay, ["hugh_l_carey_tunnel", "queens_midtown_tunnel", "qmt"]) &&
    hasAny(hay, ["access_control", "fire_alarm", "intrusion_detection", "real_time_digital_traffic_signs", "security_infrastructure"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "design_build" &&
    (hasAny(hay, ["pa_cis"]) ||
      (hasAny(hay, ["public_address"]) && hasAny(hay, ["customer_information_sign", "customer_information_signs"]))) &&
    hasAny(hay, ["replace", "replacement", "upgrade"]) &&
    hasAny(hay, ["canarsie", "canarsie_line", "along_nyct_canarsie_line"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "design_build" &&
    hasAnyToken(hay, ["camera", "cameras", "cctv"]) &&
    hasAny(hay, ["closed_circuit_television", "fare_control", "passenger_identification"])
  ) {
    return "enforcement_program";
  }
  if (
    ["design_build", "design_build_contract"].includes(typeKey) &&
    hasAny(hay, [
      "abutment_wall",
      "bridge",
      "bridges",
      "cable_dehumidification",
      "cbtc",
      "communication_based_train_control",
      "crosstown_line",
      "dehumidification",
      "electric_vehicle_charging",
      "fire_alarm",
      "fire_suppression",
      "fire_water",
      "flood",
      "flood_mitigation",
      "fulton_street_line",
      "fueling_station",
      "g_line",
      "interlocking",
      "main_cable",
      "painting",
      "power",
      "railroad_bridge",
      "railroad_viaduct",
      "refueling_station",
      "signal",
      "signals",
      "signal_system",
      "skewback",
      "station",
      "stations",
      "structural",
      "structural_improvements",
      "substation",
      "substations",
      "substructure",
      "superstructure",
      "switchgear",
      "track",
      "tracks",
      "traction_power",
      "tunnel",
      "tunnels",
      "viaduct",
    ]) &&
    !hasAny(hay, [
      "audio_call_recording",
      "camera",
      "cameras",
      "cctv",
      "connected_oriented_ethernet",
      "customer_information_sign",
      "electronic_monitoring",
      "facility_monitoring",
      "laser_intrusion",
      "monitoring_detection",
      "pa_cis",
      "pbx",
      "private_branch_exchange",
      "radio",
      "radio_system",
      "safety_systems",
      "security_infrastructure",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["design_build", "design_build_contract", "systems_replacement"].includes(typeKey) &&
    hasAny(hay, ["base_radio_sites", "digital_radio", "field_radios", "radio_dispatch", "radio_system", "t_band_radio", "uhf_t_band", "vhf_radio"]) &&
    hasAny(hay, ["control_centers", "new_digital_radio", "replace", "replacement", "upgrades"]) &&
    !hasAny(hay, ["audio_call_recording", "pbx", "private_branch_exchange"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "noncompetitive_miscellaneous_service_agreement_ion_ratification" &&
    hasAny(hay, ["bus_radio_system"]) &&
    hasAny(hay, ["bus_command_center", "command_center"]) &&
    hasAny(hay, ["critical_infrastructure_upgrade", "critical_infrastructure_upgrades", "geographic_redundancy", "virtualized_platform_upgrade"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "capacity_improvement" &&
    hasAny(hay, ["station_tracks", "interlocking", "interlockings", "crossovers", "platform"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["customer_service", "customer_service_initiative"].includes(typeKey) &&
    hasAny(hay, ["customer_service_center", "customer_service_centers"]) &&
    hasAny(hay, ["omny", "reduced_fare", "station", "stations", "subway"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["parking_expansion", "parking_facility", "parking_garage_and_transportation_hub"].includes(typeKey) &&
    hasAny(hay, ["garage", "garages", "lot", "parking", "parking_garage", "parking_lot"]) &&
    hasAny(hay, ["constructing", "constructed", "expansion", "new", "station", "stations"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "structural_repairs" &&
    hasAny(hay, ["station_garage", "poughkeepsie_station_garage"]) &&
    hasAny(hay, ["elevator_replacement", "gutter_repairs", "roof_system", "structural_repairs"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["station_refresh", "station_refresh_program", "station_renovation_program", "station_maintenance"].includes(typeKey) &&
    hasAny(hay, ["station", "stations", "subway_station", "subway_stations"]) &&
    hasAny(normalizedHaystack(payload, ["project_name", "name", "description", "status", "program"]), [
      "cleanliness",
      "cosmetic_upgrades",
      "deep_cleaning",
      "improved_lighting",
      "light_fixture_replacement",
      "planned_closures",
      "power_washing",
      "re_new_vation",
      "renewvation",
      "station_refresh",
      "stair_contrast",
      "tactile_warning_strips",
      "visible_problems",
      "water_intrusion_prevention",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "upgrade" &&
    hasAny(hay, ["station", "stations", "subway_station", "subway_stations"]) &&
    hasAny(hay, ["brighter_led", "led_bulb", "led_bulbs", "led_lighting", "lighting"]) &&
    hasAny(hay, ["illuminating", "upgrade", "upgrading"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "facility" &&
    hasAny(hay, ["mow_situation_room", "situation_room"]) &&
    hasAny(hay, ["emergency_management"]) &&
    hasAny(hay, ["inclement_weather", "major_subway_incidents", "subway_incidents"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "station_reopening" &&
    hasAny(hay, ["station", "stations", "breakneck_ridge_station"]) &&
    hasAny(hay, ["safety_enhancement", "safety_enhancement_work", "safety_enhancements"]) &&
    hasAny(hay, ["improvement", "improvements", "station_improvement", "station_improvements"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    ["request_for_proposals", "rfp", "solicitation"].includes(typeKey) &&
    hasAny(hay, ["intelligent_transit_signal_priority", "intelligent_transit_signal_priority_system", "itsp"]) &&
    hasAny(hay, ["transit_signal_priority", "signal_priority"]) &&
    hasAny(hay, ["bus", "buses", "mta_bus", "mta_bus_company", "nyct", "nyct_and_mta_bus", "new_york_city_transit"])
  ) {
    return "signal_priority";
  }
  if (
    ["tolling_program_implementation", "pricing_program"].includes(typeKey) &&
    hasAny(hay, ["central_business_district_tolling", "congestion_pricing", "tolling_program"])
  ) {
    return "fare_program";
  }
  if (typeKey === "congestion_pricing" && hasAny(hay, ["central_business_district_tolling_program", "congestion_pricing_program"])) {
    return "fare_program";
  }
  if (typeKey === "mobile_application" && hasAny(hay, ["e_zpass", "toll_payment", "tolls_by_mail"])) {
    return "fare_program";
  }
  if (
    ["implementation", "procurement", "procurement_contract"].includes(typeKey) &&
    hasAny(hay, ["e_zpass"]) &&
    hasAny(hay, ["electronic_toll_collection", "electronic_toll_collection_system"]) &&
    hasAny(hay, ["electronic_transponder", "electronic_transponders", "transponder", "transponders"])
  ) {
    return "fare_program";
  }
  if (
    ["personal_service_contract", "procurement", "procurement_amendment"].includes(typeKey) &&
    hasAny(hay, ["all_electronic_open_road_tolling", "cashless_tolling", "open_road_tolling", "ort_system"]) &&
    hasAny(hay, ["install_and_maintain", "maintenance_services", "option_renewal", "option_renewals"]) &&
    hasAny(hay, ["bridges_and_tunnels", "mta_bridges_and_tunnels", "tbta", "toll_facilities"])
  ) {
    return "fare_program";
  }
  if (
    typeKey === "personal_service_contract" &&
    hasAny(hay, ["tbta", "triborough_bridge_and_tunnel_authority"]) &&
    hasAny(hay, ["toll_related_actions", "toll_related_action"]) &&
    hasAny(hay, ["traffic_and_revenue_assessments"]) &&
    hasAny(hay, ["environmental_review"])
  ) {
    return "fare_program";
  }
  if (typeKey === "discount_program" && hasAny(hay, ["fare", "fares", "ticket", "tickets", "traintime"])) {
    return "fare_program";
  }
  if (["security", "security_initiative", "security_program"].includes(typeKey) && hasAnyToken(hay, ["cctv", "camera", "cameras", "video"])) {
    return "enforcement_program";
  }
  if (
    typeKey === "security_system_replacement" &&
    hasAny(hay, ["replacement", "state_of_good_repair"]) &&
    hasAny(hay, ["security_system", "security_systems"]) &&
    hasAny(normalizedHaystack(payload, ["project_name", "name", "description", "location"]), [
      "grand_central_terminal",
      "grand_central_train_shed",
      "park_avenue_tunnel",
    ])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "deployment" &&
    hasAny(hay, ["conductor_cab_camera", "conductor_cab_cameras"]) &&
    hasAny(hay, ["frontline_worker_safety", "worker_safety"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "grant_program" &&
    hasAny(hay, ["security_grant_program", "transit_security_grant_program", "port_security_grant_program", "urban_area_security_initiative"]) &&
    hasAny(hay, ["fare_evasion", "mtapd", "mtapd_coverage"])
  ) {
    return "enforcement_program";
  }
  if (
    typeKey === "operating_efficiency_initiative" &&
    (hasAny(hay, ["automated_bus_lane_enforcement", "able"]) || (hasAnyToken(hay, ["camera", "cameras"]) && hasAnyToken(hay, ["bus", "buses"])))
  ) {
    return "enforcement_program";
  }
  if (
    typeKey === "operating_efficiency_initiative" &&
    hasAny(hay, ["predictive_maintenance"]) &&
    hasAnyToken(hay, ["bus", "buses"]) &&
    hasAny(hay, ["maintenance_needs", "incidents_on_the_road", "reducing_incidents"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "signage_improvement" &&
    hasAny(hay, ["ada", "ada_compliance", "ada_safety_compliance", "safety_code", "safety_code_compliance"]) &&
    hasAny(hay, ["platform", "platforms", "station", "stations", "terminal"]) &&
    hasAny(hay, ["signage", "signage_updated", "updated_signage"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    ["design_and_retrofit", "design_and_testing"].includes(typeKey) &&
    hasAny(hay, ["cockpit", "cockpits", "operator_cockpit", "operator_cockpit_door", "operator_cockpit_doors"]) &&
    hasAny(hay, ["bus", "buses", "department_of_buses", "express_bus", "local_buses"]) &&
    hasAny(hay, ["bus_operator", "bus_operator_safety", "operator", "operators", "retrofit", "safety"])
  ) {
    return "accessibility_or_safety";
  }
  if (["maintenance_contract", "miscellaneous_service_contract"].includes(typeKey)) {
    if (hasAnyToken(hay, ["cctv", "camera", "cameras", "video"])) return "enforcement_program";
    if (hasAnyToken(hay, ["ada", "accessibility", "accessible", "elevator", "elevators", "escalator", "escalators", "ramp", "ramps"])) return "accessibility_or_safety";
    if (
      typeKey === "miscellaneous_service_contract" &&
      hasAny(hay, ["obsolete_subway_rail_cars", "subway_rail_cars"]) &&
      hasAny(hay, ["removal_and_disposal", "removal_disposal", "disposal"]) &&
      hasAny(hay, ["nyc_transit", "lirr", "mnr", "rail_cars"])
    ) {
      return "capital_or_infrastructure";
    }
  }
  if (
    ["modification", "procurement"].includes(typeKey) &&
    hasAny(hay, ["bcss", "bus_camera_security", "bus_camera_security_system", "bus_camera_security_systems"]) &&
    hasAny(hay, ["extend", "extension", "maintenance", "maintenance_services", "support_services"])
  ) {
    return "enforcement_program";
  }
  if (
    ["competitive_procurement", "procurement"].includes(typeKey) &&
    hasAny(hay, ["public_safety", "public_safety_software", "public_safety_suite"]) &&
    hasAny(hay, ["mta_police", "mtapd", "police"])
  ) {
    return "enforcement_program";
  }
  if (
    typeKey === "noncompetitive_miscellaneous_service_contract_ion_ratification" &&
    hasAny(hay, ["e_citation", "ecitation", "justiceone"]) &&
    hasAny(hay, ["eagle_team", "mtapd", "mta_police"])
  ) {
    return "enforcement_program";
  }
  if (
    typeKey === "technology_platform" &&
    hasAny(hay, ["safework", "safework_platform"]) &&
    hasAny(hay, ["inspection_protocols", "hazard", "hazards", "real_time_reporting"]) &&
    hasAny(hay, ["electrical_safety", "scaffold_integrity", "traffic_control_compliance"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "procurement" &&
    (hasAny(hay, ["platform_screen_doors"]) ||
      (hasAny(hay, ["track_intrusion", "track_intrusion_detection"]) && hasAny(hay, ["detection_system", "system"])))
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "procurement" &&
    hasAny(hay, ["able_system", "able_systems", "automated_bus_lane_enforcement_system", "automated_bus_lane_enforcement_systems"]) &&
    hasAny(hay, ["award", "awards", "installation", "maintenance", "operation", "purchase", "ratification"])
  ) {
    return "enforcement_program";
  }
  if (typeKey === "engineering_control" && hasAnyToken(hay, ["collision", "collisions", "safety", "safe", "safer"])) {
    return "accessibility_or_safety";
  }
  if ((typeKey === "street_improvement" || typeKey === "street_improvement_project") && hasAnyToken(hay, ["sbs", "bus", "buses"])) {
    return "bus_priority";
  }
  if (
    typeKey === "redesign" &&
    hasAnyToken(hay, ["bus", "buses"]) &&
    hasAny(hay, ["bus_network_redesign", "network_redesign"])
  ) {
    return "bus_network_redesign";
  }
	  const payloadHay = normalizedHaystack(payload, ["project_name", "name", "description", "program"]);
	  const mergedPayloadHay = normalizedMergedHaystack(payload, ["project_type", "project_name", "name", "description", "project_family", "program"]);
	  if (
	    typeKey === "professional_services_contract" &&
	    hasAny(payloadHay, ["homeless_outreach"]) &&
	    hasAny(payloadHay, ["homeless_security", "quality_of_life"])
	  ) {
	    return "accessibility_or_safety";
	  }
	  if (typeKey === "insurance_procurement" && hasAny(payloadHay, ["ocip", "owner_controlled_insurance_program"])) {
	    return "finance_or_funding";
	  }
	  if (typeKey === "maintenance_program" && hasAny(payloadHay, ["graffiti"]) && hasAny(payloadHay, ["removal", "cleaned"])) {
	    return "internal_operations";
	  }
	  if (
	    ["station", "station_redesign"].includes(typeKey) &&
    hasAny(payloadHay, ["station", "stations"]) &&
    hasAny(payloadHay, ["co_op_city", "future", "jamaica", "redesign", "penn_station_access"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "yard" &&
    hasAny(payloadHay, ["yard", "support_facility", "supporting_infrastructure"]) &&
    hasAny(payloadHay, ["completion", "construction", "expansion", "infrastructure", "retaining_wall", "support_facility", "supporting_infrastructure"]) &&
    hasAny(payloadHay, ["penn_station_access", "support_facility", "supporting_infrastructure", "yard_completion"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "yard_track_extension" &&
    hasAny(payloadHay, ["yard_track", "yard_track_extension", "yard_track_extensions"]) &&
    hasAny(payloadHay, ["port_washington", "real_estate", "station", "town_of_north_hempstead"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "renovation" &&
    hasAny(payloadHay, ["lirr_train_hall", "penn_station", "station", "train_hall"]) &&
    hasAny(payloadHay, ["construction_project", "project_management", "renovation"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "recreational_trail" &&
    hasAny(payloadHay, ["fjord_trail"]) &&
    hasAny(payloadHay, ["breakneck_connector"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "trail" &&
    hasAny(payloadHay, ["maybrook_trailway"]) &&
    hasAny(payloadHay, ["empire_state_trail"]) &&
    hasAny(payloadHay, ["beacon_line", "built_by_metro_north"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "recreational_trail" &&
    hasAny(payloadHay, ["breakneck", "breakneck_connector", "breakneck_ridge_station"]) &&
    hasAny(payloadHay, ["bridge", "high_level_platform", "high_level_platforms", "parking", "ramp", "ramps", "station_improvements"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "strategy" &&
    hasAny(payloadHay, ["climate_resilience_roadmap", "climate_resilience_strategies"]) &&
    hasAny(payloadHay, ["assessment", "framework", "future_climate_vulnerabilities", "implementation_framework", "roadmap"])
  ) {
    return "planning_or_report";
  }
  if (
    typeKey === "climate_resilience_strategy" &&
    hasAny(payloadHay, ["metro_north_flooding", "mnr_flooding", "reduce_metro_north_flooding"]) &&
    hasAny(payloadHay, ["harlem_line", "hudson_line", "mott_haven_yard"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "resilience" &&
    hasAny(payloadHay, ["hammels_wye", "south_channel_bridge"]) &&
    hasAny(payloadHay, ["bridge", "projects", "rockaway"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "resiliency" &&
    hasAny(payloadHay, ["fortifying", "increasing_resiliency"]) &&
    hasAny(payloadHay, ["hudson_line", "mnr"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "installation" &&
    hasAny(payloadHay, ["it_rack", "it_racks"]) &&
    hasAny(payloadHay, ["lirr_stations", "stations"])
  ) {
    return "technology_system";
  }
  if (
    typeKey === "service_frequency_increase" &&
    hasAny(payloadHay, ["frequency_increase", "frequency_increases", "off_peak_service"]) &&
    hasAny(payloadHay, ["g_j_m_lines", "line", "lines", "service", "waiting_times"])
  ) {
    return "service_change";
  }
  if (
    ["parking_discount", "parking_fee_structure"].includes(typeKey) &&
    hasAny(payloadHay, ["parking", "parking_fee", "parking_fees", "parking_garage", "parking_lot"]) &&
    hasAny(payloadHay, ["discount", "fee", "fees", "spaces"]) &&
    hasAny(payloadHay, ["harlem_line", "lirr", "metro_north", "station"])
  ) {
    return "fare_program";
  }
  if (typeKey === "public_hearings" && hasAny(payloadHay, ["fare_change", "fare_changes", "fares"])) {
    return "fare_program";
  }
  if (
    typeKey === "regulatory_change" &&
    hasAny(payloadHay, ["toll_violation", "toll_violation_fee", "toll_violation_enforcement"]) &&
    hasAny(payloadHay, ["fee", "fees"]) &&
    hasAny(payloadHay, ["central_business_district_tolling", "tolled_bridge_and_tunnel_facilities", "tolled_facilities"])
  ) {
    return "fare_program";
  }
  if (
    typeKey === "implementation" &&
    hasAny(payloadHay, ["e_zpass", "ezpass"]) &&
    hasAny(payloadHay, ["back_office", "customer_service_center", "electronic_toll", "toll_collection"])
  ) {
    return "fare_program";
  }
  if (
    typeKey === "task_force" &&
    hasAny(payloadHay, ["track_intrusion", "track_trespassing"]) &&
    hasAny(payloadHay, ["launched", "task_force"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "mental_health_co_response_outreach_program" &&
    hasAny(payloadHay, ["scout", "subway_co_response", "co_response"]) &&
    hasAny(payloadHay, ["clinicians", "crisis", "mental_health", "mtapd"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "program" &&
    hasAny(payloadHay, ["drug_alcohol", "drug_and_alcohol"]) &&
    hasAny(payloadHay, ["committee"]) &&
    hasAny(payloadHay, ["statistics", "update"])
  ) {
    return "internal_operations";
  }
  if (
    typeKey === "initiative" &&
    hasAny(payloadHay, ["maintenance_of_way", "mow", "productivity_efficiency_team"]) &&
    hasAny(payloadHay, ["infrastructure_projects", "overtime_analytics", "project_scheduling"]) &&
    (hasAny(payloadHay, ["capital_program", "productivity_efficiency_team"]) ||
      (hasAnyToken(payloadHay, ["productivity"]) && hasAnyToken(payloadHay, ["efficiency"])))
  ) {
    return "internal_operations";
  }
  if (
    typeKey === "project_management_services" &&
    hasAny(payloadHay, ["42nd_street_corridor", "grand_central_42nd_street", "times_square_shuttle"]) &&
    hasAny(payloadHay, ["circulation_improvements", "elevator", "elevators", "escalator", "escalator_replacement"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    ["noncompetitive_procurement", "sole_source_procurement"].includes(typeKey) &&
    hasAny(payloadHay, ["replacement_parts"]) &&
    hasAny(payloadHay, ["bus_fleet", "bus_fleets", "mci", "new_flyer", "nfi", "orion"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "procurement_personal_service_contracts" &&
    hasAny(payloadHay, ["toll_collection", "toll_collection_consultant", "toll_system_upgrade", "toll_related_infrastructure"]) &&
    hasAny(payloadHay, ["conceptual_design", "planning", "support_services"])
  ) {
    return "fare_program";
  }
  if (
    typeKey === "noncompetitive_procurement" &&
    hasAny(payloadHay, ["cdms", "crew_dispatch", "crew_dispatch_and_management_system", "hastus"]) &&
    hasAny(payloadHay, ["implementation", "implement", "managed_services"])
  ) {
    return "technology_system";
  }
  if (
    ["signal_testing", "signal_testing_and_cutover"].includes(typeKey) &&
    hasAnyToken(payloadHay, ["track", "tracks"]) &&
    hasAny(payloadHay, ["out_of_service"]) &&
    (hasAny(payloadHay, ["signal_cutover", "modernized_signal_system"]) || typeKey === "signal_testing_and_cutover")
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "resiliency" &&
    hasAny(payloadHay, ["flash_flood", "flash_floods", "flooding", "stair_flooding", "stormwater"]) &&
    hasAny(payloadHay, ["extreme_weather", "mitigate", "mitigation", "preventing", "subway"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "climate_resilience_strategy" &&
    hasAny(payloadHay, ["stormwater"]) &&
    hasAny(payloadHay, ["subway", "subway_stations", "stations", "tunnels"]) &&
    hasAny(payloadHay, ["capital_project", "capital_projects", "track_drain_cleaning"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "disaster_recovery_restoration" &&
    hasAny(payloadHay, ["sandy", "superstorm_sandy", "sandy_damage", "sandy_restoration"]) &&
    hasAny(payloadHay, ["coney_island_complex", "coney_island_yard", "repair", "restoration"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "emergency_repair" &&
    hasAny(payloadHay, ["fire_damage", "fire_damaged"]) &&
    hasAny(payloadHay, ["vacuum_train", "r251", "filter_car", "train"]) &&
    hasAny(payloadHay, ["fabricate", "fabrication", "install", "installation", "module", "replace", "replacement", "repair"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "resilience_climate_protection" &&
    hasAny(payloadHay, ["climate_threats", "flooding", "sea_level_rise", "torrential_rain"]) &&
    hasAny(payloadHay, ["hudson_line", "line", "protecting"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["ai_maintenance_system", "technology_initiative"].includes(typeKey) &&
    hasAny(payloadHay, ["predictive_maintenance", "artificial_intelligence", "machine_learning"]) &&
    hasAny(payloadHay, ["maintenance_repair", "repair_plans", "rolling_stock"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["it_system_implementation", "it_system_replacement"].includes(typeKey) &&
    hasAny(payloadHay, ["cmms", "computer_maintenance_management_system", "eam", "enterprise_asset_management", "hexagon"]) &&
    hasAny(payloadHay, ["bus", "buses", "department_of_buses", "mta_bus", "mta_bus_company", "nyc_transit_department_of_buses"]) &&
    hasAny(payloadHay, ["bus_depots", "depots", "four_shops", "maintenance_work_orders", "vehicle_assets"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["analytics_expansion", "miscellaneous_service_contract_modification", "predictive_maintenance_initiative"].includes(typeKey) &&
    hasAny(payloadHay, ["predictive_maintenance", "prognostic_maintenance"]) &&
    hasAny(payloadHay, ["bus", "buses", "bus_telematics", "department_of_buses", "mta_bus", "mta_bus_company", "nyct_department_of_buses", "on_board_bus_technology"]) &&
    hasAny(payloadHay, ["assets", "maintenance", "monitored", "quantity_of_buses"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "program" &&
    hasAny(payloadHay, ["elevate_transit", "zoning_for_accessibility"]) &&
    hasAny(payloadHay, ["accessibility", "ada", "ada_upgrade"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    ["paratransit_facility", "personal_miscellaneous_service_contract_modification"].includes(typeKey) &&
    hasAny(payloadHay, ["assessment_center", "eligibility_assessment", "independent_eligibility_assessment"]) &&
    hasAny(payloadHay, ["access_a_ride", "paratransit", "reduced_fare"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "station_access_improvement" &&
    hasAny(payloadHay, ["elevator", "elevator_access", "escalator", "escalators", "pathway"]) &&
    hasAny(payloadHay, ["biltmore_room", "grand_central", "grand_central_madison", "main_concourse"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "modification_to_contract" &&
    hasAny(payloadHay, ["emergency_elevator", "elevator_2_way", "elevator_two_way", "ee2cs"]) &&
    hasAny(payloadHay, ["hearing", "speech", "text_messaging", "two_way_communication"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "design_and_engineering" &&
    hasAny(payloadHay, ["accessibility_improvements", "ada_upgrades"]) &&
    hasAny(payloadHay, ["design_build_contracts", "station_rehabilitation", "escalator_replacement"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "corridor_project" &&
    hasAny(payloadHay, ["elevator", "elevators", "escalator", "escalators"]) &&
    hasAny(payloadHay, ["grand_central_station", "times_square_shuttle", "42nd_st_corridor"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "program" &&
    (hasAny(payloadHay, ["able_camera", "able_camera_program", "automated_bus_lane_enforcement", "drone_as_first_responder", "law_enforcement_technology_grant"]) ||
      (hasAnyToken(payloadHay, ["camera", "cameras"]) && hasAnyToken(payloadHay, ["cops", "nypd", "mtapd", "police"])))
  ) {
    return "enforcement_program";
  }
	  if (
	    [
      "contract_option_exercise",
      "contract_modification_option_exercise",
      "option_exercise_cbtc_equipment",
      "option_exercise_on_existing_contract",
      "procurement_option_election",
      "procurement_option_exercise",
    ].includes(typeKey) &&
	    hasAny(payloadHay, [
      "bus",
      "buses",
      "cars",
      "diesel_battery_hybrid_locomotives",
      "locomotive",
      "locomotives",
      "r211",
      "r46",
      "rolling_stock",
      "subway_car",
      "subway_cars",
    ])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "real_estate_development" &&
	    hasAny(payloadHay, ["nyct_facility"]) &&
	    (hasAny(payloadHay, ["electric_bus_charging_facility", "electric_bus_charging"]) ||
	      (hasAny(payloadHay, ["electric_bus", "electric_buses"]) && hasAny(payloadHay, ["charging_facility", "charging"])))
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "initiative" &&
	    hasAny(payloadHay, ["zero_emission", "zero_emission_commitment", "electric_bus", "electric_buses"]) &&
	    hasAny(payloadHay, ["charging_infrastructure", "charging_infrastructure_installation", "charging"]) &&
	    hasAny(payloadHay, ["installation", "partnership", "new_york_power_authority", "nypa"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "initiative" &&
	    hasAny(payloadHay, ["safety_management_system"]) &&
	    hasAny(payloadHay, ["contracts", "contractor_agreements", "contractor", "consultant"]) &&
	    hasAny(payloadHay, ["agreements", "division_1", "provisions", "requirements"])
	  ) {
	    return "accessibility_or_safety";
	  }
	  if (
	    typeKey === "initiative" &&
	    hasAny(payloadHay, ["first_mile_last_mile", "first_mile", "last_mile", "fmlm"]) &&
	    hasAny(payloadHay, ["pilot_program", "pilot_programs", "pilots"]) &&
	    hasAny(payloadHay, ["communities", "ten_communities"])
	  ) {
	    return "pilot";
	  }
  if (typeKey === "expansion" && hasAny(`${payloadHay} ${mergedPayloadHay}`, ["study", "studies"])) {
    return "planning_or_report";
  }
  if (
    typeKey === "expansion" &&
    (hasAny(payloadHay, ["second_avenue_subway", "penn_reconstruction", "penn_station", "mta_expansion_program"]) ||
      (hasAny(payloadHay, ["subway", "rail", "station"]) &&
        hasAny(payloadHay, ["125th_street_extension", "capital_program", "extension", "phase_two", "reconstruction"])))
  ) {
    return "capital_or_infrastructure";
  }
	  if (
	    typeKey === "procurement_modification" &&
	    ((hasAny(payloadHay, [
	      "all_electric_buses",
	      "dual_mode_locomotives",
	      "electric_buses",
	      "locomotive",
	      "locomotives",
	      "low_floor",
	    ]) &&
	      hasAny(payloadHay, ["contract", "locomotive_option", "option", "purchase", "purchase_contract"])) ||
	      (hasAny(payloadHay, ["structural_steel", "steel_repairs", "fire_standpipe"]) && hasAny(payloadHay, ["bridge", "main_span", "verrazzano"])))
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    ["procurement", "procurement_ratification", "rfp_procurement"].includes(typeKey) &&
	    hasAny(payloadHay, [
      "bus",
      "buses",
      "cutaway_buses",
      "diesel_buses",
      "electric_bus",
      "electric_buses",
      "coach_car",
      "coach_cars",
      "hybrid_electric_buses",
      "flatcar",
      "flatcars",
      "locomotive",
      "locomotives",
      "rail_car",
      "rail_cars",
      "r211",
      "r252",
      "rolling_stock",
      "subway_car",
      "subway_cars",
      "van",
      "vans",
    ]) &&
    hasAny(payloadHay, [
      "design_manufacture_test_and_deliver",
      "design_manufacturing_testing_and_delivery",
      "furnish_and_deliver",
      "manufacture_test_and_deliver",
      "order",
      "ordering",
      "procure",
      "procurement",
      "purchase",
      "purchase_of",
      "purchase_100",
      "purchase_270",
      "purchase_five",
      "rolling_stock_procurement",
    ]) &&
    !hasAny(payloadHay, [
      "automated_vehicle_location",
      "bus_camera_security",
      "bus_services",
      "field_qualification_services",
      "fuel",
      "fueling",
      "hastus",
      "maintenance_services",
      "parts_components_and_repair_services",
      "ptc_software",
      "simulator",
      "simulator_systems",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["oem_sole_source_purchase_agreement", "procurement", "procurement_sole_source_contract"].includes(typeKey) &&
    hasAny(payloadHay, ["estimated_quantity_contract", "oem", "original_equipment_manufacturer", "original_equipment_manufacturers", "purchase_agreement", "purchase_agreements", "sole_source", "sole_source_contract"]) &&
    hasAny(payloadHay, [
      "car_body_replacement_parts",
      "components_assemblies",
      "hvac_and_propulsion_parts",
      "lighting_parts",
      "m7_propulsion_system_equipment_upgrade",
      "multiple_rolling_stock_fleets",
      "propulsion_parts",
      "propulsion_system_equipment_upgrade",
      "replacement_parts",
      "seating_component_parts",
      "seating_parts",
      "truck_components",
      "wabtec_oem_purchase_agreement",
      "window_assemblies",
    ]) &&
    hasAny(payloadHay, [
      "coach_car",
      "coach_cars",
      "electric_railcars",
      "lirr",
      "locomotive",
      "locomotives",
      "m7",
      "metro_north",
      "mnr",
      "nyc_transit",
      "rail_car",
      "rail_cars",
      "railcar",
      "railcars",
      "subway_car",
      "subway_cars",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["equipment_replacement", "procurement_contract_award"].includes(typeKey) &&
    hasAny(payloadHay, ["audio_visual_recording", "avrm", "recording_monitoring_system"]) &&
    hasAny(payloadHay, ["replacement", "upgrade"]) &&
    hasAny(payloadHay, ["c3_coaches", "diesel_electric_dual_mode", "m3_fleet", "m7_fleets", "railcars"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
	    ["noncompetitive_contract_award", "noncompetitive_procurement_sole_source_contract", "procurement"].includes(typeKey) &&
	    hasAny(payloadHay, [
	      "joint_bar",
	      "laser_train_modules",
	      "rail_flaw",
      "rail_grinding",
      "rail_surfaces",
      "railhead_based_cleaning",
      "railhead_cleaning",
      "track_geometry_car",
      "track_geometry_cars",
      "ultrasonic_testing",
    ]) &&
    !hasAny(payloadHay, [
      "avlm",
      "bus_services",
      "copy_paper",
      "customer_contact",
      "ferry",
      "fuel",
      "maintenance_services",
      "office_supplies",
      "parts_supply",
      "repair_services",
      "replacement_parts",
      "simulator",
      "software",
      "tolling",
      "transponder",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "testing_and_inspection" &&
    hasAny(payloadHay, [
      "track_geometry_vehicle",
      "track_geometry_vehicle_testing",
      "track_geometry_car",
      "track_geometry_cars",
      "ultrasonic_rail",
      "ultrasonic_rail_testing",
    ])
  ) {
    return "capital_or_infrastructure";
  }
	  if (
	    typeKey === "procurement" &&
	    hasAny(payloadHay, ["fare_evasion"]) &&
	    (hasAny(payloadHay, ["turnstile_sleeves", "vertical_fins", "stainless_steel_vertical_fins"]) ||
	      (hasAnyToken(payloadHay, ["turnstile", "turnstiles"]) && hasAnyToken(payloadHay, ["sleeves", "fins"])))
	  ) {
	    return "fare_program";
	  }
	  if (
	    ["contract_modification", "procurement"].includes(typeKey) &&
	    hasAny(payloadHay, ["cng", "compressed_natural_gas"]) &&
	    hasAny(payloadHay, ["fueling_facilities", "fueling_facility"]) &&
	    hasAny(payloadHay, ["operation_and_maintenance", "operations_and_maintenance", "operation_maintenance"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "contract_modification" &&
	    hasAny(payloadHay, ["elevator", "elevators", "escalator", "escalators", "emergency_elevator"])
	  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "contract_modification" &&
    hasAny(payloadHay, ["joint_bar", "rail_flaw", "ultrasonic_internal_rail_flaw", "ultrasonic_testing"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "contract_modification" &&
    hasAny(payloadHay, ["post_award_consulting", "post_award_consulting_services"]) &&
    hasAny(payloadHay, ["r211", "r34211"]) &&
    hasAny(payloadHay, ["subway_car_contract", "subway_cars"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "contract_modification" &&
    hasAny(payloadHay, ["esa_systems_facilities", "cs179_415"]) &&
    hasAny(payloadHay, ["grand_central_terminal"]) &&
    hasAny(payloadHay, ["design_drawings"]) &&
    hasAny(payloadHay, ["access_restraints", "device_relocation"])
  ) {
    return "capital_or_infrastructure";
  }
	  if (
	    typeKey === "equipment_supply" &&
	    hasAny(payloadHay, ["positive_train_control", "ptc", "data_radios", "radio", "radios"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "noncompetitive_procurement" &&
	    ((hasAny(payloadHay, ["positive_train_control", "ptc"]) && hasAny(payloadHay, ["data_radio", "data_radios", "radio", "radios"])) ||
	      (hasAny(payloadHay, ["circuit_breaker", "circuit_breakers"]) && hasAny(payloadHay, ["traction_power", "substation", "substations"])) ||
	      (hasAny(payloadHay, ["track_geometry_car", "track_geometry_cars", "tgc3", "tgc4"]) && hasAny(payloadHay, ["critical_systems", "operational_life", "upgrade"])))
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "systems_upgrade" &&
	    hasAny(payloadHay, [
      "asynchronous_fiber_optic_network",
      "fiber_optic_network",
      "master_terminal_units",
      "power_control_center",
      "sonet",
      "traction_power",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "federally_funded_sole_source_contract" &&
    hasAny(payloadHay, ["advanced_civil_speed_enforcement", "automatic_train_control", "positive_train_control", "ptc"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "positive_train_control_implementation" &&
    hasAny(payloadHay, ["full_ptc_functionality", "positive_train_control", "ptc"])
  ) {
    return "accessibility_or_safety";
  }
  if (
    typeKey === "procurement" &&
    hasAny(payloadHay, ["positive_train_control", "ptc"]) &&
    hasAny(payloadHay, ["field_qualification_services", "software_upgrade", "software_upgrades", "technical_support"]) &&
    hasAny(payloadHay, ["m_8", "m8", "metro_north", "mnr"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "noncompetitive_purchases_and_public_works_contract" &&
    hasAny(payloadHay, ["positive_train_control", "ptc"]) &&
    hasAny(payloadHay, ["systems_engineering", "technical_service_agreement", "technical_support"]) &&
    hasAny(payloadHay, ["lirr", "metro_north", "mnr", "railroad", "railroads"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "signaling_system_contract_modification" &&
    hasAny(payloadHay, [
      "automatic_train_operation",
      "carborne",
      "cbtc",
      "communication_based_train_control",
      "signaling_system",
      "wayside",
    ])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "software_upgrade" &&
    hasAny(payloadHay, ["cbtc", "communication_based_train_control", "communications_based_train_control"]) &&
    hasAny(payloadHay, ["carborne", "carborne_cbtc", "carborne_controller", "carborne_equipment", "controller_software"]) &&
    hasAny(payloadHay, ["r211", "r211_fleet", "r211_subway_cars"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "consulting" &&
    hasAny(payloadHay, ["cbtc", "communications_based_train_control", "communication_based_train_control"]) &&
    hasAny(payloadHay, ["engineering", "engineering_tasks", "engineering_support", "gec", "general_engineering_consultant", "procurement_support", "program_administration"]) &&
    hasAny(payloadHay, ["nyct", "subway", "subway_service"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "demolition" &&
    hasAny(payloadHay, ["bridge", "bridges", "substation", "structure", "structures", "widening_structure"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "facility_replacement" &&
    hasAny(payloadHay, ["bus_bays", "bus_charging", "bus_terminal", "charging_facilities", "electrified_fleet", "replacement_bus_terminal"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["facility_acquisition", "real_estate_acquisition"].includes(typeKey) &&
    hasAny(payloadHay, ["maintenance_facility", "maintenance_shop"]) &&
    hasAny(payloadHay, ["acquisition", "continued_operation", "purchase"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "facility_transformation" &&
    hasAny(payloadHay, ["centralized_headquarters", "employee_facility", "warehouse_and_office_complex"]) &&
    hasAny(payloadHay, ["lirr", "lirr_engineering", "engineering_department", "force_account"]) &&
    hasAny(payloadHay, ["indoor_material_storage", "training_areas", "warehouse"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "terminal_relocation" &&
    hasAny(payloadHay, ["bus_terminal", "facility", "state_of_the_art_facility", "terminal"]) &&
    hasAny(payloadHay, ["new", "relocation"]) &&
    !hasAny(payloadHay, ["lease", "swing_space", "temporary"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "facility_relocation" &&
    hasAny(payloadHay, ["bus_terminal", "temporary_bus_terminal"]) &&
    hasAny(payloadHay, ["swing_space", "temporary_bus_terminal"]) &&
    (hasAny(payloadHay, ["construction", "constructed", "completion", "replacement_bus_terminal"]) ||
      hasAny(payloadHay, ["gjdc", "greater_jamaica_development_corporation", "jamaica", "90_01_168th_street"]))
  ) {
    return "capital_or_infrastructure";
  }
  if (typeKey === "installation" && hasAny(payloadHay, ["signal_hut", "signal_huts"])) {
    return "capital_or_infrastructure";
  }
		  if (typeKey === "installation" && hasAny(payloadHay, ["tactile_installation", "tactile"]) && hasAny(payloadHay, ["stations"])) {
		    return "accessibility_or_safety";
		  }
  if (
    typeKey === "service_contract" &&
    hasAny(payloadHay, ["positive_train_control", "ptc"]) &&
    hasAny(payloadHay, ["fleet", "m_8", "m8", "software_upgrade", "software_upgrades"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "contract_award" &&
    hasAny(payloadHay, ["operation_and_maintenance", "operation_maintenance"]) &&
    hasAny(payloadHay, ["facility_assets", "infrastructure", "related_facility_assets", "terminal"])
  ) {
    return "capital_or_infrastructure";
  }
		  if (
		    ["contract_modification", "digital_service_launch", "equipment_replacement", "mobile_ticketing_program", "procurement_and_installation", "service_contract", "technology_upgrade"].includes(typeKey) &&
	    (hasAny(payloadHay, [
	      "fare_collection",
	      "mobile_ticketing",
	      "onboard_validation_device",
	      "onboard_validation_devices",
	      "ticket_office_machine",
	      "ticket_office_machines",
	      "ticket_selling_system",
	      "ticket_selling_systems",
	      "ticket_vending_machine",
	      "ticket_vending_machines",
	      "traintime",
	    ]) ||
	      hasAnyToken(payloadHay, ["ovd", "ovds", "tom", "toms", "tvm", "tvms"]))
	  ) {
	    return "fare_program";
	  }
	  if (
	    typeKey === "contract_modification" &&
	    hasAny(payloadHay, ["all_electronic_open_road_tolling", "all_electronic_tolling", "open_road_tolling"]) &&
	    hasAny(payloadHay, ["recovering_tolls", "revenue_recovery_system", "rrs", "toll_evasion"])
	  ) {
	    return "fare_program";
	  }
	  if (
	    typeKey === "design_bid_build" &&
	    hasAny(payloadHay, ["bearings", "bridge", "bridges", "concrete_rehabilitation", "concrete_repairs", "structural_rehabilitation", "steel_concrete_rehabilitation", "steel_repairs", "viaducts"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (typeKey === "assessment" && hasAny(payloadHay, ["needs_assessment", "capital_needs", "long_term_capital_needs"])) {
	    return "planning_or_report";
	  }
	  if (typeKey === "bus_stop_improvement" && hasAny(payloadHay, ["bus_boarding_island", "bus_stop", "bus_stops", "bus_boarding", "boarding_island"])) {
	    return "bus_priority";
	  }
	  if (
	    typeKey === "streetscape_improvement" &&
	    hasAny(payloadHay, ["pedestrian_improvement", "pedestrian_improvements", "bus_bulb", "bus_bulbs", "neckdown", "neckdowns", "curb_extension", "curb_extensions"])
	  ) {
	    return "accessibility_or_safety";
	  }
	  if (
	    typeKey === "major_transportation_project" &&
	    hasAny(payloadHay, ["bus_lane", "bus_lanes"]) &&
	    hasAny(payloadHay, ["bus_stop", "bus_stops", "dedicated_vehicle_loading", "loading_unloading_zones", "signal_retiming"]) &&
	    hasAny(payloadHay, ["daylighting", "pedestrian_safety_islands", "signal_protected_pedestrian_crossings", "painted_pedestrian_curb_extensions"])
	  ) {
	    return "bus_priority";
	  }
	  if (
	    typeKey === "street_conversion" &&
	    hasAny(payloadHay, ["2_way_conversion", "two_way_conversion"]) &&
	    hasAny(payloadHay, ["access_opportunities", "increases_access", "parking", "prince_st", "sheraton"])
	  ) {
	    return "street_redesign";
	  }
  if (
    (typeKey === "curb_regulation_changes" || (typeKey === "curbside_changes" && hasAny(payloadHay, ["curbside_change", "curbside_changes"]))) &&
    hasAny(payloadHay, ["truck_loading_zone", "truck_loading_zones"]) &&
    hasAny(payloadHay, ["metered_parking", "parking", "parking_changes", "taxi_stand_relocation", "turn_bay", "turn_bays"])
  ) {
    return "street_redesign";
  }
	  if (
	    typeKey === "curb_extension_bus_bulb" &&
	    hasAny(payloadHay, ["bus_bulb", "bus_bulbs"]) &&
	    hasAny(payloadHay, ["curb_extension", "curb_extensions"])
	  ) {
	    return "bus_priority";
	  }
	  if (
	    typeKey === "transit_priority" &&
	    hasAny(payloadHay, ["b14", "bus_stop", "bus_stops", "relocate_b14_bus_stops", "relocate_bus_stops"]) &&
	    hasAny(payloadHay, ["ada_ramps", "ada_accessible_bus_stops", "pedestrian_malls", "southern_pedestrian_malls"])
	  ) {
	    return "bus_priority";
	  }
  if (typeKey === "bus_reroute" && hasAny(payloadHay, ["reroute", "route", "service"])) {
    return "service_change";
  }
  if (
    typeKey === "service_addition" &&
    hasAnyToken(payloadHay, ["new", "additional", "added"]) &&
    hasAnyToken(payloadHay, ["train", "trains", "service"]) &&
    hasAny(payloadHay, ["branch", "departing", "relief", "ronkonkoma", "schedule"])
  ) {
    return "service_change";
  }
  if (
    typeKey === "holiday_service_program" &&
    hasAnyToken(payloadHay, ["extra", "additional"]) &&
    hasAnyToken(payloadHay, ["train", "trains"]) &&
    hasAny(payloadHay, ["thanksgiving", "thanksgiving_day_parade", "parade"])
  ) {
    return "service_change";
  }
  if (
    typeKey === "seasonal_service" &&
    hasAny(payloadHay, ["regularly_scheduled_train", "regularly_scheduled_trains"]) &&
    hasAny(payloadHay, ["operate", "operating"])
  ) {
    return "service_change";
  }
  if (
    typeKey === "schedule_change" &&
    hasAny(payloadHay, ["adjust", "adjustments", "rerouted", "schedule", "schedules"]) &&
    hasAny(payloadHay, ["trains", "weekday_evening", "weekday_evenings", "work_train"])
  ) {
    return "service_change";
  }
  if (
    ["competitive_procurement_miscellaneous_service_contract", "contract_modification", "procurement"].includes(typeKey) &&
    hasAny(payloadHay, ["emergency_and_scheduled_bus_services", "emergency_scheduled_bus_services"]) &&
    hasAny(payloadHay, ["between_stations", "railroad_passengers", "service_disruptions", "track_outages"])
  ) {
    return "service_change";
  }
  if (
    typeKey === "contract_modification" &&
    hasAny(payloadHay, ["emergency_and_scheduled_bus_services", "emergency_scheduled_bus_services"]) &&
    hasAny(payloadHay, ["as_needed", "continuation", "five_bus_companies"]) &&
    hasAny(payloadHay, ["metro_north", "mnr"])
  ) {
    return "service_change";
  }
  if (
    ["contract_modification", "procurement_contract_modification"].includes(typeKey) &&
    hasAny(payloadHay, ["access_a_ride", "aar", "paratransit"]) &&
    (hasAny(payloadHay, ["primary_carrier_transportation_service"]) ||
      (hasAny(payloadHay, ["primary_carrier"]) && hasAny(payloadHay, ["contract", "contracts"]) && hasAny(payloadHay, ["service", "transportation_service"]))) &&
    hasAny(payloadHay, ["exercise_of_option", "option_year", "option_years"])
  ) {
    return "service_change";
  }
		  if (
		    ["route_revision", "routing_change"].includes(typeKey) &&
		    hasAny(payloadHay, ["route", "routing", "travel_path"]) &&
	    hasAnyToken(payloadHay, ["b63", "m125"])
	  ) {
	    return "service_change";
	  }
	  if (
	    typeKey === "service_improvement_initiative" &&
	    hasAny(payloadHay, ["bus_ridership", "lower_performing_routes", "routes", "targeted_improvements"])
	  ) {
	    return "service_change";
	  }
  if (
    typeKey === "paratransit_service" &&
    hasAny(payloadHay, ["contingency_recovery_rides"]) &&
    hasAny(payloadHay, ["access_a_ride", "aar"]) &&
    hasAny(payloadHay, ["extended", "june_2023"])
  ) {
    return "service_change";
  }
	  if (
	    typeKey === "transportation_improvements" &&
	    hasAny(payloadHay, ["m60_select_bus_service", "select_bus_service"]) &&
	    hasAny(payloadHay, ["off_board_fare_collection", "off_board_fare_payment"]) &&
	    hasAny(payloadHay, ["sbs_amenities", "offset_bus_lanes", "dedicated_off_set_bus_lanes"])
	  ) {
	    return "sbs_or_brt";
	  }
	  if (
	    typeKey === "program" &&
	    hasAny(payloadHay, ["bus_corridor", "bus_corridors", "bus_corridor_segments", "corridor_segments"]) &&
	    hasAny(payloadHay, ["reliability", "speed", "slow_trips"]) &&
	    hasAny(payloadHay, ["implementation", "outreach", "planning"])
	  ) {
	    return "bus_priority";
	  }
	  if (
	    typeKey === "strategy" &&
	    hasAny(payloadHay, ["bus_priority"]) &&
	    hasAny(payloadHay, ["traffic_enforcement", "zero_emissions_fleet"]) &&
	    hasAny(payloadHay, ["network", "accessibility", "customer_engagement"])
	  ) {
	    return "bus_priority";
	  }
	  if (
	    typeKey === "small_business_mentoring_program" &&
	    hasAny(payloadHay, ["bicycle_racks", "bike_racks"]) &&
	    hasAny(payloadHay, ["metro_north_stations", "stations"])
	  ) {
	    return "bike_facility";
	  }
	  if (
	    ["ferry_service", "procurement", "service"].includes(typeKey) &&
	    hasAny(payloadHay, ["ferry_service", "ferry_services", "ferry_services_contract", "weekend_ferry_service"]) &&
	    (hasAny(payloadHay, ["haverstraw_ossining", "newburgh_beacon", "routes", "service_between"]) ||
	      (hasAnyToken(payloadHay, ["haverstraw"]) && hasAnyToken(payloadHay, ["ossining"])) ||
	      (hasAnyToken(payloadHay, ["newburgh"]) && hasAnyToken(payloadHay, ["beacon"])))
	  ) {
	    return "service_change";
	  }
	  if (
	    typeKey === "interagency_agreement" &&
	    hasAny(payloadHay, ["newburgh_beacon"]) &&
	    hasAny(payloadHay, ["ferry_landing", "parking_and_ferry_landing", "ferry_landing_parking"]) &&
	    hasAny(payloadHay, ["lease_reimbursement", "lease_payments", "reimburse", "reimbursement"])
	  ) {
	    return "service_change";
	  }
	  if (
	    typeKey === "bus_service_contract" &&
	    hasAny(payloadHay, ["feeder_bus_service", "fixed_route", "scheduled_feeder_bus_service"]) &&
	    hasAny(payloadHay, ["metro_north", "mnr", "neighborhoods", "stations"])
	  ) {
	    return "service_change";
	  }
		  if (
		    ["agreement_amendment", "amendment", "interagency_agreement", "memorandum_of_understanding"].includes(typeKey) &&
		    hasAny(payloadHay, ["employer_based_shuttle", "employer_based_shuttle_agreement"]) &&
		    hasAny(payloadHay, ["amendment", "extend", "extend_the_term", "payment", "subsidize"])
		  ) {
		    return "service_change";
		  }
  if (
    typeKey === "memorandum_of_understanding" &&
    hasAny(payloadHay, ["newburgh_beacon", "ferry_landing", "parking_and_ferry_landing"]) &&
    hasAny(payloadHay, ["lease", "lease_payments", "reimburse", "reimbursement"])
  ) {
    return "service_change";
  }
	  if (
	    ["rail_and_shuttle_bus_service", "shuttle_service"].includes(typeKey) &&
	    hasAny(payloadHay, ["bus_service", "bus_services", "shuttle_bus_service"]) &&
	    (hasAny(payloadHay, ["bridgeport_waterbury", "south_fork_commuter_connection"]) ||
	      (hasAnyToken(payloadHay, ["bridgeport"]) && hasAnyToken(payloadHay, ["waterbury"])) ||
	      (hasAnyToken(payloadHay, ["speonk"]) && hasAnyToken(payloadHay, ["montauk"])))
	  ) {
	    return "service_change";
	  }
	  if (
	    typeKey === "contract_modification" &&
	    hasAny(payloadHay, ["hudson_rail_link"]) &&
	    hasAny(payloadHay, ["bus_service", "bus_services", "continuation", "renewal_option"])
	  ) {
	    return "service_change";
	  }
	  if (
	    ["contract_modification", "public_works_contract_modification"].includes(typeKey) &&
	    hasAny(payloadHay, ["hov_bus_lane", "hov_bus_lane_operations"]) &&
	    hasAny(payloadHay, ["verrazzano", "verrazzano_narrows", "vnb"])
	  ) {
	    return "bus_priority";
	  }
  if (
    ["public_works_contract_amendment", "contract_modification"].includes(typeKey) &&
    hasAny(payloadHay, ["median_barrier_transfer", "median_barrier_transfer_services"]) &&
    hasAny(payloadHay, ["verrazzano", "verrazzano_narrows", "vnb"]) &&
    hasAny(payloadHay, ["capital_project", "vn_84b"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "esa_readiness_project" &&
    hasAny(payloadHay, ["great_neck_pocket_track", "pocket_track"]) &&
    hasAny(payloadHay, ["train_storage", "additional_train_storage"]) &&
    hasAny(payloadHay, ["grand_central_madison", "gcm", "new_service", "operational_flexibility"])
  ) {
    return "capital_or_infrastructure";
  }
	  if (
	    typeKey === "maintenance" &&
	    (hasAny(payloadHay, ["bridge_maintenance", "track_surfacing", "thermite_welding", "mud_remediation", "waterproofing"]) ||
      (hasAny(payloadHay, ["grand_central_madison", "gcm"]) &&
        hasAny(payloadHay, ["contractor_maintenance"]) &&
        hasAny(payloadHay, ["main_tracks", "plaza_interlocking", "state_of_good_repair", "tracks_out_of_service", "wireless_cellular_installation"])) ||
      (hasAny(payloadHay, ["vertical_equipment", "fire_systems", "hvac"]) &&
        hasAny(payloadHay, ["infrastructure", "inspection", "preventive", "reactive", "state_federal_mandates"])))
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "contract_extension" &&
    hasAny(payloadHay, ["small_business_mentoring_program", "sbmp"]) &&
    hasAny(payloadHay, ["goal_for_the_current_year", "projects_totaling"]) &&
    hasAny(payloadHay, ["awarded", "bidding", "pending_an_award", "pending_bid_opening"])
  ) {
    return "internal_operations";
  }
  if (
    typeKey === "energy_efficiency_agreement" &&
    hasAny(payloadHay, ["nypa", "new_york_power_authority"]) &&
    hasAny(payloadHay, ["mta"]) &&
    hasAny(payloadHay, ["energy_efficiency_project", "energy_efficiency_projects"]) &&
    hasAny(payloadHay, ["master_cost_recovery_agreement", "mcra"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    typeKey === "rehabilitation" &&
      (hasAny(payloadHay, ["station_rehabilitation", "station_reconstruction", "tunnel_rehabilitation", "east_river_tunnel", "penn_station_rehabilitation"]) ||
      (hasAny(payloadHay, ["rockaways_rehab_project"]) && hasAny(payloadHay, ["rehabilitation_project", "schiavone_construction", "mta_c_d", "department_of_subways"])) ||
      (hasAny(payloadHay, ["l_train_tunnel_project"]) &&
        hasAny(mergedPayloadHay, ["night_and_weekend_shutdown", "cut_six_months", "100_million_off_the_budget", "knocking_out_capital_projects"])) ||
      (hasAny(mergedPayloadHay, ["final_rehabilitation", "tunnel_rehabilitation"]) &&
        hasAny(mergedPayloadHay, ["superstorm_sandy_damaged_tunnel", "sandy_damaged_tunnel", "damaged_tunnel"])) ||
      (hasAny(payloadHay, ["hugh_l_carey_tunnel", "tunnel_manhattan_plaza"]) &&
        hasAny(payloadHay, ["communications_systems", "drainage_improvements", "electrical", "structural", "retaining_wall_repairs"])) ||
      (hasAny(payloadHay, ["rfk_fleet_garage", "fleet_garage"]) &&
        hasAny(payloadHay, ["exit_corridor", "exit_corridors", "miscellaneous_spaces"]) &&
        hasAny(payloadHay, ["civil", "electrical", "mechanical", "repair", "repairs"])))
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["contract_extension", "inspection", "personal_service_contract", "personal_service_contracts", "public_work_contract", "public_works_contract"].includes(typeKey) &&
    (hasAny(payloadHay, ["bridge_inspection", "bridge_inspections", "structural_repairs", "structural_steel_repairs", "rail_flaw", "joint_bar", "ultrasonic_rail"]) ||
      (hasAny(payloadHay, ["tunnel_inspection", "tunnel_inspections"]) && hasAny(payloadHay, ["hugh_l_carey_tunnel", "queens_midtown", "queens_midtown_tunnel"])) ||
      (hasAny(payloadHay, ["continuous_work_platform", "maintenance_of_way"]) && hasAny(payloadHay, ["loram", "rail", "railway"])) ||
      (hasAny(payloadHay, ["rail_vacuum", "rail_vacuum_services"]) && hasAny(payloadHay, ["ballast", "electrified_territory", "railway", "right_of_way", "rights_of_way"])))
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["public_work_contract", "public_works_contract"].includes(typeKey) &&
    hasAny(payloadHay, ["partial_building_demolition", "partial_demolition"]) &&
    hasAny(payloadHay, ["lirr_section", "lirr_owned_section", "alphapointe_building"])
  ) {
    return "capital_or_infrastructure";
  }
  if (
    ["design_build_public_works", "design_build_public_works_contract"].includes(typeKey) &&
    hasAny(payloadHay, [
      "bridge",
      "electrical_power_resiliency",
      "utility_and_building_improvements",
      "tower_elevator",
      "elevator_systems",
      "pedestrian_walkway",
      "fender_rehabilitation",
    ])
  ) {
    return "capital_or_infrastructure";
  }

	  const contractShapedTypes = new Set([
	    "competitive_procurement_contract",
	    "competitive_personal_service_contracts",
	    "competitive_request_for_proposals",
	    "contract",
	    "contract_award",
	    "contract_modification",
	    "design_build",
	    "modification_to_miscellaneous_service_contract",
	    "modification_to_personal_service_contract",
	    "miscellaneous_service_contract",
	    "noncompetitive_miscellaneous_service_contract",
	    "personal_service_contract",
	    "personal_service_contract_modification",
	    "personal_service_contract_procurement",
	    "personal_service_contracts",
	    "procurement",
	    "procurement_contract",
	    "procurement_contract_modification",
	    "procurement_personal_service_contract_modification",
	    "procurement_personal_service_contracts",
	    "procurement_ratification",
	    "professional_services_contract",
	    "service_agreement_extension",
	  ]);
	  if (contractShapedTypes.has(typeKey)) {
	    if (
	      hasAny(payloadHay, ["transportation_planning", "transportation_planning_research", "conceptual_design"]) &&
	      hasAny(payloadHay, ["retainer", "retainer_contract", "research_services"])
	    ) {
	      return "planning_or_report";
	    }
    if (
      hasAny(payloadHay, ["miscellaneous_intelligent_transportation_system"]) &&
      hasAny(payloadHay, ["operations_systems"]) &&
      hasAny(payloadHay, ["consultant_design_services"]) &&
      hasAny(payloadHay, ["as_needed_basis"])
    ) {
      return "technology_system";
    }
	    if (hasAny(payloadHay, ["market_research", "quantitative_market_research", "customer_research"])) return "customer_experience";
	    if (
	      hasAny(payloadHay, [
	        "automated_revenue_recovery_system",
	        "customer_contact_center_services",
	        "customer_service_center_system",
	        "license_plate_and_owner_identification",
	        "new_york_tolling_authorities",
	        "revenue_recovery_system",
	        "transponder_distribution",
	      ])
	    ) {
      return "fare_program";
    }
    if (
      hasAny(payloadHay, [
        "audio_call_recording",
	        "automated_vehicle_location_monitoring",
	        "avlm",
	        "bus_operator_simulator",
	        "ccaas",
	        "cdms",
	        "coe",
	        "connection_oriented_ethernet",
	        "contact_center_as_a_service",
	        "crew_dispatch",
	        "data_center",
	        "data_center_maintenance",
	        "digital_audio_call_recording",
	        "eam",
	        "enterprise_asset_management",
	        "genesys",
	        "governance_risk_compliance",
	        "grc_system",
	        "hastus",
	        "ivr",
	        "kronos",
	        "license_plate_and_owner_identification",
	        "mainframe",
	        "management_system",
	        "mobility_data_hub",
	        "open_trip_planner",
	        "otp",
	        "pbx",
	        "private_branch_exchange",
	        "radio_system",
	        "rts_cad",
        "simulator_system",
        "simulators",
        "teams",
        "ukg",
        "vhf_radio",
        "vhf_radio_system",
      ])
    ) {
      return "technology_system";
    }
    if (hasAny(payloadHay, ["fmtac", "investment_portfolio", "portfolio_management"])) return "finance_or_funding";
    if (
      hasAny(payloadHay, [
	        "bank_loan_repayment",
	        "benefits_services",
	        "copy_paper",
	        "dental_benefits",
	        "dental_benefits_plans",
	        "disability_and_medicare",
	        "drug_alcohol_testing",
	        "fleet_management_services",
        "fuel_delivery",
	        "management_consultant",
	        "management_consulting",
	        "medical_benefits",
	        "medicare_coordination",
	        "office_supplies",
	        "project_management_office_consultant",
	        "project_management_office_consultant_services",
	        "pmoc",
	        "small_business_development",
	        "small_business_mentoring",
	        "ulsd_fuel",
	        "worldwide_inspection_and_testing",
	        "worldwide_inspection_testing",
	      ])
    ) {
      return "internal_operations";
    }
  }

  if (
    typeKey === "program" &&
    hasAny(payloadHay, ["open_stroller_program", "stroller", "strollers"]) &&
    hasAny(payloadHay, ["board_buses", "buses", "customers", "dedicated_area"])
	  ) {
	    return "customer_experience";
	  }

	  if (
	    typeKey === "design" &&
	    hasAny(payloadHay, ["design_services"]) &&
	    hasAny(payloadHay, ["penn_station", "reconstruction", "station_reconstruction"])
	  ) {
	    return "planning_or_report";
	  }
	  if (typeKey === "needs_assessment") return "planning_or_report";
	  if (
	    typeKey === "retainer_contract_panel" &&
	    hasAny(payloadHay, ["transportation_planning", "conceptual_design"])
	  ) {
	    return "planning_or_report";
	  }
		  if (
		    ["procurement", "signaling_maintenance_contract"].includes(typeKey) &&
	    hasAny(payloadHay, ["signaling_system", "signaling_systems", "cbtc", "ats", "ssi"]) &&
	    hasAny(payloadHay, ["maintenance", "maintenance_support", "support_services"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "procurement" &&
	    hasAny(payloadHay, ["car_hoist", "car_hoists", "truck_turntable", "truck_turntables"]) &&
	    hasAny(payloadHay, ["inspection", "maintenance", "parts_supply", "repair"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "operations_and_maintenance_contract" &&
	    hasAny(payloadHay, ["grand_central_madison", "concourse", "communication_rooms", "ventilation_power"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    ["downtown_revitalization", "plaza_project", "redevelopment"].includes(typeKey) &&
	    hasAny(payloadHay, ["station", "plaza", "pedestrian_passageway", "public_open_space", "bus_only_street"])
	  ) {
	    return "capital_or_infrastructure";
	  }
	  if (
	    typeKey === "license_expansion" &&
	    hasAny(payloadHay, ["cellular", "wireless", "wi_fi", "wifi"]) &&
	    hasAny(payloadHay, ["station", "stations", "tunnel", "tunnels", "right_of_way", "row"])
	  ) {
	    return "technology_system";
	  }
	  if (
	    typeKey === "relocation" &&
	    hasAny(payloadHay, ["lease", "relocation", "realty"]) &&
	    hasAny(payloadHay, ["cable_shop", "pitkin", "office", "facility"])
	  ) {
	    return "real_estate_or_property";
	  }
	  if (
	    typeKey === "resolution" &&
	    hasAny(payloadHay, ["bond", "bonds", "refunding", "refundings", "refunding_policy"])
	  ) {
	    return "finance_or_funding";
	  }
  if (
    typeKey === "remediation" &&
    hasAny(payloadHay, ["yaphank_landfill_remediation", "town_of_brookhaven_landfill"]) &&
    hasAny(payloadHay, ["temporary_and_permanent_easements", "property_interests", "eminent_domain"])
  ) {
    return "real_estate_or_property";
  }

	  const realEstateOrPropertyTypes = new Set([
	    "development_agreement",
	    "easement",
	    "housing_development",
	    "lease",
	    "lease_agreement",
	    "lease_extension",
	    "lease_modification",
	    "license_agreement",
	    "license_extension",
	    "licensing_program",
	    "mixed_use_development",
	    "multi_family_housing",
	    "parking_permit",
	    "permit_agreement",
	    "real_estate_development_rights_transfer",
	    "real_estate_disposition",
	    "real_estate",
	    "real_estate_development",
	    "real_estate_easement",
	    "real_estate_field_office",
	    "real_estate_lease",
	    "real_estate_license",
	    "retail_agreement",
	    "retail_development",
	    "short_term_access_permit",
	    "transit_oriented_development",
	  ]);
  if (realEstateOrPropertyTypes.has(typeKey)) return "real_estate_or_property";

  const internalOperationsTypes = new Set([
    "alternative_dispute_resolution_program",
	    "apprenticeship_program",
	    "centralized_service",
	    "cleaning_initiative",
	    "consultant_program",
	    "consulting",
	    "consulting_services",
	    "internship_program",
	    "medical_benefits_program",
	    "mta_interagency_administrative_element",
	    "operating_efficiency_program",
	    "operations_initiative",
	    "operating_efficiency_initiative",
	    "personal_service_retainer_contract",
	    "small_business_development_program",
	    "staffing_initiative",
	    "training",
	    "training_program",
	    "workforce_initiative",
	  ]);
  if (internalOperationsTypes.has(typeKey)) return "internal_operations";

  const customerExperienceTypes = new Set([
    "campaign",
    "community_event",
    "community_outreach",
    "community_outreach_program",
    "cultural_programming",
    "customer_service_modernization",
    "customer_service_program",
    "customer_service_system_implementation",
	    "customer_survey",
	    "performance_improvement",
	    "public_awareness_campaign",
	    "public_outreach_program",
	    "station_customer_experience_modernization",
	  ]);
  if (customerExperienceTypes.has(typeKey)) return "customer_experience";

  const technologySystemTypes = new Set([
    "cell_service_installation",
    "communications_upgrade",
    "drone_program",
	    "internal_dispatching_application",
	    "it_services",
	    "it_upgrade",
	    "security_technology",
	    "system_replacement",
	    "technology",
	    "technology_deployment",
	    "technology_implementation",
	    "technology_initiative",
	    "technology_platform",
	    "technology_replacement",
	    "technology_upgrade",
	    "traffic_control_system_software_upgrade",
	    "traffic_control_system",
	    "training_equipment",
	  ]);
  if (technologySystemTypes.has(typeKey)) return "technology_system";

  const financeOrFundingTypes = new Set([
    "bond_issuance",
    "budget",
	    "fuel_hedging_program",
	    "grant",
	    "grant_authorization",
	    "grant_program",
	    "grant_projects",
	    "refinancing",
	  ]);
  if (financeOrFundingTypes.has(typeKey)) return "finance_or_funding";

  return undefined;
}

function normalizeProjectFamilyValue(value: string) {
  const key = normalizedToken(value);
  if (key === "bike_boulevard" || key === "bike_lane" || key === "greenway") return "bike_facility";
  if (key === "bus_priority_corridor") return "bus_priority";
  if (key === "transit_signal_priority" || key === "transit_signal_priority_program" || key === "tsp_implementation") return "signal_priority";
  if (key === "real_estate" || key === "property" || key === "property_agreement") return "real_estate_or_property";
  if (key === "customer_service" || key === "customer_experience_program") return "customer_experience";
  if (key === "technology" || key === "it_system" || key === "it_program") return "technology_system";
  if (key === "finance" || key === "funding") return "finance_or_funding";
  return undefined;
}

function normalizeProjectStatusFromPayload(payload: JsonObject, context?: NormalizationContext) {
  const hay = normalizedHaystack(payload, ["project_type", "project_name", "name", "description", "project_family", "program"]);
  const contextHay = normalizedContextHaystack(context);
  const descriptiveHay = normalizedHaystack(payload, ["project_name", "name", "description", "program"]);
  const mergedStatusHay = normalizedMergedHaystack(payload, ["project_name", "name", "description", "project_family", "program"]);
  const statusPayloadAndMergedHay = [normalizedHaystack(payload, ["project_type", "project_name", "name", "description", "project_family", "program"]), mergedStatusHay]
    .filter((value) => value.length > 0)
    .join(" ");
  const projectType = stringValue(payload.project_type);
  const typeKey = projectType ? normalizedToken(projectType) : undefined;
  const statusProjectName = stringValue(payload.project_name) ?? stringValue(payload.name);
  const statusProjectNameKey = statusProjectName ? normalizedToken(statusProjectName) : undefined;
  const mergedStatusProjectNameKeys = new Set([
    statusProjectNameKey,
    ...normalizedMergedHaystack(payload, ["project_name", "name"])
      .split(/\s+/u)
      .filter((value) => value.length > 0),
  ]);
  const hasStatusProjectNameKey = (value: string) => mergedStatusProjectNameKeys.has(value);
  const operatingEfficiencyType = typeKey === "operating_efficiency_initiative" || typeKey === "operating_efficiency_program";
  if (!stringValue(payload.status) && typeKey !== undefined && ["committee_work_plan", "work_plan"].includes(typeKey) && descriptiveHay.includes("work_plan")) {
    return "planned";
  }

	  const status = stringValue(payload.status);
	  const statusProjectFamily = stringValue(payload.project_family);
	  const statusProjectFamilyKey = statusProjectFamily ? normalizedToken(statusProjectFamily) : undefined;
	  const derivedStatusProjectFamily = projectType ? normalizeProjectType(projectType) : undefined;
	  const derivedStatusProjectPayloadFamily = normalizeProjectFamilyFromPayload(payload);
	  const derivedStatusProjectPayloadFamilyKey = derivedStatusProjectPayloadFamily ? normalizedToken(derivedStatusProjectPayloadFamily) : undefined;
  if (
    !status &&
    statusProjectNameKey === "fordham_road_bus_lane_redesign_initiative" &&
    typeKey === "bus_lane_redesign" &&
    statusProjectFamilyKey === "bus_lane" &&
    hasAny(descriptiveHay, ["provided_an_update", "update_on_the_fordham_road_bus_lane_redesign_initiative"]) &&
    hasAny(descriptiveHay, ["president_richard_davey", "nyct"])
  ) {
    return "active";
  }
	  if (
	    !status &&
	    statusProjectNameKey === "brt_phase_i_corridors" &&
    typeKey === "bus_rapid_transit" &&
    hasAny(descriptiveHay, ["implemented", "planned"]) &&
    hasAny(descriptiveHay, ["sbs_projects", "select_bus_service_projects"])
  ) {
    return "program_context";
  }
  if (
    !status &&
    statusProjectNameKey === "fulton_cbtc_procurement_liberty_line_signal_replacement" &&
    typeKey === "signal_modernization" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("rfq_already_released") &&
    contextHay.includes("rfp_expected_within_weeks")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "lirr_sandy_restoration_and_resiliency_project_phase_3b" &&
    typeKey === "construction" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("contract_to_posillico_civil_inc") &&
    contextHay.includes("construct_phase_3b")
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "webster_avenue_low_income_housing_development" &&
    typeKey === "real_estate_development" &&
    statusProjectFamilyKey === "real_estate_or_property" &&
    contextHay.includes("intends_to_utilize_the_mta_property_interests") &&
    contextHay.includes("facilitate_the_development")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "flushing_bundle" &&
    typeKey === "state_of_good_repair" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hasAny(hay, ["seven_station_flushing_bundle", "52_st_and_111_st"]) &&
    hasAny(contextHay, ["will_bring_state_of_good_repair_work", "state_of_good_repair_work"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "direct_fixation_track_replacement" &&
    typeKey === "nyct_capital_project" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hasAny(hay, ["63rd_street_and_jamaica_lines", "63_rd_street_and_jamaica_lines"]) &&
    contextHay.includes("proposed_internal_budget_adjustments")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "fulton_liberty_line_cbtc_project" &&
    typeKey === "signal_replacement" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hasAny(hay, ["largest_signal_and_track_replacement_project", "cbtc_implementation"]) &&
    hasAny(contextHay, ["will_be_the_largest_signal_and_track_replacement_project", "fulton_liberty_line_project"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "enhanced_station_initiative_at_white_plains_station" &&
    typeKey === "station_improvement" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("completed_the_renovation_work") &&
    contextHay.includes("white_plains_station")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "zero_emission_commitment" &&
    typeKey === "initiative" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hasAny(contextHay, ["continued_progress_on_new_york_city_transit_s_zero_emission_commitment", "continued_progress_on_new_york_city_transits_zero_emission_commitment"]) &&
    contextHay.includes("charging_infrastructure_installation")
  ) {
    return "active";
  }
  if (
    !status &&
    (statusProjectNameKey === "moodna_viaduct_timber_replacement_and_inspection" || statusProjectNameKey === "new_canaan_branch_cyclical_trackwork") &&
    typeKey === "capital_improvement" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("additional_funding_is_needed_for_the_continuation") &&
    contextHay.includes("scheduled_bus_services_to_support_capital_projects")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "metro_north_harrison_station_tod" &&
    typeKey === "transit_oriented_development" &&
    statusProjectFamilyKey === "real_estate_or_property" &&
    contextHay.includes("harrison_garage_opening") &&
    contextHay.includes("mta_harrison_garage_opens")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "incredible_advocates" &&
    contextHasCheckedTitle(context, statusProjectName)
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "elevator_el_616_7th_av_and_33rd_st" &&
    typeKey === "elevator" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    contextHay.includes("alternate_accessible_travel_information") &&
    contextHay.includes("if_the_elevator_is_out_of_service") &&
    contextHay.includes("elevator_el_616")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "beach_67_st_ada_project" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    contextHay.includes("alternate_accessible_travel_information") &&
    contextHay.includes("if_this_elevator_is_out_of_service") &&
    contextHay.includes("nearby_elevator_el_481")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "cbtc_queens_boulevard_west_line_phase_1" &&
    typeKey === "signal_modernization" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("contract_s_48004_1") &&
    contextHay.includes("requests_that_the_board_ratify_a_modification_to_the_contract")
  ) {
    return "planned";
  }
  if (
    !status &&
    typeKey === "core_infrastructure" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    [
      "metro_north_park_avenue_viaduct_phase_2_acceleration",
      "nyct_elevated_structures_enhanced_overcoating_program",
      "lirr_hollis_station_accessibility_and_platform_upgrades",
    ].includes(statusProjectNameKey ?? "") &&
    hasAny(contextHay, ["key_core_infrastructure_projects", statusProjectNameKey ?? ""])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "railroad_crossing_elimination_rce_grant_program" &&
    typeKey === "grant_program" &&
    statusProjectFamilyKey === "finance_or_funding" &&
    hay.includes("573m_available_ffy_2022")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "model_g_train_project" &&
    typeKey === "train_project" &&
    contextHay.includes("model_g_train_project_sets_a_new_standard")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "2022_bus_strategy" &&
    typeKey === "strategy" &&
    statusProjectFamilyKey === "bus_priority" &&
    contextHay.includes("2022_bus_strategy") &&
    contextHay.includes("expand_bus_priority_and_traffic_enforcement") &&
    contextHay.includes("continually_improve_the_network") &&
    contextHay.includes("transition_to_a_zero_emissions_fleet")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "lirr_babylon_station_renovation" &&
    typeKey === "station_renovation" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHasCheckedTitle(context, statusProjectName) &&
    contextHay.includes("concrete_structure_under_construction")
  ) {
    return "under_construction";
  }
  if (
    !status &&
    statusProjectNameKey === "mow_situation_room" &&
    typeKey === "facility" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("establishing_the_mow_situation_room") &&
    contextHay.includes("specifically_designed_to_manage_major_subway_incidents")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "f_m_swap_service_change" &&
    typeKey === "service_change" &&
    statusProjectFamilyKey === "service_change" &&
    contextHay.includes("planning_implementing_and_communicating_the_f_m_swap_service_change") &&
    contextHay.includes("during_implementation")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "bridges_and_tunnels_capital_maintenance_projects" &&
    typeKey === "capital_maintenance" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("contracts_will_be_issued") &&
    hasAny(contextHay, ["expected_to_be_awarded", "expected_to_begin"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "hunter_college_68_st" &&
    typeKey === "ada_accessibility" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    contextHay.includes("schedule_q4_2024") &&
    contextHay.includes("avoided_water_line_disruption")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "ada_upgrades_at_lindenhurst_lirr" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    hay.includes("fully_accessible_amityville_and_lindenhurst") &&
    hay.includes("knocking_out_capital_projects")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "lirr_expansion_third_track" &&
    typeKey === "construction" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hay.includes("c_and_d_safety_report") &&
    contextHay.includes("lirr_expansion_third_track")
  ) {
    return "under_construction";
  }
  if (
    !status &&
    statusProjectNameKey === "construction_of_a_third_track_between_floral_park_and_hicksville" &&
    typeKey === "rail_infrastructure" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHay.includes("continued_progress") &&
    contextHay.includes("construction_of_a_third_track_between_floral_park_and_hicksville")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "conveyance_of_property_interests_in_the_wakefield_section_of_the_bronx" &&
    typeKey === "transit_oriented_development" &&
    statusProjectFamilyKey === "real_estate_or_property" &&
    contextHay.includes("conditionally_designate_webster_leasing_as_the_successful_proposer") &&
    hasAny(contextHay, ["subject_to_further_mta_mnr_board_action", "subject_to_further_mta_board_action"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "tibbets_brook_daylighting_project" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hay.includes("open_channel") &&
    hay.includes("closed_conduit") &&
    contextHay.includes("action_requested_authorization_to_grant_a_permanent_easement") &&
    contextHay.includes("nyc_dep_is_requesting_to_be_granted") &&
    contextHay.includes("will_provide_bn_yard_with_major_rail_infrastructure_upgrades")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "third_track_main_line_expansion" &&
    typeKey === "capital_project" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hay.includes("requiring_flagging") &&
    contextHay.includes("third_track_main_line_expansion_flagging_requirements")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "increase_ridership" &&
    contextHasCheckedTitle(context, statusProjectName) &&
    hay.includes("one_billion_subway_rides")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "achieve_financial_stability" &&
    statusProjectFamilyKey === "finance_or_funding" &&
    contextHasCheckedTitle(context, statusProjectName) &&
    contextHay.includes("nys_budget_eliminates_projected_deficits")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "increase_accessibility" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    contextHasCheckedTitle(context, statusProjectName) &&
    hay.includes("fully_accessible_grand_st_station")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "promoting_public_safety" &&
    statusProjectFamilyKey === "accessibility_or_safety" &&
    contextHasCheckedTitle(context, statusProjectName) &&
    hay.includes("homeless_outreach")
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "advance_congestion_pricing" &&
    statusProjectFamilyKey === "fare_program" &&
    contextHasCheckedTitle(context, statusProjectName)
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "14_st_f_m_l_upgrades" &&
    typeKey === "station_upgrades" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    contextHasCheckedTitle(context, statusProjectName)
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "42_st_shuttle_5g_cell_service" &&
    typeKey === "cell_service_installation" &&
    statusProjectFamilyKey === "technology_system" &&
    contextHasCheckedTitle(context, statusProjectName)
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "nyct_atlantic_cable_shop_relocation" &&
    typeKey === "relocation" &&
    statusProjectFamilyKey === "real_estate_or_property" &&
    hay.includes("lease_with_generation_next_realty") &&
    hay.includes("2016_pitkin_avenue") &&
    !hasAny(hay, ["approval_requested", "pending_approval", "recommended_for_approval", "seeking_board_approval"])
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "automotive_fueling_station_project" &&
    typeKey === "fueling_station" &&
    hay.includes("acquisition_of_4_fisher_lane") &&
    hay.includes("4_fisher_lane_realty") &&
    hay.includes("north_white_plains") &&
    !hasAny(hay, ["approval_requested", "pending_approval", "recommended_for_approval", "seeking_board_approval"])
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "harlem_and_hudson_power_improvements" &&
    typeKey === "infrastructure" &&
    hay.includes("acquisition_of_property_interests") &&
    hay.includes("construction_operation_maintenance_and_access") &&
    hay.includes("new_electrical_substation") &&
    !hasAny(hay, ["approval_requested", "pending_approval", "recommended_for_approval", "seeking_board_approval"])
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "saturday_summer_savings" &&
    typeKey === "discount_program" &&
    statusProjectFamilyKey === "fare_program" &&
    hay.includes("monthly_ticket_holders_can_travel") &&
    hasAny(hay, ["promotional_1_00_tickets_can_be_purchased", "promotional_1_tickets_can_be_purchased"]) &&
    hay.includes("traintime_app")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "verrazzano_narrows_bridge_approach_construction_vn_84" &&
    typeKey === "capital_construction" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hay.includes("construction_on_approaches") &&
    hay.includes("verrazzano_narrows_bridge") &&
    hay.includes("capital_program")
  ) {
    return "under_construction";
  }
  if (
    !status &&
    statusProjectNameKey === "contact_center_as_a_service" &&
    typeKey === "it_services" &&
    statusProjectFamilyKey === "technology_system" &&
    hay.includes("expansion_of_mta_implementation") &&
    hay.includes("paratransit_department")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "fordham_plaza_redevelopment" &&
    typeKey === "redevelopment" &&
    statusProjectFamilyKey === "capital_or_infrastructure" &&
    hay.includes("proposed_charter_school") &&
    hay.includes("bus_only_street")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "congestion_relief_projects_moving_forward" &&
    typeKey === "program" &&
    hay.includes("congestion_relief_projects_moving_forward")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "a_line_initiative" &&
    typeKey === "improvement_initiative" &&
    hay.includes("strategies_and_improvements_regarding_the_a_line") &&
    hay.includes("demetrius_crichlow")
  ) {
    return "active";
  }
  if (
	    !status &&
	    statusProjectNameKey === "additional_nyct_initiatives" &&
	    operatingEfficiencyType &&
	    (statusProjectFamilyKey === "internal_operations" || derivedStatusProjectPayloadFamilyKey === "internal_operations") &&
	    hay.includes("16_additional_initiatives_detailed_in_financial_plan")
	  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "optimize_overtime_utilization" &&
    operatingEfficiencyType &&
    hay.includes("enforcement_of_existing_timekeeping_rules") &&
    hay.includes("reduction_of_overtime")
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "paratransit_vehicle_surveillance_camera_system" &&
    typeKey === "safety_equipment" &&
    hay.includes("outfit_1_188_paratransit_vehicles") &&
    hay.includes("on_board_vehicle_surveillance_camera_system") &&
    hay.includes("cloud_video_storage") &&
    !hasAny(hay, ["completed", "deployed", "installed", "launched"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "eagle_teams_expansion" &&
    typeKey === "fare_enforcement" &&
    hay.includes("expansion_of_eagle_teams") &&
    hay.includes("fare_validation_and_enforcement") &&
    hay.includes("recommended_by_the_fare_evasion_blue_ribbon_panel") &&
    !hasAny(hay, ["current", "deployed", "introduced", "now_conduct", "now_conducting"])
  ) {
    return "planned";
  }
  if (!status && statusProjectNameKey === "transforming_jamaica" && hay.includes("take_the_survey_online")) {
    return "study";
  }
  if (
    !status &&
    statusProjectNameKey === "nyc_dot_brooklyn_bus_priority_corridors" &&
    typeKey === "bus_priority_corridors" &&
    statusProjectFamilyKey === "bus_priority" &&
    hay.includes("17_priority_corridors_identified") &&
    hay.includes("brooklyn_bus_network_redesign") &&
    hay.includes("mta_and_nyc_dot_coordinating")
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "westbound_bypass" &&
    typeKey === "network_expansion" &&
    hay.includes("federal_request_of_373_70_million") &&
    hay.includes("ffy_2026")
  ) {
    return "planned";
  }
	  if (
	    !status &&
    (statusProjectFamilyKey === "planning_or_report" || derivedStatusProjectFamily === "planning_or_report") &&
	    typeKey !== undefined &&
	    ["alternatives_analysis", "assessment", "needs_assessment", "study"].includes(typeKey) &&
    hasAny(hay, ["alternatives_analysis", "assessment", "assessments", "evaluate", "evaluation", "feasibility_study", "needs_assessment", "study", "studies"])
  ) {
    return "study";
  }
  if (
    !status &&
    typeKey === "strategic_plan" &&
    statusProjectFamilyKey === "planning_or_report" &&
    (["mta_diversity_equity_and_inclusion_strategic_plan_2025_2030", "mta_diversity_equity_inclusion_strategic_plan_2025_2030"].includes(statusProjectNameKey ?? "") ||
      (statusProjectNameKey === "metro_north_one" && descriptiveHay.includes("strategic_plan") && descriptiveHay.includes("2033")))
  ) {
    return "active";
  }
  if (
    !status &&
    ((typeKey === "grant_funded_safety_improvement" && hasAny(hay, ["grade_crossing_safety_improvements", "mnr_crossings"])) ||
      (hasAny(hay, ["fhwa_carsi_grant", "fra_crisi_grant", "section_130_grants"]) && hasAny(hay, ["grade_crossing", "safety_improvements"])) ||
      (hasAny(hay, ["funded_by_2016_fra_grants", "funded_by_15_million_in_additional_fra_grant_funding"]) && hasAny(hay, ["project", "improvements", "work"]))) &&
    !hasAny(hay, ["application_submitted", "available_ffy", "federal_request", "grant_program", "maximum_state_award", "request_for"])
  ) {
    return "approved";
  }
  if (
    !status &&
    ((hasAny(hay, ["funding_for_new_projects"]) &&
      hasAny(hay, ["mitigate_flash_floods", "extreme_weather_events", "stormwater_flooding_mitigation"])) ||
      (hasAny(hay, ["funding_to_support_bridges_and_tunnels_efforts"]) &&
        hasAny(hay, ["bicyclists_and_pedestrians", "bike_and_pedestrian_accessibility"]))) &&
    !hasAny(hay, [
      "application_submitted",
      "available_ffy",
      "federal_request",
      "grant_program",
      "intent_to_file",
      "maximum_state_award",
      "proposed_amendment",
      "request_for",
    ])
  ) {
    return "approved";
  }
  if (
    !status &&
    hasAny(hay, [
      "award_of_an_estimated_quantity_purchase_contract",
      "award_of_purchase_contract",
      "contract_awarded",
      "contract_modification",
      "board_approved_extension",
      "ratification_of_awards",
      "ratification_of_immediate_operating_need",
      "contracted_for_acquisition",
    ]) &&
    hasAny(hay, [
      "contract",
      "contract_term",
      "procurement",
      "purchase",
      "license",
      "award",
      "awards",
      "rolling_stock_procurement",
      "bus_procurement",
      "procurement_contract",
      "procurement_ratification",
    ]) &&
    !hasAny(hay, [
      "award_recommended",
      "board_approval_requested",
      "request_for_approval",
      "requested_approval",
      "seeking_board_approval",
      "sought_for_approval",
      "pending_board_approval",
      "proposed_for_board_approval",
      "recommended_for_approval",
    ])
  ) {
    return "approved";
  }
  if (
    !status &&
    hasAny(hay, [
	      "construction_access_agreement",
	      "contract_to",
	      "contract_with",
      "contract_modification",
      "five_year_sole_source_contract",
      "lease_agreement",
      "license_extension",
      "license_with",
      "maintenance_and_support_services",
      "modification_to_contract",
	      "noncompetitive_contract_to",
      "non_competitive_miscellaneous_contract",
      "short_term_parking_permit",
      "temporary_access_agreement",
    ]) &&
    hasAny(hay, [
      "agreement",
      "contract",
      "contract_term",
      "extension",
      "lease",
      "license",
      "maintenance_and_support",
      "permit",
      "sole_source_contract",
    ]) &&
    !hasAny(hay, [
      "award_recommended",
      "board_approval_requested",
      "part_of_a_multi_year_design_build_contract",
      "pending_board_approval",
      "proposed_for_board_approval",
      "recommended_for_approval",
      "request_for_approval",
      "requested_approval",
      "secure_board_approval",
      "seeking_board_approval",
      "seeks_board_approval",
      "sought_for_approval",
    ])
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "local_law_195_of_2019" &&
    typeKey === "legislation" &&
    hasAny(hay, ["codified", "new_york_city_streets_plan_mandate", "required_dot_to_construct"])
  ) {
    return "approved";
  }
  if (
    !status &&
    statusProjectNameKey === "tbta_payroll_mobility_tax_senior_lien_refunding_green_bonds_series_2024b_and_bond_anticipation_notes_series_2024c" &&
    typeKey === "bond_issuance" &&
    hasAny(hay, ["expects_to_issue", "expected_to_issue"]) &&
    hay.includes("payroll_mobility_tax")
  ) {
    return "planned";
  }
  if (
    !status &&
    typeKey === "bus_procurement" &&
    (statusProjectFamilyKey === "capital_or_infrastructure" || derivedStatusProjectFamily === "capital_or_infrastructure") &&
    (statusProjectNameKey === "purchase_of_475_battery_electric_buses" || statusProjectNameKey === "purchase_92_express_buses") &&
    hasAny(hay, ["increase", "net_increase"]) &&
    hasAny(hay, ["bid_results", "most_recent_estimates"])
  ) {
    return "planned";
  }
  if (
    !status &&
    ((typeKey === "legislative_proposal" && hasAny(hay, ["fare_free_bus_routes", "legislative_proposal"])) ||
      hasAny(hay, ["centralized_call_center_proposed_to_deliver", "proposed_curb_regulation_changes"])) &&
    !hasAny(hay, ["abandoned", "not_implemented", "proposal_not_implemented", "proposed_charter_school"])
  ) {
    return "planned";
  }
  if (
    !status &&
    (statusProjectFamilyKey === "accessibility_or_safety" || derivedStatusProjectFamily === "accessibility_or_safety") &&
    hasAny(hay, ["ada", "accessibility", "zoning_for_accessibility"]) &&
    hasAny(hay, [
      "developer_building_accessible_entrance",
      "first_p3_package_of_ada_stations",
      "metropolitan_lorimer_ada_package_1",
      "platform_components_at_43_stations",
      "progressive_design_build",
      "value_engineering_identified",
      "woodhaven_boulevard_ada_package_2",
    ])
  ) {
    return "planned";
  }
  if (
    !status &&
    hasAny(hay, ["secure_board_approval", "seeks_board_approval", "requested_board_to_declare"]) &&
    hasAny(hay, [
      "accept_federal_grants",
      "authorize_a_competitive_rfp",
      "coach_cars",
      "federal_fiscal_year",
      "rail_flaw_testing",
      "sperry_rail",
    ])
  ) {
    return "planned";
  }
  if (
    !status &&
    !hasAny(hay, [
      "award_recommended",
      "board_approval_requested",
      "request_for_approval",
      "requested_approval",
      "secure_board_approval",
      "seeks_board_approval",
      "seeking_board_approval",
      "sought_for_approval",
      "pending_board_approval",
      "proposed_for_board_approval",
      "recommended_for_approval",
      "requested_board_to_declare",
    ]) &&
    ((hasAny(hay, ["exercise_of_option", "exercise_option", "option_1", "option_2", "option_renewal", "option_renewals"]) &&
      hasAny(hay, ["contract", "extension", "license", "procurement", "renewals"])) ||
      (hasAny(hay, [
        "12_month",
        "12_months",
        "additional_12_month",
        "eight_months",
        "five_year_extension",
        "three_year_extension",
        "through_aug",
        "two_year_extension",
      ]) &&
        hasAny(hay, ["contract", "consultant", "maintenance", "management_consultant", "services", "software_as_a_service", "technical_support"])) ||
      (hasAny(hay, ["authorization_to_amend", "authorization_to_convey", "authorization_to_enter", "letter_agreement"]) &&
        hasAny(hay, ["fee_simple_title", "license_agreement", "real_estate", "field_office", "lease", "restaurant"])))
  ) {
    return "approved";
  }
  if (!status && statusProjectNameKey === "a_shuttle" && typeKey === "shuttle") {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "university_ave_el_grant_dedicated_bus_lane" &&
    (typeKey === "dedicated_bus_lane" || statusProjectFamilyKey === "bus_lane") &&
    hasAny(hay, ["dedicated_bus_lane", "bus_boarding_islands"])
  ) {
    return "implemented";
  }
  if (
    !status &&
    statusProjectNameKey === "beacon_track_3_platform_restoration" &&
    hasAny(hay, ["restored_platform", "platform_restoration", "track_3_beacon_station_platform"]) &&
    hasAny(hay, ["ada_compliant_ramp", "maintenance_work", "ongoing_capital_program"])
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "long_term_fare_gate_strategy" &&
    hasAny(hay, ["fare_gate_strategy", "long_term_fare_gate_strategy"]) &&
    hasAny(hay, ["2025_2029_capital_program"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "metro_north_laser_train_technology_adoption" &&
    hasAny(hay, ["remove_leaf_debris_from_tracks", "leaf_debris"]) &&
    (hasAny(hay, ["will_pilot_it_at_higher_speeds", "pilot_it_at_higher_speeds"]) ||
      (hasAny(hay, ["will_pilot", "pilot"]) && hasAny(hay, ["higher_speeds"])))
  ) {
    return "pilot";
  }
  if (
    !status &&
    typeKey === "infrastructure_improvement" &&
    hasStatusProjectNameKey("grand_central_terminal_train_shed_and_park_avenue_viaduct_work") &&
    hasAny(statusPayloadAndMergedHay, ["grand_central_terminal_train_shed"]) &&
    hasAny(statusPayloadAndMergedHay, ["park_avenue_viaduct"]) &&
    hasAny(mergedStatusHay, ["sector_1_is_under_construction"]) &&
    hasAny(mergedStatusHay, ["complete_replacement_of_approximately_70_000_square_feet"]) &&
    hasAny(mergedStatusHay, ["upper_level_of_the_train_shed"])
  ) {
    return "under_construction";
  }
  if (
    !status &&
    (hasAny(hay, [
      "ada_upgrade_projects_were_achieved",
      "campaign_launched",
      "eliminated_contract_cleaning",
      "first_round_of_off_peak_service_frequency_increases_took_effect",
      "platform_heating_systems_installed",
      "proactive_voluntary_stretching_initiative_aimed_at_reducing",
      "took_effect",
    ]) ||
      hasAny(hay, ["success_story_project_at_floral_park", "success_story_project_renewing_the_white_plains_station", "ribbon_cutting_ceremony"]) ||
      (hay.includes("initiative_launched") &&
        hasAny(hay, ["first_mile_last_mile", "local_stakeholders", "pilot_programs_in_ten_communities", "station_assessments"])) ||
      (hay.includes("hired_additional_cleaners") && hay.includes("stations_and_cars")))
  ) {
    return "implemented";
  }
  if (
    !status &&
    (hasAny(hay, [
      "annual_inspections",
      "c_d_is_collaborating",
      "c_and_d_is_collaborating",
      "construction_update",
      "developing_an_apprenticeship_program",
      "developing_cbdt_toll_structure",
      "enabling_real_time_reporting_of_hazards",
      "expected_to_continue_through_contract_term",
      "expanding_prognostic_maintenance_analytics",
      "is_advancing_priority_repairs",
      "multi_year_effort",
      "ongoing_events",
      "ongoing_improvements",
      "operator_cockpit_door_on_express_bus_fleets",
      "program_providing_opportunities_for_mnr_to_educate",
      "progress_being_made",
      "supports_bus_operations_and_bus_management",
      "transitioning_customer_groups",
    ]) ||
      (operatingEfficiencyType &&
        hasAny(hay, [
          "adjust_scheduled_maintenance_system_cycle_program",
          "assessment_of_scope_criteria",
          "bring_specifications_for_material_purchases",
          "comprehensive_effort_including_recognition",
          "comprehensive_review_of_maintenance_materials",
          "develop_work_standards",
          "drive_accountability_for_overtime",
          "expand_role_in_customer_service",
          "install_cameras_on_700_additional_buses",
          "lower_costs_and_greenhouse_gas_emissions",
          "material_spend_cost_reduction",
          "partnering_with_third_party_administrator",
          "rolling_stock_process_improvement",
          "use_technology_to_more_efficiently_identify",
          "utilize_passenger_loading_data",
        ])))
  ) {
    return "active";
  }
  if (
    !status &&
    (hasAny(hay, [
      "draft_strategy",
      "future_co_op_city_station",
      "identified_for_purchase_in_the_2020_2024_capital_plan",
      "mailing_all_reduced_fare_customers",
      "new_project_for_preliminary_design",
      "new_project_to_install_a_safety_fence",
      "third_party_contractual_needs_estimated",
      "will_rebuild_critical_infrastructure",
      "will_reconstruct_woodhaven_boulevard",
    ]) ||
      (hay.includes("dot_will_reconstruct") && hay.includes("implement_bus_and_safety_improvements")) ||
      (hay.includes("starting_in_2026") && hasAny(hay, ["cbtc", "communication_based_train_control", "signal_modernization"])))
  ) {
    return "planned";
  }
  if (
    !status &&
    (hasAny(hay, ["construction_commenced", "work_began"]) || hasAny(descriptiveHay, ["construction_commenced", "work_began"])) &&
    hasAny(hay, ["substantial_completion_is_slated", "substantial_completion_slated", "anticipated_to_be_completed", "anticipated_completion"]) &&
    hasAny(hay, ["bridge", "flood_protection", "infrastructure", "state_of_good_repair", "substation"]) &&
    !hasAny(hay, ["award_of", "campaign", "initiative_launched", "launched", "pilot_program", "request_for_approval", "will_rebuild", "will_reconstruct"])
  ) {
    return "under_construction";
  }
  const activeTimetableRailTypes = new Set(["crossing_rehabilitation", "crossing_renewal", "signalization", "track_maintenance"]);
  if (
    !status &&
    (statusProjectFamilyKey === "capital_or_infrastructure" || derivedStatusProjectFamily === "capital_or_infrastructure") &&
    typeKey !== undefined &&
    activeTimetableRailTypes.has(typeKey) &&
    hasAny(hay, ["during_the_march_2024_timetable", "during_the_march_4_2024_may_19_2024_timetable", "supported_during_the_september_5_2023_timetable"]) &&
    ((["crossing_rehabilitation", "crossing_renewal"].includes(typeKey) && hasAny(hay, ["crossing_rehabilitation", "crossing_renewal"])) ||
      (typeKey === "signalization" && hasAny(hay, ["signalization", "signalization_project"])) ||
      (typeKey === "track_maintenance" && hasAny(hay, ["track_maintenance", "track_work", "track_work_program"])))
  ) {
    return "active";
  }
  const pilotTypeKeys = new Set(["fare_pilot_program", "pilot", "pilot_program"]);
  if (!status && typeKey !== undefined && pilotTypeKeys.has(typeKey) && hasAnyToken(hay, ["pilot"])) {
    return "pilot";
  }
  if (
    !status &&
    hasAny(hay, ["customers_count_survey", "customer_count_survey"]) &&
    hasAny(hay, ["survey_conducted", "conducted_last_two_weeks"])
  ) {
    return "implemented";
  }
  if (
    !status &&
    hasAny(hay, ["tremont_av_safety_project", "tremont_avenue_safety_project"]) &&
    hasAny(hay, ["conducted_in_2016", "conducted"])
  ) {
    return "implemented";
  }
  if (
    !status &&
    hasAny(hay, ["fully_replaced", "fully_replaced_at_end_of_october_2023"]) &&
    hasAnyToken(hay, ["bridge", "bridges"])
  ) {
    return "implemented";
  }
  if (!status && typeKey === "engineering_control" && /(^|[_\s])achieving_\d+_reduction_in_vehicular_collisions([_\s]|$)/u.test(hay)) {
    return "implemented";
  }
  if (
    !status &&
    hasAny(hay, ["renovated_so_far", "re_new_vated_so_far", "renewvated_so_far"]) &&
    hasAny(hay, ["on_pace_to_complete"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["partnership_for_inclusive_internships", "pii_program"]) &&
    hasAny(hay, ["first_group_of_six_summer_interns_hosted", "summer_interns_hosted"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["jamaica_otp_task_force", "dedicated_task_force_established", "task_force_established"]) &&
    hasAny(hay, ["jamaica", "on_time_performance"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["bronx_ambassadors_program"]) &&
    hasAny(hay, ["return_of_the_bronx_ambassadors_program", "return"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["grand_central_madison", "gcm"]) &&
    hasAny(hay, ["weekend_contractor_maintenance", "contractor_maintenance"]) &&
    hasAny(hay, ["main_tracks", "plaza_interlocking", "tracks_out_of_service"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["boldyn_networks", "subway_cell_connectivity"]) &&
    hasAny(hay, ["continuous_cell_connectivity"]) &&
    hasAny(hay, ["times_square_shuttle_completely_connected"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["park_avenue_viaduct_job_fair"]) &&
    hasAny(hay, ["partnered", "host", "host_a_job_fair"]) &&
    hasAny(hay, ["construction_jobs", "connected_members", "east_harlem_community"])
  ) {
    return "implemented";
  }
  if (
    !status &&
    hasAny(hay, ["governor_hochuls_transparency_initiative", "governor_transparency_initiative", "transparency_initiative"]) &&
    hasAny(hay, ["memorialized", "published_transparency_plan", "transparency_plan"])
  ) {
    return "implemented";
  }
  if (
    !status &&
    hasAny(hay, ["mta_open_data_update", "open_data_update"]) &&
    hasAny(hay, ["daily_ridership_data", "ridership_data"]) &&
    hasAny(hay, ["mta_bus", "subway_lines"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["platform_barriers_project", "platform_barrier_initiative", "platform_barriers"]) &&
    hasAny(hay, ["new_safety_focused", "install_static_platform_barriers", "static_platform_barriers"])
  ) {
    return "planned";
  }
  if (
    !status &&
    hasAny(hay, ["track_trespassing_initiatives", "track_trespassing_task_force"]) &&
    hasAny(hay, ["funding", "platform_screen_doors_pilot", "track_intrusion_detection_systems"])
  ) {
    return "approved";
  }
  if (
    !status &&
    hasAny(hay, ["station_accessibility_ada", "subway_stations_accessible"]) &&
    hasAny(hay, ["legal_settlement", "new_elevator", "ramp_installations", "accessibility_features"])
  ) {
    return "active";
  }
  if (
    !status &&
    hasAny(hay, ["mta_accessibility_expansion", "announcing_new_ada_stations"]) &&
    hasAny(hay, ["new_ada_stations", "accessibility_expansion_program"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey !== undefined &&
    [
      "ada_station_reconstruction_on_the_montauk_branch",
      "ada_station_rehabilitation_at_forest_hills_stations",
      "ada_station_rehabilitation_at_hollis_station",
      "concrete_tie_installation_and_rail_replacement_on_the_main_line",
      "signal_construction_and_maintenance_between_jamaica_and_queens_village",
      "switch_installation_near_floral_park",
      "valley_stream_station_rehabilitation",
      "van_wyck_bridge_waterproofing",
    ].includes(statusProjectNameKey) &&
    typeKey !== undefined &&
    ["infrastructure", "maintenance", "rehabilitation", "track_work"].includes(typeKey)
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey !== undefined &&
    (statusProjectFamilyKey === "capital_or_infrastructure" || derivedStatusProjectFamily === "capital_or_infrastructure") &&
    ["connecticut_track_program", "harmon_to_poughkeepsie_signal_system_project"].includes(statusProjectNameKey) &&
    hasAny(hay, ["lower_than_expected_project_activity"])
  ) {
    return "active";
  }
  if (
    !status &&
    statusProjectNameKey === "fordham_plaza_project" &&
    typeKey === "plaza_project" &&
    hasAny(hay, ["will_become_one_way", "become_one_way"]) &&
    hasAny(hay, ["e_189th", "fordham_plaza"])
  ) {
    return "planned";
  }
  if (
    !status &&
    statusProjectNameKey === "long_island_rail_road_queens_interlocking_signal_system_project" &&
    typeKey === "design_build" &&
    hay.includes("contract_6398_will_upgrade")
  ) {
    return "planned";
  }
  if (!status && statusProjectNameKey === "ordering_new_rail_cars" && typeKey === "procurement" && hay.includes("ordering_new_rail_cars")) {
    return "planned";
  }
  if (!status) return undefined;
  const statusKey = normalizedToken(status);
  if (
    statusKey === "presented" &&
    typeKey === "construction" &&
    statusProjectNameKey === "concourse_line_structural_work" &&
    hay.includes("construction_work_on_the_b_and_d_subway_lines") &&
    hay.includes("associated_service_changes")
  ) {
    return "under_construction";
  }
  if (
    statusKey === "presented" &&
    typeKey === "capital_plan" &&
    statusProjectNameKey === "2025_29_tbta_capital_plan" &&
    hay.includes("tbta_committee_meeting")
  ) {
    return "planned";
  }
  if (
    statusKey === "discussed" &&
    typeKey === "ai_maintenance_system" &&
    statusProjectNameKey === "preteckt" &&
    hasAny(hay, ["uses_artificial_intelligence_to_create_maintenance_repair_plans", "create_maintenance_repair_plans"])
  ) {
    return "active";
  }
  if (
    statusKey === "listed_under_achieve_financial_stability_and_viability" &&
    statusProjectNameKey === "cracking_down_on_toll_evasion" &&
    hay.includes("cracking_down_on_toll_evasion")
  ) {
    return "active";
  }
  if (
    statusKey === "identified" &&
    operatingEfficiencyType &&
    hasAny(hay, ["committed_to_saving", "recurring_operating_costs", "starting_with_100_million_2023"])
  ) {
    return "active";
  }
  const projectNameForStatus = stringValue(payload.project_name) ?? stringValue(payload.name);
  const checkedStatusName = status.replace(/\s*[\u2611\u2713\u2714]\s*$/u, "").trim();
  if (projectNameForStatus && checkedStatusName !== status && normalizedToken(checkedStatusName) === normalizedToken(projectNameForStatus)) {
    return "implemented";
  }

  if (
    ["amendment", "approval", "ratification"].includes(statusKey) &&
    hasAny(hay, [
      "amendment",
      "contract",
      "contract_modification",
      "contracts",
      "modification",
      "personal_service_contract",
      "procurement",
      "public_works_contract",
    ])
  ) {
    return "approved";
  }

  if (
    ["weekend_of_may_17_18_2025", "weekends_of_may_3_4_and_may_17_18_2025"].includes(statusKey) &&
    hasAny(hay, ["concrete_tie", "cutover", "rail_replacement", "signal_testing", "track_out_of_service", "tracks_out_of_service"])
  ) {
    return "planned";
  }

  if (
    statusKey === "both_buses_and_depot_charging_infrastructure_will_proceed" &&
    hasAny(hay, ["electric_bus", "zero_emission_bus", "zero_emission_buses"]) &&
    hasAny(hay, ["charging_infrastructure", "depot_charging"])
  ) {
    return "planned";
  }

  if (
    statusKey === "launching" &&
    hasAny(hay, ["full_reconstruction", "infrastructure_reconstruction", "reconstructing", "reconstruction"]) &&
    hasAny(hay, ["drainage", "retaining_wall", "station_parking_lot", "street"])
  ) {
    return "under_construction";
  }

  if (
    statusKey === "substantial_completion_anticipated_fall_2024" &&
    hasAny(hay, ["ada", "accessibility", "accessible", "elevator", "elevators"]) &&
    hasAny(hay, ["station", "stations"])
  ) {
    return "planned";
  }

  if (
    statusKey === "various_completion_percentages" &&
    hasAny(hay, ["flag_repair", "flag_repairs"]) &&
    hasAny(hay, ["100", "completion_stages", "infrastructure", "viaduct"])
  ) {
    return "active";
  }

  if (
    statusKey === "completion_goal" &&
    hasAny(hay, ["bus", "buses", "hybrid_electric_buses"]) &&
    hasAny(hay, ["completion_goal", "nyct"])
  ) {
    return "planned";
  }

  if (
    statusKey === "launching" &&
    hasAny(hay, ["select_bus_service", "sbs"]) &&
    hasAny(hay, ["b44", "s79"])
  ) {
    return "planned";
  }

  if (
    statusKey === "launching_may_20_to_june_14_2024" &&
    hasAny(hay, ["metrocard", "student", "student_metrocard"]) &&
    hasAny(hay, ["raffle", "travel_to_or_from_school"])
  ) {
    return "planned";
  }

  if (
    statusKey === "annual_update" &&
    hasAny(hay, ["agency_safety_plan", "system_safety_program_plan"]) &&
    hasAny(hay, ["buses", "subways", "system_safety"])
  ) {
    return "active";
  }

  if (
    ["year_1_progress_report", "year_1_july_1_2023_june_30_2024_progress_report"].includes(statusKey) &&
    hasAny(hay, ["dei", "diversity_equity_and_inclusion", "five_year"]) &&
    hasAny(hay, ["progress_report", "strategic_plan"])
  ) {
    return "active";
  }

  if (
    statusKey === "concurrent_delays_r211_deliveries_conventional_signal_equipment_manufacturing" &&
    hasAny(hay, ["8th_avenue_line", "8_av", "cbtc", "signal_modernization"])
  ) {
    return "active";
  }

  if (
    ["conditional_designation", "conditional_designation_of_gotham_organization_as_selected_proposer"].includes(statusKey) &&
    hasAny(hay, ["conditional_designation", "conditionally_designated", "selected_proposer"]) &&
    hasAny(hay, ["development", "ground_lease", "real_estate", "transit_oriented_development"])
  ) {
    return "planned";
  }

  if (
    statusKey === "accelerated" &&
    hasAny(hay, ["ada", "accessibility", "accessibility_upgrades"]) &&
    hasAny(hay, ["accelerated", "acceleration", "stations"])
  ) {
    return "active";
  }

  if (
    ["beginning", "beginning_sep_3"].includes(statusKey) &&
    ((hasAny(hay, ["station_refresh"]) && hasAny(hay, ["improvements", "nine_stations"])) ||
      (hasAny(hay, ["signal_modernization", "crosstown_line"]) && hasAny(hay, ["beginning_sep_3", "trains_resume"])))
  ) {
    return "planned";
  }

  if (
    statusKey === "construction_pushed_to_2025" &&
    hasAny(hay, ["construction", "infrastructure_repair", "repair"]) &&
    hasAny(hay, ["east_river_tunnel", "superstorm_sandy", "tunnel"])
  ) {
    return "planned";
  }

  if (
    statusKey === "announced" &&
    ((hasAny(hay, ["electric_bus", "electric_buses", "overhead_chargers"]) && hasAny(hay, ["expected", "procurement"])) ||
      (hasAny(hay, ["albany", "metro_north", "service_expansion"]) && hasAny(hay, ["daily_roundtrip", "launch"])))
  ) {
    return "planned";
  }

  if (
    statusKey === "recommended" &&
    ((hasAny(hay, ["route_revision", "travel_path"]) && hasAny(hay, ["b63", "revise"])) ||
      (hasAny(hay, ["emergency_and_scheduled_bus_services", "scheduled_bus_services"]) && hasAny(hay, ["contracts", "service_disruptions", "track_outages"])))
  ) {
    return "planned";
  }

  if (
    statusKey === "executed" &&
    hasAny(hay, ["permit", "short_term_access_permit"]) &&
    hasAny(hay, ["parking_lot", "station", "town_of_cortlandt"])
  ) {
    return "implemented";
  }

  if (
    statusKey === "reviewed" &&
    hasAny(hay, ["policy_code", "policy_directive", "code_of_ethics", "whistleblower_protection"]) &&
    (hasAny(hay, ["adopted", "revised", "reviewed"]) ||
      (hasAny(hay, ["whistleblower_protection"]) &&
        hasAny(hay, ["policy_directive"]) &&
        hasAny(hay, ["applicable_law", "protect_mta_employees", "protecting_whistleblowers", "wrongful_acts"])))
  ) {
    return "approved";
  }

  if (
    statusKey === "reported" &&
    typeKey === "service_improvement_initiative" &&
    hasAny(hay, ["targeted_improvements", "lower_performing_routes"]) &&
    hasAny(hay, ["bus_ridership", "routes"])
  ) {
    return "active";
  }

  if (
    statusKey === "committed" &&
    hasAny(hay, ["bus_lanes", "busways"]) &&
    hasAny(hay, ["committed", "implement"])
  ) {
    return "planned";
  }

  if (
    statusKey === "purchase_new_dual_mode_locomotives_for_lirr" &&
    hasAny(hay, ["dual_mode_locomotives", "locomotives", "rolling_stock"]) &&
    hasAny(hay, ["purchase", "replacing_aging_railcars"])
  ) {
    return "planned";
  }

  if (
    statusKey === "new" &&
    hasAny(hay, ["new"]) &&
    (hasAny(hay, ["state_of_good_repair", "sgr"]) || hasAny(hay, ["mta_interagency", "mta_construction_development"]))
  ) {
    return "planned";
  }

  return undefined;
}

const PROJECT_DATE_FIELDS = [
  "completion_date",
  "completion_date_text",
  "implementation_date",
  "implemented_date",
  "opening_date",
  "launch_date",
  "launch_date_text",
  "start_date",
  "start_date_text",
  "phase_1_start_date",
  "phase_2_start_date",
  "publication_date",
  "target_year",
  "year",
  "timeframe",
] as const;

function addProjectDateCompanions(next: JsonObject, payload: JsonObject) {
  const best = bestNormalizedDateWithField(payload, PROJECT_DATE_FIELDS);
  if (best) {
    if (typeof next.date_normalized !== "string") next.date_normalized = best.normalized.normalized_date;
    addIfMissing(next, "date_precision", best.normalized.precision);
    addIfMissing(next, "date_source_field", best.field);
    return;
  }
  addIfMissing(next, "date_precision", "unknown");
}

function normalizeProjectPayload(payload: JsonObject, context?: NormalizationContext): JsonObject {
  const next: JsonObject = { ...payload };
  const projectFamily = stringValue(payload.project_family);
  const normalizedFamily = projectFamily ? normalizeProjectFamilyValue(projectFamily) : undefined;
  if (normalizedFamily) next.project_family = normalizedFamily;
  const documentTimeStatus = stringValue(payload.document_time_status);
  if (documentTimeStatus) {
    const normalizedStatus = normalizeProjectStatus(documentTimeStatus);
    if (normalizedStatus !== "other") next.document_time_status = normalizedStatus;
  }
  const status = stringValue(payload.status);
  if (status) addIfMissingOrOther(next, "document_time_status", normalizeProjectStatus(status));
  addIfMissingOrOther(next, "document_time_status", normalizeProjectStatusFromPayload(payload, context));
  const projectType = stringValue(payload.project_type);
  if (projectType) addIfMissingOrOther(next, "project_family", normalizeProjectType(projectType));
  const payloadFamily = normalizeProjectFamilyFromPayload(payload);
  if (payloadFamily === "planning_or_report" && projectType && normalizedToken(projectType) === "expansion" && next.project_family === "capital_or_infrastructure") {
    next.project_family = payloadFamily;
  } else {
    addIfMissingOrOther(next, "project_family", payloadFamily);
  }
  addProjectDateCompanions(next, payload);
  return next;
}

function normalizeEventKind(value: string) {
  const key = normalizedToken(value);
  const launchEventKinds = new Set(["in_service", "new_service", "service_rollout", "start_of_service"]);
  const publicEngagementEventKinds = new Set([
    "community_engagement",
    "community_board_briefing",
    "community_board_design_review",
    "community_board_review",
    "community_board_update",
    "community_consultation",
	    "community_forum",
	    "community_walk_through",
	    "community_workshop",
	    "design_charrette",
	    "design_workshop",
    "public_design_workshop",
    "public_discussion",
	    "public_engagement",
	    "public_feedback",
	    "public_forum",
	    "public_town_hall",
	    "public_webinar",
    "public_workshop",
    "public_workshop_series",
    "residents_briefing",
    "stakeholder_briefing",
  ]);
  const implementationEventKinds = new Set([
    "accessibility_installation",
    "commissioning",
    "fare_pilot_program",
    "fare_toll_increase",
	    "holiday_getaway_service",
	    "holiday_service",
	    "holiday_service_program",
	    "bus_deployment",
	    "drill_exercise",
	    "infrastructure_added",
    "infrastructure_replacement",
    "infrastructure_upgrade",
    "infrastructure_work",
    "installation",
    "installation_target",
    "pilot",
    "pilot_program",
	    "pilot_test",
	    "policy_effective_date",
	    "program_activation",
	    "return_to_service",
    "schedule_change",
    "schedule_adjustment",
    "seasonal_service",
    "service_addition",
    "service_adjustment",
    "service_expansion",
    "service_increase",
    "service_modification",
    "service_restoration",
    "service_resumption",
    "cutover",
    "final_cutover",
    "signal_cutover",
    "special_event_service",
    "special_service",
    "testing",
    "timetable_change",
    "toll_change",
    "toll_increase",
    "track_work",
    "trackwork",
    "trackwork_program",
  ]);
  const milestoneEventKinds = new Set([
    "acquisition",
    "anniversary",
    "anniversary_celebration",
    "agreement_execution",
    "agreement_executed",
    "agreement_signed",
    "appointment",
    "bid_receipt",
    "bid_submission",
    "bond_closing",
    "bond_issuance",
    "bond_issuance_planned",
    "contract_execution",
    "contract_issuance",
    "contract_option_exercised",
    "credit_rating_action",
    "credit_rating_upgrade",
    "debt_payoff",
    "debut",
    "delivery_start",
    "employee_recognition",
    "execution",
	    "financing_closing",
	    "filing",
	    "fuel_hedge",
    "fuel_hedge_execution",
    "fleet_retirement",
    "funding_allocation",
    "grant_announcement",
    "grant_execution",
    "graduation",
    "inaugural_run",
    "inaugural_ride",
    "incorporation",
	    "leadership_change",
		    "legal_execution",
		    "lease_agreement",
		    "lease_execution",
		    "license_agreement",
		    "licenses_executed",
	    "locomotive_unveiling",
    "bond_pricing",
    "bond_remarketing",
    "bond_sale",
    "bond_transaction",
    "consolidation",
	    "mou_execution",
	    "naming_announcement",
	    "notice_to_proceed",
	    "ntp",
	    "permit_execution",
	    "planned_bond_issuance",
	    "proposal_deadline",
    "proposal_submission",
    "proposal_due",
	    "ratings_upgrade",
	    "regulatory_filing",
	    "regulatory_submission",
	    "request_for_proposals",
	    "retirement",
	    "creation",
	    "program_establishment",
	    "rfp_advertisement",
    "rfp_issue",
    "rfp_issued",
    "rfp_issuance",
    "rfp_release",
    "ribbon_cutting",
	    "solicitation_issue",
	    "submission",
	    "submission_deadline",
    "ribbon_cutting_ceremony",
    "ridership_record",
    "unveiling",
    "unveiling_ceremony",
    "upcoming_bond_issuance",
    "vehicle_unveiling",
  ]);
  const pauseEventKinds = new Set(["outage", "planned_track_outage", "service_disruption", "service_outage", "track_outage", "track_work_outage", "trackwork_outage"]);
  const incidentEventKinds = new Set(["accident", "derailment", "incident", "safety_incident"]);
  const documentMetadataEventKinds = new Set(["data_as_of_date", "document_date", "staff_summary_date"]);
  const planningEventKinds = new Set([
    "alternatives_analysis_selection",
    "analysis",
	    "board_proposal",
    "corridor_identification",
	    "corridor_selection",
    "design",
    "design_development",
    "design_finalization",
    "design_phase",
    "design_refinement",
    "design_selection",
    "design_start",
    "environmental_review_start",
    "plan_development",
    "planned_rfq",
    "planning",
	    "planning_phase",
    "project_identification",
	    "project_transfer",
    "scoping_start",
    "proposal_development",
    "study",
    "study_initiation",
    "study_phase",
    "study_start",
  ]);
  const approvalEventKinds = new Set([
    "adoption",
    "authorization",
    "board_adoption",
    "board_ratification",
    "board_authorization",
    "board_resolution",
    "board_resolution_adoption",
    "bond_authorization",
    "budget_adoption",
    "charter_adoption",
    "charter_adoption_amendment",
    "contract_authorization",
    "contract_ratification",
    "policy_adoption",
    "procurement_ratification",
    "program_adoption",
    "ratification",
    "resolution_adoption",
  ]);
	  const governanceEventKinds = new Set([
	    "adjournment",
	    "agenda_item",
	    "board_briefing",
	    "board_action",
	    "board_update",
	    "budget_action",
	    "budget_review",
	    "committee_action",
	    "committee_agenda_item",
	    "committee_briefing",
	    "committee_information_item",
	    "committee_review",
	    "finance_committee_action_item",
	    "finance_committee_agenda_item",
	    "information_item",
	    "policy_revision",
	    "recurring_agenda_item",
	    "scheduled_committee_agenda",
	  ]);
  if (
    key.includes("launch") ||
    key.includes("pilot_start") ||
    key.includes("service_start") ||
    key.includes("service_availability") ||
    key.includes("restart") ||
    key.includes("start_date") ||
    key.includes("project_start") ||
    key.includes("program_start") ||
    key.includes("commencement") ||
    key.includes("opening") ||
    launchEventKinds.has(key)
  ) {
    return "launch";
  }
  const publicationEventKinds = new Set(["design_release", "document_release", "draft_plan_release", "environmental_assessment_release", "plan_release"]);
  if (publicationEventKinds.has(key)) return "publication";
  if (key.includes("publication") || key.includes("published") || key.includes("report") || key.includes("blog_post") || key.includes("press_release")) {
    return "publication";
  }
  if (key.includes("dataset") || key.includes("data_release") || key.includes("planned_dataset_release")) return "data_release";
  if (
    value.trim() === "emergency_exercise" ||
    key.includes("implementation") ||
    key.includes("service_change") ||
    key.includes("improvement") ||
    key.includes("station_addition") ||
    key === "restriction_effective" ||
    implementationEventKinds.has(key) ||
    key.includes("program_expansion") ||
    key.includes("policy_change") ||
    key.includes("policy_expansion") ||
    key.includes("permanent_designation")
  ) {
    return "implementation";
  }
  if (
    key.includes("meeting") ||
    key.includes("hearing") ||
    key.includes("presentation") ||
    key.includes("outreach") ||
    key.includes("survey") ||
    key.includes("open_house") ||
    publicEngagementEventKinds.has(key) ||
    key.includes("public_comment") ||
    key.includes("press_conference") ||
    key.includes("datathon")
  ) {
    return "public_engagement";
  }
  if (key.includes("enforcement") || key === "conviction") return "enforcement";
  if (key.includes("legislation") || key.includes("legislative")) return "legislation";
  if (key.includes("construction") || key.includes("groundbreaking")) return "construction";
  if (governanceEventKinds.has(key)) return "governance";
  if (approvalEventKinds.has(key) || key.includes("vote") || key.includes("approval")) return "approval";
  if (pauseEventKinds.has(key) || key.includes("pause") || key.includes("suspension")) return "pause";
  if (incidentEventKinds.has(key)) return "incident";
  if (documentMetadataEventKinds.has(key)) return "document_metadata";
  if (key.includes("planned_release")) return "data_release";
  if (milestoneEventKinds.has(key) || key.includes("monitoring") || key.includes("milestone") || key.includes("completion") || key.includes("award") || key.includes("program_transition") || key.includes("program_transfer")) return "milestone";
  if (planningEventKinds.has(key) || key.includes("future_plan")) return "planning";
  return "other";
}

function normalizeEventFamilyFromPayload(payload: JsonObject, context?: NormalizationContext): string | undefined {
  const eventKind = stringValue(payload.event_kind);
  if (!eventKind) return undefined;
  const eventKindKey = normalizedToken(eventKind);

  const haystack = normalizedToken(
    [
      stringValue(payload.event_name),
      stringValue(payload.name),
      stringValue(payload.description),
      stringValue(payload.date_text),
      stringValue(payload.raw_text),
    ]
      .filter((value): value is string => value !== undefined)
      .join(" "),
  );
  const contextHaystack = normalizedContextHaystack(context);
  const evidenceHaystack = [haystack, contextHaystack].filter((value) => value.length > 0).join(" ");
  const eventKindSpelling = eventKind.trim().toLowerCase();
	  const hasDatedAnchor = /(^|_)(?:19|20)\d{2}(_|$)/u.test(haystack);
  if (
    ["horse_race", "baseball_season", "concert"].includes(eventKindKey) &&
    hasAny(evidenceHaystack, ["will_run_extra_trains", "provides_extra_services", "will_provide_extra_post_event_service", "yankee_clipper"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "current_status" && evidenceHaystack.includes("15_electric_buses_operating_in_manhattan")) {
    return "implementation";
  }
  if (
    eventKindKey === "safety_project" &&
    hasAny(evidenceHaystack, ["tremont_av_safety_project", "tremont_avenue_safety_project"]) &&
    hasAny(evidenceHaystack, ["reduced_injuries", "2016"])
  ) {
    return "implementation";
  }
  if (
    ["operating_start", "operations_start"].includes(eventKindKey) &&
    hasAny(evidenceHaystack, ["has_been_operating", "started_operating"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "notice_submission" &&
    evidenceHaystack.includes("submitted") &&
    hasAny(evidenceHaystack, ["public_authorities_law", "pal_2897", "new_york_state_officials"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "notice_transmittal" &&
    evidenceHaystack.includes("forwarded") &&
    hasAny(evidenceHaystack, ["governor", "speaker", "temporary_president"])
  ) {
    return "milestone";
  }
  if (eventKindKey === "storm" && evidenceHaystack.includes("hurricane_ida")) {
    return "incident";
  }
  if (
    eventKindKey === "natural_disaster" &&
    (evidenceHaystack.includes("superstorm_sandy") || (evidenceHaystack.includes("struck_the_region") && evidenceHaystack.includes("damaged")))
  ) {
    return "incident";
  }
  if (
    ["storm_response", "winter_storm_operations", "weather_event"].includes(eventKindKey) &&
    evidenceHaystack.includes("winter_storm_fern") &&
    hasAny(evidenceHaystack, ["response", "snowfall", "deicer", "kept_operating", "only_major_transit_agency"])
  ) {
    return "incident";
  }
  if (
    eventKindKey === "warranty_expiration" &&
    evidenceHaystack.includes("warranty") &&
    hasAny(evidenceHaystack, ["expire", "expired", "contract_ended"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "guidance_received" &&
    evidenceHaystack.includes("fhwa") &&
    hasAny(evidenceHaystack, ["environmental_assessment", "cbd_tolling"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "rebranding" &&
    evidenceHaystack.includes("rebranded") &&
    hasAny(evidenceHaystack, ["metro_north_care", "lirr_care"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "protest" &&
    evidenceHaystack.includes("jews_for_peace") &&
    hasAny(evidenceHaystack, ["arrests", "arrested"]) &&
    hasAny(evidenceHaystack, ["rush_hour", "grand_central_terminal"])
  ) {
    return "incident";
  }
  if (
    eventKindKey === "budget_deal" &&
    hasAny(evidenceHaystack, ["4_year_budget_deal", "four_year_budget_deal"]) &&
    hasAny(evidenceHaystack, ["fund_mta", "fund_the_mta"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "labor_settlement" &&
    evidenceHaystack.includes("twu_local_100") &&
    evidenceHaystack.includes("tentative_agreement")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "presidential_visit" &&
    hasAny(evidenceHaystack, ["president_joe_biden", "president_biden"]) &&
    evidenceHaystack.includes("federal_commitment") &&
    evidenceHaystack.includes("hudson_tunnel_project")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "personnel_start" &&
    evidenceHaystack.includes("started") &&
    hasAny(evidenceHaystack, ["chief_accessibility_officer", "agency_wide_chief_accessibility_officer"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "employment_start" &&
    evidenceHaystack.includes("joined") &&
    hasAny(evidenceHaystack, ["paratransit_department", "nyct_s_paratransit"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "hiring_cohort" &&
    hasAny(evidenceHaystack, ["welcomed_a_cohort", "cohort_of_28"]) &&
    evidenceHaystack.includes("engineering_trainees")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "inception" &&
    hasAny(evidenceHaystack, ["fmtac_aggregate_portfolio", "portfolio_inception"]) &&
    evidenceHaystack.includes("inception_date")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "price_adjustment" &&
    hasAny(evidenceHaystack, ["price_concession", "unilateral_price_concession"]) &&
    hasAny(evidenceHaystack, ["selection_for_award", "selected_for_award"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "operation" &&
    evidenceHaystack.includes("safe_passage") &&
    evidenceHaystack.includes("verrazzano_narrows_bridge")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "seasonal_preparation" &&
    evidenceHaystack.includes("prepared_for_summer_operations") &&
    evidenceHaystack.includes("air_comfort_system")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "safety_program" &&
    evidenceHaystack.includes("seasonal_safety_focus_days") &&
    hasAny(evidenceHaystack, ["launch", "prepared_to_perform"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "awareness_day" &&
    evidenceHaystack.includes("international_level_crossing_awareness_day") &&
    hasAny(evidenceHaystack, ["education", "enforcement", "ilcad"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "awareness_week" &&
    evidenceHaystack.includes("national_work_zone_awareness_week")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "training" &&
    evidenceHaystack.includes("emergency_response_training") &&
    evidenceHaystack.includes("tactical_exercises_using_railroad_equipment") &&
    hasAny(evidenceHaystack, ["mtapd_s_emergency_services_unit", "southwest_regional_emergency_response_team", "m8_rail_cars"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "training" &&
    evidenceHaystack.includes("operation_lifesaver_authorized_volunteer") &&
    evidenceHaystack.includes("rail_safety_presentations") &&
    evidenceHaystack.includes("communities_we_serve")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "certification" &&
    evidenceHaystack.includes("operation_lifesaver_authorized_volunteer") &&
    evidenceHaystack.includes("free_rail_safety_education") &&
    evidenceHaystack.includes("communities_we_serve")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "contest" &&
    evidenceHaystack.includes("rail_safety_sticker_contest") &&
    evidenceHaystack.includes("student_artwork") &&
    evidenceHaystack.includes("participants")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "ceremony" &&
    evidenceHaystack.includes("school_safety_backpack_contest") &&
    hasAny(evidenceHaystack, ["safety_themed_slogan", "safety_around_trains_and_tracks"]) &&
    hasAny(evidenceHaystack, ["tracks_presentations", "t_r_a_c_k_s_presentations"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "audition" &&
    evidenceHaystack.includes("music_under_new_york") &&
    hasAny(evidenceHaystack, ["passersby", "riders", "perform_live_for_the_public"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "showcase" &&
    evidenceHaystack.includes("staycation_showcase") &&
    evidenceHaystack.includes("visitors") &&
    evidenceHaystack.includes("tourism_partners")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "expo" &&
    evidenceHaystack.includes("april_it_expo") &&
    hasAny(evidenceHaystack, ["applications_submitted", "interviews", "offers_made"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "process_change" &&
    evidenceHaystack.includes("automated_some_dataset_uploads")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "redesign" &&
    evidenceHaystack.includes("redesigned_the_nyct_and_lirr_mnr_committee_books")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "extension" &&
    evidenceHaystack.includes("extended_the_availability") &&
    evidenceHaystack.includes("supplemental_family_benefits_agreement")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "vacated" &&
    evidenceHaystack.includes("rite_aid") &&
    evidenceHaystack.includes("vacated") &&
    evidenceHaystack.includes("retail_space")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "closeout" &&
    evidenceHaystack.includes("mid_suffolk_yard") &&
    evidenceHaystack.includes("closeout") &&
    evidenceHaystack.includes("forecast") &&
    evidenceHaystack.includes("yard_support_facility_completion") &&
    evidenceHaystack.includes("actual")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "commemoration" &&
    evidenceHaystack.includes("tbta_s_90th_anniversary_commemoration")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "recognition_program" &&
    evidenceHaystack.includes("transit_all_stars") &&
    evidenceHaystack.includes("employee_recognition")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "appreciation_day" &&
    evidenceHaystack.includes("transit_employee_appreciation_day") &&
    hasAny(evidenceHaystack, ["visited_employees", "visits_to_over_a_dozen_employee_facilities", "employee_facilities"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "recognition_day" &&
    evidenceHaystack.includes("national_transit_employee_appreciation_day") &&
    hasAny(evidenceHaystack, ["thanked_employees", "recognizing", "dedication_and_service"])
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "strike" &&
    evidenceHaystack.includes("strike_by_nj_transit_train_operators") &&
    evidenceHaystack.includes("no_metro_north_west_of_hudson_service")
  ) {
    return "pause";
  }
  if (
    eventKindKey === "demonstration" &&
    evidenceHaystack.includes("access_a_ride") &&
    evidenceHaystack.includes("operations_and_cleanliness_milestone") &&
    evidenceHaystack.includes("ford_e_450") &&
    evidenceHaystack.includes("15_vans")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "pilot_duration" &&
    evidenceHaystack.includes("fare_pilot_promotion") &&
    evidenceHaystack.includes("sale_of_monthly_passes_for_july_2024") &&
    evidenceHaystack.includes("at_least_12_months")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "phase" &&
    evidenceHaystack.includes("summer_2024_strategic_improvement") &&
    evidenceHaystack.includes("expand_trip_subsidy_to_60_per_trip")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "expansion" &&
    evidenceHaystack.includes("fall_2024_strategic_expansion") &&
    evidenceHaystack.includes("onboard_up_to_800_new_customers")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "financial_plan_update" &&
    evidenceHaystack.includes("board_will_be_updated") &&
    evidenceHaystack.includes("february_financial_plan")
  ) {
    return "publication";
  }
  if (
    eventKindKey === "fiscal_year_end_results" &&
    evidenceHaystack.includes("fmtac_finished_2025") &&
    evidenceHaystack.includes("gross_premium_earned")
  ) {
    return "publication";
  }
  if (
    eventKindKey === "gridlock_alert" &&
    evidenceHaystack.includes("un_week") &&
    evidenceHaystack.includes("gridlock_delays") &&
    evidenceHaystack.includes("use_mass_transit")
  ) {
    return "publication";
  }
  if (
    eventKindKey === "discussion" &&
    evidenceHaystack.includes("tmha") &&
    evidenceHaystack.includes("requested_to_move_forward") &&
    evidenceHaystack.includes("permanent_exclusive_use_easement")
  ) {
    return "planning";
  }
  if (
    ["option_exercise", "proposed_extension", "proposed_contract_extension", "procurement_action"].includes(eventKindKey) &&
    ((eventKindKey === "option_exercise" && evidenceHaystack.includes("approved_by_the_december_2020_board")) ||
      (evidenceHaystack.includes("staff_summary_requests") && evidenceHaystack.includes("board") && evidenceHaystack.includes("adoption")) ||
      (evidenceHaystack.includes("seeking_board_approval_to_extend") && evidenceHaystack.includes("personal_service_contract")) ||
      (evidenceHaystack.includes("proposed_award_of_competitively_solicited_personal_service_contract") &&
        evidenceHaystack.includes("construction_management") &&
        hasAny(evidenceHaystack, ["bridge_preservation", "bronx_whitestone", "tnm_402", "wbm_389"])))
  ) {
    return "approval";
  }
  if (
    ["coverage_target", "goal_target", "target"].includes(eventKindKey) &&
    ((evidenceHaystack.includes("74_of_subway_stations") && hasAny(evidenceHaystack, ["will_be_by_the_end_of_2024", "target"])) ||
      (evidenceHaystack.includes("customer_satisfaction") && hasAny(evidenceHaystack, ["increase_target_of_10", "up_10_by_june_2024"])) ||
      (evidenceHaystack.includes("estimated_800_additional_conductor_cab_camera_systems") && evidenceHaystack.includes("in_service")))
  ) {
    return "planning";
  }
  if (
    eventKindKey === "delivery_window" &&
    hasAny(evidenceHaystack, ["delivery_schedule_for_13_b_ac_locomotives", "locomotives_are_scheduled_to_be_delivered"])
  ) {
    return "milestone";
  }
  if (eventKindKey === "future_initiative" && evidenceHaystack.includes("free_mta_issued_reduced_fare_omny_cards_beginning_next_year")) {
    return "planning";
  }
  if (eventKindKey === "prototype_display" && evidenceHaystack.includes("wide_fare_gate_prototype") && evidenceHaystack.includes("on_display")) {
    return "milestone";
  }
  if (eventKindKey === "accomplishment" && evidenceHaystack.includes("already_made_big_strides_in_2021")) {
    return "milestone";
  }
  if (
    eventKindKey === "capital_project" &&
    evidenceHaystack.includes("upcoming_capital_project") &&
    evidenceHaystack.includes("bay_parkway") &&
    evidenceHaystack.includes("cropsey_avenue")
  ) {
    return "planning";
  }
  if (eventKindKey === "capital_project_phase" && evidenceHaystack.includes("adjustment_monitoring_and_evaluation_period") && evidenceHaystack.includes("capital_project_phase")) {
    return "planning";
  }
  if (
    ["expected_payment", "financial_reconfiguration", "valuation", "appraisal_update"].includes(eventKindKey) &&
    ((evidenceHaystack.includes("expected_payment") && evidenceHaystack.includes("mrt_2_escalator_payments")) ||
      evidenceHaystack.includes("reconfigured_its_1_3_billion_revolving_line_of_credit") ||
      evidenceHaystack.includes("broker_opinion_of_value") ||
      evidenceHaystack.includes("updated_appraisal_of_premises"))
  ) {
    return "milestone";
  }
  if (
    ["facility_tour", "competition", "walking_tour"].includes(eventKindKey) &&
    ((evidenceHaystack.includes("conducted_a_tour_of_the_professional_paratransit_facility") && evidenceHaystack.includes("queens_borough_president")) ||
      evidenceHaystack.includes("mta_s_first_open_data_challenge_launched") ||
      evidenceHaystack.includes("walking_tours_of_125th_street"))
  ) {
    return "public_engagement";
  }
  if (
    ["contract_closure", "program_review", "inspection"].includes(eventKindKey) &&
    ((evidenceHaystack.includes("anticipate_finalizing_contract_closure_agreement") && hasAny(evidenceHaystack, ["alstom_siemens", "open_variances"])) ||
      evidenceHaystack.includes("will_be_reevaluated_and_decision_made") ||
      evidenceHaystack.includes("ensco_geometry_runs_scheduled"))
  ) {
    return "planning";
  }
  if (eventKindKey === "committee_cancellation" && evidenceHaystack.includes("no_meeting_scheduled")) {
    return "governance";
  }
  if (
    eventKindKey === "special_event" &&
    evidenceHaystack.includes("bronx_bound_upper_level") &&
    evidenceHaystack.includes("closed_to_vehicular_traffic") &&
    evidenceHaystack.includes("reopened_at_10_50")
  ) {
    return "pause";
  }
  if (
    ["non_responsible_determination", "withdrawal"].includes(eventKindKey) &&
    (evidenceHaystack.includes("deemed_non_responsible_by_nys_office_of_general_services") || evidenceHaystack.includes("withdrew_its_proposal_prior_to_submitting"))
  ) {
    return "milestone";
  }
  if (
    ["actuarial_certification", "strategic_plan"].includes(eventKindKey) &&
    ((evidenceHaystack.includes("statement_of_actuarial_opinion") && evidenceHaystack.includes("december_31_2025")) ||
      evidenceHaystack.includes("mta_five_year_diversity_equity_and_inclusion_strategic_plan"))
  ) {
    return "publication";
  }
  if (eventKindKey === "private_event" && haystack.includes("award_ceremony")) {
    return "milestone";
  }
  if (
    eventKindKey === "private_event" &&
    hasAny(haystack, ["boldyn"]) &&
    hasAny(haystack, ["cellular_service"]) &&
    hasAny(haystack, ["subway", "subways"]) &&
    hasAny(haystack, ["announcement", "celebrate_the_announcement"])
  ) {
    return "milestone";
  }
  if (
    ["rating_action", "rating_upgrade"].includes(eventKindKey) &&
    hasAny(haystack, ["rating", "ratings"]) &&
    hasAny(haystack, ["upgrade", "upgraded", "upgrades"])
  ) {
    return "milestone";
  }
  if (
    ["court_order", "court_ruling"].includes(eventKindKey) &&
    hasAny(haystack, ["court"]) &&
    hasAny(haystack, ["issued", "order", "ruling"]) &&
    hasAny(haystack, ["injunction", "memorandum"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "lawsuit_filed" &&
    hasAny(haystack, ["filed"]) &&
    hasAny(haystack, ["lawsuit", "lawsuits"])
  ) {
    return "milestone";
  }
  if (
    ["settlement", "settlement_agreement", "settlement_announcement"].includes(eventKindKey) &&
    hasAny(haystack, ["settlement"]) &&
    hasAny(haystack, ["accessibility_advocates", "class_action", "mobility_disabilities"]) &&
    hasAny(haystack, ["announced", "entered_into", "reached", "resolve"])
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "request_for_information" &&
    hasAny(haystack, ["request_for_information", "rfi"]) &&
    hasAny(haystack, ["issued", "posted", "release", "released"])
  ) {
    return "milestone";
  }
  if (eventKindKey === "rfp_response" && hasAny(haystack, ["rfp"]) && hasAny(haystack, ["respondent", "response", "responses"])) {
    return "milestone";
  }
  if (eventKindKey === "proposal_received" && hasAny(haystack, ["proposal", "proposals"]) && hasAny(haystack, ["received"])) {
    return "milestone";
  }
  if (eventKindKey === "pre_bid_conference" && hasAny(haystack, ["pre_bid_conference", "pre_bid"]) && hasAny(haystack, ["conference"])) {
    return "milestone";
  }
  if (
    ["transaction", "transaction_closing", "upcoming_transaction", "refinancing", "remarketing"].includes(eventKindKey) &&
    hasAny(haystack, ["ban", "bond", "bonds", "debt", "note", "notes", "refinance", "refinancing", "refunding", "remarket", "remarketed", "remarketing", "series", "subseries"])
  ) {
    return "milestone";
  }
  if (
    ["grant_period_start", "grant_period_end"].includes(eventKindKey) &&
    hasAny(haystack, ["cmaq", "grant", "grants"]) &&
    hasAny(haystack, ["connecting_services", "coverage_period", "grant_period"])
  ) {
    return "milestone";
  }
  if (
    ["rolling_stock_delivery", "rolling_stock_retirement"].includes(eventKindKey) &&
    hasAny(haystack, ["r179", "r211", "r32"])
  ) {
    return "milestone";
  }
  if (
    ["proposed_fare_increase", "proposed_fare_toll_increase", "proposed_increase", "proposed_rate_change"].includes(eventKindKey) &&
    hasAny(haystack, ["assumed_for_implementation", "fare_and_toll_rate_increase", "farebox_revenues", "projected_to_generate", "projected_to_increase", "proposed_fare_and_toll"]) &&
    hasAny(haystack, ["fare", "farebox", "toll", "tolls"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "fare_increase" &&
    hasAny(haystack, ["reserving_ability_to_withdraw", "withdraw"]) &&
    hasAny(haystack, ["fare", "farebox", "toll", "tolls"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "fare_increase" &&
    haystack.includes("fares_and_tolls") &&
    haystack.includes("farebox_and_toll_revenues") &&
    haystack.includes("projected_to_generate") &&
    haystack.includes("annualized_increase") &&
    !hasAny(haystack, ["went_into_effect", "took_effect", "take_effect", "takes_effect"])
  ) {
    return "planning";
  }
  if (
    ["fare_and_toll_increase", "proposed_fare_toll_increase"].includes(eventKindKey) &&
    hasAny(haystack, ["assumed_for_implementation", "below_the_line", "projected"]) &&
    hasAny(haystack, ["fare", "farebox", "toll", "tolls"])
  ) {
    return "planning";
  }
  if (
    [
      "annual_results_review",
      "budget_results_review",
      "committee_information",
      "operating_results_review",
      "operations_review",
    ].includes(eventKindKey) &&
    hasAny(haystack, ["final", "operation_summary", "prior_year", "review_of_the_prior_year", "will_be_presented", "will_be_provided"])
  ) {
    return "publication";
  }
  if (
    ["mid_year_operational_update", "mid_year_update", "operations_update"].includes(eventKindKey) &&
    hasAny(haystack, ["mid_year", "mid_year_update", "mid_year_operations_update"]) &&
    hasAny(haystack, ["key_performance_metrics", "operating_performance_metrics", "will_be_presented", "will_be_provided", "will_provide"])
  ) {
    return "publication";
  }
  if (eventKindKey === "guidance_issuance" && haystack.includes("issued") && haystack.includes("interpretative_guidance")) {
    return "publication";
  }
  if (eventKindKey === "annual_plan_update" && hasAny(haystack, ["agency_safety_plan", "asp"]) && hasAny(haystack, ["annual_update", "version_7"])) {
    return "publication";
  }
  if (eventKindKey === "weekender_alert" && haystack.includes("mtaweekender") && haystack.includes("service_change_information")) {
    return "publication";
  }
  if (
    eventKindKey === "update" &&
    haystack.includes("rapid_transit_loading_guidelines_update") &&
    hasAny(haystack, ["first_update_to_the_guidelines_since_adoption_in_1988", "second_update_to_the_guidelines_since_adoption_in_1988"])
  ) {
    return "milestone";
  }
  if (
    ["board_committee_review", "board_review", "committee_update", "committee_work_plan", "work_plan"].includes(eventKindKey) &&
    hasAny(haystack, ["board", "charter", "committee", "committee_update", "contract", "work_plan"])
  ) {
    return "governance";
  }
  if (eventKindKey === "proposed_revision" && hasAny(haystack, ["committee_charter", "diversity_committee_charter"]) && hasAny(haystack, ["proposed_revision", "revision"])) {
    return "governance";
  }
  if (
    eventKindKey === "annual_review" &&
    hasAny(haystack, ["committee_charter", "long_island_committee_charter"]) &&
    !hasAny(haystack, ["approval", "approve"])
  ) {
    return "governance";
  }
  if (eventKindKey === "veto" && hasAny(haystack, ["capital_program_review_board", "cprb"]) && haystack.includes("vetoed") && haystack.includes("plan")) {
    return "governance";
  }
  if (eventKindKey === "signing" && haystack.includes("delegation_of_authority") && haystack.includes("accountable_executive")) {
    return "governance";
  }
  if (eventKindKey === "resignation" && haystack.includes("board_member") && haystack.includes("mta_board") && hasAny(haystack, ["resigning", "resignation"])) {
    return "governance";
  }
  if (eventKindKey === "committee_recurring_item" && hasAny(haystack, ["approval_of_minutes", "motion_to_approve", "approve_the_minutes"])) {
    return "approval";
  }
  if (
    eventKindKey === "board_submission" &&
    hasAny(haystack, ["toll_violation", "toll_violation_enforcement"]) &&
    hasAny(haystack, ["board_for_approval", "submitted_to_the_board_for_approval"])
  ) {
    return "approval";
  }
  if (
    ["collision", "damage_incident", "passenger_rescue_incident", "safety_incident_response", "security_incident", "security_incident_response"].includes(eventKindKey)
  ) {
    return "incident";
  }
  if (
    ["infrastructure_issue", "operational_issue"].includes(eventKindKey) &&
    hasAny(haystack, ["caused", "causing", "due_to"]) &&
    hasAny(haystack, ["delayed_customers", "delays", "late_trains"])
  ) {
    return "pause";
  }
  if (eventKindKey === "security_inspection" && haystack.includes("unionport_yard") && haystack.includes("trespassers") && hasAny(haystack, ["nypd_vandals_unit", "train_car"])) {
    return "incident";
  }
  if (
    (eventKindKey === "shooting" && hasAny(haystack, ["shooting"]) && hasAny(haystack, ["subway", "train"])) ||
    (eventKindKey === "electrical_fault" && hasAny(haystack, ["electrical_fault", "transformer_fault"]) && hasAny(haystack, ["rectifier", "transformer", "replacement"])) ||
    (eventKindKey === "power_outage" && hasAny(haystack, ["feeder_failure", "power_restored"]) && hasAny(haystack, ["grand_central_terminal", "gct", "power_outage"])) ||
    (eventKindKey === "flooding_event" && hasAny(haystack, ["flooding"]) && hasAny(haystack, ["after_a_storm", "high_tide", "storm"])) ||
    (eventKindKey === "infrastructure_failure" && hasAny(haystack, ["collapse", "covering"]) && hasAny(haystack, ["tracks", "hudson_line"])) ||
    (["damage", "damage_event"].includes(eventKindKey) &&
      hasAny(haystack, ["damaged", "flooded"]) &&
      hasAny(haystack, ["east_river_tunnel", "tunnel_tracks", "tunnel_tubes"]) &&
      hasAny(haystack, ["sandy", "superstorm_sandy"])) ||
    (eventKindKey === "fatality" && hasAny(haystack, ["fatality"]) && hasAny(haystack, ["intersection", "pedestrian"]))
  ) {
    return "incident";
  }
  if (
    ["emergency_drill", "emergency_preparedness_drill", "safety_drill", "station_operations_exercise"].includes(eventKindKey) &&
    hasAny(haystack, ["drill", "emergency", "exercise", "readiness", "wayfinding"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "maintenance_operation" &&
    haystack.includes("flood_door_testing") &&
    hasAny(haystack, ["hugh_l_carey", "queens_midtown", "tunnels"]) &&
    hasAny(haystack, ["doors_installed", "long_term_resiliency", "overnight_tests"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "infrastructure" &&
    haystack.includes("hudson_line_fiber_migration") &&
    hasAny(haystack, ["migrated_from_cellular_to_fiber", "installation_of_new_fiber"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "fleet_transition" &&
    haystack.includes("paratransit") &&
    hasAny(haystack, ["decommissioned_dedicated_carrier", "relocated"]) &&
    hasAny(haystack, ["launched_new_dedicated_carrier_location", "new_dedicated_carrier_location"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "work_continuation" &&
    haystack.includes("tactile_warning_strip_installation") &&
    haystack.includes("continue_into_2023")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "program_rename" &&
    haystack.includes("following_legislative_approval") &&
    haystack.includes("changed_project_name_from_able_to_ace") &&
    haystack.includes("automated_camera_enforcement")
  ) {
    return "milestone";
  }
  if (
    eventKindKey === "capital_project_work" &&
    haystack.includes("gct_grease_duct_platform_project") &&
    hasAny(haystack, ["continued", "creating_platforms"]) &&
    haystack.includes("state_of_good_repair")
  ) {
    return "construction";
  }
  if (
    eventKindKey === "delivery" &&
    hasAny(haystack, ["expected_delivery_of_first_15", "expected_delivery_of_remaining_15"]) &&
    haystack.includes("customer_service_point_of_sale_devices")
  ) {
    return "planning";
  }
  if (
    eventKindKey === "environmental_review" &&
    haystack.includes("target_completion") &&
    hasAny(haystack, ["34th_street_sbs", "34th_street_select_bus_service"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "software_deployment" &&
    haystack.includes("alstom_m8_obc_software") &&
    haystack.includes("testing_was_completed") &&
    hasAny(haystack, ["fra_approval_request", "deployment_in_jan_2024"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "regulatory_mandate" &&
    haystack.includes("fra_issued") &&
    haystack.includes("unfunded_mandate") &&
    hasAny(haystack, ["commuter_passenger_service", "cctv_systems"])
  ) {
    return "legislation";
  }
  if (
    eventKindKey === "deployment" &&
    haystack.includes("real_time_passenger_information") &&
    haystack.includes("86th_street")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "pilot_period" &&
    haystack.includes("summer_saturdays_pilot_runs") &&
    haystack.includes("july_6") &&
    haystack.includes("august_31_2024")
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "enrollment_start" &&
    hasAny(haystack, ["new_customers_begin_to_be_added", "new_customers_begin"]) &&
    hasAny(haystack, ["phase_3_e_hail", "e_hail_program"])
  ) {
    return "launch";
  }
  if (
    eventKindKey === "planned_migration" &&
    hasAny(haystack, ["plans_to_begin_migration", "plans_to_slowly_migrate"]) &&
    haystack.includes("hard_case_transponders") &&
    haystack.includes("sticker_tags")
  ) {
    return "planning";
  }
  if (
    eventKindKey === "schedule_delay" &&
    haystack.includes("penn_station_access") &&
    haystack.includes("delayed_until_2030") &&
    haystack.includes("original_schedule_of_2027")
  ) {
    return "pause";
  }
  if (
    eventKindKey === "hiring_start" &&
    haystack.includes("penn_station_access") &&
    haystack.includes("hiring_planned_to_start_in_2025")
  ) {
    return "planning";
  }
  if (
    eventKindKey === "scheduled_work" &&
    hasAny(haystack, ["planter_delivery_and_hardening_scheduled", "planter_delivery_hardening_scheduled"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "announcement" &&
    haystack.includes("mayor_s_2019_state_of_the_city") &&
    haystack.includes("improve_bus_speeds_25_by_2020")
  ) {
    return "planning";
  }
  if (eventKindKey === "initiative_kickoff" && haystack.includes("ghost_plate") && haystack.includes("enforcement") && haystack.includes("multi_agency")) {
    return "enforcement";
  }
  if (
    ["legacy_support_end", "planned_discontinuation", "service_retirement", "support_end"].includes(eventKindKey) &&
    hasAny(haystack, ["continues_to_support", "discontinuation", "legacy", "no_longer", "retire", "retirement", "unable_to_maintain", "until_new"])
  ) {
    return "milestone";
  }
  if (
    ["action_item", "budget_recommendation", "committee_action_item"].includes(eventKindKey) &&
    hasAny(haystack, ["committee_will_recommend_action_to_the_board", "recommend_action_to_the_board"]) &&
    hasAny(haystack, ["final_proposed_budget", "final_budget"])
  ) {
    return "governance";
  }
  if (eventKindKey === "policy_effective" && haystack.includes("policy") && hasAny(haystack, ["applicable", "effective_date"])) {
    return "implementation";
  }
  if (eventKindKey === "pilot_end" && haystack.includes("fare_collection_resumed") && haystack.includes("pilot_routes")) {
    return "implementation";
  }
  if (eventKindKey === "pilot_conclusion" && haystack.includes("fare_collection_resumes") && haystack.includes("pilot_concludes")) {
    return "implementation";
  }
  if (eventKindKey === "phase_in_period" && haystack.includes("crz_program") && haystack.includes("phase_in_period") && haystack.includes("resolution")) {
    return "implementation";
  }
  if (eventKindKey === "labor_agreement" && hasAny(haystack, ["deal_reached", "tentative_deal"]) && haystack.includes("ending_a_strike") && haystack.includes("returned_to_service")) {
    return "implementation";
  }
  if (eventKindKey === "parade" && haystack.includes("lirr") && hasAny(haystack, ["extra_train_service", "operate_extra_train_service"])) {
    return "implementation";
  }
  if (eventKindKey === "sports_championship" && haystack.includes("extra_lirr_train_service") && haystack.includes("temporary_station")) {
    return "implementation";
  }
  if (
    ["service_end", "software_end_of_life", "system_sunset"].includes(eventKindKey) &&
    hasAny(haystack, ["end_of_life", "last_day_of_operation", "no_longer_be_licensed", "no_longer_be_licensed_or_supported", "sales_end"])
  ) {
    return "milestone";
  }
  if (
    ["data_prepared", "page_update", "staff_summary"].includes(eventKindKey) &&
    hasAny(haystack, [
      "automated_camera_enforcement_webpage_updated",
      "last_updated",
      "mta_open_data_program_page",
      "prepared_by_mta_division_of_management_and_budget",
      "ridership_data",
      "staff_summary_date",
      "staff_summary_prepared",
      "staff_summary_prepared_and_reviewed",
    ])
  ) {
    return "document_metadata";
  }
  if (eventKindKey === "measurement_date" && hasAny(haystack, ["annual_impact_as_of"])) {
    return "document_metadata";
  }
  if (eventKindKey === "analysis_snapshot" && haystack.includes("annual_impact_analysis") && haystack.includes("as_of")) {
    return "document_metadata";
  }
  if (
    eventKindKey === "data_collection" &&
    haystack.includes("report_card") &&
    haystack.includes("bus_time_feed") &&
    hasAny(haystack, ["collected_between", "speed_data"])
  ) {
    return "document_metadata";
  }
  if (
    eventKindKey === "revenue_service_date" &&
    hasAny(haystack, ["anticipated_revenue_service_date", "planned_revenue_service_date"]) &&
    hasAny(haystack, ["east_side_access", "grand_central_terminal", "second_avenue_subway", "sas_phase_2"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "project_target" &&
    hasAny(haystack, ["short_term_project", "longer_term_project"]) &&
    hasAny(haystack, ["woodhaven", "cross_bay", "q52", "q53", "sbs"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "regulation_update" &&
    hasAny(haystack, ["refine_curb_access_regulations", "refine_curb_regulations"]) &&
    hasAny(haystack, ["following_implementation", "lexington_avenue", "offset_bus_lane_implementation"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "education_campaign") {
    const provesBuswayLaunchOutreach =
      haystack.includes("busway") &&
      (haystack.includes("ahead_of_launch") ||
        haystack.includes("ahead_of_busway_launch") ||
        haystack.includes("outreach") ||
        haystack.includes("on_street_engagement") ||
        haystack.includes("door_to_door") ||
        haystack.includes("informational_signage"));
    if (provesBuswayLaunchOutreach) return "public_engagement";
  }
  if (eventKindKey === "input_phase") {
    const provesPublicInputPhase =
      (haystack.includes("gather_feedback") || haystack.includes("gathering_feedback") || haystack.includes("feedback_and_suggestions")) &&
      (haystack.includes("stakeholders") || haystack.includes("riders") || haystack.includes("area_residents") || haystack.includes("community_engagement"));
    if (provesPublicInputPhase) return "public_engagement";
  }
  if (eventKindKey === "blood_drive") {
    const provesPublicBloodDrive = haystack.includes("new_york_blood_center") || haystack.includes("public_donors");
    if (provesPublicBloodDrive) return "public_engagement";
  }
  if (eventKindKey === "marketing_campaign") {
    const provesOmnySystemwidePublicCampaign =
      haystack.includes("omny") &&
      haystack.includes("fare_payment_system") &&
      haystack.includes("tap_on_get_on") &&
      (haystack.includes("472_subway_stations") || haystack.includes("5800_buses") || haystack.includes("staten_island_railway"));
    if (provesOmnySystemwidePublicCampaign) return "public_engagement";
  }
  if (eventKindKey === "tour") {
    const provesPcacLirrFacilitiesTour =
      haystack.includes("pcac") &&
      (haystack.includes("lirr") || haystack.includes("railroad")) &&
      (haystack.includes("facilities") || haystack.includes("jamaica_control_center") || haystack.includes("hillside_support_facility"));
    if (provesPcacLirrFacilitiesTour) return "public_engagement";
  }
  if (
    eventKindKey === "ride_along" &&
    hasAny(haystack, ["assemblymember_alex_bores", "assemblyman_alex_bores"]) &&
    haystack.includes("nyct_president_rich_davey") &&
    haystack.includes("6_line")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "roundtable" &&
    haystack.includes("white_house_roundtable") &&
    haystack.includes("zero_emission_bus_manufacturing")
  ) {
    return "public_engagement";
  }
  if (
    eventKindKey === "summit" &&
    hasAny(haystack, ["mayor_eric_adams", "mta_chair"]) &&
    hasAny(haystack, ["new_enhanced_bus_lanes", "busways"]) &&
    haystack.includes("flatbush_avenue_bus_priority")
  ) {
    return "public_engagement";
  }
  if (eventKindKey === "event") {
    const provesUsOpenServiceIncrease =
      haystack.includes("lirr") &&
      haystack.includes("offered_increased_service") &&
      haystack.includes("mets_willets_point") &&
      ((haystack.includes("tickets_to_and_from_mets_willets_point") && haystack.includes("matches")) ||
        haystack.includes("us_open") ||
        haystack.includes("national_tennis_center"));
    if (provesUsOpenServiceIncrease) return "implementation";
  }
  if (eventKindKey === "special_event") {
    const provesMarathonRidershipRecord =
      haystack.includes("record_setting") &&
      haystack.includes("subway_ridership") &&
      (haystack.includes("marathon_weekend") || haystack.includes("tcs_nyc_marathon"));
    if (provesMarathonRidershipRecord) return "milestone";
  }
  if (eventKindKey === "tour" || eventKindKey === "site_tour") {
    const provesGrandAvenueDepotChargingMilestone =
      haystack.includes("grand_avenue_depot") &&
      haystack.includes("nypa") &&
      haystack.includes("phase_i") &&
      haystack.includes("charging_infrastructure") &&
      (haystack.includes("construction") || haystack.includes("progress") || haystack.includes("milestone"));
    if (provesGrandAvenueDepotChargingMilestone) return "milestone";
  }
  if (eventKindKey === "policy_announcement") {
    const provesBusPriorityInstallPlan =
      haystack.includes("announced_plans") &&
      haystack.includes("install") &&
      (haystack.includes("busway") || haystack.includes("busways")) &&
      haystack.includes("bus_lanes");
    if (provesBusPriorityInstallPlan) return "planning";
  }
  if (eventKindKey === "service_announcement") {
    const provesStationServiceLaunch =
      haystack.includes("could_now_stop") &&
      haystack.includes("station") &&
      (haystack.includes("first_new_lirr_station") || haystack.includes("new_lirr_station"));
    if (provesStationServiceLaunch) return "launch";
    const provesSubwayFrequencyIncrease =
      hasAny(haystack, ["announced", "officials_announced"]) &&
      hasAny(haystack, ["increased_weekend_service", "increased_service"]) &&
      hasAny(haystack, ["g_j_and_m_lines", "g_j_m_lines", "g_line", "j_line", "m_line"]);
    if (provesSubwayFrequencyIncrease) return "implementation";
  }
  if (eventKindKey === "panel_announcement") {
    const provesFareEvasionPanel = hasAny(haystack, ["announced", "blue_ribbon_panel"]) && hasAny(haystack, ["fare_evasion"]);
    if (provesFareEvasionPanel) return "milestone";
  }
  if (eventKindKey === "initiative_announcement") {
    const provesAccessibilityZoningInitiative =
      haystack.includes("zoning_for_accessibility") &&
      hasAny(haystack, ["announced", "joint_initiative"]) &&
      hasAny(haystack, ["dcp", "mopd", "accessibility"]);
    if (provesAccessibilityZoningInitiative) return "planning";
  }
  if (eventKindKey === "policy_announcement") {
    const provesSubwaySafetyPolicyPlan =
      hasAny(haystack, ["announced", "announces"]) &&
      hasAny(haystack, ["five_point_plan", "protect_new_yorkers"]) &&
      hasAny(haystack, ["subway", "subways"]);
    if (provesSubwaySafetyPolicyPlan) return "planning";
  }
  if (eventKindKey === "station_status_change") {
    const provesPermanentLirrStationLaunch =
      haystack.includes("mets_willets_point") &&
      haystack.includes("permanent_lirr_station_stop") &&
      haystack.includes("year_round_daily_service") &&
      (haystack.includes("beginning") || haystack.includes("becomes") || haystack.includes("marked_the_beginning"));
    if (provesPermanentLirrStationLaunch) return "launch";
  }
  if (eventKindKey === "agreement") {
    const provesExecutedStationAgentAgreement =
      haystack.includes("landmark_agreement") && haystack.includes("station_agents") && haystack.includes("redefines_the_role");
    if (provesExecutedStationAgentAgreement) return "milestone";
  }
  if (eventKindKey === "temporary_fare_promotion") {
    const provesTemporaryFarePromotionApproval = haystack.includes("approval_to_launch") && haystack.includes("temporary_fare_promotions");
    if (provesTemporaryFarePromotionApproval) return "approval";
  }
  if (eventKindKey === "fare_promotion_adjustment") {
    const provesOmnyBestFareImplementation =
      haystack.includes("omny") &&
      haystack.includes("weekly_best_fare") &&
      (haystack.includes("adjusted") || haystack.includes("will_be_adjusted")) &&
      haystack.includes("begin_on_any_day");
    if (provesOmnyBestFareImplementation) return "implementation";
  }
  if (eventKindKey === "immediate_operating_need_declaration") {
    return "approval";
  }
  if (["ion_declaration", "ion_declaration_and_notice_to_proceed"].includes(eventKindKey)) {
    const provesIonApproval =
      hasAnyToken(haystack, ["ion"]) &&
      (haystack.includes("approved") || haystack.includes("ratify") || haystack.includes("ratified") || haystack.includes("notice_to_proceed"));
    if (provesIonApproval) return "approval";
  }
  if (eventKindKey === "declaration") {
    const hasImmediateOperatingNeed = haystack.includes("immediate_operating_need") || new Set(haystack.split("_").filter(Boolean)).has("ion");
    if (hasImmediateOperatingNeed) return "approval";
  }
  if (eventKindKey === "evaluation" && haystack.includes("selection_committee") && (haystack.includes("selected") || haystack.includes("determined"))) {
    return "approval";
  }
  if (eventKindKey === "evaluation" && hasAny(haystack, ["evaluate_budget_impacts", "customer_response"]) && hasAny(haystack, ["phase_3_program", "e_hail"])) {
    return "planning";
  }
  if (
    eventKindKey === "evaluation_period" &&
    hasAny(haystack, ["evaluation_period", "pilot_evaluation_period", "monitor_usage_patterns"]) &&
    hasAny(haystack, ["pilot", "pre_pilot", "make_recommendations"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "in_service_evaluation" &&
    hasAny(haystack, ["in_service_evaluation", "lead_bus"]) &&
    hasAny(haystack, ["nova_bus", "electric_buses", "all_electric_buses"])
  ) {
    return "planning";
  }
  if (
    (eventKindKey === "evaluation" || eventKindKey === "performance_evaluation") &&
    ((haystack.includes("evaluate_sbs_performance") && haystack.includes("study_more_robust_options")) ||
      (haystack.includes("present_busway_performance_data") && haystack.includes("project_modifications_if_needed")))
  ) {
    return "planning";
  }
  if (
    eventKindKey === "policy_amendment" &&
    (haystack.includes("governance_guidelines") || haystack.includes("policy_governing_event_fee_schedule"))
  ) {
    return "governance";
  }
  if (eventKindKey === "test_agreement") {
    const provesAbleVendorTestAgreement =
      hasDatedAnchor &&
      (haystack.includes("department_of_buses") || hasAnyToken(haystack, ["dob"])) &&
      (haystack.includes("entered_into_test_agreement") || haystack.includes("entered_into_test_agreements")) &&
      haystack.includes("able") &&
      (haystack.includes("system_development") || haystack.includes("certification_testing")) &&
      (haystack.includes("hayden") || haystack.includes("seon"));
    if (provesAbleVendorTestAgreement) return "milestone";
  }
  if (eventKindKey === "procurement_action") {
    const provesProcurementApproval =
      haystack.includes("seeks_board_approval") ||
      haystack.includes("seeks_board_approval_of") ||
      haystack.includes("seeks_board_approval_for") ||
      haystack.includes("seeks_board_approval_to") ||
      haystack.includes("mta_board_approval") ||
      (haystack.includes("immediate_operating_need") && haystack.includes("issued_and_approved"));
    if (provesProcurementApproval) return "approval";
  }
  if (eventKindKey === "procurement_recommendation") {
    const provesCommitteeProcurementApproval =
      hasAny(haystack, ["committee_recommended_approval", "recommended_approval"]) && hasAny(haystack, ["contract", "contracts"]);
    if (provesCommitteeProcurementApproval) return "approval";
  }
  if (eventKindKey === "procurement_cycle") {
    const provesFutureBoardAward =
      hasAny(haystack, ["rfp", "request_for_proposals"]) &&
      hasAny(haystack, ["concludes", "conclusion"]) &&
      hasAny(haystack, ["award_expected", "recommended_to_the_board"]);
    if (provesFutureBoardAward) return "planning";
  }
  if (eventKindKey === "responsibility_finding") {
    const provesApprovedResponsibilityFinding =
      (haystack.includes("found_responsible") || haystack.includes("responsible_notwithstanding")) && haystack.includes("approved");
    if (provesApprovedResponsibilityFinding) return "approval";
  }
	  if (eventKindKey === "procurement") {
	    const provesDatedProposalReceipt =
	      (haystack.includes("proposal_received") ||
	        haystack.includes("proposal_was_received") ||
	        haystack.includes("single_proposal") ||
	        haystack.includes("received_from")) &&
	      hasDatedAnchor &&
	      !haystack.includes("future_procurement");
	    if (provesDatedProposalReceipt) return "milestone";
	    const provesBusPriorityCapitalProcurement =
	      haystack.includes("procurement") &&
	      haystack.includes("capital_improvements") &&
	      (haystack.includes("bx6_sbs") || haystack.includes("sbs"));
	    if (provesBusPriorityCapitalProcurement) return "planning";
	    const provesFareGateQualificationProcurement =
	      (haystack.includes("qualification_procurement") || haystack.includes("qualification_and_procurement")) && haystack.includes("modern_fare_gates");
	    if (provesFareGateQualificationProcurement) return "planning";
	    const hasIssuanceOrSolicitation =
	      haystack.includes("request_for_proposals_issuance") ||
      haystack.includes("rfp_issuance") ||
      haystack.includes("issued_notification_of_the_rfp") ||
      haystack.includes("issued_rfp") ||
      haystack.includes("issued_a_request_for_proposals") ||
      haystack.includes("public_solicitation_of_bids") ||
      haystack.includes("solicitation_of_bids") ||
      haystack.includes("bid_solicitation") ||
      ((haystack.includes("request_for_proposals") || haystack.includes("rfp")) &&
        (haystack.includes("issued") || haystack.includes("issuance") || haystack.includes("advertised") || haystack.includes("public_solicitation")));
    const isVagueOrReceipt =
      haystack.includes("proposal_received") ||
      haystack.includes("proposal_was_received") ||
      haystack.includes("single_proposal") ||
      haystack.includes("qualification_procurement") ||
      haystack.includes("future_procurement") ||
      haystack.includes("expected_procurement");
	    if (hasIssuanceOrSolicitation && !isVagueOrReceipt) return "milestone";
	  }
	  if (eventKindKey === "upcoming_issuance") {
	    const provesDebtIssuance =
	      (haystack.includes("expects_to_issue") || haystack.includes("expected_to_issue") || haystack.includes("upcoming_issuance")) &&
	      (haystack.includes("bond") ||
	        haystack.includes("bonds") ||
	        haystack.includes("notes") ||
	        haystack.includes("series") ||
	        haystack.includes("ban") ||
	        haystack.includes("revenue_refunding") ||
	        haystack.includes("payroll_mobility_tax"));
	    if (provesDebtIssuance) return "milestone";
	  }
  if (eventKindKey === "software_delivery") {
    const provesPlannedObcSoftwareDelivery =
      hasAny(haystack, ["anticipate_receiving", "expected_to_receive", "receiving_final"]) &&
      hasAny(haystack, ["final_on_board_computer", "obc_software", "software"]) &&
      hasAny(haystack, ["siemens", "subsystem_testing", "atc", "acses"]);
    if (provesPlannedObcSoftwareDelivery) return "planning";
  }
  if (["deadline", "election_deadline"].includes(eventKindKey)) {
    const provesProjectDecisionDeadline =
      (haystack.includes("elect_to_direct") && hasAny(haystack, ["expanded_scope", "phase_2"])) ||
      (haystack.includes("final_plans") && hasAny(haystack, ["expanded_scope", "expanded_work"]));
    if (provesProjectDecisionDeadline) return "planning";
  }
  if (["timetable_end", "timetable_period_end"].includes(eventKindKey)) {
    const provesSchedulePeriodEndpoint =
      hasAny(haystack, ["schedule", "schedules"]) && hasAny(haystack, ["adjusted", "adjustment"]) && hasAny(haystack, ["period", "through"]);
    if (provesSchedulePeriodEndpoint) return "implementation";
  }
  if (eventKindKey === "notice_posting") {
    const provesPublicHearingNotice =
      hasAny(haystack, ["notices_of_proposal", "proposal"]) && hasAny(haystack, ["public_hearings", "public_hearing"]) && hasAny(haystack, ["stations", "station"]);
    if (provesPublicHearingNotice) return "public_engagement";
  }
  if (eventKindKey === "strike_averted" && hasAny(haystack, ["no_lirr_strike", "strike_averted"]) && haystack.includes("service_will_continue_uninterrupted")) {
    return "milestone";
  }
  if (eventKindKey === "vehicle_debut") {
    const provesParatransitEvPilotDebut =
      hasAny(haystack, ["debuted", "first_of_fifteen", "electric_vehicles", "ev"]) && hasAny(haystack, ["access_a_ride", "paratransit", "pilot_program"]);
    if (provesParatransitEvPilotDebut) return "launch";
  }
  if (eventKindKey === "turnover") {
    const provesGrandCentralMadisonTurnover =
      hasAny(haystack, ["turned_over", "turnover"]) &&
      hasAny(haystack, ["grand_central_madison", "gcm"]) &&
      hasAny(haystack, ["lirr", "major_work_complete", "systems_testing", "punch_list"]);
    if (provesGrandCentralMadisonTurnover) return "milestone";
  }
  if (eventKindKey === "test_train") {
    const provesEastSideAccessTestTrain =
      haystack.includes("test_train") && hasAny(haystack, ["east_side_access", "new_terminal", "grand_central_madison"]);
    if (provesEastSideAccessTestTrain) return "implementation";
  }
	  if (eventKindKey === "contract_end") {
	    const provesContractEndpoint =
      haystack.includes("contract") &&
      (haystack.includes("end_date") ||
        haystack.includes("end_of") ||
        haystack.includes("contract_term") ||
        haystack.includes("term_end") ||
        haystack.includes("through_"));
    if (provesContractEndpoint) return "milestone";
  }
  if (eventKindKey === "contract_term_end") {
    const provesContractTermEndpoint =
      haystack.includes("contract") &&
      (haystack.includes("end_date") || haystack.includes("end_of") || haystack.includes("contract_term") || haystack.includes("term_end"));
    if (provesContractTermEndpoint) return "milestone";
  }
	  if (eventKindKey === "contract_expiration") {
	    const provesContractExpiration =
	      (haystack.includes("contract") || haystack.includes("agreement") || haystack.includes("license_agreement")) &&
      (haystack.includes("expire") ||
        haystack.includes("expires") ||
        haystack.includes("expired") ||
        haystack.includes("expiration") ||
        haystack.includes("expiring"));
	    if (provesContractExpiration) return "milestone";
	  }
	  if (eventKindKey === "expiration") {
	    const provesAgreementExpiration =
	      (haystack.includes("agreement") || haystack.includes("agreements") || haystack.includes("license_agreement")) &&
	      (haystack.includes("expired") || haystack.includes("expiry") || haystack.includes("expiration"));
	    if (provesAgreementExpiration) return "milestone";
	  }
	  if (eventKindKey === "issuance") {
	    const provesRfpIssuance =
	      (haystack.includes("issued") || haystack.includes("issuance")) &&
	      (haystack.includes("request_for_proposals") || haystack.includes("rfp"));
	    if (provesRfpIssuance) return "milestone";
	    const provesGovernancePolicyIssuance =
	      (haystack.includes("issued") || haystack.includes("issuance")) &&
	      (haystack.includes("code_of_ethics") || haystack.includes("board_members_code_of_ethics"));
	    if (provesGovernancePolicyIssuance) return "governance";
	  }
  if (eventKindKey === "contract_start" && (eventKindSpelling === "contract_start" || eventKindSpelling === "contract start")) {
    const provesContractStart =
      (eventKindSpelling === "contract_start" || eventKindSpelling === "contract start" || haystack.includes("contract") || haystack.includes("agreement")) &&
      (haystack.includes("start_date") ||
        haystack.includes("term_start") ||
        (eventKindSpelling === "contract_start" && (haystack.includes("start_of") || haystack.includes("start_of_the"))) ||
        hasDatedAnchor);
    if (provesContractStart) return "milestone";
  }
  if (eventKindKey === "contract_term") {
    const provesContractTerm =
      haystack.includes("contract") &&
      (haystack.includes("contract_term") || haystack.includes("base_term") || haystack.includes("term_of_contract")) &&
      (haystack.includes("year") ||
        haystack.includes("years") ||
        haystack.includes("option") ||
        haystack.includes("options") ||
        hasDatedAnchor);
    if (provesContractTerm) return "milestone";
  }
  if (eventKindKey === "contract_period") {
    const provesContractPeriod =
      (haystack.includes("contract_term") ||
        haystack.includes("base_term") ||
        haystack.includes("term_of") ||
        haystack.includes("option_year") ||
        haystack.includes("term_for") ||
        haystack.includes("year") ||
        haystack.includes("years") ||
        hasDatedAnchor) &&
      !haystack.includes("pilot_period") &&
      !haystack.includes("service_period");
    if (provesContractPeriod) return "milestone";
  }
  const contractEndpointText = `${eventKindKey} ${haystack}`;
  const contractEndpointKinds = new Set([
    "contract_option_period",
    "contract_option_term",
    "contract_option_extension",
    "contract_renewal_start",
    "contract_renewal_end",
    "contract_term",
    "contract_term_start",
  ]);
  if (contractEndpointKinds.has(eventKindKey)) {
    const provesEndpointPayload =
      haystack.includes("start") ||
      haystack.includes("end") ||
      haystack.includes("through") ||
      haystack.includes("commencing") ||
      haystack.includes("month") ||
      haystack.includes("months") ||
      haystack.includes("year") ||
      haystack.includes("years") ||
      hasDatedAnchor;
    const provesContractEndpoint =
      contractEndpointText.includes("contract") &&
      (contractEndpointText.includes("term") ||
        contractEndpointText.includes("option") ||
        contractEndpointText.includes("renewal") ||
        contractEndpointText.includes("extension")) &&
      provesEndpointPayload;
    if (provesContractEndpoint) return "milestone";
  }
  if (eventKindKey === "contract_option_exercise") {
    const provesContractOptionExercise =
      contractEndpointText.includes("contract") &&
      contractEndpointText.includes("option") &&
      (haystack.includes("exercise") ||
        haystack.includes("exercised") ||
        haystack.includes("additional_year") ||
        haystack.includes("through") ||
        hasDatedAnchor);
    if (provesContractOptionExercise) return "milestone";
  }
  const datedTermOrPeriodEndpointKinds = new Set([
    "agreement_effective_date",
    "agreement_expiration",
    "agreement_extension",
    "contract_extension_end",
    "contract_extension_period",
    "grant_period",
    "lease_expiration",
    "license_expiration",
    "license_extension",
    "license_term",
	    "permit_term",
	    "service_period",
	  ]);
  if (eventKindKey === "license_term" && haystack.includes("term_of_license_between")) {
    return "milestone";
  }
  if (eventKindKey === "lease_expiration" && haystack.includes("lease") && (haystack.includes("expired") || haystack.includes("expiration"))) {
    return "milestone";
  }
		  if (datedTermOrPeriodEndpointKinds.has(eventKindKey)) {
    const endpointText = `${eventKindKey} ${haystack}`;
    const hasEndpointDomain = hasAnyToken(endpointText, [
      "agreement",
      "agreements",
      "contract",
      "contracts",
      "grant",
      "grants",
      "lease",
      "leases",
      "license",
      "licenses",
      "permit",
      "permits",
      "service",
      "services",
    ]);
    const hasEndpointProof =
      hasAny(endpointText, [
        "effective_date",
        "retroactive",
        "expired",
        "expiration",
        "agreement_extension",
        "extension_end",
        "extension_period",
        "lease_expiration",
        "license_extension",
        "license_expiration",
        "license_term",
        "permit_term",
        "grant_period",
        "service_period",
        "commencing",
        "through",
        "start_of",
        "end_of",
        "remainder_of",
      ]) || hasAnyToken(endpointText, ["extension"]);
    const hasDatedOrRangedEndpoint =
      hasDatedAnchor || hasAnyToken(haystack, ["month", "months", "year", "years", "from", "to", "through"]) || haystack.includes("remainder_of");
	    if (hasEndpointDomain && hasEndpointProof && hasDatedOrRangedEndpoint) return "milestone";
	  }
	  if (eventKindKey === "access_license") {
	    const provesAccessLicenseMilestone =
	      haystack.includes("access_license") &&
	      (haystack.includes("term") || haystack.includes("compensation") || haystack.includes("short_term") || haystack.includes("subject_to_extensions")) &&
	      (haystack.includes("project") || haystack.includes("construction") || haystack.includes("right_of_way") || haystack.includes("delivery_of_construction"));
	    if (provesAccessLicenseMilestone) return "milestone";
	  }
  const provesLegalTransactionMilestone =
    (eventKindKey === "holdover_agreement" &&
      haystack.includes("entered_into") &&
      hasAny(haystack, ["prior_license_agreement_expired", "prior_license_expired"])) ||
    (eventKindKey === "license_expiry" && hasAny(haystack, ["prior_license_agreement_expired", "prior_license_expired"])) ||
    (eventKindKey === "letter_of_intent" &&
      haystack.includes("entered_into") &&
      hasAny(haystack, ["letter_of_intent", "loi"]) &&
      hasAny(haystack, ["contribute", "expanded_scope"])) ||
    (["offer", "formal_offer"].includes(eventKindKey) &&
      haystack.includes("formal_offer") &&
      haystack.includes("extended") &&
      haystack.includes("appraisal") &&
      hasAny(haystack, ["consolidated_edison", "to_the_property_owner"])) ||
    (eventKindKey === "procurement_option_exercise" &&
      hasAny(haystack, ["exercise", "option_exercise"]) &&
      hasAny(haystack, ["additional_640_subway_cars", "additional_fleet", "purchase_additional", "subway_cars"])) ||
    (eventKindKey === "procurement_modification" &&
      hasAny(haystack, ["modification", "contract_modification"]) &&
      hasAny(haystack, ["software", "hardware"]) &&
      hasAny(haystack, ["cubic", "cvm", "new_fare_pay_system", "omny"])) ||
    (eventKindKey === "contract_direction" &&
      haystack.includes("contractor_was_directed") &&
      hasAny(haystack, ["agreement_reached", "execute_this_modification", "modification"])) ||
    (eventKindKey === "termination" && haystack.includes("termination_for_cause") && hasAny(haystack, ["contract", "w_32564"])) ||
    (eventKindKey === "license_agreement_effective" && haystack.includes("entered_into") && haystack.includes("license_agreement")) ||
    (eventKindKey === "lease_renewal_agreement" &&
      hasAny(haystack, ["lease_renewal", "renewal_of_the_lease_agreement"]) &&
      hasAny(haystack, ["compensation", "term"]) &&
      hasAny(haystack, ["bus_swing_room", "mabstoa", "nyct"])) ||
    (eventKindKey === "sale" && hasAny(haystack, ["sold"]) && hasAny(haystack, ["premises"])) ||
    (eventKindKey === "lease" && hasAny(haystack, ["lease_with"]) && hasAny(haystack, ["retail_space", "retail_sale"]) && hasAny(haystack, ["term"])) ||
    (eventKindKey === "legal_agreement" &&
      haystack.includes("entered_into") &&
      haystack.includes("legal_agreement") &&
      hasAny(haystack, ["accessible", "accessibility", "stations"])) ||
    (eventKindKey === "commercial_license" &&
      hasAny(haystack, ["new_license"]) &&
      hasAny(haystack, ["rent", "term", "year"]) &&
      hasAny(haystack, ["retail_sale", "seafood"])) ||
    (eventKindKey === "option_agreement_modification" &&
      hasAny(haystack, ["modification_to_the_option_agreement", "modification_to_option_agreement"]) &&
      hasAny(haystack, ["property_interests", "improvements"]) &&
      hasAny(haystack, ["rfk_bridge", "robert_f_kennedy_bridge"])) ||
    (eventKindKey === "lease_termination_agreement" &&
      hasAny(haystack, ["early_termination", "surrender"]) &&
      hasAny(haystack, ["termination_agreement", "lease"]) &&
      hasAny(haystack, ["grand_central_terminal", "rite_aid"])) ||
    (eventKindKey === "contract_assignment" && hasAny(haystack, ["assigned"]) && hasAny(haystack, ["contract"])) ||
    (eventKindKey === "short_term_permit" &&
      hasAny(haystack, ["short_term_permit"]) &&
      hasAny(haystack, ["station_parking", "parking_lot", "parking_lot_1", "parking_lot_2"]) &&
      hasAny(haystack, ["cortlandt", "metro_north_station"]));
  if (provesLegalTransactionMilestone) return "milestone";
  const easementTransactionKinds = new Set(["easement_agreement", "easement_acquisition", "easement_grant"]);
  if (easementTransactionKinds.has(eventKindKey)) {
    const easementText = `${eventKindKey} ${haystack}`;
    const provesEasementTransaction =
      easementText.includes("easement") &&
      hasAny(easementText, ["agreement", "acquisition", "grant", "grantee"]) &&
      hasAny(haystack, ["permanent", "temporary", "term_permanent", "perpetual", "right_of_way", "lirr_property", "property_adjacent"]);
    const provesTransitOrInfrastructureContext = hasAny(haystack, [
      "right_of_way",
      "train_station",
      "station",
      "ada_ramp",
      "stairway",
      "second_avenue_subway",
      "phase_2",
      "sewer_force_main",
      "crossing_lirr_property",
      "lirr_property",
      "installation_and_maintenance",
      "installation_of",
    ]);
    if (provesEasementTransaction && provesTransitOrInfrastructureContext) return "milestone";
  }
  if (eventKindKey === "property_acquisition") {
    const provesActualPropertyAcquisition =
      haystack.includes("acquired") || haystack.includes("acquisition_of_property") || haystack.includes("acquisition_of_property_interests");
    const provesProjectOrInfrastructureContext = hasAny(haystack, [
      "construction",
      "project",
      "station",
      "sas2",
      "second_avenue_subway",
      "penn_station_access",
      "co_op_city_station",
    ]);
    if (provesActualPropertyAcquisition && provesProjectOrInfrastructureContext) return "milestone";
  }
  const hasSpeculativeTransactionTail = hasAny(haystack, [
    "approached_procurement",
    "expected",
    "proposed",
    "proposed_award",
    "request_approval_to_award",
    "requested",
    "requesting",
    "seeking",
    "seeks_board_approval",
  ]);
  if ((eventKindKey === "contract_amendment" || eventKindKey === "contract_modification") && !hasSpeculativeTransactionTail) {
    const provesCompletedContractChange =
      haystack.includes("amendment_no") ||
      haystack.includes("additional_funding") ||
      haystack.includes("extended_period_of_performance") ||
      haystack.includes("modification_1_enabled") ||
      haystack.includes("modification_1_to_primary_carrier_contracts") ||
      haystack.includes("prior_modification") ||
      haystack.includes("was_modified");
    if (provesCompletedContractChange) return "milestone";
  }
  if (eventKindKey === "procurement_action" && !hasSpeculativeTransactionTail) {
    const provesCompletedProcurementAction =
      haystack.includes("award_made") || haystack.includes("the_award_was_made") || haystack.includes("award_of_modification");
    if (provesCompletedProcurementAction) return "milestone";
  }
  if (eventKindKey === "license_amendment") {
    const provesLicenseAmendmentMilestone =
      haystack.includes("license") &&
      hasAny(haystack, ["amendment", "extension", "extend", "option", "parking", "term", "tribute_in_light"]);
    if (provesLicenseAmendmentMilestone) return "milestone";
  }
  if (eventKindKey === "permit_agreement") {
    const provesPermitAgreementMilestone = hasAny(haystack, ["parking", "permit", "restoration", "shuttle_bus", "sidewalk_area", "station"]);
    if (provesPermitAgreementMilestone) return "milestone";
  }
  if (eventKindKey === "negotiation") {
    const provesCompletedNegotiation = (haystack.includes("negotiations_were_conducted") || haystack.includes("negotiated")) && !haystack.includes("not_required");
    if (provesCompletedNegotiation) return "milestone";
  }
	  if (eventKindKey === "contract_extension" && (eventKindSpelling === "contract_extension" || eventKindSpelling === "contract extension")) {
	    const provesContractContext = eventKindSpelling === "contract_extension" || haystack.includes("contract") || haystack.includes("agreement") || haystack.includes("modification");
    const provesContractExtension =
      provesContractContext &&
      (haystack.includes("extension") || haystack.includes("extended") || haystack.includes("extend_the_contract")) &&
      (haystack.includes("extension_start") ||
        haystack.includes("extension_end") ||
        haystack.includes("extension_period") ||
        haystack.includes("extended_contract_term") ||
        haystack.includes("start_of") ||
        haystack.includes("end_of") ||
        haystack.includes("through_") ||
        haystack.includes("month") ||
        haystack.includes("months") ||
        (eventKindSpelling === "contract_extension" && (haystack.includes("year") || haystack.includes("years"))) ||
        haystack.includes("two_year") ||
        haystack.includes("three_year") ||
        haystack.includes("four_year") ||
        hasDatedAnchor);
    if (provesContractExtension) return "milestone";
  }
  const boardApprovalRequestKinds = new Set(["board_action_request", "board_request"]);
  if (boardApprovalRequestKinds.has(eventKindKey)) {
    const provesBoardApprovalRequest =
      (haystack.includes("request_for_board_approval") || haystack.includes("requesting_board_approval")) &&
      (haystack.includes("board_approval") || haystack.includes("mta_board_approval"));
    if (provesBoardApprovalRequest) return "approval";
  }
  if (eventKindKey === "employee_resource_group_event") {
    const provesExactErgActivity =
      (haystack.includes("back_to_school_photos") && evidenceHaystack.includes("all_are_welcome_to_participate")) ||
      (haystack.includes("tabletop_model_train_project") &&
        hasAny(evidenceHaystack, ["learn_3d_printing", "showcase_your_skills_and_talent", "register_to_attend_in_person_or_virtually"]));
    if (provesExactErgActivity) return "public_engagement";

    const provesEmployeeResourceGroupEvent =
      haystack.includes("erg") ||
      haystack.includes("employee_resource_group") ||
      haystack.includes("aapi_heritage_month") ||
      haystack.includes("african_american_day_parade") ||
      haystack.includes("all_generational") ||
      haystack.includes("abilities") ||
      haystack.includes("begin") ||
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("breast_cancer_awareness") ||
      haystack.includes("como_yo") ||
      haystack.includes("ewt") ||
      haystack.includes("empowering_women") ||
      haystack.includes("generations_in_the_workforce") ||
      haystack.includes("hispanic_heritage_month") ||
      haystack.includes("jewish_heritage") ||
      haystack.includes("latinos_friends") ||
      haystack.includes("latinos_and_friends") ||
      haystack.includes("making_strides_against_breast_cancer") ||
      haystack.includes("museum_of_jewish_heritage") ||
      haystack.includes("pride_express") ||
      haystack.includes("shadow_day") ||
      haystack.includes("suicide_prevention") ||
      haystack.includes("transportasian") ||
      haystack.includes("young_professionals") ||
      haystack.includes("cafecito_chat") ||
      haystack.includes("train_module_workshop") ||
      haystack.includes("speed_networking") ||
      haystack.includes("black_history_month") ||
      haystack.includes("holiday_get_together") ||
      haystack.includes("holiday_gathering") ||
      haystack.includes("winter_toy_and_coat_drive");
	    if (provesEmployeeResourceGroupEvent) return "public_engagement";
	  }
  if (eventKindKey === "employee_event" || eventKindKey === "employee_program") {
    const provesEmployeeErgProgram =
      haystack.includes("erg") ||
      haystack.includes("abilities") ||
      haystack.includes("accessible_programs") ||
      haystack.includes("cafecito_chat") ||
      haystack.includes("como_yo") ||
      haystack.includes("conversational_spanish") ||
      haystack.includes("latinos_friends") ||
      haystack.includes("latinos_and_friends") ||
      haystack.includes("making_the_mta_more_inclusive");
    if (provesEmployeeErgProgram) return "public_engagement";
  }
  if (["charity_drive", "donation_drive", "drive"].includes(eventKindKey)) {
    const provesCommunityDonationDrive =
      haystack.includes("winter_toy_and_coat_drive") ||
      (hasAny(haystack, ["toy_and_coat_drive", "toy_drive", "coat_drive"]) &&
        hasAny(haystack, ["all_generational", "bronx_defenders", "henry_street_settlement"]));
    if (provesCommunityDonationDrive) return "public_engagement";
  }
  if (["chat", "chat_event", "virtual_chat"].includes(eventKindKey) && haystack.includes("cafecito_chat")) {
    return "public_engagement";
  }
	  if (eventKindKey === "erg_event") {
	    const provesErgEvent =
	      haystack.includes("erg") ||
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("black_employee_group") ||
      haystack.includes("all_generational") ||
      haystack.includes("transportasian") ||
      haystack.includes("multicultural") ||
      haystack.includes("latinos_friends") ||
      haystack.includes("pride_express") ||
      haystack.includes("veteran") ||
      haystack.includes("veterans") ||
      haystack.includes("ewt") ||
      haystack.includes("empowering_women") ||
      haystack.includes("black_history") ||
      haystack.includes("juneteenth") ||
      haystack.includes("stonewall") ||
      haystack.includes("dynamic_dialogues") ||
      haystack.includes("cross_cultural_exchange") ||
      haystack.includes("lunch_and_learn") ||
      haystack.includes("all_member_meeting");
    if (provesErgEvent) return "public_engagement";
  }
  if (eventKindKey === "employee_engagement_event") {
    const provesEmployeeEngagementEvent =
      haystack.includes("hosted") ||
      haystack.includes("event") ||
      haystack.includes("program") ||
      haystack.includes("tour") ||
      haystack.includes("commemoration") ||
      haystack.includes("storytelling") ||
      haystack.includes("trivia") ||
      haystack.includes("bingo") ||
      haystack.includes("cafecito_chat") ||
      haystack.includes("heritage_month") ||
      haystack.includes("transportasian") ||
      haystack.includes("latinos_friends") ||
      haystack.includes("multicultural_erg") ||
      haystack.includes("veterans_erg") ||
      haystack.includes("pride_express") ||
      haystack.includes("young_professional_erg");
    if (provesEmployeeEngagementEvent) return "public_engagement";
  }
  if (eventKindKey === "erg_celebration") {
    const provesErgCelebration =
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("erg") ||
      haystack.includes("ewt") ||
      haystack.includes("empowering_women") ||
      haystack.includes("black_history_month") ||
      haystack.includes("womens_history_month") ||
      haystack.includes("kwanzaa") ||
      haystack.includes("umoja") ||
      haystack.includes("cultural_celebration") ||
      haystack.includes("celebration");
    if (provesErgCelebration) return "public_engagement";
  }
  if (eventKindKey === "celebration") {
    const provesLaunchCelebration =
      haystack.includes("launch") &&
      (haystack.includes("bus_network_redesign") || haystack.includes("bronx_local_bus_network_redesign") || haystack.includes("redesign_launch"));
    if (provesLaunchCelebration) return "launch";

    const provesPublicCelebration =
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("black_employee_group") ||
      haystack.includes("employee_resource_group") ||
      haystack.includes("erg") ||
      haystack.includes("ewt") ||
      haystack.includes("empowering_women") ||
      haystack.includes("transportasian") ||
      haystack.includes("pride_express") ||
      haystack.includes("black_history_month") ||
      haystack.includes("women_s_history_month") ||
      haystack.includes("womens_history_month") ||
      haystack.includes("hispanic_heritage_month") ||
      haystack.includes("aapi_heritage_month") ||
      haystack.includes("aapi_heritage") ||
      haystack.includes("asian_american_islander_pacific_heritage_month") ||
      haystack.includes("juneteenth") ||
      haystack.includes("kwanzaa") ||
      haystack.includes("umoja") ||
      haystack.includes("disability_pride_month") ||
      haystack.includes("lgbtqia") ||
      haystack.includes("pride_month") ||
      haystack.includes("customers_and_employees") ||
      haystack.includes("resource_fairs") ||
      haystack.includes("five_boroughs") ||
      haystack.includes("disability_unite") ||
      haystack.includes("elected_officials") ||
      haystack.includes("cultural_institutions") ||
      haystack.includes("community_festival") ||
      (haystack.includes("earth_day") &&
        (haystack.includes("messaging") || haystack.includes("digital_screens") || haystack.includes("digital_displays")));
    if (provesPublicCelebration) return "public_engagement";

    const provesMilestoneCelebration =
      haystack.includes("milestone") ||
      haystack.includes("brand_new_elevators") ||
      haystack.includes("station_improvements") ||
      (haystack.includes("all_new") && haystack.includes("station") && (haystack.includes("100_years") || haystack.includes("centennial")));
    if (provesMilestoneCelebration) return "milestone";
  }
  if (eventKindKey === "customer_engagement") {
    const provesCustomerEngagement =
      haystack.includes("connect_with_us") ||
      haystack.includes("transittalk") ||
      haystack.includes("engaged_customers") ||
      haystack.includes("customer_appreciation") ||
      haystack.includes("appreciation_luncheon");
    if (provesCustomerEngagement) return "public_engagement";
  }
	  if (eventKindKey === "customer_engagement_event") {
	    const provesCustomerEngagement =
	      haystack.includes("transittalk") ||
      haystack.includes("engaging_with_customers") ||
      haystack.includes("engaged_customers");
    if (provesCustomerEngagement) return "public_engagement";
  }
  if (eventKindKey === "customer_safety_event" && haystack.includes("engage_directly_with_customers")) {
    return "public_engagement";
  }
	  if (eventKindKey === "help_desk_event" && haystack.includes("omny_help_desk") && haystack.includes("well_attended")) {
	    return "public_engagement";
	  }
  if (["workshop", "exhibition", "lunch_and_learn", "walking_tour"].includes(eventKindKey)) {
    const provesEmployeeOrErgLearningEvent =
      haystack.includes("employee_resource_group") ||
      haystack.includes("erg") ||
      haystack.includes("all_generational") ||
      haystack.includes("intersectionality") ||
      haystack.includes("lgbtq") ||
      haystack.includes("pride_express") ||
      haystack.includes("staff_and_leadership") ||
      haystack.includes("train_module") ||
      haystack.includes("mta_employees");
    if (provesEmployeeOrErgLearningEvent) return "public_engagement";
  }
  if (eventKindKey === "community_event") {
    const provesMunicipalCommunityPermit =
      haystack.includes("family_fun_day") &&
      evidenceHaystack.includes("municipal_and_not_for_profit") &&
      evidenceHaystack.includes("non_commercial");
    if (provesMunicipalCommunityPermit) return "public_engagement";

    const provesCivicOrCommunityParticipation =
      haystack.includes("age_friendly") ||
      haystack.includes("american_cancer_society") ||
      haystack.includes("civic_association") ||
      haystack.includes("earth_day") ||
      haystack.includes("glen_cove") ||
      haystack.includes("making_strides") ||
      haystack.includes("spring_clean_up") ||
      haystack.includes("winter_toy_and_coat_drive");
    if (provesCivicOrCommunityParticipation) return "public_engagement";
  }
  if (eventKindKey === "pride_event") {
    const provesPrideEngagement = haystack.includes("pride") || haystack.includes("lgbtq") || haystack.includes("stonewall");
    if (provesPrideEngagement) return "public_engagement";
  }
  if (eventKindKey === "parade") {
    const provesMtaParticipation =
      haystack.includes("disability_pride") ||
      haystack.includes("essential_workers") ||
      haystack.includes("hometown_heroes") ||
      haystack.includes("mta_accessibility") ||
      haystack.includes("mta_participated") ||
      haystack.includes("pride_express");
    if (provesMtaParticipation) return "public_engagement";
  }
  if (eventKindKey === "safety_event" || eventKindKey === "safety_campaign") {
    const provesWorkforceSafetyFocusDay =
      haystack.includes("safety_focus_day") &&
      (haystack.includes("employee") ||
        haystack.includes("employees") ||
        haystack.includes("manager") ||
        haystack.includes("managers") ||
        haystack.includes("senior_leadership") ||
        haystack.includes("hazard") ||
        haystack.includes("hazards") ||
        haystack.includes("ppe") ||
        haystack.includes("cross_departmental_collaboration"));
    if (provesWorkforceSafetyFocusDay) return "implementation";

    const provesCustomerSafetyOutreach =
      haystack.includes("customer") ||
      haystack.includes("customers") ||
      haystack.includes("escalator_safety") ||
      haystack.includes("fliers") ||
      haystack.includes("grand_central") ||
      haystack.includes("operation_lifesaver") ||
      haystack.includes("outreach") ||
      haystack.includes("penn_station") ||
      haystack.includes("rail_safety_week") ||
      haystack.includes("stations");
    if (provesCustomerSafetyOutreach) return "public_engagement";
  }
  if (eventKindKey === "job_fair" || eventKindKey === "recruitment_event") {
    const provesRecruitmentEvent =
      haystack.includes("job_fair") ||
      haystack.includes("potential_job_applicants") ||
      haystack.includes("recruitment_open_house") ||
      haystack.includes("represented_jobs") ||
      haystack.includes("skilled_tradespeople");
    if (provesRecruitmentEvent) return "public_engagement";
  }
  if (eventKindKey === "memorial") {
    const provesMemorialMilestone =
      haystack.includes("commemorative_event") ||
      haystack.includes("honoring_garrett_goble") ||
      haystack.includes("memorial_plaque") ||
      haystack.includes("mural_unveiling");
    if (provesMemorialMilestone) return "milestone";
  }
  const employeeOrErgEngagementKinds = new Set([
    "ceremony_and_parade",
    "charity_drive",
    "charity_walk",
    "chat_interview",
    "cultural_celebration",
    "dialogue_series",
    "diversity_event",
    "educational_program",
    "employee_appreciation",
    "employee_event",
    "employee_program",
    "employee_resource_group_event",
    "erg_event_series",
    "erg_membership_drive",
    "exhibition",
    "forum",
    "fundraising_walk",
    "gathering",
    "heritage_celebration",
    "heritage_month_event",
    "interview",
    "networking",
    "networking_event",
    "observance",
    "panel",
    "pride_event",
    "pride_month_event",
    "program",
    "training",
    "walk",
    "walking_tour",
    "womens_history_celebration",
    "workforce_event",
    "workshop",
  ]);
  if (employeeOrErgEngagementKinds.has(eventKindKey)) {
    const provesEmployeeOrErgEngagement =
      haystack.includes("abilities_erg") ||
      haystack.includes("all_generational") ||
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("bus_rodeo") ||
      haystack.includes("cafecito_chat") ||
      haystack.includes("como_yo") ||
      haystack.includes("dialogue_series") ||
      haystack.includes("employee_appreciation") ||
      haystack.includes("employee_resource_group") ||
      haystack.includes("empowering_women") ||
      haystack.includes("generations_in_the_workforce") ||
      haystack.includes("jewish_american_heritage") ||
      hasAnyToken(haystack, ["erg", "ewt"]) ||
      haystack.includes("family_day") ||
      haystack.includes("latinos_friends") ||
      haystack.includes("latinos_and_friends") ||
      haystack.includes("making_strides") ||
      haystack.includes("museum_of_jewish_heritage") ||
      haystack.includes("mta_colleagues") ||
      haystack.includes("mta_employees") ||
      haystack.includes("lgbtq") ||
      haystack.includes("pride") ||
      haystack.includes("pride_month") ||
      haystack.includes("pride_express") ||
      haystack.includes("speed_networking") ||
      haystack.includes("stonewall") ||
      haystack.includes("transit_employee_appreciation") ||
      haystack.includes("transportasian") ||
      haystack.includes("veterans_erg") ||
      haystack.includes("winter_toy_and_coat_drive") ||
      haystack.includes("young_professional");
    if (provesEmployeeOrErgEngagement) return "public_engagement";
  }
  const ergActivityKinds = new Set([
    "career_event",
    "discussion",
    "employee_initiative",
    "employee_resource_group_initiative",
    "employee_resource_group_program",
    "employee_resource_group_training",
    "employee_resource_group_workshop",
    "job_shadowing_initiative",
  ]);
  if (ergActivityKinds.has(eventKindKey)) {
    const provesErgIdentity =
      hasAny(haystack, ["abilities_erg", "como_yo", "employee_resource_group", "latino_s_friends", "latinos_friends", "latinos_and_friends"]) ||
      hasAnyToken(haystack, ["erg"]);
    const provesSpecificActivity = hasAny(haystack, [
      "accessible_programs",
      "all_member_meeting",
      "career_options",
      "conversational_spanish",
      "job_shadowing",
      "leadership_training",
      "shadow_day",
    ]);
    if (provesErgIdentity && provesSpecificActivity) return "public_engagement";
  }
  const communityOrCustomerOutreachKinds = new Set([
    "advisory_committee",
    "annual_community_event",
    "awareness_campaign",
    "awareness_event",
    "career_event",
    "charity_event",
    "community_charity_event",
    "community_event",
    "customer_event",
    "design_period",
    "discussion",
    "job_fair",
    "kickoff",
    "planning_timeline",
    "project_kickoff",
    "public_event",
    "recruitment_event",
    "safety_awareness_event",
    "safety_campaign",
    "safety_event",
  ]);
  if (communityOrCustomerOutreachKinds.has(eventKindKey)) {
    const provesCommunityOrCustomerOutreach =
      haystack.includes("american_cancer_society") ||
      haystack.includes("community_advisory_committee") ||
      haystack.includes("customer_event") ||
      haystack.includes("customers") ||
      haystack.includes("day_of_giving") ||
      haystack.includes("donations_from_customers") ||
      haystack.includes("grade_crossing") ||
      haystack.includes("job_fair") ||
      haystack.includes("lakeview_civic_association") ||
      haystack.includes("level_crossing_awareness") ||
      haystack.includes("open_house") ||
      haystack.includes("on_street_outreach") ||
      haystack.includes("operation_lifesaver") ||
      haystack.includes("potential_job_applicants") ||
      haystack.includes("public_feedback") ||
      haystack.includes("public_outreach") ||
      haystack.includes("rail_safety_week") ||
      haystack.includes("recruitment_open_house") ||
      haystack.includes("represented_jobs") ||
      haystack.includes("skilled_tradespeople") ||
      haystack.includes("spoke_with_customers") ||
      haystack.includes("stemta_program");
    if (provesCommunityOrCustomerOutreach) return "public_engagement";
  }
  if (eventKindKey === "annual_community_event" && haystack.includes("earth_day")) {
    return "public_engagement";
  }
  const provesCivicCustomerEngagementTail =
    (eventKindKey === "awareness_event" && hasAny(haystack, ["customer_safety_and_suicide_prevention_awareness", "suicide_prevention"]) && haystack.includes("penn_station")) ||
    (eventKindKey === "feedback_portal" && haystack.includes("feedback_portal") && hasAny(haystack, ["location_specific_comments", "location_specific_feedback"])) ||
    (eventKindKey === "career_event" && haystack.includes("career_discovery_week") && hasAny(haystack, ["job_opportunities", "students_visited"])) ||
    (eventKindKey === "consultation" &&
      haystack.includes("consultation") &&
      (haystack.includes("community_boards_9_10_and_11") || (haystack.includes("community_board_9") && haystack.includes("community_board_10")))) ||
    (eventKindKey === "ambassador_program" && hasAny(haystack, ["customer_ambassador_program", "ambassadors_also_deployed"])) ||
    (eventKindKey === "interview" && haystack.includes("employer_interviews") && haystack.includes("alternatives_analysis_public_outreach")) ||
    (eventKindKey === "feedback_session" && haystack.includes("feedback_sessions") && haystack.includes("transit_hubs")) ||
    (eventKindKey === "resource_fair" && haystack.includes("older_adult_resource_fair") && haystack.includes("lincoln_square")) ||
    (eventKindKey === "career_day" && haystack.includes("annual_career_day") && haystack.includes("government_and_community_relations")) ||
    (eventKindKey === "customer_service" && haystack.includes("customer_service_team") && haystack.includes("trade_in") && hasAny(haystack, ["metrocards", "metro_cards"]) && haystack.includes("omny_cards")) ||
    (["kickoff", "project_kickoff"].includes(eventKindKey) && haystack.includes("community_boards") && haystack.includes("elected_officials")) ||
    (eventKindKey === "educational_program" && haystack.includes("stemta_program") && hasAny(haystack, ["grade_school", "government_and_community_relations"]));
  if (provesCivicCustomerEngagementTail) return "public_engagement";
	  if (
	    eventKindKey === "future_workshops" &&
	    haystack.includes("workshops") &&
    haystack.includes("meetings") &&
    !haystack.includes("employee") &&
    !haystack.includes("erg")
  ) {
    return "public_engagement";
  }
  if (eventKindKey === "panel_discussion") {
    const provesEmployeeOrHeritagePanel =
      haystack.includes("b_e_g_i_n") ||
      haystack.includes("ewt") ||
      haystack.includes("empowering_women") ||
      haystack.includes("women_s_history_month") ||
      haystack.includes("womens_history_month") ||
      haystack.includes("international_womens_day") ||
      haystack.includes("black_excellence") ||
      haystack.includes("workplace") ||
      haystack.includes("art_showcase");
    if (provesEmployeeOrHeritagePanel) return "public_engagement";
  }
  const boardApprovedPayloadKinds = new Set([
    "option_exercise",
    "procurement_modification",
    "rate_schedule_modification",
    "real_estate_acquisition",
    "real_estate_lease",
    "real_estate_license",
  ]);
  if (boardApprovedPayloadKinds.has(eventKindKey)) {
    const hasPendingOrRecommendationApprovalContext =
      haystack.includes("recommend_action") ||
      haystack.includes("recommendation_to_approve") ||
      haystack.includes("recommended_approval") ||
      haystack.includes("submitted_to_the_board") ||
      haystack.includes("board_submission") ||
      haystack.includes("prepared_and_reviewed_for_board_approval") ||
      haystack.includes("proposed_contract_extension") ||
      haystack.includes("proposed_amendment") ||
      haystack.includes("proposed_one_year_extension") ||
      haystack.includes("postponed_approval") ||
      haystack.includes("seeks_board_approval") ||
      haystack.includes("request_for_board_approval") ||
      haystack.includes("requesting_board_approval");
    const provesCompletedBoardApproval =
      haystack.includes("board_approved") || haystack.includes("board_approval_of") || haystack.includes("previous_board_approval_event");
    if (provesCompletedBoardApproval && !hasPendingOrRecommendationApprovalContext) return "approval";
  }
  const actionApprovalKinds = new Set(["action_item", "board_action", "committee_action", "committee_action_item"]);
	  if (actionApprovalKinds.has(eventKindKey)) {
	    const hasRecommendationOnlyApprovalContext =
	      haystack.includes("recommend_action_to_approve") ||
      haystack.includes("recommend_action_on") ||
      haystack.includes("recommend_action_to_the_board") ||
      haystack.includes("recommend_the_procurement") ||
      haystack.includes("recommendation_to_approve") ||
      haystack.includes("before_the_board_for_approval") ||
      haystack.includes("presented_to_the_board_for_approval") ||
      haystack.includes("requiring_board_approval");
    const provesBoardOrCommitteeApproval =
      !hasRecommendationOnlyApprovalContext &&
      (haystack.includes("board_approval") ||
        haystack.includes("mta_board_approval") ||
        haystack.includes("committee_approval") ||
        haystack.includes("finance_committee_approval") ||
        haystack.includes("approval_of") ||
        haystack.includes("annual_review_and_approval") ||
        (haystack.includes("annual_review_of") && haystack.includes("committee_revision_approval")) ||
        haystack.includes("review_and_approval") ||
        haystack.includes("committee_revision_approval") ||
        haystack.includes("will_approve") ||
        haystack.includes("asked_to_approve") ||
        haystack.includes("requested_to_approve") ||
        haystack.includes("committee_approves") ||
        haystack.includes("committee_approved") ||
        haystack.includes("board_action_to_approve") ||
        (eventKindKey === "board_action" &&
          (haystack.includes("authorization_to_enter_into") ||
            haystack.includes("board_requested_to_authorize") ||
            haystack.includes("approval_for_acquisition") ||
            haystack.includes("mnr_1_approval_for_acquisition"))) ||
        (eventKindKey === "board_action" &&
          (haystack.includes("board_adoption") ||
            haystack.includes("mta_board_adoption") ||
            haystack.includes("adoption_of_") ||
            haystack.includes("budget_adoption"))) ||
        (eventKindKey === "committee_action" && haystack.includes("formal_adoption") && haystack.includes("committee_charter")));
    if (provesBoardOrCommitteeApproval) return "approval";
  }
  if (eventKindKey === "recurring_agenda_item") {
    const provesApprovalOfMinutes =
      haystack.includes("minutes") &&
      (haystack.includes("approval") || haystack.includes("approve")) &&
      (haystack.includes("committee_meeting") || haystack.includes("prior_month") || haystack.includes("official_proceedings"));
    if (provesApprovalOfMinutes) return "approval";
  }
  const committeeWorkPlanApprovalKinds = new Set([
    "agenda_item",
    "committee_agenda_item",
    "committee_work_plan",
    "finance_committee_action_item",
    "committee_information_item",
    "committee_specific_agenda_item",
    "information_item",
    "scheduled_committee_agenda",
    "work_plan",
  ]);
  if (committeeWorkPlanApprovalKinds.has(eventKindKey)) {
    const provesCommitteeWorkPlanApproval =
      (haystack.includes("committee_work_plan") || (haystack.includes("work_plan") && haystack.includes("committee"))) &&
      (haystack.includes("approval_of") ||
        haystack.includes("will_approve") ||
        haystack.includes("asked_to_approve") ||
        haystack.includes("approve_its_use") ||
        haystack.includes("approve_the_amended_work_plan") ||
        haystack.includes("approval_of_proposed_work_plan") ||
        haystack.includes("approval_of_work_plan") ||
        haystack.includes("requested_to_approve") ||
        haystack.includes("committee_approves") ||
        haystack.includes("committee_approved") ||
        haystack.includes("approve_committee_work_plan")) &&
      !haystack.includes("recommend_action_to_the_board") &&
      !haystack.includes("recommends_action_to_the_board");
    if (provesCommitteeWorkPlanApproval) return "approval";
  }
  const committeeWorkPlanPlanningKinds = new Set([
    "committee_action",
    "committee_agenda_item",
    "committee_information_item",
    "committee_work_plan",
    "committee_work_plan_proposal",
    "information_item",
    "work_plan",
  ]);
  if (committeeWorkPlanPlanningKinds.has(eventKindKey)) {
    const provesDraftCommitteeWorkPlan =
      haystack.includes("committee_work_plan") &&
      (haystack.includes("present_a_draft") ||
        haystack.includes("presents_draft") ||
        haystack.includes("presentation_of_draft") ||
        haystack.includes("proposed_committee_work_plan"));
    if (provesDraftCommitteeWorkPlan) return "planning";
  }
  const scheduleAdvisoryPlanningKinds = new Set([
    "committee_agenda_item",
    "committee_briefing",
    "committee_information_item",
    "holiday_service_planning",
    "information_item",
    "project_update",
    "service_plan_advisory",
    "service_planning",
    "service_planning_and_trackwork",
    "timetable_change_and_trackwork",
    "timetable_change_and_trackwork_advisory",
    "track_work_program_update",
    "trackwork_advisory",
    "trackwork_program_update",
  ]);
  if (scheduleAdvisoryPlanningKinds.has(eventKindKey)) {
    const scheduleAdvisoryText = `${eventKindKey} ${haystack}`;
    const provesCommitteeScheduleAdvisory =
      (scheduleAdvisoryText.includes("committee_will_be_advised") ||
        scheduleAdvisoryText.includes("committee_will_be_advised_of") ||
        scheduleAdvisoryText.includes("committee_advised") ||
        scheduleAdvisoryText.includes("inform_the_long_island_committee")) &&
      scheduleAdvisoryText.includes("plans_to_adjust_schedules");
    const provesTrackworkScheduleAdvisory =
      (scheduleAdvisoryText.includes("plans_to_adjust_schedules") ||
        scheduleAdvisoryText.includes("plan_to_temporarily_adjust_schedules") ||
        scheduleAdvisoryText.includes("temporarily_adjust_schedules") ||
        scheduleAdvisoryText.includes("adjust_schedules")) &&
      (scheduleAdvisoryText.includes("trackwork") ||
        scheduleAdvisoryText.includes("track_work") ||
        scheduleAdvisoryText.includes("construction_projects") ||
        scheduleAdvisoryText.includes("switch_installations"));
    const hasScheduleContext =
      scheduleAdvisoryText.includes("timetable") ||
        scheduleAdvisoryText.includes("trackwork") ||
        scheduleAdvisoryText.includes("track_work") ||
        scheduleAdvisoryText.includes("construction_projects") ||
        scheduleAdvisoryText.includes("switch_installations") ||
        scheduleAdvisoryText.includes("holiday_service") ||
        eventKindKey === "service_planning" ||
        eventKindKey === "service_plan_advisory" ||
        eventKindKey === "committee_agenda_item" ||
        eventKindKey === "committee_information_item" ||
        eventKindKey === "information_item";
    if ((provesCommitteeScheduleAdvisory || provesTrackworkScheduleAdvisory) && hasScheduleContext) return "planning";
    const provesUpcomingScheduleChangeAdvisory =
      (scheduleAdvisoryText.includes("committee_will_be_advised") ||
        scheduleAdvisoryText.includes("committee_will_be_advised_of") ||
        scheduleAdvisoryText.includes("committee_advised")) &&
      scheduleAdvisoryText.includes("upcoming") &&
      (scheduleAdvisoryText.includes("schedule_change") || scheduleAdvisoryText.includes("schedule_changes"));
    if (provesUpcomingScheduleChangeAdvisory) return "planning";
  }
  if (eventKindKey === "track_work_program_update") {
    const trackworkText = haystack;
    const provesTrackworkProgramPlanning =
      trackworkText.includes("track_work_program") ||
      trackworkText.includes("trackwork_program") ||
      trackworkText.includes("construction_projects") ||
      trackworkText.includes("switch_installations") ||
      trackworkText.includes("track_construction");
    if (provesTrackworkProgramPlanning) return "planning";
  }
  const committeeCharterReviewKinds = new Set([
    "annual_review",
    "charter_review",
    "committee_agenda_item",
    "committee_charter_review",
    "committee_information_item",
    "committee_action",
    "committee_review",
    "committee_specific_agenda_item",
    "finance_committee_agenda_item",
    "information_item",
    "review",
  ]);
  if (committeeCharterReviewKinds.has(eventKindKey)) {
    const provesCommitteeCharterApproval =
      haystack.includes("committee_charter") &&
      (haystack.includes("annual_review_and_approval") ||
        haystack.includes("asked_to_formally_adopt") ||
        haystack.includes("formally_adopt_it_for_use") ||
        haystack.includes("committee_revision_approval") ||
        haystack.includes("review_and_approval") ||
        haystack.includes("revision_approval") ||
        haystack.includes("approval"));
    if (provesCommitteeCharterApproval) return "approval";
  }
  if (eventKindKey === "plan_amendment" && haystack.includes("approved") && haystack.includes("effective") && haystack.includes("coverage")) {
    return "approval";
  }
	  if (eventKindKey === "contract_modification" || eventKindKey === "contract_amendment") {
    const provesModificationApproval =
      (haystack.includes("board_approved") && (haystack.includes("modification") || haystack.includes("amend"))) ||
      haystack.includes("ratification_of_a_modification") ||
      haystack.includes("approval_to_amend");
    if (provesModificationApproval) return "approval";
	    const provesModificationAward = haystack.includes("modification") && haystack.includes("awarded");
	    if (provesModificationAward) return "milestone";
	  }
	  if (eventKindKey === "change_order") {
	    const provesChangeOrderMilestone =
	      haystack.includes("change_order") &&
	      (haystack.includes("added") || haystack.includes("add") || haystack.includes("cost") || haystack.includes("at_a_cost"));
	    if (provesChangeOrderMilestone) return "milestone";
	  }
  if (eventKindKey === "project_step") {
    const provesImplementationStep = haystack.includes("step_4") && (haystack.includes("implementation") || haystack.includes("launch_sbs_service"));
    if (provesImplementationStep) return "implementation";
    const provesPlanningStep =
      haystack.includes("data_collection") ||
      haystack.includes("analysis") ||
      haystack.includes("concept") ||
      haystack.includes("design") ||
      haystack.includes("corridor_plan") ||
      haystack.includes("preferred_plan");
    if (provesPlanningStep) return "planning";
  }
  if (eventKindKey === "project_schedule") {
    const provesBusPriorityCapitalSchedule = haystack.includes("capital_improvements") && (haystack.includes("bx6_sbs") || haystack.includes("sbs"));
    if (provesBusPriorityCapitalSchedule && haystack.includes("construction_start")) return "construction";
    if (provesBusPriorityCapitalSchedule && (haystack.includes("finalize_design") || haystack.includes("procurement"))) return "planning";
  }
	  if (eventKindKey === "project_update") {
	    const provesCompletedPtcImplementation =
	      (haystack.includes("positive_train_control") || haystack.includes("ptc")) &&
	      haystack.includes("implementation") &&
      (haystack.includes("close_out") || haystack.includes("closeout")) &&
      (haystack.includes("full_ptc_functionality") ||
        haystack.includes("full_positive_train_control_functionality") ||
        haystack.includes("full_functionality") ||
        haystack.includes("going_into_effect") ||
	        haystack.includes("went_into_effect"));
	    if (provesCompletedPtcImplementation) return "implementation";
	    const provesCommitteeProjectUpdate =
	      haystack.includes("committee_will_be_briefed") ||
	      haystack.includes("will_be_briefed_on_the_status");
	    if (provesCommitteeProjectUpdate) return "governance";
	  }
	  if (eventKindKey === "ntsb_recommendation_closeout_request") {
	    const provesFormalCloseoutRequest =
	      haystack.includes("ntsb") &&
	      haystack.includes("request") &&
	      (haystack.includes("closed_acceptable_action") || haystack.includes("closeout_request") || haystack.includes("formal_request"));
	    if (provesFormalCloseoutRequest) return "milestone";
	  }
  const ptcCloseoutBriefingKinds = new Set(["briefing", "committee_agenda_item", "committee_briefing", "project_update", "project_update_briefing"]);
  if (ptcCloseoutBriefingKinds.has(eventKindKey)) {
    const provesPtcCloseoutBriefing =
      (haystack.includes("positive_train_control") || haystack.includes("ptc")) &&
      haystack.includes("implementation") &&
      (haystack.includes("close_out") || haystack.includes("closeout")) &&
      (haystack.includes("full_ptc_functionality") ||
        haystack.includes("full_positive_train_control_functionality") ||
        haystack.includes("full_functionality") ||
        haystack.includes("going_into_effect") ||
        haystack.includes("went_into_effect"));
    if (provesPtcCloseoutBriefing) return "implementation";
  }
  if (eventKindKey === "project_phase") {
    const provesPublicEngagementPhase = haystack.includes("cac_meeting") || haystack.includes("cac_meetings") || haystack.includes("public_open_house");
    if (provesPublicEngagementPhase) return "public_engagement";
    if (haystack.includes("implementation")) return "implementation";
    const provesPlanningPhase =
      haystack.includes("data_collection") ||
      haystack.includes("analysis") ||
      haystack.includes("design") ||
      haystack.includes("preferred_corridor_plan");
    if (provesPlanningPhase) return "planning";
  }
  if (eventKindKey === "next_steps") {
    const provesPlanningNextSteps =
      haystack.includes("data_collection") ||
      haystack.includes("traffic_and_transit_data") ||
      haystack.includes("transit_operations_data") ||
      haystack.includes("analysis") ||
      haystack.includes("conceptual_design") ||
      haystack.includes("detailed_plans") ||
      haystack.includes("community_boards") ||
      haystack.includes("cac_meeting");
    if (provesPlanningNextSteps) return "planning";
  }
  if (eventKindKey === "planned_procurement") {
    const provesPlannedRfpRelease =
      haystack.includes("rfp_release") && (haystack.includes("currently_planned") || haystack.includes("planned_to_occur") || haystack.includes("planned"));
    if (provesPlannedRfpRelease) return "planning";
  }
  if (eventKindKey === "testing_planned") {
    const provesPlannedServiceTesting =
      haystack.includes("revenue_service_testing") && (haystack.includes("deployment_to_commence") || haystack.includes("testing_and_deployment"));
    if (provesPlannedServiceTesting) return "planning";
  }
  if (eventKindKey === "proposal") {
    const provesConcreteProjectProposal =
      haystack.includes("complete_street_proposal") || haystack.includes("proposal_to_upgrade") || haystack.includes("proposal_from");
    if (provesConcreteProjectProposal) return "planning";
  }
  if (eventKindKey === "proposal_refinement") {
    const provesPlanningProposalRefinement =
      haystack.includes("refine_proposal") && (haystack.includes("community_feedback") || haystack.includes("data_collection") || haystack.includes("site_visits"));
    if (provesPlanningProposalRefinement) return "planning";
  }
  const estimatedPlanningKinds = new Set(["anticipated_start", "estimated_need_date", "estimated_start", "estimated_timeframe", "estimated_timeline", "revenue_service_target"]);
  if (estimatedPlanningKinds.has(eventKindKey)) {
    const provesEstimatedPlanningDate =
      haystack.includes("estimated") ||
      haystack.includes("anticipated") ||
      haystack.includes("target_date") ||
      haystack.includes("construction_start") ||
      haystack.includes("property_interests") ||
      haystack.includes("revenue_service");
    const excludesCompletedOrActual = haystack.includes("completed") || haystack.includes("actual");
    if (provesEstimatedPlanningDate && !excludesCompletedOrActual) return "planning";
  }
  const designPlanningKinds = new Set(["design_review", "engineering_design", "engineering_review", "final_design_and_engineering", "study_period"]);
  if (designPlanningKinds.has(eventKindKey)) {
    const provesPlanningDesignOrStudy =
      haystack.includes("design") ||
      haystack.includes("engineering") ||
      haystack.includes("environmental_review") ||
      haystack.includes("traffic_analysis") ||
      haystack.includes("study") ||
      haystack.includes("surveys");
    const excludesCompletedReview = haystack.includes("completed_their_reevaluation") || haystack.includes("fonsi_remains_valid");
    if (provesPlanningDesignOrStudy && !excludesCompletedReview) return "planning";
  }
  if (eventKindKey === "assessment") {
    const provesNeedsAssessmentPublication = haystack.includes("twenty_year_needs") || haystack.includes("needs_assessment");
    if (provesNeedsAssessmentPublication) return "publication";
  }
	  if (eventKindKey === "closeout") {
	    const isForecastCloseout = haystack.includes("forecast") || haystack.includes("expected") || haystack.includes("scheduled");
	    const provesCompletedCloseout = !isForecastCloseout && (haystack.includes("completed") || haystack.includes("actual"));
	    if (provesCompletedCloseout) return "implementation";
	    const provesDatedCapitalCloseout =
	      !isForecastCloseout &&
	      hasDatedAnchor &&
	      haystack.includes("closeout") &&
	      (haystack.includes("pocket_track") || haystack.includes("yard") || haystack.includes("phase_1"));
	    if (provesDatedCapitalCloseout) return "implementation";
	  }
  if (eventKindKey === "environmental_review") {
    const provesCompletedReview =
      haystack.includes("fhwa_completed") ||
      haystack.includes("completed_their_reevaluation") ||
      haystack.includes("fonsi_remains_valid") ||
      (haystack.includes("nepa") && haystack.includes("confirming"));
    if (provesCompletedReview) return "approval";
    const provesReviewPlanning =
      haystack.includes("expected_to_begin") ||
      haystack.includes("review_process_expected") ||
      haystack.includes("commenced") ||
      haystack.includes("publication_of_the_scope") ||
      haystack.includes("draft_environmental_impact_statement") ||
      haystack.includes("deis");
    if (provesReviewPlanning) return "planning";
  }
  if (eventKindKey === "activation" && (haystack.includes("activated") || haystack.includes("began"))) {
    return "implementation";
  }
  if (eventKindKey === "service_activation" && (haystack.includes("activated") || haystack.includes("put_into_service"))) {
    return "implementation";
  }
  if (
    ["fleet_upgrade", "vehicle_upgrade"].includes(eventKindKey) &&
    haystack.includes("b46") &&
    hasAny(haystack, ["upgrade_to_articulated_buses", "upgrade_to_longer_articulated_buses"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "infrastructure_activation") {
    const provesInfrastructureActivation =
      haystack.includes("operational") ||
      haystack.includes("in_operation") ||
      haystack.includes("activating") ||
      haystack.includes("activated");
    if (provesInfrastructureActivation) return "implementation";
  }
  const provesExactImplementationTail =
    (eventKindKey === "signal_cutover_and_commissioning" &&
      haystack.includes("signal_cutover") &&
      haystack.includes("commissioning") &&
      (haystack.includes("actual") || hasAny(haystack, ["great_neck_pocket_track", "great_neck"]))) ||
    (eventKindKey === "station_accessibility" && hasAny(haystack, ["placed_into_service", "put_into_service"]) && hasAny(haystack, ["elevator", "elevators"])) ||
    (eventKindKey === "fleet_commissioning" && hasAny(haystack, ["put_into_service", "placed_into_service"]) && hasAny(haystack, ["railcars", "rail_cars"])) ||
    (eventKindKey === "service_upgrade" && haystack.includes("enhanced_cellular_service") && hasAny(haystack, ["now_have", "5g", "lte"])) ||
    (eventKindKey === "safety_installation" && haystack.includes("completed_installation") && haystack.includes("polycarbonate_barriers")) ||
    (eventKindKey === "proof_of_concept_completed" &&
      haystack.includes("successful_proof_of_concept") &&
      (haystack.includes("completed") || hasAny(haystack, ["revenue_recovery_system", "persistent_toll_violators", "positive_identification"])));
  if (provesExactImplementationTail) return "implementation";
  if (eventKindKey === "infrastructure_project") {
    const provesInfrastructureImplementation =
      haystack.includes("fully_replaced") ||
      haystack.includes("was_constructed") ||
      haystack.includes("began_replacing") ||
      haystack.includes("will_begin") ||
      haystack.includes("begins_in") ||
      haystack.includes("scheduled_to_be_completed") ||
      haystack.includes("crossing_replaced") ||
      (haystack.includes("bridge_replacement_projects") && haystack.includes("mt_vernon")) ||
      haystack.includes("maintenance_of_way_rail_and_tie_replacement") ||
      (haystack.includes("state_of_good_repair_work") && haystack.includes("schedule_adjustments_enacted"));
    if (provesInfrastructureImplementation) return "implementation";
  }
  if (eventKindKey === "capital_project") {
    const provesBusPriorityCapitalImplementation =
      !haystack.includes("upcoming") &&
      (haystack.includes("design_and_implement_capital_project") ||
        (haystack.includes("capital_project_including_bus_bulbs") && haystack.includes("bus_bulbs")));
    if (provesBusPriorityCapitalImplementation) return "implementation";
  }
  if (eventKindKey === "data_collection" && haystack.includes("post_implementation") && (haystack.includes("monitoring") || haystack.includes("data_collection"))) {
    return "implementation";
  }
  if (
    eventKindKey === "proof_of_concept" &&
    (haystack.includes("conducted") || haystack.includes("successful") || haystack.includes("pilot") || haystack.includes("permitted_to_conduct"))
  ) {
    return "implementation";
  }
  if (eventKindKey === "emergency_exercise" || eventKindKey === "emergency_drill") {
    const provesEmergencyExercise =
      haystack.includes("emergency") &&
      (haystack.includes("exercise") ||
        haystack.includes("drill") ||
        haystack.includes("preparedness") ||
        haystack.includes("simulated") ||
        haystack.includes("simulating") ||
        haystack.includes("scenario") ||
        haystack.includes("evacuate") ||
        haystack.includes("evacuations") ||
        haystack.includes("responders"));
    if (provesEmergencyExercise) return "implementation";
  }
  const agendaItemKinds = new Set([
    "agenda_item",
    "budget_review",
    "committee_budget_briefing",
    "committee_agenda_item",
    "committee_information",
    "committee_information_item",
    "committee_review",
    "finance_committee_agenda_item",
    "financial_plan_update",
    "information_item",
    "operating_review",
    "operating_results_review",
    "performance_review",
    "public_notice",
    "public_release",
    "regulatory_notice",
    "scheduled_committee_agenda",
  ]);
  const hasAgendaPlaceholder = haystack.includes("no_items_scheduled") || haystack.includes("no_meetings_held");
  const hasRecommendationOnlyBudgetContext =
    haystack.includes("recommend_action_to_the_board") ||
    haystack.includes("recommends_action_to_the_board") ||
    haystack.includes("recommend_action_on") ||
    haystack.includes("recommend_action_to_approve") ||
    haystack.includes("committee_will_recommend_action") ||
    haystack.includes("will_recommend_action_to_the_board");
  const reportPublicationKinds = new Set([
    ...agendaItemKinds,
    "committee_recurring_item",
    "recurring_agenda_item",
    "recurring_information_item",
  ]);
	  const provesFinancialPlanPresentationPublication =
	    reportPublicationKinds.has(eventKindKey) &&
	    !hasAgendaPlaceholder &&
	    !hasRecommendationOnlyBudgetContext &&
	    haystack.includes("financial_plan") &&
    (haystack.includes("present") || haystack.includes("presentation") || haystack.includes("revised") || haystack.includes("updated_forecast")) &&
    (haystack.includes("adopted_budget") ||
      haystack.includes("adopted_financial_plan") ||
      haystack.includes("february_financial_plan") ||
      haystack.includes("preliminary_budget") ||
      haystack.includes("july_financial_plan") ||
	      haystack.includes("november_financial_plan") ||
	      haystack.includes("revised_financial_plan") ||
	      haystack.includes("four_year_financial_plan"));
  const provesDatedRevisedFinancialPlanPresentation =
    eventKindKey === "financial_plan_update" &&
    !hasAgendaPlaceholder &&
    !hasRecommendationOnlyBudgetContext &&
    haystack.includes("financial_plan") &&
    (haystack.includes("present") || haystack.includes("presentation")) &&
    /(^|_)revised_20\d{2}_financial_plan(_|$)/u.test(haystack);
  const provesFinalOperatingResultsReviewPublication =
    reportPublicationKinds.has(eventKindKey) &&
    !hasAgendaPlaceholder &&
    !hasRecommendationOnlyBudgetContext &&
    (haystack.includes("final_review") || haystack.includes("final_reviews")) &&
    (haystack.includes("operating_budget_results") || haystack.includes("operating_results") || haystack.includes("budget_results")) &&
    (haystack.includes("prior_year") ||
      haystack.includes("will_be_presented_to_the_committee") ||
      haystack.includes("presented_to_the_committee") ||
      haystack.includes("current_and_future_budget_performance") ||
      haystack.includes("performance_metrics") ||
      haystack.includes("performance_indicators"));
  const provesOperationsYearReviewPublication =
    reportPublicationKinds.has(eventKindKey) &&
    !hasAgendaPlaceholder &&
    (haystack.includes("year_in_review") || haystack.includes("operations_summary")) &&
    (haystack.includes("prior_year") || haystack.includes("end_of_calendar_year") || haystack.includes("railroad_service")) &&
    (haystack.includes("provided_to_the_committee") || haystack.includes("will_be_provided_to_the_committee") || haystack.includes("review_of"));
	  const provesCommitteePerformanceReviewPublication =
	    eventKindKey === "performance_review" &&
	    !hasAgendaPlaceholder &&
	    !hasRecommendationOnlyBudgetContext &&
    (((haystack.includes("prior_year") || haystack.includes("prior_year_s")) &&
      haystack.includes("performance") &&
      haystack.includes("railroad_service") &&
      (haystack.includes("provided_to_the_committee") || haystack.includes("will_be_provided_to_the_committee"))) ||
      ((haystack.includes("prior_year") || haystack.includes("prior_year_s")) &&
	        (haystack.includes("budget_results") || haystack.includes("operating_budget_results")) &&
	        haystack.includes("current_and_future_budget_performance") &&
	        (haystack.includes("presented_to_the_committee") || haystack.includes("will_be_presented_to_the_committee"))));
  const provesDatedOperatingResultsReviewPublication =
    eventKindKey === "operating_review" &&
    !hasAgendaPlaceholder &&
    !hasRecommendationOnlyBudgetContext &&
    hasDatedAnchor &&
    (haystack.includes("final_review") || haystack.includes("preliminary_review")) &&
    haystack.includes("operating_results");
  const provesDatedRailroadPerformanceReviewPublication =
    eventKindKey === "performance_review" &&
    !hasAgendaPlaceholder &&
    !hasRecommendationOnlyBudgetContext &&
    hasDatedAnchor &&
    (haystack.includes("prior_year") || haystack.includes("prior_year_s")) &&
    haystack.includes("performance") &&
    haystack.includes("railroad_service");
  const provesYearEndRidershipPerformanceSummaryPublication =
    eventKindKey === "performance_summary" &&
    hasDatedAnchor &&
    haystack.includes("year_end") &&
    haystack.includes("ridership") &&
    haystack.includes("performance_results");
	  const provesRecurringCommitteeReportPublication =
	    reportPublicationKinds.has(eventKindKey) &&
	    !hasAgendaPlaceholder &&
    haystack.includes("report") &&
    (haystack.includes("monthly_report") || haystack.includes("quarterly") || haystack.includes("monthly")) &&
    (haystack.includes("president") ||
      haystack.includes("police_activity") ||
      haystack.includes("police_activities") ||
      haystack.includes("diversity") ||
      haystack.includes("equal_opportunity") ||
      haystack.includes("financial") ||
      haystack.includes("operations") ||
      haystack.includes("performance")) &&
    (haystack.includes("will_be_provided") ||
      haystack.includes("will_be_given") ||
      haystack.includes("provided") ||
      haystack.includes("provides") ||
      haystack.includes("highlighting") ||
      haystack.includes("monthly_presentation") ||
      haystack.includes("comprehensive_overview"));
  const provesFinancialForecastPublication =
    (haystack.includes("mid_year_forecast") || haystack.includes("july_financial_plan") || haystack.includes("financial_plan")) &&
    (haystack.includes("revenue_and_expense") || haystack.includes("consolidated_subsidies"));
  const provesTransitPerformanceReportPublication =
    ((haystack.includes("annual_ridership_report") || haystack.includes("ridership_report")) &&
      (haystack.includes("ridership_trends") || haystack.includes("monthly_ticket_sales") || haystack.includes("train_ridership_counts"))) ||
    ((haystack.includes("elevator") || haystack.includes("escalator")) &&
      haystack.includes("report") &&
      (haystack.includes("reliability") || haystack.includes("availability")));
  const provesWorkforceDiversityReportPublication =
    haystack.includes("report") &&
    (haystack.includes("eeo") || haystack.includes("diversity") || haystack.includes("equal_opportunity")) &&
    (haystack.includes("quarter") ||
      haystack.includes("qtr") ||
      haystack.includes("year_end") ||
      haystack.includes("year_end_report") ||
      haystack.includes("diversity_eeo_report") ||
      haystack.includes("eeo_diversity_report"));
  const provesGctRetailAnnualReportPublication =
    haystack.includes("annual_report") &&
    haystack.includes("grand_central_terminal") &&
    haystack.includes("retail_development") &&
    haystack.includes("leasing") &&
    haystack.includes("construction_opportunities") &&
    haystack.includes("financial") &&
    haystack.includes("marketing");
  const provesSafetySecurityReportPublication =
    haystack.includes("safety") &&
    ((haystack.includes("security") && haystack.includes("comprehensive_report")) ||
      (haystack.includes("safety_report") &&
        (haystack.includes("monthly_report") || haystack.includes("compilation")) &&
        (haystack.includes("statistics") || haystack.includes("indicators") || haystack.includes("collision_rates") || haystack.includes("lost_time"))));
  const provesRecurringFinancialReportPublication =
    haystack.includes("financial_report") &&
    haystack.includes("monthly_report") &&
    (haystack.includes("financial_performance") || haystack.includes("financial_indicators") || (haystack.includes("budget") && haystack.includes("forecast")));
  const provesRecurringOperationsOrRidershipReportPublication =
    haystack.includes("monthly_report") &&
    ((haystack.includes("operations_report") && haystack.includes("operating_performance") && (haystack.includes("statistics") || haystack.includes("indicators"))) ||
      (haystack.includes("ridership_report") && haystack.includes("ticket_sales") && haystack.includes("ridership") && haystack.includes("revenues")));
  const provesRecurringKeyPerformanceMetricsReportPublication =
    (haystack.includes("key_performance_metric_report") || haystack.includes("key_performance_metrics_reports")) &&
    (haystack.includes("monthly_presentation") || haystack.includes("monthly") || haystack.includes("comprehensive_overview")) &&
    (haystack.includes("performance_indicators") || haystack.includes("performance_metrics"));
  const provesQuarterlyTrackProgramReportPublication =
    (haystack.includes("quarterly_report") || haystack.includes("a_quarterly_report_will_be_provided")) &&
    (haystack.includes("progress_made") || haystack.includes("highlighting_progress")) &&
    haystack.includes("track_maintenance") &&
    haystack.includes("state_of_good_repair");
  const provesStrategicPrioritiesReportPublication =
    haystack.includes("biannual_report") &&
    haystack.includes("railroads_progress") &&
    haystack.includes("safe_and_reliable_transportation") &&
    haystack.includes("customer_service");
  const provesStateRequiredAnnualReportPublication =
    haystack.includes("state_required_report") &&
    ((haystack.includes("annual_procurement_report") && haystack.includes("procurement_division")) ||
      (haystack.includes("annual_investment_report") && haystack.includes("treasury_division")));
  if (agendaItemKinds.has(eventKindKey) && haystack.includes("public_comment")) {
    return "public_engagement";
  }
		  if (reportPublicationKinds.has(eventKindKey)) {
		    if (provesFinancialPlanPresentationPublication || provesDatedRevisedFinancialPlanPresentation) return "publication";
	    if (provesFinalOperatingResultsReviewPublication) return "publication";
	    if (provesOperationsYearReviewPublication) return "publication";
	    if (provesCommitteePerformanceReviewPublication) return "publication";
	    if (provesDatedOperatingResultsReviewPublication) return "publication";
	    if (provesDatedRailroadPerformanceReviewPublication) return "publication";
	    if (provesRecurringCommitteeReportPublication) return "publication";
	  }
  if (provesYearEndRidershipPerformanceSummaryPublication) return "publication";
  if (agendaItemKinds.has(eventKindKey)) {
    if (provesFinancialForecastPublication) return "publication";
    if (provesTransitPerformanceReportPublication) return "publication";
    if (provesWorkforceDiversityReportPublication) return "publication";
    if (provesGctRetailAnnualReportPublication) return "publication";
    if (provesSafetySecurityReportPublication) return "publication";
    if (provesQuarterlyTrackProgramReportPublication) return "publication";
    if (eventKindKey === "budget_review") {
      const isBudgetRecommendationOnly =
        haystack.includes("recommend_action_to_the_board") ||
        haystack.includes("recommend_action_on") ||
        haystack.includes("recommend_action_to_approve") ||
        haystack.includes("committee_will_recommend_action");
      const provesOperatingBudgetReviewPublication =
        !isBudgetRecommendationOnly &&
        ((haystack.includes("final_review") && (haystack.includes("operating_budget") || haystack.includes("operating_results") || haystack.includes("budget_results"))) ||
          ((haystack.includes("prior_year") || haystack.includes("prior_year_s")) &&
            haystack.includes("budget_results") &&
            (haystack.includes("will_be_presented_to_the_committee") ||
              haystack.includes("present_a_brief_review") ||
              haystack.includes("will_present_a_brief_review") ||
              haystack.includes("current_and_future_budget_performance") ||
              haystack.includes("implications_for_current_and_future_budget_performance"))));
      if (provesOperatingBudgetReviewPublication) return "publication";
      const provesBudgetResultsPresentation =
        (haystack.includes("budget_results") || haystack.includes("operating_budget_results")) &&
        (haystack.includes("will_be_presented_to_the_committee") ||
          haystack.includes("present_a_brief_review") ||
          haystack.includes("will_present_a_brief_review"));
      if (provesBudgetResultsPresentation) return "publication";
    }
    if (eventKindKey === "committee_information") {
      const provesCommitteeInformationReport =
        (haystack.includes("annual") && haystack.includes("report")) ||
        (haystack.includes("final_review") && haystack.includes("budget_results"));
      if (provesCommitteeInformationReport) return "publication";
    }
    const provesCommitteeReportPresentation =
      haystack.includes("report_will_be_presented_to_the_committee") ||
      haystack.includes("annual_report_to_the_committee") ||
      haystack.includes("quarterly_report_to_the_committee") ||
      haystack.includes("report_to_the_committee") ||
      haystack.includes("report_providing_data") ||
      (haystack.includes("report") && haystack.includes("will_be_presented_to_the_committee"));
    if (provesCommitteeReportPresentation) return "publication";
  }
  if (eventKindKey === "committee_briefing" && provesTransitPerformanceReportPublication) return "publication";
  const recurringReportKinds = new Set(["committee_recurring_item", "recurring_agenda_item", "recurring_information_item"]);
  if (recurringReportKinds.has(eventKindKey) && provesSafetySecurityReportPublication) return "publication";
  if (recurringReportKinds.has(eventKindKey) && provesRecurringFinancialReportPublication) return "publication";
  if (recurringReportKinds.has(eventKindKey) && provesRecurringOperationsOrRidershipReportPublication) return "publication";
  if (recurringReportKinds.has(eventKindKey) && provesRecurringKeyPerformanceMetricsReportPublication) return "publication";
  if ((eventKindKey === "safety_update" || eventKindKey === "safety_and_security_update") && provesSafetySecurityReportPublication) return "publication";
  if (eventKindKey === "quarterly_update") {
    if (provesQuarterlyTrackProgramReportPublication) return "publication";
  }
  if ((eventKindKey === "strategic_priorities_update" || eventKindKey === "strategic_update") && provesStrategicPrioritiesReportPublication) {
    return "publication";
  }
  if (eventKindKey === "finance_committee_action_item" && provesStateRequiredAnnualReportPublication) return "publication";
  if (eventKindKey === "financial_forecast") {
    if (provesFinancialForecastPublication) return "publication";
  }
  if (eventKindKey === "certification") {
    const provesBudgetCertificationPublication =
      (haystack.includes("certification") || haystack.includes("certified")) &&
      (haystack.includes("attached_budget") || haystack.includes("preliminary_budget") || haystack.includes("july_financial_plan")) &&
      (haystack.includes("budget") || haystack.includes("financial_plan"));
    if (provesBudgetCertificationPublication) return "publication";
  }
	  if (eventKindKey === "public_event") {
	    const provesStationPrioritizationFeedback =
	      haystack.includes("feedback") &&
      haystack.includes("priority_stations") &&
      (haystack.includes("every_geographic_area") ||
        haystack.includes("geographic_area_across_the_system") ||
	        haystack.includes("accessibility"));
	    if (provesStationPrioritizationFeedback) return "public_engagement";
	  }
  if (eventKindKey === "public_review" && haystack.includes("released_for_public_review")) {
    return "publication";
  }
  if (eventKindKey === "public_notice" && haystack.includes("issue_the_public_notice") && (haystack.includes("online") || haystack.includes("stations"))) {
    return "publication";
  }
  if (eventKindKey === "public_advertisement" && haystack.includes("posted") && haystack.includes("nys_contract_reporter")) {
    return "publication";
  }
  if (eventKindKey === "town_hall") {
    const isPublicTownHall =
      (haystack.includes("community_board") || haystack.includes("interborough_express") || haystack.includes("ibx")) && !haystack.includes("employee");
    if (isPublicTownHall) return "public_engagement";
  }
  if (eventKindKey === "workshop") {
    const isPublicWorkshop =
      (haystack.includes("public_workshop") ||
        haystack.includes("community_planning") ||
        haystack.includes("bronx_bus_network_redesign") ||
        haystack.includes("connecting_communities")) &&
      !haystack.includes("employee") &&
      !haystack.includes("erg");
    if (isPublicWorkshop) return "public_engagement";
  }
  if (eventKindKey === "briefing") {
    const isStakeholderBriefing =
      (haystack.includes("community_board") || haystack.includes("elected_official") || haystack.includes("select_bus_service_briefing")) && !haystack.includes("committee_will_be_briefed");
    if (isStakeholderBriefing) return "public_engagement";
  }
	  if (eventKindKey === "walkthrough") {
	    const isPlanningOrStakeholderWalkthrough =
	      haystack.includes("sbs_planning") ||
	      haystack.includes("community_walkthrough") ||
	      haystack.includes("elected_official") ||
	      haystack.includes("dot_commissioner") ||
	      haystack.includes("nyct_president");
	    if (isPlanningOrStakeholderWalkthrough) return "public_engagement";
	  }
		  if (["public_tour", "site_tour", "site_visit", "tour", "walking_tour"].includes(eventKindKey)) {
		    const isPublicOrPlanningTour =
		      haystack.includes("public_tour") ||
	      haystack.includes("public_outreach") ||
	      hasAnyToken(haystack, ["cac"]) ||
	      haystack.includes("community_advisory_committee") ||
      haystack.includes("m15_sbs_tour") ||
		      (haystack.includes("sbs") && (haystack.includes("planning") || haystack.includes("outreach") || haystack.includes("reference")));
		    if (isPublicOrPlanningTour) return "public_engagement";
      const isElectedOfficialAccessProjectTour = eventKindKey === "site_tour" && haystack.includes("state_senator") && haystack.includes("ada_project");
      if (isElectedOfficialAccessProjectTour) return "public_engagement";
      const isElectedOfficialTransitTour =
        eventKindKey === "tour" &&
        (hasAny(haystack, ["state_senator", "town_supervisor", "borough_president", "council_member"]) ||
          hasAnyToken(haystack, ["senator"])) &&
        hasAnyToken(haystack, ["yard", "depot", "facility", "facilities"]);
      if (isElectedOfficialTransitTour) return "public_engagement";
		  }
		  if (eventKindKey === "ceremony" && (haystack.includes("unveiled") || haystack.includes("unveiling"))) {
		    return "milestone";
		  }
	  if (eventKindKey === "ceremony") {
	    const provesAwardOrPromotionMilestone =
	      haystack.includes("medal_and_award_ceremony") ||
	      haystack.includes("award_ceremony") ||
	      haystack.includes("promotional_ceremony");
	    if (provesAwardOrPromotionMilestone) return "milestone";
	    if (haystack.includes("veterans_day") || haystack.includes("veteran_day")) return "public_engagement";
	    const provesEmployeeResourceGroupCeremony =
	      (haystack.includes("erg") || haystack.includes("employee_resource_group")) &&
	      (haystack.includes("veterans") || haystack.includes("veteran") || haystack.includes("memorial_day"));
	    if (provesEmployeeResourceGroupCeremony) return "public_engagement";
	  }
  if (eventKindKey === "community_event" && haystack.includes("employee_resource_group") && haystack.includes("african_american_day_parade")) {
    return "public_engagement";
  }
  if (eventKindKey === "unveiling_ceremony" && haystack.includes("unveiling")) {
    return "milestone";
  }
	  if (eventKindKey === "postponement") {
    const provesGovernancePostponement =
      haystack.includes("postponed_approval") &&
      haystack.includes("lack_of_quorum") &&
      (haystack.includes("committee_work_plan") || haystack.includes("committee_meeting_minutes") || haystack.includes("joint_agency_committee_meeting_minutes"));
    if (provesGovernancePostponement) return "governance";
	    const provesImplementationDeferral =
	      (haystack.includes("implementation_delayed") || haystack.includes("delayed_until") || haystack.includes("postponed_until")) &&
	      (haystack.includes("implementation") || haystack.includes("service") || haystack.includes("launch")) &&
      !haystack.includes("lack_of_quorum") &&
      !haystack.includes("minutes") &&
      !haystack.includes("committee_work_plan") &&
      !haystack.includes("approval_of");
    if (provesImplementationDeferral) return "pause";
  }
  if (eventKindKey === "incident") {
    const provesServiceImpact =
      haystack.includes("temporarily_suspending") ||
      haystack.includes("service_suspended") ||
      haystack.includes("late_trains") ||
      haystack.includes("delayed_customers") ||
      haystack.includes("delay") ||
      haystack.includes("disrupting_service") ||
      haystack.includes("service_restored") ||
      haystack.includes("full_service_restored") ||
      haystack.includes("full_closure") ||
      haystack.includes("allowed_reopening");
    if (provesServiceImpact) return "pause";
  }
  if (eventKindKey === "rescue") {
    const provesRailRightOfWaySafetyRescue =
      (haystack.includes("collapsed_onto_subway_tracks") || haystack.includes("rescued_a_person")) &&
      (haystack.includes("station_agent") || haystack.includes("police_officers") || haystack.includes("train_operator")) &&
      (haystack.includes("subway_tracks") || haystack.includes("elevated_structure"));
    if (provesRailRightOfWaySafetyRescue) return "incident";
  }
  if (eventKindKey === "strike" && haystack.includes("service_is_shut_down")) {
    return "pause";
  }
  if (eventKindKey === "strike_over" && haystack.includes("restore_service")) {
    return "implementation";
  }
  if (eventKindKey === "station_closure" && haystack.includes("closure") && haystack.includes("station")) {
    return "pause";
  }
  if (eventKindKey === "tunnel_closure" && haystack.includes("closure") && haystack.includes("tunnel")) {
    return "pause";
  }
  if (eventKindKey === "signal_upgrade" && haystack.includes("shutdown_of_train_service") && haystack.includes("bus_service")) {
    return "pause";
  }
  if (eventKindKey === "service_incident" && (haystack.includes("removed_from_service") || haystack.includes("fleet_removed_from_service"))) {
    return "pause";
  }
  if (eventKindKey === "maintenance_outage" && haystack.includes("taken_out_of_service") && haystack.includes("returned_to_service")) {
    return "pause";
  }
  if (
    eventKindKey === "weather_disruption" &&
    (haystack.includes("service_suspended") || haystack.includes("service_suspensions") || haystack.includes("delays"))
  ) {
    return "pause";
  }
  if (
    eventKindKey === "natural_disaster" &&
    haystack.includes("service") &&
    (haystack.includes("restored") || haystack.includes("snarling") || haystack.includes("suspension")) &&
    (haystack.includes("flood") || haystack.includes("flooding") || haystack.includes("track") || haystack.includes("tracks"))
  ) {
    return "pause";
  }
  if (eventKindKey === "storm_damage" && haystack.includes("service_suspensions")) {
    return "pause";
  }
  if (
    eventKindKey === "work_resumption" &&
    haystack.includes("work") &&
    (haystack.includes("resume") || haystack.includes("resumed") || haystack.includes("resumption")) &&
    (haystack.includes("right_of_way") || haystack.includes("lirr_expansion"))
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "temporary_bus_lane_installation" &&
    haystack.includes("temporary_bus_lanes_installed") &&
    haystack.includes("shutdown") &&
    (haystack.includes("shuttle") || haystack.includes("shuttles"))
  ) {
    return "implementation";
  }
  if (eventKindKey === "safety_incident") {
    const provesWorkPause =
      haystack.includes("stop_work_order") ||
      haystack.includes("work_suspension") ||
      (haystack.includes("work_activities") && haystack.includes("resume") && haystack.includes("investigation"));
    if (provesWorkPause) return "pause";
  }
  if (eventKindKey === "policy_announcement") {
    const provesImplementationPause =
      haystack.includes("announced") &&
      haystack.includes("pause") &&
      haystack.includes("implementation") &&
      (haystack.includes("central_business_district_tolling_program") || haystack.includes("cbdtp"));
    if (provesImplementationPause) return "pause";
  }
  if (eventKindKey === "weather_event") {
    const provesWeatherDisruption =
      !haystack.includes("maintained_operations") &&
      (haystack.includes("service_disruption") ||
        haystack.includes("disruptions") ||
        haystack.includes("flooding") ||
        haystack.includes("flood") ||
        haystack.includes("late_trains") ||
        haystack.includes("delayed_customers") ||
        haystack.includes("delays") ||
        haystack.includes("canceled") ||
        haystack.includes("cancelled") ||
        haystack.includes("terminated_trains") ||
        haystack.includes("suspension") ||
        haystack.includes("curtailment") ||
        haystack.includes("travel_ban") ||
        haystack.includes("planned_shutdown") ||
        haystack.includes("reduced_monthly_otp") ||
        haystack.includes("posed_challenges"));
    if (provesWeatherDisruption) return "pause";
  }
  if (eventKindKey === "storm") {
    const provesStormServiceImpact =
      !haystack.includes("referenced_as_comparison") &&
      !haystack.includes("maintained_operations") &&
      hasAny(haystack, ["impacting_mta", "subway", "bus", "metro_north", "lirr", "bridges_tunnels", "operations"]);
    if (provesStormServiceImpact) return "pause";
  }
  if (eventKindKey === "delay") {
    const provesProjectOrServiceDelay =
      haystack.includes("delayed_to") || haystack.includes("delayed_until") || haystack.includes("realignment") || haystack.includes("service");
    if (provesProjectOrServiceDelay) return "pause";
  }
  if (eventKindKey === "deferral") {
    const provesFundingDeferral = haystack.includes("deferred") && (haystack.includes("lack_of_funding") || haystack.includes("funding"));
    if (provesFundingDeferral) return "pause";
  }
  if (eventKindKey === "disruption") {
    const provesScheduleDisruption =
      haystack.includes("schedule_revision") || haystack.includes("schedule_revised") || haystack.includes("force_majeure") || haystack.includes("caused_a_4_month");
    if (provesScheduleDisruption) return "pause";
  }
  if (eventKindKey === "potential_strike") {
    const provesPotentialServiceSuspension =
      haystack.includes("strike_could_be_called") && (haystack.includes("suspending_all_lirr_service") || haystack.includes("service_suspension"));
    if (provesPotentialServiceSuspension) return "pause";
  }
  if (
    eventKindKey === "track_maintenance" &&
    (haystack.includes("out_of_service") || haystack.includes("taken_out_of_service") || haystack.includes("bus_service_replaces_train_service"))
  ) {
    return "pause";
  }
  if (eventKindKey === "scheduled_maintenance") {
    const provesBusReplacement =
      (haystack.includes("bus_service") || haystack.includes("buses")) && haystack.includes("replace") && haystack.includes("train_service");
    if (haystack.includes("switch_work") && provesBusReplacement) return "pause";
  }
  if (eventKindKey === "signal_testing") {
    const provesServiceImpact =
      haystack.includes("out_of_service") ||
      haystack.includes("bus_service_replaces_train_service") ||
      haystack.includes("bypass_stops") ||
      haystack.includes("bypasses_stops") ||
      haystack.includes("no_service") ||
      haystack.includes("service_reduced") ||
      haystack.includes("reduced_to_hourly");
    if (provesServiceImpact) return "pause";
  }
	  if (eventKindKey === "delivery") {
	    const provesInstallationImplementation =
	      haystack.includes("installation") &&
      (haystack.includes("begins") || haystack.includes("begin") || haystack.includes("installed")) &&
      !haystack.includes("expected_delivery") &&
      !haystack.includes("remaining");
	    if (provesInstallationImplementation) return "implementation";
	    const provesActualDelivery = haystack.includes("receive") && haystack.includes("delivery") && !haystack.includes("expected_delivery") && !haystack.includes("remaining");
	    if (provesActualDelivery) return "milestone";

	    const provesDeliveryStart =
      (haystack.includes("delivery") || haystack.includes("scheduled_to_be_provided")) &&
      (haystack.includes("scheduled_to_begin") || haystack.includes("scheduled_to_commence") || haystack.includes("scheduled_to_be_provided")) &&
      !haystack.includes("completed") &&
      !haystack.includes("concluding") &&
      !haystack.includes("remaining") &&
	      !haystack.includes("expected_delivery");
	    if (provesDeliveryStart) return "milestone";
	    const provesVehicleDeliveryEndpoint =
	      haystack.includes("delivery") &&
	      (haystack.includes("bus") || haystack.includes("buses") || haystack.includes("nova_bus") || haystack.includes("option_buses")) &&
	      (haystack.includes("scheduled_to_be_completed") ||
	        (haystack.includes("starting") && haystack.includes("concluding")) ||
	        (haystack.includes("begin") && haystack.includes("completed"))) &&
	      !haystack.includes("expected_delivery") &&
	      !haystack.includes("remaining");
	    if (provesVehicleDeliveryEndpoint) return "milestone";
	  }
	  if (eventKindKey === "delivery" && (haystack.includes("delivered_on_schedule") || haystack.includes("delivery_completion"))) {
	    return "implementation";
	  }
	  if (eventKindKey === "delivery_period") {
	    const provesVehicleDeliveryPeriod =
	      haystack.includes("delivery") &&
	      (haystack.includes("scheduled_to_begin") || haystack.includes("begin_delivery") || haystack.includes("begin_in") || haystack.includes("beginning")) &&
	      (haystack.includes("completed") || haystack.includes("completion") || haystack.includes("through") || haystack.includes("concluding")) &&
	      (haystack.includes("locomotive") ||
	        haystack.includes("locomotives") ||
	        haystack.includes("dual_mode") ||
	        haystack.includes("buses") ||
	        haystack.includes("railcars"));
	    if (provesVehicleDeliveryPeriod) return "milestone";
	  }
		  if (eventKindKey === "deployment") {
    const provesDeploymentImplementation =
      haystack.includes("complete_fleetwide_deployment") ||
      haystack.includes("begin_deployment") ||
      haystack.includes("began_deployment") ||
      haystack.includes("hit_the_tracks") ||
      (haystack.includes("deployed") && !hasAny(haystack, ["anticipated", "coming_to", "expected", "planned", "will_be"]));
    if (provesDeploymentImplementation) return "implementation";
  }
  if (eventKindKey === "delivery_complete") {
    const provesDeliveryCompletion = haystack.includes("delivery") && (haystack.includes("complete") || haystack.includes("completed") || haystack.includes("completion"));
    const provesVehicleDelivery =
      haystack.includes("locomotive") ||
      haystack.includes("locomotives") ||
      haystack.includes("dual_mode") ||
      haystack.includes("diesel_battery") ||
      haystack.includes("option_locomotives") ||
      haystack.includes("railcars") ||
      haystack.includes("buses");
    if (provesDeliveryCompletion && provesVehicleDelivery) return "implementation";
  }
  if (eventKindKey === "release" && haystack.includes("released") && (haystack.includes("plan") || haystack.includes("action_plan"))) {
    return "publication";
  }
  if (
    eventKindKey === "announcement" &&
    (haystack.includes("announcement_of_the_release") || haystack.includes("announced_the_release")) &&
    (haystack.includes("plan") || haystack.includes("proposed_final_plan") || haystack.includes("final_plan"))
  ) {
    return "publication";
  }
	  if (eventKindKey === "announcement") {
	    const provesVisionZeroMilestone = haystack.includes("announces_vision_zero_initiative") || haystack.includes("announced_vision_zero_initiative");
	    if (provesVisionZeroMilestone) return "milestone";

	    const provesTransitImprovementSummitPlanning =
	      (haystack.includes("transit_improvement_summit") && haystack.includes("collaborative_effort_to_improve_transit_service")) ||
	      (haystack.includes("launch_planning") && haystack.includes("community_outreach") && haystack.includes("bus_priority_projects"));
	    if (provesTransitImprovementSummitPlanning) return "planning";

	    const provesPlanningAnnouncement =
	      (haystack.includes("announcement") || haystack.includes("announced") || haystack.includes("advance")) &&
	      (((haystack.includes("proposal") || haystack.includes("proposed")) &&
	        (haystack.includes("central_business_district_tolling_program") || haystack.includes("cbdtp"))) ||
	        (haystack.includes("recommendations") &&
	          (haystack.includes("transit_access") || haystack.includes("transit_access_to_laguardia") || haystack.includes("laguardia_airport"))) ||
	        haystack.includes("transit_access") ||
	        haystack.includes("transit_access_to_laguardia") ||
	        haystack.includes("laguardia_airport"));
	    if (provesPlanningAnnouncement) return "planning";

	    const provesAccessibilitySettlement =
	      haystack.includes("class_action_settlement") && haystack.includes("accessibility_advocates") && haystack.includes("reached");
	    const provesProjectRestart = haystack.includes("announced_the_project_restart");
	    if (provesAccessibilitySettlement || provesProjectRestart) return "milestone";
	  }
	  if (eventKindKey === "payment") {
	    const provesMrtEscalatorPayment =
	      (haystack.includes("mrt_2") || haystack.includes("mrt2")) &&
	      haystack.includes("escalator_payments") &&
	      (haystack.includes("statutorily_required") || haystack.includes("dutchess") || haystack.includes("orange") || haystack.includes("rockland"));
	    if (provesMrtEscalatorPayment) return "milestone";
	  }
	  if (eventKindKey === "service_plan_update") {
	    const provesSchedulePlanning =
	      haystack.includes("schedule_adjustment") ||
	      haystack.includes("schedule_adjustments") ||
	      haystack.includes("holiday_service") ||
	      haystack.includes("thanksgiving_holiday_service") ||
	      (haystack.includes("summer_schedule_adjustments") && (haystack.includes("construction") || haystack.includes("trackwork")));
	    if (provesSchedulePlanning) return "planning";
	  }
	  if (eventKindKey === "expansion") {
	    const provesConcreteExpansion =
	      haystack.includes("automated_camera_enforcement") ||
	      haystack.includes("ace_expansion") ||
	      haystack.includes("scout_expansion") ||
	      haystack.includes("more_teams");
	    const isConditionalCustomerExpansion = haystack.includes("if_budget_impact") || haystack.includes("if_budget");
	    if (provesConcreteExpansion && !isConditionalCustomerExpansion) return "implementation";
	  }
	  if (eventKindKey === "conference" && haystack.includes("pre_proposal_conference")) {
	    return "milestone";
	  }
	  if (
	    (eventKindKey === "conference" || eventKindKey === "symposium") &&
	    (haystack.includes("c3rs") || haystack.includes("confidential_close_call_reporting") || haystack.includes("first_mile_last_mile"))
	  ) {
	    return "public_engagement";
		  }
		  if (
		    (eventKindKey === "summit" || eventKindKey === "safety_summit") &&
		    (haystack.includes("on_track_safety_summit") || haystack.includes("rivertowns_summit") || haystack.includes("transit_improvement_summit"))
		  ) {
		    return "public_engagement";
	  }
	  if (
	    eventKindKey === "celebration" &&
	    (haystack.includes("earth_day") || haystack.includes("transit_employee_appreciation") || haystack.includes("national_transit_employee_appreciation"))
	  ) {
	    return "public_engagement";
	  }
	  if (eventKindKey === "project_announcement" && haystack.includes("announced_the_project_restart")) {
	    return "milestone";
	  }
  if (eventKindKey === "solicitation") {
    const hasProcurementSolicitation =
      haystack.includes("solicitation") ||
      haystack.includes("request_for_proposals") ||
      haystack.includes("rfp") ||
      haystack.includes("request_for_information") ||
      haystack.includes("rfi") ||
      haystack.includes("request_for_expression_of_interest") ||
      haystack.includes("rfei");
    const wasIssued = haystack.includes("issued") || haystack.includes("advertised") || haystack.includes("published") || haystack.includes("conducted");
    if (hasProcurementSolicitation && wasIssued) return "milestone";
  }
  if (eventKindKey === "response_deadline") {
    const provesProcurementResponseDeadline =
      haystack.includes("responses_due") && (haystack.includes("rfq") || haystack.includes("request_for_qualifications"));
    if (provesProcurementResponseDeadline) return "milestone";
  }
  if (eventKindKey === "rfq_issued") {
    const provesRfqIssued =
      (haystack.includes("rfq_issued") || haystack.includes("request_for_qualifications_issued") || haystack.includes("issued_request_for_qualifications")) &&
      !haystack.includes("planned") &&
      !haystack.includes("later_this_year") &&
      !haystack.includes("to_be_issued") &&
      !haystack.includes("response_due") &&
      !haystack.includes("deadline");
    if (provesRfqIssued) return "milestone";
  }
  if (eventKindKey === "rfp_deadline") {
    const provesRfpClosingDeadline = haystack.includes("closing_date") && haystack.includes("rfp");
    if (provesRfpClosingDeadline) return "milestone";
  }
  if (eventKindKey === "deployment_deadline") {
    const provesDeploymentDeadline = haystack.includes("deployment_date") || haystack.includes("field_deployment_date");
    if (provesDeploymentDeadline) return "milestone";
  }
  if (eventKindKey === "go_live_deadline") {
    const provesGoLiveDeadline = haystack.includes("go_live") && (haystack.includes("target") || haystack.includes("effective_date"));
    if (provesGoLiveDeadline) return "milestone";
  }
  if (eventKindKey === "target_deadline") {
    const provesTargetEffectiveDeadline =
      haystack.includes("target_date") && (haystack.includes("in_effect") || haystack.includes("automated_revenue_recovery_system"));
    if (provesTargetEffectiveDeadline) return "milestone";
  }
  if (eventKindKey === "option_deadline") {
    const provesOptionExerciseDeadline = haystack.includes("deadline_for_exercising_options") || haystack.includes("exercising_options");
    if (provesOptionExerciseDeadline) return "milestone";
  }
  if (eventKindKey === "compliance_deadline") {
    const provesMandatedComplianceDeadline =
      haystack.includes("deadline_by_which") && (haystack.includes("must_be_equipped") || haystack.includes("mandate"));
    if (provesMandatedComplianceDeadline) return "milestone";
  }
  if (eventKindKey === "deadline") {
    if (haystack.includes("deployment_deadline") && haystack.includes("only_viable_option_to_meet")) return "milestone";
    if (haystack.includes("submissions_due")) return "milestone";
    if (haystack.includes("written_submissions") && haystack.includes("comments")) return "public_engagement";
  }
  const hasSpeculativeFareOrTollChange =
    haystack.includes("proposed") ||
    haystack.includes("proposal") ||
    haystack.includes("projected") ||
    haystack.includes("assumed") ||
    haystack.includes("expected") ||
    haystack.includes("planned") ||
    haystack.includes("forecast") ||
    haystack.includes("reserve") ||
    haystack.includes("withdraw") ||
    haystack.includes("would") ||
    haystack.includes("could");
  if (!hasSpeculativeFareOrTollChange) {
    if (eventKindKey === "fare_change" && haystack.includes("new_fares") && (haystack.includes("take_effect") || haystack.includes("takes_effect"))) {
      return "implementation";
    }
    if (eventKindKey === "tolling_change" && haystack.includes("split_tolling") && haystack.includes("implemented")) {
      return "implementation";
    }
    if (eventKindKey === "tax_rate_change" && haystack.includes("payroll_mobility_tax") && haystack.includes("increased")) {
      return "implementation";
    }
  }
  if (eventKindKey === "fare_increase" && haystack.includes("went_into_effect")) {
    return "implementation";
  }
  if (eventKindKey === "fare_system_change") {
    const provesFareSystemImplementation =
      (haystack.includes("metrocard") && (haystack.includes("no_longer_be_accepted") || haystack.includes("no_longer_be_sold"))) ||
      (haystack.includes("omny") && haystack.includes("fee_promotion") && haystack.includes("will_end"));
    if (provesFareSystemImplementation) return "implementation";
  }
  if (eventKindKey === "appraisal") {
    const provesAppraisalMilestone =
      haystack.includes("appraisal") &&
      (haystack.includes("solicited") ||
        haystack.includes("completed") ||
        haystack.includes("completion") ||
        haystack.includes("commissioned") ||
        haystack.includes("appraised") ||
        haystack.includes("effective_date_of_valuation"));
    if (provesAppraisalMilestone) return "milestone";
  }
  if (eventKindKey === "establishment") {
    const provesAdvisoryCommitteeEstablishment =
      (haystack.includes("advisory_committee_for_transit_accessibility") || haystack.includes("acta")) &&
      haystack.includes("established") &&
      haystack.includes("successor");
    if (provesAdvisoryCommitteeEstablishment) return "milestone";
  }
  if (eventKindKey === "operational_status") {
    const provesFullPtcOperations =
      haystack.includes("all") &&
      haystack.includes("trains") &&
      haystack.includes("operating") &&
      haystack.includes("full_ptc_functionality");
    if (provesFullPtcOperations) return "implementation";
  }
  if (eventKindKey === "planned" && haystack.includes("spruce_up_stations") && haystack.includes("lirr_station_spruce_up_program")) {
    return "planning";
  }
  if (
    eventKindKey === "street_conversion" &&
    hasAny(haystack, ["one_way_to_two_way", "two_way"]) &&
    hasAny(haystack, ["conversion", "converted"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "street_change" && hasAny(haystack, ["parking_opportunities_added", "replaced_with_parking", "addition_of_angled_parking"])) {
    return "implementation";
  }
  if (eventKindKey === "panel_creation" && haystack.includes("blue_ribbon_panel") && haystack.includes("fare_evasion")) {
    return "milestone";
  }
  if (
    eventKindKey === "mobilization" &&
    hasAny(haystack, ["mobilization_starting", "starting"]) &&
    hasAny(haystack, ["ada", "accessible"]) &&
    hasAny(haystack, ["new_ada_stations", "stations"])
  ) {
    return "construction";
  }
  if (eventKindKey === "ongoing_obligation" && haystack.includes("ptasp") && haystack.includes("annual_review") && haystack.includes("board")) {
    return "governance";
  }
  if (eventKindKey === "annual_update" && hasAny(haystack, ["agency_safety_plan", "system_safety", "dept_of_buses_agency_safety_plan"])) {
    return "publication";
  }
  if (
    eventKindKey === "platform_repair" &&
    hasAny(haystack, ["out_of_service", "taken_out_of_service"]) &&
    hasAny(haystack, ["bypass", "bypasses", "reduced_service"])
  ) {
    return "pause";
  }
  if (
    eventKindKey === "special_schedule" &&
    haystack.includes("yankee_stadium") &&
    haystack.includes("metro_north") &&
    hasAny(haystack, ["provides", "service"]) &&
    hasAny(haystack, ["mlb", "concert", "operating_schedule_order"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "pilot_extension" &&
    haystack.includes("e_hail") &&
    hasAny(haystack, ["extension", "extended"]) &&
    hasAny(haystack, ["pilot_program", "participating_customers"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "planned_upgrade" && haystack.includes("planned_upgrade_work") && haystack.includes("out_of_service")) {
    return "pause";
  }
  if (eventKindKey === "program_extension" && haystack.includes("pre_boarding_ticket_validation") && haystack.includes("extended")) {
    return "implementation";
  }
  if (eventKindKey === "in_service_date" && haystack.includes("planned_in_service_date") && hasAny(haystack, ["third_track", "lirr_main_line"])) {
    return "planning";
  }
  if (eventKindKey === "timetable_update" && hasAny(haystack, ["timetable", "schedule_adjustment", "schedule_adjustments"])) {
    return "implementation";
  }
  if (eventKindKey === "technology_upgrade" && haystack.includes("installation") && haystack.includes("complete") && hasAny(haystack, ["ipad", "gps_units"])) {
    return "implementation";
  }
  if (
    eventKindKey === "inspection_and_maintenance" &&
    hasAny(haystack, ["inspection", "maintenance"]) &&
    hasAny(haystack, ["service_reduced", "reduced_to_hourly", "out_of_service"])
  ) {
    return "pause";
  }
  if (
    eventKindKey === "maintenance" &&
    hasAny(haystack, ["grand_central_madison", "contractor_maintenance"]) &&
    haystack.includes("out_of_service")
  ) {
    return "pause";
  }
  if (
    eventKindKey === "pilot_phase_start" &&
    haystack.includes("e_hail") &&
    hasAny(haystack, ["began_phase_2", "phase_2_start"]) &&
    hasAny(haystack, ["rides_per_customer", "subsidy"])
  ) {
    return "launch";
  }
  if (eventKindKey === "pilot_renewal" && hasAny(haystack, ["pilots_renewed", "renewed"]) && hasAny(haystack, ["audio_announcements", "advertising"])) {
    return "implementation";
  }
  if (
    eventKindKey === "track_work_program" &&
    hasAny(haystack, ["track_work_program", "trackwork"]) &&
    hasAny(haystack, ["out_of_service", "all_tracks_out_of_service"])
  ) {
    return "pause";
  }
  if (
    eventKindKey === "operational_control_transfer" &&
    hasAny(haystack, ["operational_control", "turned_operational_control_over"]) &&
    hasAny(haystack, ["major_work_complete", "complete"])
  ) {
    return "milestone";
  }
  if (
    (eventKindKey === "regulatory_change" || eventKindKey === "regulation_change") &&
    hasAny(haystack, ["before", "after", "changed", "modifications"]) &&
    hasAny(haystack, ["bridge_opening", "speed_limit"])
  ) {
    return "implementation";
  }
  if (eventKindKey === "regulation_enactment" && hasAny(haystack, ["enacted", "establishing"]) && hasAny(haystack, ["regulation", "nycrr"])) {
    return "legislation";
  }
  if (eventKindKey === "regulatory_certification" && haystack.includes("ulurp") && haystack.includes("certification")) {
    return "approval";
  }
  if (eventKindKey === "service" && haystack.includes("holiday_lights_train") && haystack.includes("began_service")) {
    return "launch";
  }
  if (
    eventKindKey === "service_live_date" &&
    hasAny(haystack, ["will_provide", "beginning_tonight"]) &&
    hasAny(haystack, ["super_express_train", "new_haven_line"])
  ) {
    return "launch";
  }
  if (
    ["planned_software_release", "software_release_scheduled"].includes(eventKindKey) &&
    hasAny(haystack, ["software_release", "software_modifications"]) &&
    hasAny(haystack, ["expected", "scheduled"])
  ) {
    return "planning";
  }
  if (eventKindKey === "commissioning_scheduled" && hasAny(haystack, ["commissioning_scheduled", "scheduled"]) && hasAny(haystack, ["cp_230", "new_haven_line"])) {
    return "planning";
  }
  if (eventKindKey === "work_start" && hasAny(haystack, ["work_will_commence", "will_commence"]) && hasAny(haystack, ["s_program", "carryover"])) {
    return "construction";
  }
  if (eventKindKey === "policy_release" && haystack.includes("planyc") && haystack.includes("released") && haystack.includes("brt")) {
    return "publication";
  }
  if (
    eventKindKey === "extra_service" &&
    hasAny(haystack, ["extra_service", "provide_extra_service"]) &&
    hasAny(haystack, ["lirr", "parade", "customers_travelling"])
  ) {
    return "implementation";
  }
  if (
    eventKindKey === "weather_event" &&
    hasAny(haystack, ["tropical_storm_ophelia", "historic_rainfall"]) &&
    hasAny(haystack, ["impact_to_subway_operations", "subway_operations"])
  ) {
    return "pause";
  }
  if (eventKindKey === "fare_increase" && haystack.includes("effective_september_1_2025") && haystack.includes("new_haven_line")) {
    return "implementation";
  }
  if (
    eventKindKey === "fare_increase" &&
    haystack.includes("new_haven_line") &&
    hasAny(haystack, ["connecticut_portion", "connecticut_stations", "to_from_connecticut_stations", "travel_to_or_from_connecticut_stations"]) &&
    hasAny(haystack, ["5_fare_increase", "5_percent_fare_increase", "five_percent_fare_increase"]) &&
    !hasAny(haystack, ["went_into_effect", "take_effect", "takes_effect"])
  ) {
    return "planning";
  }
  if (
    eventKindKey === "budget_enactment" &&
    haystack.includes("new_york_state_fiscal_year_2023_2024_budget_enacted") &&
    hasAny(haystack, ["payroll_mobility_tax", "state_aid", "paratransit_services"])
  ) {
    return "legislation";
  }
  if (eventKindKey === "resolution" && haystack.includes("resolution_adopted_by_the_board") && haystack.includes("authorizing") && haystack.includes("wzse_program")) {
    return "approval";
  }
  if (eventKindKey === "executive_session" && haystack.includes("board_voted_affirmatively") && haystack.includes("labor_agreements")) {
    return "approval";
  }
  if (eventKindKey === "restriction_start" && haystack.includes("southbound_bus_and_truck_only") && haystack.includes("sbto") && haystack.includes("main_street")) {
    return "implementation";
  }

  return undefined;
}

/** Pick the best available raw date literal (in precedence order) and return its normalized form
 *  only when it parses to an ISO value. Shared by the event and source scalar-date promotions. */
function bestNormalizedDateWithField(payload: JsonObject, fields: readonly string[]): { field: string; normalized: JsonObject } | undefined {
  for (const field of fields) {
    const value = payload[field];
    const text = typeof value === "number" ? String(value) : stringValue(value);
    if (!text) continue;
    const normalized = normalizeDateText(text);
    if (typeof normalized.normalized_date === "string") return { field, normalized };
  }
  return undefined;
}

function bestNormalizedDate(payload: JsonObject, fields: readonly string[]): JsonObject | undefined {
  return bestNormalizedDateWithField(payload, fields)?.normalized;
}

const EVENT_DATE_FIELDS = ["event_date", "date", "date_text", "year"] as const;

/** Map event_kind/event_family toward the bounded C2.1 lifecycle taxonomy. Returns `other` with the
 *  raw event_kind for passthrough when nothing matches (mirrors the event_family fallback). */
function normalizeLifecyclePhase(eventKind: string, eventFamily: string | undefined): { phase: string; passthrough?: string } {
  const key = normalizedToken(eventKind);
  const has = (...subs: string[]) => subs.some((sub) => key.includes(sub));
  if (has("cancel", "abandon", "terminat", "scrapped", "withdrawn")) return { phase: "cancelled" };
  if (has("complete", "completion", "permanent_designation", "finished", "opened", "operational")) return { phase: "completed" };
  if (has("resume", "restart", "reinstat", "restor") || key === "return_to_service" || key === "service_resumption") return { phase: "resumed" };
  if (has("suspend", "pause", "halt", "stop_work")) return { phase: "suspended" };
  if (has("expansion", "expanded", "extension", "extended")) return { phase: "expanded" };
  if (has("pilot")) return { phase: "piloted" };
  if (has("launch", "service_start", "service_availability", "go_live", "opening", "inaugurat")) return { phase: "launched" };
  if (has("install")) return { phase: "installed" };
  if (has("construction", "groundbreak", "build_start")) return { phase: "construction" };
  if (has("fund", "grant_award", "appropriat")) return { phase: "funded" };
  if (has("approval", "approved", "vote", "enacted", "adopted")) return { phase: "approved" };
  if (has("planned", "scheduled", "future_plan", "commitment")) return { phase: "planned" };
  if (has("study", "studied", "feasibility", "analysis")) return { phase: "studied" };
  if (key === "bid_submission") return { phase: "proposed" };
  if (has("propose", "proposal", "draft", "concept")) return { phase: "proposed" };
  if (has("modif", "service_change", "policy_change", "redesign", "adjustment", "improvement")) return { phase: "modified" };
  // Secondary signal: the already-normalized event_family, where it is unambiguous about phase.
  if (eventFamily === "construction") return { phase: "construction" };
  if (eventFamily === "launch") return { phase: "launched" };
  return { phase: "other", passthrough: eventKind.trim() };
}

function normalizeEventPayload(payload: JsonObject, context?: NormalizationContext): JsonObject {
  const next: JsonObject = { ...payload };
  const existingEventFamily = stringValue(payload.event_family);
  if (existingEventFamily) {
    const canonicalFamily = normalizeLegacyEventFamily(existingEventFamily);
    if (canonicalFamily !== undefined) next.event_family = canonicalFamily;
  }
  const eventKind = stringValue(payload.event_kind);
  if (eventKind) {
    const eventFamily = normalizeEventKind(eventKind);
    const payloadEventFamily = normalizeEventFamilyFromPayload(payload, context);
    if ((eventFamily === "governance" || eventFamily === "incident") && payloadEventFamily !== undefined) {
      addIfMissingOrOther(next, "event_family", payloadEventFamily);
      addIfMissingOrOther(next, "event_family", eventFamily);
    } else {
      addIfMissingOrOther(next, "event_family", eventFamily);
      addIfMissingOrOther(next, "event_family", payloadEventFamily);
    }
    const { phase, passthrough } = normalizeLifecyclePhase(eventKind, stringValue(next.event_family));
    addIfMissingOrOther(next, "lifecycle_phase", phase);
    if (passthrough && (next.lifecycle_phase_other === undefined || next.lifecycle_phase_other === eventKind)) addIfMissing(next, "lifecycle_phase_other", passthrough);
    if (!passthrough && next.lifecycle_phase_other === eventKind) delete next.lifecycle_phase_other;
  }

  // Promote a scalar normalized date + precision for lifecycle ordering. The scalar must win the
  // `date_normalized` key over the generic object form — both for fresh payloads (this runs before
  // normalizeDateFields) and for journals re-normalized at materialize time, whose stored payload
  // already carries the old object under `date_normalized`. So overwrite when the existing value is
  // not already a scalar string (the object has no consumers — verified in S2.1). The generic
  // per-field date objects (event_date_normalized, …) are untouched.
  const best = bestNormalizedDate(payload, EVENT_DATE_FIELDS);
  if (best) {
    if (typeof next.date_normalized !== "string") next.date_normalized = best.normalized_date;
    addIfMissing(next, "date_precision", best.precision);
  } else {
    addIfMissing(next, "date_precision", "unknown");
  }
  return next;
}

function normalizeLegacyEventFamily(value: string) {
  const key = normalizedToken(value);
  if (key === "press_release") return "publication";
  if (key === "postponement") return "pause";
  if (key === "tolling_program_commencement") return "launch";
  return undefined;
}

function normalizeTreatmentKind(value: string) {
  const key = normalizedToken(value);
  const exactFamily = new Map<string, string>([
    ["branding", "customer_information"],
    ["advanced_payment", "fare_collection"],
    ["all_electronic_open_road_tolling", "fare_collection"],
    ["automated_revenue_recovery_system", "fare_collection"],
    ["autonomous_pantograph_dispenser", "vehicle_or_fleet"],
    ["autonomous_track_inspection", "capital_or_infrastructure"],
    ["beacon", "safety"],
    ["back_cocking_removal", "safety"],
    ["back_office_system", "fare_collection"],
    ["backflow_prevention", "capital_or_infrastructure"],
    ["blue_lighting", "capital_or_infrastructure"],
    ["bollard_installation", "bus_lane"],
    ["bridge_rehabilitation", "capital_or_infrastructure"],
    ["bridge_replacement", "capital_or_infrastructure"],
    ["bus_and_truck_only_lane", "bus_lane"],
    ["bus_equipment", "vehicle_or_fleet"],
    ["bus_interior_modification", "vehicle_or_fleet"],
    ["bus_and_truck_priority_lane", "bus_lane"],
    ["bus_contra_flow_lane", "bus_lane"],
    ["bus_design", "vehicle_or_fleet"],
    ["bus_layover_reconfiguration", "service_pattern"],
    ["bus_layover_space", "service_pattern"],
    ["bus_only_lane", "bus_lane"],
    ["bus_only_lanes", "bus_lane"],
    ["bus_only_tunnel", "traffic_restriction"],
    ["bus_operator_compartment_doors", "vehicle_or_fleet"],
    ["bus_operator_simulator", "vehicle_or_fleet"],
    ["bus_operator_barrier", "vehicle_or_fleet"],
    ["bus_operator_protection", "vehicle_or_fleet"],
    ["bus_priority_lane", "bus_lane"],
    ["bus_time_wayfinding_panel", "customer_information"],
    ["bus_tunnel", "traffic_restriction"],
    ["bus_tunnel_one_way", "traffic_restriction"],
    ["bus_tunnel_two_way", "traffic_restriction"],
    ["bus_validator_mounting_bracket", "vehicle_or_fleet"],
    ["cng_fueling_facility", "vehicle_or_fleet"],
    ["communications_based_train_control", "capital_or_infrastructure"],
    ["communications_based_train_control_cbtc", "capital_or_infrastructure"],
    ["construction_zone", "capital_or_infrastructure"],
    ["crosswalk", "pedestrian_or_accessibility"],
    ["crossing_renewal", "capital_or_infrastructure"],
    ["catch_basin_cleaning", "capital_or_infrastructure"],
    ["cctv_video_analytics", "safety"],
    ["customer_display", "customer_information"],
    ["cut_and_cover_excavation", "capital_or_infrastructure"],
    ["daylighting", "pedestrian_or_accessibility"],
    ["dc_electrical_substation", "capital_or_infrastructure"],
    ["delivery_window", "curb_management"],
    ["delivery_windows", "curb_management"],
    ["delivery_zone", "curb_management"],
    ["delivery_zones", "curb_management"],
    ["delayed_egress", "safety"],
    ["delayed_egress_rollout", "safety"],
    ["detectable_warning_strip_installation", "pedestrian_or_accessibility"],
    ["detectable_warning_strips", "pedestrian_or_accessibility"],
    ["digital_information_screen", "customer_information"],
    ["drainage_and_surfacing", "capital_or_infrastructure"],
    ["drainage_capacity_upgrade", "capital_or_infrastructure"],
    ["e_mirrors", "vehicle_or_fleet"],
    ["electric_bus", "vehicle_or_fleet"],
    ["electric_substation_construction", "capital_or_infrastructure"],
    ["elevator", "pedestrian_or_accessibility"],
    ["elevator_installation", "pedestrian_or_accessibility"],
    ["elevator_installation_and_replacement", "pedestrian_or_accessibility"],
    ["elevator_rehabilitation", "pedestrian_or_accessibility"],
    ["enhanced_stations", "bus_stop_or_boarding"],
    ["enclosed_operator_compartments", "vehicle_or_fleet"],
    ["energy_management_system", "capital_or_infrastructure"],
    ["entrance_reconfiguration", "pedestrian_or_accessibility"],
    ["elevated_cable_bridge", "capital_or_infrastructure"],
    ["elevated_substation", "capital_or_infrastructure"],
    ["encampment_removal", "safety"],
    ["fire_suppression_system_replacement", "capital_or_infrastructure"],
    ["flood_protection", "capital_or_infrastructure"],
    ["flood_wall", "capital_or_infrastructure"],
    ["flexible_bollards", "bus_lane"],
    ["gate_alarm_reactivation", "safety"],
    ["gate_delay_modification", "safety"],
    ["gate_guards", "safety"],
    ["grade_crossing_repair", "capital_or_infrastructure"],
    ["grade_crossing_replacement", "capital_or_infrastructure"],
    ["hearing_loops", "pedestrian_or_accessibility"],
    ["help_point", "pedestrian_or_accessibility"],
    ["help_point_installation", "pedestrian_or_accessibility"],
    ["help_point_intercoms", "pedestrian_or_accessibility"],
    ["high_security_fencing", "safety"],
    ["horizontal_alignment_modification", "capital_or_infrastructure"],
    ["improved_passenger_information", "customer_information"],
    ["improved_station_amenities", "bus_stop_or_boarding"],
    ["information_display", "customer_information"],
    ["inspection_car", "capital_or_infrastructure"],
    ["larger_buses", "vehicle_or_fleet"],
    ["leading_bus_interval", "signal_priority"],
    ["lane_configuration", "capital_or_infrastructure"],
    ["lane_conversion", "capital_or_infrastructure"],
    ["lane_reconfiguration", "capital_or_infrastructure"],
    ["lane_realignment", "capital_or_infrastructure"],
    ["lane_realignments", "capital_or_infrastructure"],
    ["lane_widening", "capital_or_infrastructure"],
    ["limited_stop_discontinuation", "service_pattern"],
    ["laser_intrusion_detection_system", "safety"],
    ["laser_train", "vehicle_or_fleet"],
    ["lock_replacement", "safety"],
    ["low_floor_articulated_bus", "vehicle_or_fleet"],
    ["low_floor_bus", "vehicle_or_fleet"],
    ["low_floor_buses", "vehicle_or_fleet"],
    ["low_floor_three_door_bus", "vehicle_or_fleet"],
    ["low_floor_three_door_articulated_buses", "vehicle_or_fleet"],
    ["mechanical_closure_device", "capital_or_infrastructure"],
	    ["mta_trip_planner", "customer_information"],
	    ["mural", "amenity_or_public_art"],
	    ["navilens", "pedestrian_or_accessibility"],
    ["new_bus_fleet", "vehicle_or_fleet"],
    ["new_entrance", "pedestrian_or_accessibility"],
    ["new_gate_deployment", "safety"],
    ["new_low_floor_buses", "vehicle_or_fleet"],
    ["new_two_way_operation", "capital_or_infrastructure"],
    ["no_standing_regulation", "curb_management"],
    ["operator_barrier", "vehicle_or_fleet"],
    ["passenger_counting", "customer_information"],
    ["passenger_counting_technology", "customer_information"],
    ["passenger_info", "customer_information"],
    ["passenger_information", "customer_information"],
    ["passenger_information_display", "customer_information"],
    ["paint_removal", "capital_or_infrastructure"],
    ["physical_separation", "bus_lane"],
    ["physical_protection", "bus_lane"],
    ["platform_barrier", "safety"],
    ["platform_barriers", "safety"],
    ["platform_bollards", "safety"],
    ["platform_edge_barrier", "safety"],
    ["platform_heating", "capital_or_infrastructure"],
    ["platform_replacement", "capital_or_infrastructure"],
    ["platform_safety_barrier", "safety"],
    ["platform_screen_doors", "safety"],
    ["police_deployment", "safety"],
    ["power_system_upgrade", "capital_or_infrastructure"],
    ["pre_payment", "fare_collection"],
    ["positive_train_control_data_radios", "capital_or_infrastructure"],
    ["predictive_maintenance", "capital_or_infrastructure"],
    ["pump_room", "capital_or_infrastructure"],
    ["public_address_system_installation", "customer_information"],
    ["quick_kurb", "bus_lane"],
    ["qwik_kurb", "bus_lane"],
    ["proposed_bus_tunnel", "traffic_restriction"],
    ["public_realm_improvement", "pedestrian_or_accessibility"],
    ["raised_crosswalk", "pedestrian_or_accessibility"],
    ["raised_step", "pedestrian_or_accessibility"],
    ["raised_vents", "capital_or_infrastructure"],
    ["rail_maintenance", "capital_or_infrastructure"],
    ["rail_washer_train", "vehicle_or_fleet"],
    ["railroad_crossing_rehabilitation", "capital_or_infrastructure"],
    ["rapid_roll_up_doors", "capital_or_infrastructure"],
    ["regulation_change", "traffic_restriction"],
    ["real_time_arrival_information", "customer_information"],
    ["real_time_bus_arrival_information", "customer_information"],
    ["real_time_bus_arrival_signs", "customer_information"],
    ["real_time_bus_information", "customer_information"],
    ["real_time_bus_information_system", "customer_information"],
    ["real_time_information", "customer_information"],
    ["real_time_information_system", "customer_information"],
    ["refuge_island", "pedestrian_or_accessibility"],
    ["regenerative_braking", "vehicle_or_fleet"],
    ["revenue_recovery_system", "fare_collection"],
    ["security_monitor_screens", "safety"],
    ["security_system_installation", "safety"],
    ["security_upgrade", "safety"],
    ["sensor_replacement", "safety"],
    ["revised_station_spacing", "service_pattern"],
    ["road_reconfiguration", "capital_or_infrastructure"],
    ["roadway_improvement", "capital_or_infrastructure"],
    ["road_resurfacing", "capital_or_infrastructure"],
    ["roadway_redesign", "capital_or_infrastructure"],
    ["roadway_reconfiguration", "capital_or_infrastructure"],
    ["road_change", "capital_or_infrastructure"],
    ["route_re_alignment", "service_pattern"],
    ["route_optimization", "service_pattern"],
    ["route_reroute", "service_pattern"],
    ["route_rerouting", "service_pattern"],
    ["route_segment_discontinuation_and_replacement", "service_pattern"],
    ["route_shortening", "service_pattern"],
    ["route_truncation", "service_pattern"],
    ["routing_change", "service_pattern"],
    ["selective_milling", "capital_or_infrastructure"],
    ["sewer_cleaning", "capital_or_infrastructure"],
    ["shelter_shed_upgrade", "capital_or_infrastructure"],
    ["slip_lane", "traffic_restriction"],
    ["slip_lane_adjustment", "traffic_restriction"],
    ["slip_lane_closure", "traffic_restriction"],
    ["speed_bump", "safety"],
    ["stair_upgrade", "pedestrian_or_accessibility"],
    ["staircase_ramp_installation", "pedestrian_or_accessibility"],
    ["station_amenities", "bus_stop_or_boarding"],
    ["station_building_improvement", "capital_or_infrastructure"],
    ["station_consolidation", "bus_stop_or_boarding"],
    ["station_construction", "capital_or_infrastructure"],
    ["station_enhancement", "capital_or_infrastructure"],
    ["station_improvement", "capital_or_infrastructure"],
    ["station_design", "bus_stop_or_boarding"],
    ["station_lighting", "capital_or_infrastructure"],
	    ["station_lighting_upgrade", "capital_or_infrastructure"],
	    ["station_renewal_cleaning", "capital_or_infrastructure"],
	    ["structural_rehabilitation", "capital_or_infrastructure"],
	    ["subway_connection", "customer_information"],
	    ["surveillance_and_barriers", "safety"],
    ["street_design", "capital_or_infrastructure"],
    ["street_design_changes", "capital_or_infrastructure"],
    ["street_design_improvements", "capital_or_infrastructure"],
    ["street_direction_change", "capital_or_infrastructure"],
    ["street_direction_reversal", "capital_or_infrastructure"],
    ["street_reconfiguration", "capital_or_infrastructure"],
    ["street_resurfacing", "capital_or_infrastructure"],
    ["street_reversal", "capital_or_infrastructure"],
    ["street_treatment", "capital_or_infrastructure"],
    ["street_closure", "traffic_restriction"],
    ["street_tree", "pedestrian_or_accessibility"],
    ["shared_street", "traffic_restriction"],
    ["streetscape_improvement", "pedestrian_or_accessibility"],
    ["substation_easement", "capital_or_infrastructure"],
    ["substation_feeders", "capital_or_infrastructure"],
    ["switch_inspection", "capital_or_infrastructure"],
    ["switch_installation", "capital_or_infrastructure"],
    ["switch_installations", "capital_or_infrastructure"],
    ["switch_maintenance", "capital_or_infrastructure"],
    ["tactile_warning_strips", "pedestrian_or_accessibility"],
    ["taxi_stand_relocation", "curb_management"],
    ["ticket_checking", "fare_collection"],
    ["ticket_vending_machine_installation", "fare_collection"],
    ["toll_detection_system", "fare_collection"],
    ["toll_payment_system", "fare_collection"],
    ["tolling_system_replacement", "fare_collection"],
    ["track_construction", "capital_or_infrastructure"],
    ["track_geometry_inspection", "capital_or_infrastructure"],
    ["track_geometry_measurement", "capital_or_infrastructure"],
    ["track_intrusion_detection_system", "safety"],
    ["track_maintenance", "capital_or_infrastructure"],
    ["tree_transplant", "pedestrian_or_accessibility"],
    ["transit_boulevard_design", "capital_or_infrastructure"],
    ["transit_freight_priority_street", "traffic_restriction"],
    ["transitway", "busway"],
    ["tunnel_sealing", "capital_or_infrastructure"],
    ["two_way_conversion", "capital_or_infrastructure"],
    ["ultrasonic_rail_testing", "capital_or_infrastructure"],
    ["unarmed_gate_guards", "safety"],
    ["upgraded_crosswalk", "pedestrian_or_accessibility"],
    ["upgraded_crosswalks", "pedestrian_or_accessibility"],
    ["utility_conduit_sealing", "capital_or_infrastructure"],
	    ["video_surveillance", "safety"],
	    ["vending_machine_installation", "amenity_or_public_art"],
	    ["visual_inspection", "capital_or_infrastructure"],
    ["wayfinding", "customer_information"],
    ["wayfinding_panel", "customer_information"],
    ["wayfinding_pilot", "pedestrian_or_accessibility"],
    ["wayfinding_sign", "customer_information"],
    ["widen_reconfigure_travel_lanes", "capital_or_infrastructure"],
    ["wide_aisle_gates", "pedestrian_or_accessibility"],
    ["greening", "pedestrian_or_accessibility"],
    ["mid_block_crossing", "pedestrian_or_accessibility"],
    ["pavement_replacement", "capital_or_infrastructure"],
    ["resurfacing", "capital_or_infrastructure"],
    ["rubber_speed_bumps", "safety"],
    ["shortened_crossing", "pedestrian_or_accessibility"],
    ["stop_bar_recess", "signage_and_markings"],
    ["walkway_and_ramp_improvements", "pedestrian_or_accessibility"],
    ["walkability_enhancements", "pedestrian_or_accessibility"],
    ["wind_protection", "capital_or_infrastructure"],
    ["yard_improvement", "capital_or_infrastructure"],
    ["canopy_installation", "capital_or_infrastructure"],
    ["led_lighting", "capital_or_infrastructure"],
    ["lighting_upgrade", "capital_or_infrastructure"],
    ["restroom_improvement", "capital_or_infrastructure"],
  ]).get(key);
  if (exactFamily) return exactFamily;

  if (
    [
      "brt_station",
      "bus_island_station",
      "bus_lay_by",
      "bus_lay_by_lane",
      "bus_only_station_areas",
      "bus_pad",
      "bus_pads",
      "bus_shelter",
      "bus_station",
      "capital_improvements_at_sbs_stations",
      "express_bus_station",
      "improve_stop_spacing",
      "improved_bus_stations",
      "limited_stops",
      "proposed_local_stop",
      "proposed_sbs_stop",
      "reconfigured_bus_stations",
      "sbs_station",
      "sbs_stop_amenities",
      "shelter",
      "shelters_and_benches",
      "station_shelter",
      "stop_adjustment",
      "stop_change",
      "stop_consolidation",
      "stop_discontinuation",
      "stop_optimization",
      "stop_relocation",
      "stop_removal",
      "stop_spacing_optimization",
    ].includes(key)
  ) {
    return "bus_stop_or_boarding";
  }
  if (key.includes("bus_lane") || key.includes("protected_bus_lane")) return "bus_lane";
  if (key.includes("busway")) return "busway";
  if (key.includes("enforcement") || key.includes("camera")) return "enforcement";
  if (key.includes("curb") || key.includes("loading") || key.includes("parking")) return "curb_management";
  if (key.includes("turn") || key.includes("restriction") || key.includes("access") || key.includes("through_trip") || key.includes("traffic")) return "traffic_restriction";
  if (key.includes("bus_stop") || key.includes("boarding") || key.includes("bus_bulb") || key.includes("boarder")) return "bus_stop_or_boarding";
  if (key.includes("signal") || key.includes("queue_jump") || key.includes("tsp")) return "signal_priority";
  if (key.includes("pedestrian") || key.includes("neckdown") || key.includes("ada")) return "pedestrian_or_accessibility";
  if (key.includes("signage") || key.includes("marking")) return "signage_and_markings";
  if (key.includes("bike") || key.includes("bicycle")) return "bike_facility";
  if (key.includes("fare")) return "fare_collection";
  if (key.includes("route_type") || key.includes("service") || key.includes("detour") || key.includes("alternative_route") || key.includes("route_change")) return "service_pattern";
  if (key.includes("safety")) return "safety";
  if (key.includes("vehicle")) return "vehicle_or_fleet";
  if (
    key.includes("infrastructure") ||
    key.includes("reconstruction") ||
    key.includes("median") ||
    key.includes("intersection") ||
    key.includes("street_conversion") ||
    key.includes("sidewalk") ||
    key.includes("landscaping")
  ) {
    return "capital_or_infrastructure";
  }
  if (key.includes("customer_information") || key.includes("real_time_passenger_information") || key.includes("amenity")) return "customer_information";
  if (key.includes("monitoring")) return "monitoring";
  return "other";
}

function normalizeTreatmentFamilyFromPayload(payload: JsonObject): string | undefined {
  const kind = stringValue(payload.treatment_kind);
  if (!kind) return undefined;
  const kindKey = normalizedToken(kind);

  const description = stringValue(payload.description);
  const key = normalizedToken(description ?? "");

  if (kindKey === "physical_modification") {
    if (["back_cocking", "delayed_egress", "turnstile", "sleeves", "fins"].some((signal) => key.includes(signal))) return "safety";
    return undefined;
  }

  if (kindKey === "cleaning_initiative") {
    const hasStationRenewalSignal =
      key.includes("power_washing_and_heavy_duty_cleaning") ||
      key.includes("station_building") ||
      key.includes("shelter_shed") ||
      key.includes("led_lighting") ||
      key.includes("station_signage");
    if (hasStationRenewalSignal) return "capital_or_infrastructure";
  }

  if (kindKey === "renovation" && key.includes("re_new_vation")) return "capital_or_infrastructure";

  if (kindKey === "station" || kindKey === "stations") {
    const hasBusStationContext = ["sbs", "brt", "bus", "curbside"].some((signal) => key.includes(signal));
    const hasBoardingFeature = ["shelter", "fare_collection", "fare_machine", "ticket_vending", "bus_bulb", "boarding", "passenger_info"].some((signal) =>
      key.includes(signal),
    );
    if (hasBusStationContext && hasBoardingFeature) return "bus_stop_or_boarding";
  }

  if (kindKey === "repair") {
    const haystack = normalizedToken(
      [
        description,
        stringValue(payload.label),
        stringValue(payload.name),
        stringValue(payload.location_text),
        stringValue(payload.locations),
        ...stringArrayValues(payload.locations),
        stringValue(payload.raw_text),
      ]
        .filter((value): value is string => value !== undefined)
        .join(" "),
    );
    const tokens = new Set(haystack.split("_").filter(Boolean));
    const hasVerticalCirculationAsset = tokens.has("esc") || tokens.has("elevator") || tokens.has("escalator");
    const hasEscalatorRepairSignal = [
      "bull_gear",
      "comb_plate",
      "emergency_stop",
      "frequency_drive",
      "gear_box",
      "handrail",
      "main_valve",
      "reverse_phase_relay",
      "step_chain",
    ].some((signal) => haystack.includes(signal));
    if (hasVerticalCirculationAsset || hasEscalatorRepairSignal) return "pedestrian_or_accessibility";
  }

  if (kindKey === "cross_section" && key.includes("existing_and_proposed_street_layout")) return "capital_or_infrastructure";
  if (kindKey === "draft_plan" && key.includes("existing_and_proposed_street_layout")) return "capital_or_infrastructure";
  if (kindKey === "draft_plan" && key.startsWith("draft_plan_for_") && key.includes("_intersection")) {
    const locationKey = normalizedToken(stringValue(payload.location_text) ?? "");
    if (locationKey.includes("_at_") && key.includes(locationKey)) return "capital_or_infrastructure";
  }
  if (kindKey === "draft_plan" && key.includes("traffic_signage") && key.includes("signs_indicate")) return "signage_and_markings";

  if (kindKey === "key_design_piece") {
    if (key.includes("bus_lane_replaces_parking_lane")) return "bus_lane";
    if (key.includes("widening_of_travel_lanes") || key.includes("intersection_redesign")) return "capital_or_infrastructure";
    if (key.includes("ada_accessible_bus_stops") && key.includes("landing_platforms")) return "bus_stop_or_boarding";
  }

  if (kindKey === "capital_improvements" && key.includes("capital_improvements_at_sbs_stations")) {
    return "bus_stop_or_boarding";
  }
  if (
    (kindKey === "capital_improvements" || kindKey === "capital_project") &&
    key.includes("medians") &&
    key.includes("streetscaping") &&
    key.includes("bus_bulbs")
  ) {
    return "capital_or_infrastructure";
  }
  if (
    kindKey === "capital_project" &&
    key.includes("great_streets_capital_toolkit") &&
    hasAny(key, ["pedestrian_safety_improvements", "safety_improvements_for_all_road_users"]) &&
    hasAny(key, ["curb_extensions", "widened_medians", "realignment_of_dangerous_intersections"]) &&
    hasAny(key, ["bus_lanes", "bus_stops", "signal_timing", "curb_management"])
  ) {
    return "capital_or_infrastructure";
  }
  if (kindKey === "capital_project" && key.includes("water_main_project")) return "capital_or_infrastructure";

  if ((kindKey === "transit_priority" || kindKey === "targeted_transit_priority_treatments") && key.includes("improved_curbside_bus_stops")) {
    return "bus_stop_or_boarding";
  }

  if (
    kindKey === "implementation_timeline" &&
    key.includes("bus_priority") &&
    (key.includes("will_be_implemented") || key.includes("implemented_by") || key.includes("implementation"))
  ) {
    return "bus_priority";
  }

  if (
    kindKey === "capital_design_and_sbs_implementation" &&
    key.includes("capital_roadway_improvements") &&
    key.includes("select_bus_service")
  ) {
    return "bus_priority";
  }

  if (kindKey === "bus_priority" && key.includes("curbside_bus_lane") && (key.includes("7a_7p") || key.includes("no_standing_anytime"))) {
    return "bus_lane";
  }
  if (kindKey === "bus_priority_improvements" && key.includes("targeted_bus_priority_improvements")) {
    return "bus_priority";
  }

  if (
    kindKey === "bus_rapid_transit_improvements" &&
    key.includes("limited_stops") &&
    key.includes("highway_operation") &&
    key.includes("transit_signal_priority")
  ) {
    const locationKey = normalizedToken(stringValue(payload.location_text) ?? "");
    if (hasAny(locationKey, ["lga", "queens_proposed_sbs_routes", "sbs_route", "sbs_routes"])) return "bus_priority";
  }

  if (
    [
      "brt",
      "brt_toolbox",
      "bus_priority",
      "bus_priority_toolkit",
      "bus_rapid_transit_improvements",
      "operational_treatment",
      "sbs_features",
      "sbs_package",
      "technology",
    ].includes(kindKey)
  ) {
    const featureSignals = [
      hasAny(key, ["bus_lane", "offset_bus_lane", "curbside_bus_lane", "dedicated_bus_lane"]),
      hasAny(key, ["busway", "transit_and_truck_priority"]),
      hasAny(key, ["transit_signal_priority", "tsp", "queue_jump"]),
      hasAny(key, ["bus_lane_camera_enforcement", "automated_camera_enforcement", "on_bus_camera", "ace"]),
      hasAny(key, ["off_board_fare", "prepayment_fare", "pre_payment_fare", "advanced_payment", "faster_fare_collection", "fare_machine"]),
      hasAny(key, ["bus_boarder", "bus_bulb", "enhanced_station", "station_amenities", "bus_shelter", "new_shelter"]),
      hasAny(key, ["limited_stop", "limited_stops", "stop_spacing", "stop_adjustment"]),
      hasAny(key, ["real_time_bus", "real_time_passenger", "arrival_information", "wayfinding"]),
      hasAny(key, ["low_floor", "articulated_bus", "brt_vehicle"]),
      hasAny(key, ["curb_management", "curb_regulation"]),
    ].filter(Boolean).length;
    if (featureSignals >= 3) return "bus_priority";
  }

  if (kindKey === "upgrade" && key.includes("bus_stops") && key.includes("sidewalk_extensions") && key.includes("shortened_crossings") && key.includes("medians")) {
    return "capital_or_infrastructure";
  }

  if (kindKey === "addition" && (key.includes("raised_crosswalk") || (key.includes("additional_crossings") && key.includes("street_trees")))) {
    return "pedestrian_or_accessibility";
  }

  if (kindKey === "deployment" && key.includes("gate_guards")) return "safety";

  if (kindKey === "sensor" && key.includes("bridge_strike_mitigation")) return "safety";

  if ((kindKey === "construction_license" || kindKey === "permanent_easement") && key.includes("pedestrian_overpass")) {
    return "pedestrian_or_accessibility";
  }

  if (kindKey === "amenities" && key.includes("bus_shelters")) return "bus_stop_or_boarding";
  if (
    kindKey === "operational_change" &&
    hasAny(key, ["station_agents", "outside_of_booths", "outside_booths", "customer_service_at_turnstiles", "customer_service"])
  ) {
    return "service_pattern";
  }
  return undefined;
}

function normalizeTreatmentRecordScopeFromPayload(payload: JsonObject): { scope: string; reason: string } | undefined {
  const kindKey = normalizedToken(stringValue(payload.treatment_kind) ?? "");
  const haystack = normalizedHaystack(payload, ["treatment_type", "component_kind", "component_type", "description", "label", "name", "raw_text"]);

  if (kindKey === "monitoring" && haystack.includes("continue_to_monitor_traffic_on_side_streets")) {
    return { scope: "non_intervention_monitoring_context", reason: "continue_to_monitor_not_treatment" };
  }

  if (
    kindKey === "implementation_timeline" &&
    haystack.includes("bus_priority") &&
    hasAny(haystack, ["will_be_implemented", "implemented_by", "implementation"])
  ) {
    return { scope: "implementation_timeline_context", reason: "timeline_not_treatment_component" };
  }

  const busPriorityFeatureSignals = [
    hasAny(haystack, ["bus_lane", "bus_lanes", "bus_only_lanes", "offset_bus_lane", "curbside_bus_lane", "dedicated_bus_lane"]),
    hasAny(haystack, ["busway", "transit_and_truck_priority"]),
    hasAny(haystack, ["transit_signal_priority", "tsp", "queue_jump", "traffic_signal_timing"]),
    hasAny(haystack, ["bus_lane_camera_enforcement", "automated_camera_enforcement", "on_bus_camera", "ace"]),
    hasAny(haystack, ["off_board_fare", "off_board_fare_collection", "prepayment_fare", "pre_payment_fare", "advanced_payment", "fare_machine"]),
    hasAny(haystack, ["all_door_boarding", "bus_boarder", "bus_bulb", "enhanced_station", "station_amenities", "bus_shelter", "new_shelter"]),
    hasAny(haystack, ["limited_stop", "limited_stops", "stop_spacing", "stop_adjustment", "wider_stop_spacing"]),
    hasAny(haystack, ["real_time_bus", "real_time_passenger", "arrival_information", "wayfinding"]),
    hasAny(haystack, ["low_floor", "articulated_bus", "brt_vehicle", "brt_vehicles"]),
    hasAny(haystack, ["curb_management", "curb_regulation", "improved_curb_regulations"]),
  ].filter(Boolean).length;
  const hasAggregateBusPriorityPackage =
    (["brt", "brt_toolbox", "bus_priority_toolkit", "sbs_features", "sbs_package"].includes(kindKey) && busPriorityFeatureSignals >= 2) ||
    (kindKey === "bus_rapid_transit_improvements" && busPriorityFeatureSignals >= 2 && hasAny(haystack, ["limited_stops", "proposed_sbs_routes", "sbs_routes"])) ||
    (kindKey === "capital_design_and_sbs_implementation" &&
      haystack.includes("capital_roadway_improvements") &&
      haystack.includes("select_bus_service")) ||
    (kindKey === "technology" && haystack.includes("toolbox") && busPriorityFeatureSignals >= 2) ||
    (kindKey === "operational_treatment" &&
      haystack.includes("other_tools") &&
      hasAny(haystack, ["traffic_signal_timing", "tsp", "transit_signal_priority"]) &&
      hasAny(haystack, ["bus_lane_camera_enforcement", "ace", "stationary_cameras"])) ||
    (kindKey === "bus_priority_improvements" && haystack.includes("targeted_bus_priority_improvements")) ||
    (kindKey === "bus_priority" && busPriorityFeatureSignals >= 3 && hasAny(haystack, ["improvements_include", "transit_toolkit_options", "toolkit_options"]));
  if (hasAggregateBusPriorityPackage) {
    return { scope: "aggregate_treatment_package_context", reason: "bus_priority_feature_or_toolkit_list" };
  }

  if (kindKey === "bus_priority") {
    const family = stringValue(payload.treatment_family);
    const concreteFamilyProof =
      (family === "bus_lane" && hasAny(haystack, ["bus_lane", "busway", "offset_lanes", "curbside_lanes", "painting_bus_lanes", "physically_separated"])) ||
      (family === "bus_stop_or_boarding" && hasAny(haystack, ["bus_boarder", "bus_boards", "bus_bulb", "bus_stop", "boarding"])) ||
      (family === "signal_priority" && hasAny(haystack, ["bus_queue_jump", "queue_jump", "tsp", "signal_phase", "transit_signal_priority"])) ||
      (family === "traffic_restriction" && hasAny(haystack, ["transit_freight_priority", "buses_and_trucks", "limiting_other_through_traffic", "turn_restrictions"]));
    if (concreteFamilyProof) {
      return { scope: "generic_bus_priority_literal_context", reason: "concrete_treatment_family_payload" };
    }
    return undefined;
  }

  if (kindKey !== "route_type") return undefined;

  const typeKey = normalizedToken(stringValue(payload.treatment_type) ?? stringValue(payload.component_type) ?? "");
  const routeTaxonomyTypes = new Set(["local", "limited", "rush", "express", "crosstown_sbs", "crosstown_select_bus_service"]);
  const hasRouteTypeTaxonomySignal =
    routeTaxonomyTypes.has(typeKey) &&
    hasAny(haystack, ["connects", "serves", "shown_in", "color", "color_coded"]) &&
    hasAny(haystack, ["stop_spacing", "stops_at", "frequent", "peak_hour", "non_stop", "high_frequency"]);
  const hasImplementationSignal = hasAny(haystack, [
    "bus_lane",
    "bus_priority",
    "implemented",
    "implementation",
    "queue_jump",
    "realignment",
    "reroute",
    "route_change",
    "stop_change",
    "stop_consolidation",
    "stop_removal",
    "transit_signal_priority",
  ]);

  if (hasRouteTypeTaxonomySignal && !hasImplementationSignal) {
    return { scope: "route_taxonomy_context", reason: "route_type_taxonomy" };
  }
  return undefined;
}

function normalizeTreatmentPayload(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  const treatmentKind = stringValue(payload.treatment_kind);
  const componentKind = stringValue(payload.component_kind);
  if (!treatmentKind && componentKind) {
    const componentKindKey = normalizedToken(componentKind);
    const treatmentFamily = stringValue(payload.treatment_family);
    const description = stringValue(payload.description);
    const descriptionKey = description ? normalizedToken(description) : "";
    if (
      treatmentFamily === "bus_lane" &&
      ["curbside_bus_lane", "mixed_bus_lane", "offset_bus_lane"].includes(componentKindKey) &&
      descriptionKey.includes("design_for_50_foot_wide_street") &&
      descriptionKey.includes("bus_lane")
    ) {
      next.treatment_kind = componentKind;
    }
  }
  const kinds = [payload.treatment_kind, payload.component_kind, payload.treatment_type, payload.component_type]
    .map((value) => stringValue(value))
    .filter((value): value is string => value !== undefined);
  for (const kind of kinds) {
    const family = normalizeTreatmentKind(kind);
    if (family === "other" && next.treatment_family !== undefined && next.treatment_family !== "other" && next.treatment_family !== "shelters_and_benches") break;
    addTreatmentFamily(next, family);
    if (family !== "other") break;
  }
  addTreatmentFamily(next, normalizeTreatmentFamilyFromPayload(payload));
  const recordScope = normalizeTreatmentRecordScopeFromPayload(next);
  addIfMissing(next, "treatment_record_scope", recordScope?.scope);
  addIfMissing(next, "treatment_record_scope_reason", recordScope?.reason);
  return next;
}

function normalizeSourceGapKind(value: string) {
  const key = normalizedToken(value);
  if (
    hasAny(key, [
      "preliminary",
      "provisional",
      "subject_to_change",
      "subject_to_revision",
      "subject_to_review",
      "subject_to_audit",
      "audit_review",
      "post_close_adjustments",
      "preliminary_close",
      "preliminary_results",
      "contingent_forecast",
      "design_refinement_uncertainty",
      "draft_status",
      "estimated_data",
      "estimates_subject_to_change",
      "pending_final_report",
      "tentative_dates",
    ])
  ) {
    return "provisional_data";
  }
  if (hasAny(key, ["data_estimation", "data_quality", "data_precision", "data_variation", "variation", "variance", "underreporting"])) {
    return "data_quality_caveat";
  }
  if (hasAny(key, ["data_reliability"])) return "data_quality_caveat";
  if (key === "data_provenance") return "methodology_or_comparability";
  if (hasAny(key, ["measurement_baseline_note", "methodological_caveat", "methodology", "comparability", "seasonal_adjustment", "data_source_change", "temporal_scope"])) {
    return "methodology_or_comparability";
  }
  if (hasAny(key, ["rounding", "rounding_discrepancy"])) return "rounding_note";
  if (hasAny(key, ["data_exclusion", "excluded", "exclusion", "excludes", "excluded_funding", "no_active_hedges"])) return "data_exclusion";
  if (
    hasAny(key, [
      "pending_analysis",
      "pending_procurement",
      "recalculation_needed",
      "under_review",
      "data_pending",
      "filing_in_progress",
      "reporting_delay",
      "status_pending",
      "traffic_analysis_pending",
      "work_continuation",
    ])
  ) {
    return "pending_analysis";
  }
  if (key.includes("deferred")) return "deferred_data";
  if (key.includes("suspension") || key.includes("suspended")) return "data_collection_suspension";
  if (key.includes("not_collected") || key.includes("not_collected_or_reported") || key === "survey_not_conducted") return "data_not_collected";
  if (
    key.includes("unavailable") ||
    key.includes("not_available") ||
    key.includes("not_yet_available") ||
    key.includes("missing") ||
    key === "date_uncertainty" ||
    key === "empty_source" ||
    key === "no_data" ||
    key === "unidentified" ||
    key === "unknown_environmental_review_level"
  ) {
    return "data_unavailable";
  }
  if (hasAny(key, ["correction", "date_inconsistency", "errata", "data_note", "data_removed", "data_revision", "documentation_quality"])) return "correction";
  if (
    key === "risk" ||
    key.endsWith("_risk") ||
    hasAny(key, [
      "contingent_financing",
      "contingent_program",
      "funding_gap",
      "funding_uncertainty",
      "program_underperformance",
      "staffing_shortage",
      "structural_imbalance",
    ])
  ) {
    return "risk_or_contingency";
  }
  return "other";
}

function normalizeSourceGapKindFromPayload(payload: JsonObject): string | undefined {
  const hay = normalizedHaystack(payload, ["gap_text", "missing_information", "description"]);
  if (!hay) return undefined;
  const gapKind = stringValue(payload.gap_kind);
  const gapKindKey = gapKind ? normalizedToken(gapKind) : undefined;
  if (
    hasAny(hay, ["not_yet_available", "not_available", "not_specified", "have_not_yet_been_specified", "no_specific_source", "no_specific_source_or_nature"]) ||
    (hasAny(hay, ["missing", "unavailable"]) && hasAny(hay, ["data", "funding", "information", "source"])) ||
    hasAny(hay, ["approval_status_unknown", "cannot_be_reasonably_estimated", "full_impact_is_unknown", "status_unknown", "ultimate_extent"])
  ) {
    return "data_unavailable";
  }
  if (
    gapKindKey === "scope_gap" &&
    hasAny(hay, ["does_not_contain", "no_bus_routes", "no_transit_project", "no_transit_projects", "no_transit_project_route_or_corridor_data"]) &&
    hasAny(hay, ["bus_routes", "corridor", "corridors", "project", "projects", "route", "routes", "treatment", "treatments"])
  ) {
    return "data_unavailable";
  }
  if (
    gapKindKey === "contextual_caveat" &&
    hasAny(hay, ["covid_19_pandemic", "covid_19", "pandemic"]) &&
    hasAny(hay, ["performance_indicators", "performance_data"]) &&
    hasAny(hay, ["severely_impacted", "ridership_declines", "operational_changes", "unprecedented_global_crisis"])
  ) {
    return "methodology_or_comparability";
  }
  if (
    hasAny(hay, ["as_built_drawings"]) &&
    hasAny(hay, ["signal_cables", "signal_monuments"]) &&
    hasAny(hay, ["did_not_depict", "not_depicted", "no_indications"])
  ) {
    return "data_unavailable";
  }
  if (hasAny(hay, ["no_site_visits_were_performed", "site_visits_were_not_performed", "site_visits_not_performed"])) {
    return "data_not_collected";
  }
  if (
    hasAny(hay, ["time_did_not_permit_a_discussion", "time_did_not_permit_discussion"]) &&
    hasAny(hay, ["activities_on_this_block", "curbside_activity", "curbside_activities"])
  ) {
    return "data_not_collected";
  }
  if (
    hasAny(hay, ["meeting_time_constraints_prevented_discussion", "time_constraints_prevented_discussion"]) &&
    hasAny(hay, ["curbside_activity", "curbside_activities"])
  ) {
    return "data_not_collected";
  }
  if (
    hay.includes("running_time_changes_only") &&
    hasAny(hay, ["headway"]) &&
    hasAny(hay, ["capacity"]) &&
    hasAny(hay, ["not_shown"])
  ) {
    return "data_exclusion";
  }
  if (
    hasAny(hay, ["preliminary", "provisional", "subject_to_change", "subject_to_revision", "subject_to_review", "subject_to_audit", "post_close_adjustments"])
  ) {
    return "provisional_data";
  }
  if (hasAny(hay, ["methodology", "methodologies", "revised_methodology", "comparable_basis", "recording_methods"])) {
    return "methodology_or_comparability";
  }
  if (hasAny(hay, ["based_on_pre_covid_consumption", "can_not_be_statistically_compared", "cannot_be_statistically_compared", "not_standardized", "pre_covid_consumption"])) {
    return "methodology_or_comparability";
  }
  if (hasAny(hay, ["analysis_assumes", "no_assumed_mode_shift"]) && hasAny(hay, ["mode_shift", "traffic"])) {
    return "methodology_or_comparability";
  }
  if (hasAny(hay, ["rounding", "totals_may_differ", "totals_may_not_add", "differences_are_due_to_rounding"])) {
    return "rounding_note";
  }
  if (hasAny(hay, ["excluded_from_this_report", "do_not_include", "does_not_include", "exclude", "excludes", "excluded"])) {
    return "data_exclusion";
  }
  if (
    gapKindKey === "implementation_challenge" &&
    hay.includes("developing_alternative_method") &&
    hay.includes("fare_machine_installation") &&
    hay.includes("exploring_options_for_powering_fare_machines")
  ) {
    return "pending_analysis";
  }
  if (
    gapKindKey === "stated_limitation" &&
    hay.includes("could_not_be_completed_with_in_house_materials") &&
    hay.includes("permanent_material") &&
    hay.includes("timeline_for_permanent_material_installation")
  ) {
    return "pending_analysis";
  }
  if (
    gapKindKey === "scope_limitation" &&
    hasAny(hay, ["outside_the_scope_of_this_study", "could_not_be_evaluated_in_detail"]) &&
    hasAny(hay, [
      "final_station_designs",
      "funding_and_permitting_processes",
      "governance_operations_plan",
      "need_further_analysis",
      "structural_bridge_analysis",
      "would_need_structural_analysis",
      "would_require_more_in_depth_analysis",
      "would_need_further_analysis",
      "would_need_to_be_developed",
      "would_need_to_be_finalized",
    ])
  ) {
    return "pending_analysis";
  }
  if (hasAny(hay, ["currently_on_hold", "in_progress", "pending_analysis", "pending_traffic_analysis", "status_tbd", "under_review", "waiting_on_notification", "will_provide_results", "recalculation"])) {
    return "pending_analysis";
  }
  if (hasAny(hay, ["affected_ridership_data_accuracy", "data_accuracy", "data_may_vary", "may_need_revision", "may_need_to_be_revised", "not_representative", "only_one_week", "variation", "variance", "exact_figures_are_difficult", "underreported", "underreporting"])) {
    return "data_quality_caveat";
  }
  if (
    hasAny(hay, ["employee_hours_of_work_were_estimated", "estimated_for_february_2022", "have_not_self_identified", "not_self_identified"]) &&
    hasAny(hay, ["employee", "employees", "hours", "workforce"])
  ) {
    return "data_quality_caveat";
  }
  if (
    hasAny(hay, [
      "additional_security_records_added",
      "calculation_error",
      "data_initially_presented",
      "direct_comparison_with_earlier_reports",
      "has_been_updated_from_previously_reported",
      "removed_from_this_version",
      "source_note_contains_typographical_errors",
      "typographical_errors",
      "updated_count",
      "updated_data_will_be_reflected",
    ]) &&
    !hasAny(hay, ["subject_to_revision", "subject_to_change", "revised_methodology", "updated_proposal"])
  ) {
    return "correction";
  }
  return undefined;
}

function normalizeSourceGapPayload(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  const kind = stringValue(payload.gap_kind);
  if (kind) addIfMissingOrOther(next, "gap_kind_normalized", normalizeSourceGapKind(kind));
  addIfMissingOrOther(next, "gap_kind_normalized", normalizeSourceGapKindFromPayload(payload));
  return next;
}

const SOURCE_DATE_FIELDS = ["publication_date", "date", "document_date", "date_text", "year"] as const;

/** Authority tier from the document's own classification fields (C7). Returns undefined when no
 *  signal — S2.7 enriches this with publisher heuristics and builds the corroboration view on top. */
function normalizeAuthorityTier(payload: JsonObject): string | undefined {
  const hay = normalizedHaystack(payload, ["content_type", "source_type", "document_type", "document_kind", "publisher", "title", "description"]);
  if (!hay) return undefined;
  if (hasAny(hay, ["evaluation", "monitoring_report", "monitoring", "assessment", "audit", "before_and_after"])) return "official_evaluation";
  if (hasAny(hay, ["board", "committee", "agenda", "minutes", "board_book"])) return "board_material";
  if (hasAny(hay, ["press_release", "press", "announcement", "newsroom"])) return "press_release";
  if (hasAny(hay, ["data_dictionary", "dataset", "open_data", "metadata", "data_documentation"])) return "dataset_documentation";
  if (hasAny(hay, ["plan", "report", "study", "proposal", "presentation", "brochure", "factsheet", "fact_sheet"])) return "plan_document";
  return undefined;
}

/** Source companions (S2.1): the load-bearing published-date fold (C2.6 first pass — payload date
 *  literals only; the staged-metadata/filename fallback that drives `source_undated` ≤ 10% lands in
 *  S2.2) plus the authority tier (C7). */
function normalizeSourcePayload(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  const published = bestNormalizedDate(payload, SOURCE_DATE_FIELDS);
  if (published) {
    addIfMissing(next, "published_date_normalized", published.normalized_date);
    addIfMissing(next, "published_date_precision", published.precision);
  }
  const tier = normalizeAuthorityTier(payload);
  if (tier) addIfMissing(next, "authority_tier", tier);
  return next;
}

const MONTHS = new Map(
  [
    ["jan", "01"],
    ["january", "01"],
    ["feb", "02"],
    ["february", "02"],
    ["mar", "03"],
    ["march", "03"],
    ["apr", "04"],
    ["april", "04"],
    ["may", "05"],
    ["jun", "06"],
    ["june", "06"],
    ["jul", "07"],
    ["july", "07"],
    ["aug", "08"],
    ["august", "08"],
    ["sep", "09"],
    ["sept", "09"],
    ["september", "09"],
    ["oct", "10"],
    ["october", "10"],
    ["nov", "11"],
    ["november", "11"],
    ["dec", "12"],
    ["december", "12"],
  ].map(([key, value]) => [key, value] as const),
);

export function normalizeDateText(value: string): JsonObject {
  const raw = value.trim();
  const lower = raw.toLowerCase();
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
  if (isoDay) {
    return {
      raw_text: raw,
      normalized_date: raw,
      precision: "day",
      confidence: "submitted_iso",
    };
  }

  const isoMonth = /^(\d{4})-(\d{2})$/u.exec(raw);
  if (isoMonth) {
    return {
      raw_text: raw,
      normalized_date: raw,
      precision: "month",
      confidence: "submitted_iso",
    };
  }

  const yearOnly = /^(\d{4})$/u.exec(raw);
  if (yearOnly) {
    return {
      raw_text: raw,
      normalized_date: raw,
      precision: "year",
      confidence: "submitted_iso",
    };
  }

  const monthDayYear = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[,]?\s*([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})/iu.exec(
    raw,
  );
  if (monthDayYear) {
    const month = MONTHS.get(monthDayYear[1]!.toLowerCase());
    const day = monthDayYear[2]!.padStart(2, "0");
    if (month) {
      return {
        raw_text: raw,
        normalized_date: `${monthDayYear[3]}-${month}-${day}`,
        precision: "day",
        confidence: "parsed_text",
      };
    }
  }

  const monthYear = /([a-z]+)\.?\s+(\d{4})/iu.exec(raw);
  if (monthYear) {
    const month = MONTHS.get(monthYear[1]!.toLowerCase());
    if (month) {
      return {
        raw_text: raw,
        normalized_date: `${monthYear[2]}-${month}`,
        precision: "month",
        confidence: "parsed_text",
      };
    }
  }

  const seasonYear = /\b(spring|summer|fall|autumn|winter)\s+(\d{4})\b/iu.exec(lower);
  if (seasonYear) {
    return {
      raw_text: raw,
      normalized_date: `${seasonYear[2]}-${seasonYear[1] === "autumn" ? "fall" : seasonYear[1]}`,
      precision: "season",
      confidence: "parsed_text",
    };
  }

  return {
    raw_text: raw,
    precision: "unknown",
    confidence: "unparsed",
  };
}

function isDateField(key: string) {
  if (key.endsWith("_normalized")) return false;
  return key === "date" || key.endsWith("_date") || key.endsWith("_date_text") || key === "date_text" || key.includes("launch_date") || key.includes("construction_start");
}

function normalizeDateFields(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (!isDateField(key) || typeof value !== "string" || !value.trim()) continue;
    const normalizedKey = `${key}_normalized`;
    if (next[normalizedKey] === undefined) next[normalizedKey] = normalizeDateText(value);
  }
  return next;
}

const ORDINAL_AVENUES = new Map<number, string>([
  [1, "First"],
  [2, "Second"],
  [3, "Third"],
  [4, "Fourth"],
  [5, "Fifth"],
  [6, "Sixth"],
  [7, "Seventh"],
  [8, "Eighth"],
  [9, "Ninth"],
  [10, "Tenth"],
  [11, "Eleventh"],
  [12, "Twelfth"],
]);

function normalizeStreetName(value: string) {
  let text = value.trim().replace(/\bAv\b\.?/giu, "Avenue").replace(/\bAve\b\.?/giu, "Avenue").replace(/\bSt\b\.?/giu, "Street");
  text = text.replace(/\b([EWNS])\s+(\d+(?:st|nd|rd|th)?\s+Street)\b/iu, (_match, prefix: string, street: string) => {
    const direction = { E: "East", W: "West", N: "North", S: "South" }[prefix.toUpperCase()] ?? prefix;
    return `${direction} ${street}`;
  });
  text = text.replace(/\b(\d+)(?:st|nd|rd|th)?\s+Avenue\b/iu, (_match, numberText: string) => {
    const word = ORDINAL_AVENUES.get(Number(numberText));
    return word ? `${word} Avenue` : `${numberText} Avenue`;
  });
  return text;
}

function streetLikeAtStart(value: string) {
  const trimmed = value.trim();
  const explicit = /^(Central Park West|West End Avenue|Broadway|Transverse Road)\b/iu.exec(trimmed);
  if (explicit) return explicit[1];

  const numbered = /^((?:[EWNS]\s+)?\d+(?:st|nd|rd|th)?\s+(?:Street|St|Avenue|Ave|Av))\b/iu.exec(trimmed);
  if (numbered) return numbered[1];

  return undefined;
}

function normalizeLocationText(raw: string): JsonObject {
  const text = raw.trim();
  const normalized: JsonObject = {
    raw_text: text,
  };

  const direction = /\b(eastbound|westbound|northbound|southbound)\b/iu.exec(text);
  if (direction) normalized.direction = direction[1]!.toLowerCase();

  const street = /\b(?:[EWNS]\s+)?\d+(?:st|nd|rd|th)?\s+(?:Street|St)\b/iu.exec(text) ?? /\bTransverse Road\b/iu.exec(text);
  if (street) normalized.street = normalizeStreetName(street[0]);

  const crossPrefix = /\b(?:at|&|and|approach to|to)\s+/iu.exec(text);
  if (crossPrefix) {
    const crossStreet = streetLikeAtStart(text.slice(crossPrefix.index + crossPrefix[0].length));
    if (crossStreet) normalized.cross_street = normalizeStreetName(crossStreet);
  }

  return normalized;
}

function normalizeLocationFields(payload: JsonObject): JsonObject {
  const next: JsonObject = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (!key.toLowerCase().includes("location")) continue;

    if (typeof value === "string" && value.trim()) {
      const normalizedKey = key === "location_text" ? "normalized_location" : `${key}_normalized`;
      if (next[normalizedKey] === undefined) next[normalizedKey] = normalizeLocationText(value);
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      const normalizedKey = `${key}_normalized`;
      if (next[normalizedKey] === undefined) next[normalizedKey] = value.map((item) => normalizeLocationText(item as string)) as JsonValue;
    }
  }
  return next;
}

export function normalizeObservationPayload(kind: MtaObservationKind, payload: JsonObject, context?: NormalizationContext): JsonObject {
  let next = { ...payload };
  if (kind === "source") next = normalizeSourcePayload(next);
  if (kind === "relation") next = normalizeRelationPayload(next);
  if (kind === "metric_claim") next = normalizeMetricPayload(next, context);
  if (kind === "claim") next = normalizeClaimPayload(next);
  if (kind === "route") next = normalizeRoutePayload(next);
  if (kind === "project") next = normalizeProjectPayload(next, context);
  if (kind === "event") next = normalizeEventPayload(next, context);
  if (kind === "treatment_component") next = normalizeTreatmentPayload(next);
  if (kind === "source_gap") next = normalizeSourceGapPayload(next);
  next = normalizeBoroughFields(next);
  next = normalizeDateFields(next);
  next = normalizeLocationFields(next);
  return next;
}
