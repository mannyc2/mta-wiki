// S2.1 runner-owned companion normalizers (docs/step-2-implementation-plan.md §S2.1, §5).
// One block per new vocabulary; all run through the real normalizeObservationPayload dispatch so
// the kind wiring and the event scalar-date-vs-object ordering are exercised end to end.

import { describe, expect, it } from "bun:test";
import { normalizeObservationPayload, type NormalizationContext } from "@mta-wiki/pipeline/ontology/normalizers";
import type { JsonObject } from "@mta-wiki/db/types";

const event = (payload: JsonObject, context?: NormalizationContext) => normalizeObservationPayload("event", payload, context);
const route = (payload: JsonObject) => normalizeObservationPayload("route", payload);
const project = (payload: JsonObject, context?: NormalizationContext) => normalizeObservationPayload("project", payload, context);
const source = (payload: JsonObject) => normalizeObservationPayload("source", payload);
const gap = (payload: JsonObject) => normalizeObservationPayload("source_gap", payload);
const metric = (payload: JsonObject, context?: NormalizationContext) => normalizeObservationPayload("metric_claim", payload, context);
const treatment = (payload: JsonObject) => normalizeObservationPayload("treatment_component", payload);

describe("route route_type_normalized", () => {
  it("derives route type from bounded route identity and mode evidence", () => {
    expect(route({ route_id: "B100", description: "East-west bus route in south Brooklyn." }).route_type_normalized).toBe("bus");
    expect(route({ route_label: "B3", route_name: "Avenue U" }).route_type_normalized).toBe("bus");
    expect(route({ route_id: "Bee-Line 60", description: "Westchester County Bee-Line bus route." }).route_type_normalized).toBe("bus");
    expect(route({ mode: "bus", route_id: "B68" }).route_type_normalized).toBe("bus");
    expect(
      route({
        route_name: "34th Street Select Bus Service",
        description: "SBS on 34th Street in Manhattan.",
      }).route_type_normalized,
    ).toBe("select_bus_service");
    expect(route({ route_name: "34th Street Select Bus Service", description: "SBS on 34th Street in Manhattan." }).service_variant).toBe("sbs");
    expect(route({ route_id: "C", mode: "subway", description: "C Subway Line." }).route_type_normalized).toBe("subway");
    expect(route({ route_id: "N", description: "N train serving 57 Street Station." }).route_type_normalized).toBe("subway");
    expect(
      route({
        route_id: "Penn Station Access Line",
        route_name: "Penn Station Access Line",
        description: "Metro-North Railroad line - extension of New Haven Line into Penn Station.",
      }).route_type_normalized,
    ).toBe("commuter_rail");
  });

  it("keeps route-type inference narrow around aggregate and ambiguous route surfaces", () => {
    expect(route({ route_name: "34th Street Bus Priority", description: "Bus Priority/Hot Spot location on 34th Street." }).route_type_normalized).toBeUndefined();
    expect(route({ route_id: "Q52/Q53", route_name: "Woodhaven / Cross Bay Boulevard Select Bus Service" }).route_type_normalized).toBe("select_bus_service");
    expect(route({ route_id: "Q52/Q53" }).route_type_normalized).toBeUndefined();
    expect(route({ route_id: "15 Express bus routes" }).route_type_normalized).toBeUndefined();
    expect(route({ route_id: "M5/M7", description: "Route list context." }).route_type_normalized).toBeUndefined();
    expect(route({ route_id: "C", description: "C-shaped route marker without rail-mode evidence." }).route_type_normalized).toBeUndefined();
  });
});

describe("event lifecycle_phase", () => {
  it("maps event_kind toward the bounded C2.1 taxonomy", () => {
    expect(event({ event_kind: "SBS Launch" }).lifecycle_phase).toBe("launched");
    expect(event({ event_kind: "Groundbreaking" }).lifecycle_phase).toBe("construction");
    expect(event({ event_kind: "Project Cancelled" }).lifecycle_phase).toBe("cancelled");
    expect(event({ event_kind: "Pilot start" }).lifecycle_phase).toBe("piloted");
    expect(event({ event_kind: "Feasibility study" }).lifecycle_phase).toBe("studied");
  });

  it("uses exact prospective evidence when lifecycle is missing or other", () => {
    expect(
      event(
        {
          event_kind: "installation",
          description: "Installation of 3 Bus Only Signals along Flatbush Ave",
        },
        { raw_text: "3 Bus Only Signals are planned for Summer 2024 installation along Flatbush Ave" },
      ).lifecycle_phase,
    ).toBe("planned");
    expect(
      event({
        event_kind: "service launch",
        lifecycle_phase: "other",
        description: "Bus lanes expected to be operational",
      }).lifecycle_phase,
    ).toBe("planned");
    expect(
      event(
        { event_kind: "launch", description: "Promotional transfer policy launch" },
        { raw_text: "To obtain Board approval to launch a promotional transfer policy beginning on June 29, 2025" },
      ).lifecycle_phase,
    ).toBe("proposed");
    expect(
      event(
        { event_kind: "launch", lifecycle_phase: "other", description: "Citywide Bus Lane Enforcement Task Force begins" },
        { raw_text: "The Citywide Bus Lane Enforcement Task Force, which will begin on December 4, 2023." },
      ).lifecycle_phase,
    ).toBe("planned");
    expect(
      event(
        {
          event_kind: "service_expansion",
          description: "Newburgh-Beacon Bridge Shuttle expansion",
        },
        { raw_text: "Beginning on Tuesday, January 2, the Newburgh-Beacon Bridge Shuttle will expand bus service." },
      ).lifecycle_phase,
    ).toBe("planned");
  });

  it("does not silently rewrite explicit lifecycle phases during replay", () => {
    expect(
      event(
        {
          event_kind: "installation",
          lifecycle_phase: "installed",
          description: "Installation of 3 Bus Only Signals along Flatbush Ave",
        },
        { raw_text: "3 Bus Only Signals are planned for Summer 2024 installation along Flatbush Ave" },
      ).lifecycle_phase,
    ).toBe("installed");
    expect(
      event({
        event_kind: "service launch",
        lifecycle_phase: "launched",
        description: "Bus lanes expected to be operational",
      }).lifecycle_phase,
    ).toBe("launched");
    expect(
      event(
        { event_kind: "launch", lifecycle_phase: "launched", description: "Promotional transfer policy launch" },
        { raw_text: "To obtain Board approval to launch a promotional transfer policy beginning on June 29, 2025" },
      ).lifecycle_phase,
    ).toBe("launched");
    expect(
      event(
        { event_kind: "service_expansion", lifecycle_phase: "expanded", description: "Newburgh-Beacon Bridge Shuttle expansion" },
        { raw_text: "Beginning on Tuesday, January 2, the Newburgh-Beacon Bridge Shuttle will expand bus service." },
      ).lifecycle_phase,
    ).toBe("expanded");

    expect(event({ event_kind: "installation", lifecycle_phase: "installed", description: "Bus Only Signals were installed in Summer 2024." }).lifecycle_phase).toBe(
      "installed",
    );
    expect(event({ event_kind: "service launch", lifecycle_phase: "launched", description: "Bus lanes became operational." }).lifecycle_phase).toBe("launched");
    expect(event({ event_kind: "launch", lifecycle_phase: "launched", description: "Transfer policy launched after Board approval." }).lifecycle_phase).toBe("launched");
  });

  it("maps concrete opening events to the launch event family", () => {
    expect(event({ event_kind: "opening" }).event_family).toBe("launch");
    expect(event({ event_kind: "station_opening" }).event_family).toBe("launch");
    expect(event({ event_kind: "start of service" }).event_family).toBe("launch");
    expect(event({ event_kind: "in-service" }).event_family).toBe("launch");
    expect(event({ event_kind: "new_service" }).event_family).toBe("launch");
    expect(event({ event_kind: "service rollout" }).event_family).toBe("launch");
    expect(event({ event_kind: "opening" }).lifecycle_phase).toBe("launched");
    expect(event({ event_kind: "start of service" }).lifecycle_phase).toBe("launched");
    expect(event({ event_kind: "revenue_service_date" }).event_family).toBe("other");
    expect(event({ event_kind: "in_service_date" }).event_family).toBe("other");
    expect(event({ event_kind: "service_live_date" }).event_family).toBe("other");
  });

  it("maps payload-proven document metadata and target-date events without bare-date broadening", () => {
    expect(event({ event_kind: "page_update", description: "MTA Open Data Program page last updated January 27, 2026." }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "page update", description: "Automated Camera Enforcement webpage updated May 15, 2026." }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "staff_summary", description: "Staff summary date for board action item." }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "staff summary", description: "Staff summary prepared and reviewed for Board approval." }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "data_prepared", description: "Ridership data through July 2023 prepared by MTA Division of Management & Budget." }).event_family).toBe(
      "document_metadata",
    );
    expect(event({ event_kind: "revenue_service_date", description: "East Side Access planned Revenue Service Date for LIRR service to Grand Central Terminal." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "revenue service date",
        description: "Anticipated Revenue Service Date for Second Avenue Subway Phase 2 is September 2032, which includes a 10-month schedule contingency.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "project target", description: "Short-term project target year for Woodhaven / Cross Bay Blvd (Q52/Q53) SBS launch." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "project_target", description: "Longer term project after 2017 for Woodhaven / Cross Bay Blvd SBS corridor." }).event_family).toBe("planning");
    expect(event({ event_kind: "regulation_update", description: "Refine curb access regulations following implementation." }).event_family).toBe("implementation");
    expect(event({ event_kind: "regulation_update", description: "Refine curb regulations on Lexington Avenue between 60th and 52nd Street." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "regulation update", description: "Refine curb regulations following offset bus lane implementation and monitoring." }).event_family).toBe(
      "implementation",
    );

    expect(event({ event_kind: "page_update" }).event_family).toBe("other");
    expect(event({ event_kind: "app_update", description: "Software app updated for internal users." }).event_family).toBe("other");
    expect(event({ event_kind: "measurement_date", event_name: "Annual Impact as of Oct 10, 2023" }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "revenue_service_date" }).event_family).toBe("other");
    expect(event({ event_kind: "project_target", description: "Generic project target." }).event_family).toBe("other");
    expect(event({ event_kind: "regulation_update", description: "Generic proposed regulatory discussion." }).event_family).toBe("other");
  });

  it("maps exact board and committee procedure events to governance without broad board matching", () => {
    expect(event({ event_kind: "committee_agenda_item" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee action" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_information_item" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee briefing" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_review" }).event_family).toBe("governance");
    expect(event({ event_kind: "board_action" }).event_family).toBe("governance");
    expect(event({ event_kind: "board update" }).event_family).toBe("governance");
    expect(event({ event_kind: "Finance Committee action item" }).event_family).toBe("governance");
    expect(event({ event_kind: "Finance Committee agenda item" }).event_family).toBe("governance");
    expect(event({ event_kind: "recurring agenda item" }).event_family).toBe("governance");
    expect(event({ event_kind: "scheduled_committee_agenda" }).event_family).toBe("governance");
    expect(event({ event_kind: "information_item" }).event_family).toBe("governance");
    expect(event({ event_kind: "adjournment" }).event_family).toBe("governance");

    expect(event({ event_kind: "community_board_briefing" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "board" }).event_family).toBe("other");
    expect(event({ event_kind: "committee" }).event_family).toBe("other");
    expect(event({ event_kind: "information" }).event_family).toBe("other");
    expect(event({ event_kind: "committee meeting" }).event_family).toBe("public_engagement");
  });

  it("maps residual event tails only with bounded payload proof", () => {
    expect(
      event({
        event_kind: "fare and toll increase",
        description: "Fare/Toll Increase, March 2025 - assumed for implementation and projected to generate farebox and toll revenues.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "fare_increase", description: "5% fare increase with CTDOT reserving ability to withdraw." }).event_family).toBe("planning");
    expect(event({ event_kind: "fare_increase", event_name: "CTDOT New Haven Line Fare Increase Effective September 1, 2025" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "fare_increase", description: "5% fare increase on New Haven Line for travel to/from Connecticut stations." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "fare_increase",
        description: "Connecticut Department of Transportation five percent fare increase on the Connecticut portion of MNR's New Haven Line.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "fare_increase", description: "5% fare increase on New Haven Line." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "fare increase",
        description: "Fares and tolls are projected to generate annualized increase in farebox and toll revenues.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "proposed_fare_toll_increase", description: "Below-the-line proposed 4% fare and toll yield increase." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "fare_increase", description: "Fare increase summary without proposal or forecast markers." }).event_family).toBe("other");
    expect(event({ event_kind: "fare_increase", description: "Fare increase went into effect." }).event_family).toBe("implementation");

    expect(event({ event_kind: "annual_results_review", description: "A review of the prior year's performance of railroad service will be provided to the Committee." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "committee_information", event_name: "2024 Operation Summary (Final)", description: "Review of prior year performance." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "operations_update", description: "The agency will provide Mid-Year update on Railroad Operations." }).event_family).toBe("publication");
    expect(
      event({
        event_kind: "update",
        event_name: "Rapid Transit Loading Guidelines update",
        description: "First update to the Guidelines since adoption in 1988",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "update",
        event_name: "Rapid Transit Loading Guidelines update",
        description: "Second update to the Guidelines since adoption in 1988",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "update", description: "Generic project update." }).event_family).toBe("other");
    expect(event({ event_kind: "performance_review", description: "Review of the prior year's performance of railroad service." }).event_family).toBe("other");

    expect(event({ event_kind: "work_plan", description: "Corporate Governance Committee Work Plan with recurring agenda items." }).event_family).toBe("governance");
    expect(event({ event_kind: "board_review", description: "Board review of the Penn Station Access Design-Build contract." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_update", description: "LIRR Special Events Ridership Committee Update." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_recurring_item", event_name: "Approval of Minutes", description: "Motion to approve the minutes." }).event_family).toBe(
      "approval",
    );

    expect(event({ event_kind: "collision", description: "Subway collision under NTSB investigation." }).event_family).toBe("incident");
    expect(event({ event_kind: "damage_incident", description: "Fire damage to rolling stock required replacement work." }).event_family).toBe("incident");
    expect(event({ event_kind: "safety_incident_response", description: "Employee activated the emergency stop button after a passenger fall." }).event_family).toBe("incident");
    expect(event({ event_kind: "safety_event", description: "Safety Focus Day for employees." }).event_family).toBe("implementation");
    expect(
      event({
        event_kind: "safety event",
        description: "Safety Focus Day with theme 'Prepared to Perform', focused on Hazards, Mental Fatigue, Slip Trip and Fall Prevention, and PPE Compliance.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "safety_event", description: "Generic safety event for employees." }).event_family).toBe("other");
    expect(event({ event_kind: "picnic", description: "Annual Safety and Employee Appreciation picnic with a President's Safety Award." }).event_family).toBe("other");

    expect(event({ event_kind: "emergency_preparedness_drill", description: "Emergency preparedness drill with response organizations." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "station_operations_exercise", description: "Wayfinding exercise to test station readiness." }).event_family).toBe("implementation");
    expect(event({ event_kind: "emergency exercise" }).event_family).toBe("other");

    expect(event({ event_kind: "support_end", description: "Legacy PTC Data Radio support continues until new radios are available." }).event_family).toBe("milestone");
    expect(event({ event_kind: "planned_discontinuation", description: "Planned discontinuation of all MetroCard sales." }).event_family).toBe("milestone");
    expect(event({ event_kind: "planned", description: "2026 Spruce Up Stations for the LIRR Station Spruce-Up Program." }).event_family).toBe("planning");
    expect(event({ event_kind: "planned", description: "Generic planned event." }).event_family).toBe("other");
    expect(event({ event_kind: "street conversion", description: "Conversion of 39th Avenue from one-way to two-way between Main Street and Prince Street." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "street change", description: "Removal of B82 bus stop replaced with parking and addition of angled parking." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "street change", description: "Generic street change discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "panel creation", description: "New Blue-Ribbon Panel Created to address fare evasion." }).event_family).toBe("milestone");
    expect(event({ event_kind: "mobilization", description: "Mobilization starting in summer 2021 for 8 new ADA stations." }).event_family).toBe("construction");
    expect(
      event({
        event_kind: "ongoing obligation",
        description: "OSS must conduct an annual review of the PTASPs; this annual review requires MTA Board review and approval.",
      }).event_family,
    ).toBe("governance");
    expect(event({ event_kind: "annual_update", description: "Version 6.0 of the NYCT Dept. of Buses Agency Safety Plan annual update." }).event_family).toBe(
      "publication",
    );
    expect(
      event({
        event_kind: "platform repair",
        description: "One of two main tracks taken out of service for platform repairs; eastbound trains bypass Elmont-UBS Arena.",
      }).event_family,
    ).toBe("pause");
    expect(
      event({
        event_kind: "special_schedule",
        description: "Metro-North provides Yankee Stadium service for MLB and concert events with an operating schedule order.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event({
        event_kind: "pilot_extension",
        description: "Six-month extension of the on-demand E-Hail pilot program for participating customers.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "planned_upgrade", description: "Escalator 11 is out of service for planned upgrade work." }).event_family).toBe("pause");
    expect(event({ event_kind: "program_extension", description: "Pre-boarding ticket validation program extended to every Monday through Friday." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "in_service_date", description: "LIRR Main Line Third Track planned in-service date." }).event_family).toBe("planning");
    expect(event({ event_kind: "in_service_date", description: "Generic in service date." }).event_family).toBe("other");
    expect(event({ event_kind: "timetable update", description: "March 2025 timetable schedule adjustment." }).event_family).toBe("implementation");
    expect(event({ event_kind: "technology_upgrade", description: "Installation of 600+ iPad GPS units into fleet to be complete." }).event_family).toBe(
      "implementation",
    );
    expect(
      event({
        event_kind: "inspection and maintenance",
        description: "FRA rail inspections and maintenance with service reduced to hourly.",
      }).event_family,
    ).toBe("pause");
    expect(event({ event_kind: "maintenance", description: "Grand Central Madison contractor maintenance with one main track out of service." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "maintenance", description: "General maintenance activity." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "pilot phase start",
        description: "E-Hail Phase 2 Start: MTA restructured E-Hail program and began Phase 2 with limits on rides per customer and subsidy amounts.",
      }).event_family,
    ).toBe("launch");
    expect(event({ event_kind: "pilot_renewal", description: "Existing pilots for audio announcements and audio advertising renewed until July 2026." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "track work program", description: "Weekend track work program with all tracks out of service." }).event_family).toBe("pause");
    expect(
      event({
        event_kind: "operational control transfer",
        description: "MTA C&D turned operational control over Grand Central Madison to LIRR, with major work complete.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "regulatory_change",
        description: "Coast Guard bridge opening regulation modifications: BEFORE immediate openings, AFTER advance notice required.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "regulation_change", description: "Speed limit changed to 30 mph on Woodhaven Boulevard." }).event_family).toBe("implementation");
    expect(event({ event_kind: "regulation enactment", description: "NYSDFS enacted regulation 23 NYCRR Part 500." }).event_family).toBe("legislation");
    expect(event({ event_kind: "regulatory certification", description: "ULURP Certification for Sackman Street de-mapping." }).event_family).toBe("approval");
    expect(event({ event_kind: "service", description: "Metro-North Holiday Lights Train began service on the day after Thanksgiving." }).event_family).toBe("launch");
    expect(
      event({
        event_kind: "service_live_date",
        description: "Metro-North will provide a Super Express train on New Haven Line beginning tonight.",
      }).event_family,
    ).toBe("launch");
    expect(event({ event_kind: "service_live_date", description: "Generic service live date." }).event_family).toBe("other");
    expect(event({ event_kind: "planned_software_release", description: "M8 OBC software release expected to resolve priority PTC variances." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "software_release_scheduled", description: "OBC software release with ATC/ACSES software modifications scheduled." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "commissioning_scheduled", description: "New Haven Line new CP 230 commissioning scheduled." }).event_family).toBe("planning");
    expect(event({ event_kind: "work_start", description: "S-Program work will commence in October 2023 and will carryover to 2024." }).event_family).toBe(
      "construction",
    );
    expect(event({ event_kind: "policy_release", description: "PlaNYC released, focusing on improved transit including BRT." }).event_family).toBe("publication");
    expect(event({ event_kind: "extra_service", description: "LIRR will provide extra service for customers travelling to the parade." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "weather event", description: "Tropical Storm Ophelia caused historic rainfall with enormous impact to subway operations." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "weather event", description: "Winter Storm Fern impacted the region; MTA maintained operations." }).event_family).toBe("other");
    expect(event({ event_kind: "service_announcement", description: "Officials announced increased weekend service on the G, J and M lines." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "service_announcement", description: "General service announcement." }).event_family).toBe("other");
    expect(event({ event_kind: "policy announcement", description: "Governor Hochul announces Five-Point Plan to Protect New Yorkers on the Subway." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "policy announcement", description: "General policy announcement." }).event_family).toBe("other");
    expect(event({ event_kind: "panel announcement", description: "Blue Ribbon Panel on Fare Evasion announced by the MTA Chair." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "panel announcement", description: "Panel announcement for a generic discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "initiative_announcement", description: "MTA, NYC DCP and MOPD announced Zoning for Accessibility joint initiative." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "initiative_announcement", description: "General initiative announcement." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "evaluation",
        description: "MTA will evaluate budget impacts and customer response to the E-Hail Phase 3 program.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "evaluation", description: "Generic evaluation update." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "evaluation_period",
        description: "Nine-month pilot evaluation period comparing pre-pilot to pilot period results.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "evaluation period", description: "Generic evaluation period." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "in-service evaluation",
        description: "Lead bus scheduled for in-service evaluation for five Nova Bus all-electric buses.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "in-service evaluation", description: "General in-service evaluation." }).event_family).toBe("other");
    expect(event({ event_kind: "procurement recommendation", description: "Committee recommended approval of two contracts." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "procurement recommendation", description: "Procurement recommendation without approval language." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "procurement_cycle",
        description: "The RFP process concludes in Q3/Q4 2024; award expected to be recommended to the Board.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "procurement_cycle", description: "Generic procurement cycle." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "software delivery",
        description: "Anticipate receiving final on-board computer OBC software from Siemens after full subsystem testing.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "software delivery", description: "Generic software delivery." }).event_family).toBe("other");
    expect(event({ event_kind: "deadline", description: "Deadline for final plans for the Expanded Scope." }).event_family).toBe("planning");
    expect(event({ event_kind: "deadline", description: "Generic deadline." }).event_family).toBe("other");
    expect(event({ event_kind: "timetable period end", description: "End of adjusted schedule period beginning November 10, 2025." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "timetable period end", description: "Generic timetable period end." }).event_family).toBe("other");
    expect(event({ event_kind: "notice_posting", description: "Notices of proposal and public hearings were placed at stations." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "notice_posting", description: "Notices were posted internally." }).event_family).toBe("other");
    expect(event({ event_kind: "strike_averted", description: "No LIRR strike - service will continue uninterrupted." }).event_family).toBe("milestone");
    expect(event({ event_kind: "strike_averted", description: "Strike averted." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "vehicle debut",
        description: "Debuted the first of fifteen electric vehicles to the public for Access-A-Ride Paratransit service pilot program.",
      }).event_family,
    ).toBe("launch");
    expect(event({ event_kind: "vehicle debut", description: "Generic vehicle debut." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "turnover",
        description: "MTA C&D turned over Grand Central Madison to LIRR, with major work complete save for systems testing and punch list items.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "turnover", description: "Generic turnover." }).event_family).toBe("other");
    expect(event({ event_kind: "test train", description: "Test train operating in the new East Side Access terminal." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "test train", description: "Generic test train." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "budget_enactment",
        description: "New York State fiscal year 2023-2024 budget enacted with Payroll Mobility Tax, State aid, and paratransit services funding.",
      }).event_family,
    ).toBe("legislation");
    expect(event({ event_kind: "budget_enactment", description: "Budget enacted." }).event_family).toBe("other");
    expect(event({ event_kind: "resolution", description: "Resolution adopted by the Board authorizing WZSE program." }).event_family).toBe("approval");
    expect(event({ event_kind: "resolution", description: "Generic resolution date." }).event_family).toBe("other");
    expect(event({ event_kind: "executive_session", description: "Board voted affirmatively on two labor agreements." }).event_family).toBe("approval");
    expect(event({ event_kind: "executive_session", description: "Board convened executive session to discuss litigation." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "restriction start",
        description: "Start of Southbound Bus and Truck Only (SBTO) restriction on Main Street.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "restriction start", description: "Start of general curb restriction." }).event_family).toBe("other");
    expect(event({ event_kind: "board submission", description: "Toll violation enforcement changes submitted to the Board for approval." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "board submission", description: "Generic board submission." }).event_family).toBe("other");
    expect(event({ event_kind: "proposed revision", description: "Proposed revision to the Diversity Committee Charter." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "proposed revision", description: "Proposed project design revision." }).event_family).toBe("other");
    expect(event({ event_kind: "annual review", description: "Annual review of the Long Island Committee Charter." }).event_family).toBe("governance");
    expect(event({ event_kind: "annual review", description: "Annual performance review." }).event_family).toBe("other");
    expect(event({ event_kind: "veto", description: "Capital Program Review Board appointees vetoed the plan." }).event_family).toBe("governance");
    expect(event({ event_kind: "veto", description: "Generic veto." }).event_family).toBe("other");
    expect(event({ event_kind: "signing", description: "Delegation of authority signed by the Accountable Executive." }).event_family).toBe("governance");
    expect(event({ event_kind: "signing", description: "Agreement signing ceremony." }).event_family).toBe("other");
    expect(event({ event_kind: "resignation", description: "MTA Board member resigning from the MTA Board." }).event_family).toBe("governance");
    expect(event({ event_kind: "resignation", description: "Staff resignation." }).event_family).toBe("other");
    expect(event({ event_kind: "guidance issuance", description: "NYS OMH issued interpretative guidance." }).event_family).toBe("publication");
    expect(event({ event_kind: "guidance issuance", description: "Guidance received internally." }).event_family).toBe("other");
    expect(event({ event_kind: "annual plan update", description: "Agency Safety Plan ASP annual update, Version 7." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "annual plan update", description: "Generic annual plan target." }).event_family).toBe("other");
    expect(event({ event_kind: "operations update", description: "Mid-Year Operations Update with key performance metrics." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "operations update", description: "Generic operations update." }).event_family).toBe("other");
    expect(event({ event_kind: "weekender_alert", description: "MTAWeekender service change information." }).event_family).toBe("publication");
    expect(event({ event_kind: "weekender_alert", description: "Weekend event alert." }).event_family).toBe("other");
    expect(event({ event_kind: "policy_effective", description: "MTA Federal Substance Abuse Policy effective date and applicable employees." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "policy_effective", description: "Policy discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "pilot_end", description: "Fare collection resumed on pilot routes." }).event_family).toBe("implementation");
    expect(event({ event_kind: "pilot_end", description: "Pilot ended." }).event_family).toBe("other");
    expect(event({ event_kind: "pilot conclusion", description: "Fare collection resumes and pilot concludes." }).event_family).toBe("implementation");
    expect(event({ event_kind: "pilot conclusion", description: "Generic pilot conclusion." }).event_family).toBe("other");
    expect(event({ event_kind: "phase-in period", description: "CRZ Program phase-in period defined by resolution." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "phase-in period", description: "Generic phase-in period." }).event_family).toBe("other");
    expect(event({ event_kind: "labor agreement", description: "Tentative deal ending a strike; service returned to service." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "labor agreement", description: "Tentative labor agreement awaits ratification." }).event_family).toBe("other");
    expect(event({ event_kind: "parade", description: "LIRR will operate extra train service for the St. Patrick's Day Parade." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "parade", description: "Parade attendance." }).event_family).toBe("other");
    expect(event({ event_kind: "sports championship", description: "Extra LIRR train service to a temporary station for the championship." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "sports championship", description: "Championship attendance." }).event_family).toBe("other");
    expect(event({ event_kind: "security inspection", description: "Unionport Yard inspection found trespassers in a train car with NYPD Vandals Unit." }).event_family).toBe(
      "incident",
    );
    expect(event({ event_kind: "security inspection", description: "Routine security inspection." }).event_family).toBe("other");
    expect(event({ event_kind: "initiative kickoff", description: "Multi-agency ghost plate enforcement initiative kickoff." }).event_family).toBe(
      "enforcement",
    );
    expect(event({ event_kind: "initiative kickoff", description: "Generic initiative kickoff." }).event_family).toBe("other");
    expect(event({ event_kind: "delivery", description: "Expected delivery of first 15 Customer Service Point of Sale devices." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "delivery", description: "Expected delivery of remaining 15 Customer Service Point of Sale devices." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "environmental review", description: "Target completion of environmental review for 34th Street SBS project." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "software deployment", description: "Alstom M8 OBC Software 1.5 testing was completed; FRA approval request will be filed for revenue testing and deployment in Jan 2024." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "regulatory mandate", description: "FRA issued an unfunded mandate requiring CCTV systems in commuter passenger service lead locomotives." }).event_family).toBe(
      "legislation",
    );
    expect(event({ event_kind: "work continuation", description: "Tactile warning strip installation at 25 stations will continue into 2023." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "program rename", description: "Following legislative approval to monitor bus stops, DOB changed project name from ABLE to ACE (Automated Camera Enforcement)." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "infrastructure", event_name: "Hudson Line Fiber Migration", description: "Migrated from cellular to fiber communication with the installation of new fiber on Hudson Line." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "maintenance operation", event_name: "Flood Door Testing at Tunnels", description: "Flood door testing at Hugh L. Carey and Queens Midtown Tunnels. Doors installed in 2017 as part of long-term resiliency program." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "fleet transition", description: "Paratransit decommissioned dedicated carrier MV, relocated nearly one-third of fleet, and launched new dedicated carrier location PTA in Astoria." }).event_family).toBe(
      "implementation",
    );
    expect(
      event({
        event_kind: "capital project work",
        description: "MTA Real Estate and Metro-North continued the GCT Grease Duct Platform Project during 2022, creating platforms within duct risers as part of a state of good repair effort.",
      }).event_family,
    ).toBe("construction");
    expect(event({ event_kind: "analysis snapshot", description: "Annual impact analysis for Fuel Hedge Program as of May 10, 2022." }).event_family).toBe(
      "document_metadata",
    );
    expect(event({ event_kind: "data collection", description: "Report card data collection period using Bus Time feed data and speed data." }).event_family).toBe(
      "document_metadata",
    );
    expect(event({ event_kind: "announcement", description: "Mayor's 2019 State of the City announcement of improve bus speeds 25% by 2020." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "pilot period", description: "Summer Saturdays pilot runs on Saturdays between July 6 and August 31, 2024." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "enrollment start", description: "New customers begin to be added to Phase 3 E-Hail program pending budget analysis." }).event_family).toBe(
      "launch",
    );
    expect(event({ event_kind: "planned migration", description: "B&T plans to begin migration from hard-case transponders to less expensive interior sticker tags." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "schedule delay", description: "Full completion of Penn Station Access project expected to be delayed until 2030, from original schedule of 2027." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "hiring start", description: "Penn Station Access hiring planned to start in 2025 for train crews and operations managers." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "scheduled work", description: "Planter delivery and hardening scheduled." }).event_family).toBe("planning");
    expect(event({ event_kind: "ride-along", description: "Assemblymember Alex Bores and NYCT President Rich Davey ride-along on the 6 line." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "roundtable", description: "President Davey represented MTA at White House roundtable on the future of Zero-Emission bus manufacturing." }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({
        event_kind: "summit",
        description:
          "Mayor Eric Adams and MTA Chair and CEO Janno Lieber announced 150 miles of new/enhanced bus lanes and busways over 4 years, launching planning for Flatbush Avenue bus priority.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "delivery", description: "Expected delivery of first 15 devices." }).event_family).toBe("other");
    expect(event({ event_kind: "environmental review", description: "Target completion of a generic environmental review." }).event_family).toBe("other");
    expect(event({ event_kind: "software deployment", description: "Software deployment update." }).event_family).toBe("other");
    expect(event({ event_kind: "regulatory mandate", description: "Agency mandate discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "work continuation", description: "Generic work continuation." }).event_family).toBe("other");
    expect(event({ event_kind: "program rename", description: "Internal program rename." }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure", description: "Infrastructure update." }).event_family).toBe("other");
    expect(event({ event_kind: "analysis snapshot", description: "Snapshot of a generic analysis." }).event_family).toBe("other");
    expect(event({ event_kind: "data collection", description: "Generic data collection period." }).event_family).toBe("other");
    expect(event({ event_kind: "planned migration", description: "General migration plan." }).event_family).toBe("other");
    expect(event({ event_kind: "schedule delay", description: "Generic schedule delay." }).event_family).toBe("other");
    expect(event({ event_kind: "hiring start", description: "Hiring starts later." }).event_family).toBe("other");
    expect(event({ event_kind: "scheduled work", description: "Generic scheduled work." }).event_family).toBe("other");
    expect(event({ event_kind: "ride-along", description: "Internal ride-along." }).event_family).toBe("other");
    expect(event({ event_kind: "roundtable", description: "General policy roundtable." }).event_family).toBe("other");
    expect(event({ event_kind: "summit", description: "General annual summit." }).event_family).toBe("other");
  });

  it("maps exact public engagement events to public engagement without broad event matching", () => {
    expect(event({ event_kind: "public workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public design workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community forum" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_forum" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public town hall" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public webinar" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_engagement" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "community engagement" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "education campaign", description: "Busway education campaign ahead of busway launch." }).event_family).toBe("public_engagement");
    expect(
      event({
        event_kind: "education_campaign",
        description: "Door-to-door outreach, on-street engagement, informational signage, website, and digital updates ahead of launch for the busway.",
      }).event_family,
    ).toBe("public_engagement");
	    expect(event({ event_kind: "community workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community_board_briefing" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community board design review" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community_board_review" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community_board_update" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community_consultation" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "community walk-through" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "design charrette" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "design workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_discussion" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_feedback" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_workshop_series" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "residents_briefing" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "stakeholder_briefing" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "customer engagement", event_name: "Connect with Us" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "customer_engagement", description: "TransitTalk event where NYCT President engaged customers on OMNY." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "customer engagement", event_name: "First customer appreciation luncheon" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "customer_engagement" }).event_family).toBe("other");
    expect(event({ event_kind: "panel discussion", description: "B.E.G.I.N. held a panel discussion centered on Advancing Black Excellence in the Workplace." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "panel_discussion", event_name: "EWT International Women's Day - Expanding HERizons Panel Discussion & Art Showcase" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "panel_discussion" }).event_family).toBe("other");
    expect(event({ event_kind: "workshop" }).event_family).toBe("other");
	    expect(event({ event_kind: "public event" }).event_family).toBe("other");
		    expect(event({ event_kind: "public event", description: "A public event was held where feedback was received." }).event_family).toBe("other");
		    expect(event({ event_kind: "community event", description: "Town Family Fun Day event utilizing parking lots." }).event_family).toBe("other");
    expect(event({ event_kind: "education_campaign" }).event_family).toBe("other");
    expect(event({ event_kind: "education campaign", description: "Internal education campaign for employees." }).event_family).toBe("other");
		    expect(event({ event_kind: "employee_event", description: "Virtual Cafecito chat hosted by Latinos & Friends ERG." }).event_family).toBe(
	      "public_engagement",
	    );
    expect(event({ event_kind: "employee_resource_group_program", event_name: "Como Yo Spanish Language Program Launch", description: "Latinos & Friends Como Yo program to practice conversational Spanish." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "job shadowing initiative", description: "Latinos & Friends launched a job shadowing initiative for Shadow Day career options." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_workshop", description: "Employee Resource Group All Member Meeting Workshop allowed nine ERGs to network and collaborate." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_training", description: "ERG Leadership Training centered on developing strong leaders." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "discussion", description: "Abilities ERG presents All-Agency Accessible Programs discussion." }).event_family).toBe("public_engagement");
    expect(
      event({
        event_kind: "career_event",
        event_family: "other",
        lifecycle_phase: "other",
        lifecycle_phase_other: "career_event",
        description: "Latinos & Friends hosted a Shadow Day career options event.",
      }).event_family,
    ).toBe("public_engagement");
	    expect(event({ event_kind: "employee_resource_group_event", description: "Back to School Photos." }).event_family).toBe("other");
	    expect(event({ event_kind: "employee_resource_group_event", description: "Tabletop Model Train Project." }).event_family).toBe("other");
    expect(
      event(
        {
          event_kind: "employee_resource_group_event",
          event_name: "Back to School Photos",
          description: "School photos - preschool to high school - and general talent. Submit photos by September 8.",
        },
        {
          evidence_quotes: [
            "Back to School Photos September 30 - School photos - preschool to high school - and general talent! Submit your photos by September 8 All are welcome to participate!",
          ],
        },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "employee_resource_group_event",
        event_name: "Tabletop Model Train Project",
        description: "Design. Build. Collaborate. Showcase your skills and talent! Learn 3D printing, design, and more.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        {
          event_kind: "employee_resource_group_event",
          event_name: "Tabletop Model Train Project",
          description: "Design. Build. Collaborate. 2 Broadway, 20th Fl Conference Room.",
        },
        {
          evidence_quotes: ["Register to attend in person or virtually Tuesday, April 23 12 PM - 1 PM 2 Broadway, 20th Fl Conference Room"],
        },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        {
          event_kind: "community event",
          event_name: "Family Fun Day",
          description: "Town of Cortlandt Family Fun Day event utilizing parking lots 1 and 2 at Cortlandt Station",
        },
        {
          evidence_quotes: ["Municipal and not-for-profit corporations for non-commercial activities used the railroad facilities for an annual Family Fun Day event."],
        },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "donation drive",
        event_name: "All Generational Winter Coat & Toy Drive",
        description: "All Generational hosted their annual winter toy and coat drive to benefit The Henry Street Settlement.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "drive", event_name: "Winter Toy and Coat Drive", description: "Drive to benefit The Henry Street Settlement and The Bronx Defenders." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "drive", description: "Generic collection drive." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "panel",
        event_name: "Generations in the Workforce",
        description: "A conversation Across Generations embracing generational perspectives at the MTA.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "heritage_celebration",
        event_name: "Jewish American Heritage Month Event 2023",
        description: "MTA in collaboration with The Museum of Jewish Heritage held a conversation with a Holocaust survivor.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "charity_event",
        description: "LIRR and Metro-North employees joined the American Cancer Society Making Strides Against Breast Cancer Walk.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "charity_event", description: "Generic charity event." }).event_family).toBe("other");
    expect(event({ event_kind: "annual community event", event_name: "Town of Ossining Annual Earth Day" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "annual community event", description: "Generic annual community event." }).event_family).toBe("other");
	    expect(event({ event_kind: "career_event", description: "Career panel for staff." }).event_family).toBe("other");
	    expect(event({ event_kind: "discussion", description: "General discussion of accessible programs." }).event_family).toBe("other");
    expect(event({ event_kind: "employee resource group event" }).event_family).toBe("other");
    expect(event({ event_kind: "ERG event" }).event_family).toBe("other");
    expect(event({ event_kind: "briefing" }).event_family).toBe("other");
    expect(event({ event_kind: "committee briefing" }).event_family).toBe("governance");
    expect(event({ event_kind: "community event" }).event_family).toBe("other");
    expect(event({ event_kind: "conference" }).event_family).toBe("other");
    expect(event({ event_kind: "job fair" }).event_family).toBe("other");
    expect(event({ event_kind: "ceremony", description: "Veterans Day ceremony and wreath laying in Grand Central Terminal." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "ceremony", event_name: "Veteran Day Ceremony and Parade" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "ceremony", description: "School Safety Backpack Contest Ceremony." }).event_family).toBe("other");
    expect(event({ event_kind: "ceremony", description: "Medal and Award Ceremony." }).event_family).toBe("milestone");
    expect(event({ event_kind: "private event", description: "Award ceremony" }).event_family).toBe("milestone");
  });

  it("maps exact residual event scout gates without broad venue or schedule matching", () => {
    const extraService = event(
      { event_kind: "horse race", description: "Belmont Stakes Race at Belmont Park." },
      { raw_text: "The LIRR will run extra trains in each direction to serve patrons of the event." },
    );
    expect(extraService.event_family).toBe("implementation");
    expect(extraService.raw_text).toBeUndefined();
    expect(event({ event_kind: "concert", description: "Concert at a regional venue." }).event_family).toBe("other");

    expect(event({ event_kind: "baseball_season", description: "Metro-North provides extra services including Yankee Clipper trains." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "current status", description: "15 electric buses operating in Manhattan." }).event_family).toBe("implementation");
    expect(
      event({
        event_kind: "safety_project",
        description: "Previous Tremont Avenue safety project in 2016 that reduced injuries on the corridor.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "operating start", description: "Gateway Foods has been operating in the Licensed Area since May 2014." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "operations start", description: "Marky's has been operating in MKT-23 since 2022." }).event_family).toBe("implementation");
    expect(event({ event_kind: "operating period", description: "Generic operating period." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "notice_submission",
        description: "Explanatory Statement was submitted to the appropriate New York State officials pursuant to Public Authorities Law.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "notice_transmittal",
        description: "Notice was forwarded to the Governor, the Speaker of the Assembly, and the Temporary President of the Senate.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "notice_submission", description: "Generic notice record." }).event_family).toBe("other");
    expect(event({ event_kind: "storm", description: "Hurricane Ida struck the region." }).event_family).toBe("incident");
    expect(event({ event_kind: "natural disaster", description: "Superstorm Sandy struck the region." }).event_family).toBe("incident");
    expect(
      event({
        event_kind: "storm response",
        description: "Winter Storm Fern brought sustained snowfall and employees applied deicer.",
      }).event_family,
    ).toBe("incident");
    expect(
      event({
        event_kind: "winter storm operations",
        description: "MTA kept operating during Winter Storm Fern.",
      }).event_family,
    ).toBe("incident");
    expect(event({ event_kind: "weather event", description: "Winter Storm Fern impacted the region; MTA was the only major transit agency that kept operating." }).event_family).toBe(
      "incident",
    );
    expect(event({ event_kind: "weather event", description: "Generic weather forecast." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "warranty_expiration",
        description: "PTG warranty period expired in December 2025 and contract ended December 31, 2025.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "warranty_expiration", description: "Warranty coverage period." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "guidance received",
        description: "Received guidance from FHWA regarding Environmental Assessment for CBD Tolling Program.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "guidance received", description: "Received internal guidance." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "rebranding",
	        description: "Metro-North rebranded the customer call ahead assistance program as Metro-North Care to align with LIRR Care.",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "protest", description: "Jews for Peace protest at Grand Central Terminal during rush hour resulting in roughly 335 arrests." }).event_family).toBe(
	      "incident",
	    );
	    expect(event({ event_kind: "protest", description: "General protest outside a station." }).event_family).toBe("other");
	    expect(event({ event_kind: "budget deal", description: "Gov. Hochul Secures 4-Year Budget Deal to Fund MTA" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "budget deal", description: "General budget deal." }).event_family).toBe("other");
	    expect(event({ event_kind: "labor_settlement", description: "MTA and TWU Local 100 tentative agreement effective May 2023." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "labor_settlement", description: "Generic labor settlement." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "presidential visit",
	        description: "President Joe Biden visited West Side Yard to announce a $292 million federal commitment towards the Hudson Tunnel Project.",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "presidential visit", description: "President visited a facility." }).event_family).toBe("other");
	    expect(event({ event_kind: "personnel start", description: "Quemuel Arroyo started as the MTA's first agency-wide Chief Accessibility Officer." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "employment start", description: "Steven La joined NYCT's Paratransit Department after completing undergraduate studies." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "hiring cohort", description: "Metro-North welcomed a cohort of 28 new Engineering trainees." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "personnel start", description: "Staff role context." }).event_family).toBe("other");
	    expect(event({ event_kind: "employment start", description: "Employee bio context." }).event_family).toBe("other");
	    expect(event({ event_kind: "hiring cohort", description: "Hiring cohort summary." }).event_family).toBe("other");
	    expect(
	      event(
	        { event_kind: "inception", description: "FMTAC Aggregate Portfolio inception date." },
	        { raw_text: "Inception date: 2/23/2018" },
	      ).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "inception", description: "Generic inception date." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "price adjustment",
	        description: "When New Flyer was notified of its selection for award, it offered a unilateral price concession of $1 million.",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "price adjustment", description: "Generic price adjustment." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "operation",
	        description: "Coordinated safe passage under the Verrazzano-Narrows Bridge of a cargo vessel carrying four tall container cranes.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "operation", description: "Generic operation." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "seasonal_preparation",
	        description: "Prepared for summer operations by inspecting every line and location for air comfort system functionality.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "seasonal_preparation", description: "Seasonal preparation." }).event_family).toBe("other");
	    expect(
	      event(
	        { event_kind: "safety_program", description: "Metro-North Seasonal Safety Focus Days launch with Spring theme Prepared to Perform." },
	        { raw_text: "Spring will focus on Prepared to Perform." },
	      ).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "safety_program", description: "Generic safety program." }).event_family).toBe("other");
	    expect(
	      event(
	        { event_kind: "awareness day", event_name: "International Level Crossing Awareness Day", description: "MNR education and enforcement event." },
	        { raw_text: "International Level Crossing Awareness Day (ILCAD) - June 9, 2022" },
	      ).event_family,
	    ).toBe("public_engagement");
		    expect(event({ event_kind: "awareness day", description: "Generic awareness day." }).event_family).toBe("other");
		    expect(event({ event_kind: "awareness_week", event_name: "2026 National Work Zone Awareness Week" }).event_family).toBe("public_engagement");
		    expect(event({ event_kind: "awareness_week", description: "Generic awareness week." }).event_family).toBe("other");

    expect(
      event({
        event_kind: "training",
        description: "Employees supported emergency response training with MTAPD's Emergency Services Unit. Tactical exercises using railroad equipment, including M8 rail cars.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event(
        {
          event_kind: "training",
          event_name: "Operation Lifesaver Authorized Volunteer Training",
          description: "More than 30 MNR Office of System Safety employees completed OLAV training.",
        },
        { raw_text: "This program equips employees to deliver impactful rail safety presentations in the communities we serve." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        {
          event_kind: "certification",
          event_name: "Operation Lifesaver Authorized Volunteer",
          description: "Elaine Lee became an Operation Lifesaver Authorized Volunteer.",
        },
        { raw_text: "This strengthens our ability to deliver free rail safety education to the communities we serve." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        { event_kind: "contest", description: "Metro-North's Rail Safety Sticker Contest results announced." },
        { raw_text: "Presented student artwork of the winners. There were 240 entries and all participants were thanked." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        {
          event_kind: "ceremony",
          description: "Long Island Rail Road will recognize winners of last year's School Safety Backpack Contest.",
        },
        { raw_text: "Students created a safety-themed slogan promoting Safety Around Trains and Tracks for upcoming T.R.A.C.K.S. presentations." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        {
          event_kind: "audition",
          description: "First auditions for Music Under New York since May 2019.",
        },
        { raw_text: "Music Under New York auditions gave passersby's, riders and employees a chance to enjoy performances and musicians performed live for the public." },
      ).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "showcase", description: "Staycation Showcase introduced day-trip ideas to more than 500 visitors with over 25 tourism partners." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "expo", event_name: "April IT Expo", description: "4,000+ applications submitted, 95 interviews, 47 offers made." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "process_change", description: "Automated some dataset uploads." }).event_family).toBe("implementation");
    expect(event({ event_kind: "redesign", description: "Redesigned the NYCT and LIRR / MNR committee books." }).event_family).toBe("implementation");
    expect(
      event({
        event_kind: "extension",
        event_name: "COVID-19 Family Benefits extension",
        description: "Agreements extended the availability of the supplemental Family Benefits Agreement until August 31, 2021.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "vacated", description: "Rite-Aid Pharmacy vacated retail space MC-10." }).event_family).toBe("milestone");
    expect(
      event(
        { event_kind: "closeout", description: "Mid-Suffolk Yard closeout forecast." },
        { raw_text: "New yard support facility completion: March 2020 (Actual). Yard and supporting infrastructure completion: October 2020 (Actual). Closeout: July 2023 (Forecast)." },
      ).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "commemoration", description: "TBTA's 90th anniversary commemoration with archival photos." }).event_family).toBe("milestone");
    expect(event({ event_kind: "recognition program", description: "Transit All-Stars May 2024 employee recognition program." }).event_family).toBe("milestone");
    expect(
      event(
        { event_kind: "appreciation_day", description: "Transit Employee Appreciation Day noted by President Davey." },
        { raw_text: "President Davey spoke of his visits to over a dozen employee facilities that day." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        { event_kind: "recognition day", description: "National Transit Employee Appreciation Day observed on March 18." },
        { raw_text: "President Crichlow thanked employees throughout New York City Transit for their dedication and service." },
      ).event_family,
    ).toBe("public_engagement");
    expect(
      event(
        { event_kind: "strike", description: "A strike by NJ Transit train operators could begin on Friday May 16 at 12:01 AM." },
        { raw_text: "In the event of a strike, there will be no Metro-North West of Hudson service." },
      ).event_family,
    ).toBe("pause");
    expect(
      event(
        {
          event_kind: "demonstration",
          description: "AAR demonstrated a new van model which will join the AAR fleet - the Ford E-450.",
        },
        { raw_text: "Access-A-Ride hit another operations and cleanliness milestone. 15 vans with the feature are expected to join current AAR fleet." },
      ).event_family,
    ).toBe("milestone");
    expect(
      event(
        {
          event_kind: "pilot_duration",
          description: "Duration of fare pilot promotion would be at least 12 months.",
        },
        { raw_text: "This fare pilot promotion will start with the sale of monthly passes for July 2024." },
      ).event_family,
    ).toBe("implementation");
    expect(
      event(
        { event_kind: "phase", date_text: "Summer 2024", description: "Expand trip subsidy to $60 per trip." },
        { raw_text: "Summer 2024: Strategic Improvement" },
      ).event_family,
    ).toBe("implementation");
    expect(
      event(
        { event_kind: "expansion", date_text: "Fall 2024", description: "Onboard up to 800 new customers if budget impact is as expected." },
        { raw_text: "Fall 2024: Strategic Expansion" },
      ).event_family,
    ).toBe("implementation");
    expect(
      event(
        {
          event_kind: "Financial Plan update",
          description: "Board updated on City, State, and federal actions.",
        },
        { raw_text: "The Board will be updated as part of the February Financial Plan." },
      ).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "fiscal year-end results",
        description: "FMTAC finished 2025 with $250.6M in Gross Premium Earned, up 19.6% from 2024.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "gridlock alert", description: "UN Week September 22-29 - Gridlock Delays - Use Mass Transit." }).event_family).toBe(
      "publication",
    );
    expect(
      event(
        {
          event_kind: "discussion",
          description: "Discussions with TMHA led to request for permanent exclusive-use easement.",
        },
        { raw_text: "Following discussions with TMHA in March 2024, TMHA requested to move forward with a permanent, exclusive-use easement." },
      ).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "training", description: "General staff training." }).event_family).toBe("other");
    expect(event({ event_kind: "strike", description: "A strike could begin." }).event_family).toBe("other");
    expect(event({ event_kind: "demonstration", description: "Vehicle demonstration." }).event_family).toBe("other");
    expect(event({ event_kind: "pilot_duration", description: "Pilot duration TBD." }).event_family).toBe("other");
    expect(event({ event_kind: "phase", description: "Generic strategic phase." }).event_family).toBe("other");
    expect(event({ event_kind: "expansion", description: "Generic expansion." }).event_family).toBe("other");
    expect(event({ event_kind: "Financial Plan update", description: "General financial plan update." }).event_family).toBe("other");
    expect(event({ event_kind: "fiscal year-end results", description: "Year-end results summary." }).event_family).toBe("other");
    expect(event({ event_kind: "gridlock alert", description: "Gridlock alert." }).event_family).toBe("other");
    expect(event({ event_kind: "discussion", description: "General easement discussion." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "contract_modification",
        description: "MTA Strategic Initiatives approached Procurement to add 38 new NYC Transit locations to the Runwise contract.",
      }).event_family,
    ).toBe("other");

		    expect(event({ event_kind: "option exercise", description: "Approved by the December 2020 Board for eight additional locomotives." }).event_family).toBe(
		      "approval",
    );
    expect(event({ event_kind: "proposed_extension", description: "Staff Summary requests Board adoption of a further extension." }).event_family).toBe(
      "approval",
    );
    expect(
      event({
        event_kind: "procurement_action",
        description: "Proposed award of competitively solicited personal service contract for Construction Management and Inspection Services for Bridge Preservation at Bronx-Whitestone under WBM-389/TNM-402.",
      }).event_family,
    ).toBe("approval");

    expect(event({ event_kind: "coverage_target", description: "Target for 74% of subway stations to have micromobility share access." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "goal_target", description: "Customer satisfaction increase target of 10% by June 2024." }).event_family).toBe("planning");
    expect(event({ event_kind: "target", description: "Estimated 800 additional conductor cab camera systems in service." }).event_family).toBe("planning");
    expect(event({ event_kind: "closeout", description: "Generic closeout forecast." }).event_family).toBe("other");
    expect(event({ event_kind: "target", description: "Generic target record." }).event_family).toBe("other");

    expect(event({ event_kind: "delivery window", description: "Delivery schedule for 13 B+AC locomotives from January 2029 through July 2030." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "future_initiative", description: "MTA will provide free MTA-issued reduced fare OMNY cards beginning next year." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "prototype_display", description: "Wide Fare Gate prototype was on display at Jay St-MetroTech." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "accomplishment", description: "We've already made big strides in 2021." }).event_family).toBe("milestone");
    expect(event({ event_kind: "capital project", description: "Upcoming capital project at Bay Parkway & Cropsey Avenue intersection." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "capital project phase", description: "Adjustment, monitoring and evaluation period before capital project phase." }).event_family).toBe(
      "planning",
    );

    expect(event({ event_kind: "expected_payment", description: "Expected payment of MRT-2 escalator payments." }).event_family).toBe("milestone");
    expect(event({ event_kind: "financial_reconfiguration", description: "MTA Finance reconfigured its $1.3 billion revolving line of credit program." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "valuation", event_name: "Broker Opinion of Value" }).event_family).toBe("milestone");
    expect(event({ event_kind: "appraisal_update", description: "Updated appraisal of Premises for revised fee simple request." }).event_family).toBe("milestone");

    expect(event({ event_kind: "facility tour", description: "Government and Community Relations conducted a tour of the Professional Paratransit Facility with Queens Borough President." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "competition", description: "MTA's first Open Data Challenge launched in fall 2024." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "walking tour", description: "Walking tours of 125th Street." }).event_family).toBe("public_engagement");

    expect(event({ event_kind: "contract closure", description: "Anticipate finalizing contract closure agreement with Alstom/Siemens." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "program_review", description: "Runwise Program will be reevaluated and decision made." }).event_family).toBe("planning");
    expect(event({ event_kind: "inspection", description: "ENSCO geometry runs scheduled." }).event_family).toBe("planning");
    expect(event({ event_kind: "committee_cancellation", description: "No meeting scheduled." }).event_family).toBe("governance");
    expect(
      event({
        event_kind: "special event",
        description: "Bronx-bound upper level closed to vehicular traffic at 5:30 am and reopened at 10:50 am.",
      }).event_family,
    ).toBe("pause");
    expect(event({ event_kind: "non_responsible_determination", description: "Kapsch deemed Non-Responsible by NYS Office of General Services." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "withdrawal", description: "Nova Bus withdrew its proposal prior to submitting a Best and Final Offer." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "actuarial_certification", description: "Statement of Actuarial Opinion as of December 31, 2025." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "strategic plan", event_name: "MTA Five Year Diversity Equity and Inclusion Strategic Plan" }).event_family).toBe("publication");
  });

  it("maps payload-proven public workshops, town halls, briefings, and walkthroughs without internal-event broadening", () => {
    expect(event({ event_kind: "town_hall", event_name: "Community Board 3 Town Hall" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "town_hall", event_name: "IBX Town Halls", description: "In-person town hall meetings on Interborough Express" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "workshop", event_name: "Public Workshop #1: Community Planning" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "workshop", description: "MTA Bronx Bus Network Redesign Workshop at Davidson Community Center" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "briefing", event_name: "Bronx Elected Officials Briefing" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "briefing", event_name: "Pomonok Houses Transportation Committee: Select Bus Service Briefing" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "briefing", description: "Briefing to Community Board 8 on the Utica Avenue SBS project." }).event_family).toBe(
      "public_engagement",
    );
	    expect(event({ event_kind: "walkthrough", description: "Walkthrough of 125th Street as part of SBS planning" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "walkthrough", description: "Walkthrough with DOT Commissioner, NYCT President, Bronx BP, CM Feliz, CM Sanchez" }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "site tour", event_name: "CAC Tour of Fordham Road SBS" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "public tour", description: "Public tour of M15 Select Bus Service." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "tour", event_name: "M15 SBS Tour" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "tour", description: "Metro-North welcomed Senator Pete Harckham and Ossining Town Supervisor Liz Feldman for a tour of Croton-Harmon Yard." }).event_family).toBe(
	      "public_engagement",
	    );
		    expect(event({ event_kind: "walking_tour", description: "Walking tours of 125th Street as part of public outreach for SBS." }).event_family).toBe(
		      "public_engagement",
		    );
    expect(
      event({
        event_kind: "input phase",
        description: "Gather feedback and suggestions from stakeholders, riders, and area residents.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "input_phase",
        description: "Input phase to gather feedback and suggestions from stakeholders and area residents, with community engagement to follow.",
      }).event_family,
    ).toBe("public_engagement");
		    expect(event({ event_kind: "town_hall", description: "NYCT leadership team held a town hall. Over 800 employees attended." }).event_family).toBe("other");
			    expect(event({ event_kind: "workshop", description: "Employee Resource Group All Member Meeting Workshop focused on Emotional Intelligence." }).event_family).toBe(
			      "public_engagement",
			    );
	    expect(event({ event_kind: "briefing", description: "The committee will be briefed on the status of project implementation." }).event_family).toBe("other");
	    expect(event({ event_kind: "walkthrough", description: "Internal walkthrough of station back-office procedures." }).event_family).toBe("other");
		    expect(event({ event_kind: "tour", description: "Young Professional tour of CBTC facilities." }).event_family).toBe("other");
			    expect(event({ event_kind: "tour", description: "Elected officials toured Croton-Harmon Yard." }).event_family).toBe("other");
			    expect(event({ event_kind: "tour", description: "Grand Avenue Depot tour during Climate Week." }).event_family).toBe("other");
				    expect(event({ event_kind: "public event", description: "One-day event to promote the city of Tokyo tourism." }).event_family).toBe("other");
    expect(event({ event_kind: "marketing_campaign", description: "Grand Central flash sale marketing campaign." }).event_family).toBe("other");
	    expect(event({ event_kind: "input phase" }).event_family).toBe("other");
    expect(event({ event_kind: "input_phase", description: "Internal input phase for project staff." }).event_family).toBe("other");
	    expect(event({ event_kind: "blood drive", description: "MNR Blood Drive" }).event_family).toBe("other");
			  });

  it("maps narrow special-event service and infrastructure milestones without venue-event broadening", () => {
    expect(
      event({
        event_kind: "event",
        description: "LIRR offered increased service to Mets-Willets Point for fans attending the matches. Almost 227,000 tickets to and from Mets-Willets Point were sold.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event({
        event_kind: "station_status_change",
        description: "Mets-Willets Point becomes a permanent LIRR station stop with year-round daily service.",
      }).event_family,
    ).toBe("launch");
    expect(event({ event_kind: "station_status_change", description: "Station status change discussion." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "special_event",
        description: "TCS NYC Marathon weekend produced record-setting subway ridership.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "tour",
        description: "Grand Avenue Depot tour during Climate Week highlighted NYPA Phase I charging infrastructure construction progress.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "site_tour",
        description: "Grand Avenue Depot NYPA Phase I charging infrastructure milestone tour.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "policy announcement",
        description: "City announced plans to install 28 miles of new busways and bus lanes in 2021.",
      }).event_family,
    ).toBe("planning");
    expect(
      event({
        event_kind: "service announcement",
        description: "Announcement that both east and westbound trains could now stop at Elmont-UBS Arena station - the first new LIRR station in almost 50 years.",
      }).event_family,
    ).toBe("launch");

    expect(event({ event_kind: "event", description: "Annual squash tournament." }).event_family).toBe("other");
    expect(event({ event_kind: "event", description: "52nd running of the TCS New York City Marathon started from Verrazzano-Narrows Bridge." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "special_event", description: "155th running of the Belmont Stakes; LIRR carried approximately 22,900 fans." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "special_event", description: "154,000 customers attended the Ryder Cup at Bethpage Black." }).event_family).toBe("other");
    expect(event({ event_kind: "tour", description: "Communication-Based Train Control CBTC Tour - Young Professional." }).event_family).toBe("other");
    expect(event({ event_kind: "tour", description: "Grand Avenue Depot tour during Climate Week." }).event_family).toBe("other");
    expect(event({ event_kind: "policy announcement", description: "Governor Hochul announces five-point plan to protect New Yorkers on the subway." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "policy announcement", description: "Mayor announces policy launch one year after plan launched." }).event_family).toBe("other");
    expect(event({ event_kind: "service announcement" }).event_family).toBe("other");
    expect(event({ event_kind: "service_announcement", description: "Officials announced there will be increased weekend service on the G, J and M lines." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "public event", description: "One-day event to promote the city of Tokyo tourism." }).event_family).toBe("other");
  });

  it("maps narrow public/social tail events without generic event broadening", () => {
	    expect(event({ event_kind: "customer_engagement_event", description: "TransitTalk event engaging with customers." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "customer_safety_event", description: "LIRR customer safety day to engage directly with customers." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "help_desk_event", description: "OMNY help desk event was well attended." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "employee_event", event_name: "Cafecito Chat with Jose La Salle", description: "Hosted by Latinos & Friends ERG." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "employee_program", event_name: "Como Yo", description: "MTA colleagues connect to practice conversational Spanish." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "chat", event_name: "Cafecito Chat with Hector Garcia" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "chat event", description: "Cafecito Chat - Latinos & Friends with Catherine Sheridan" }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "virtual chat", event_name: "Cafecito Chat with Lourdes Zapata" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "future_workshops", description: "Future workshops and meetings for Fordham Road bus priority." }).event_family).toBe(
	      "public_engagement",
	    );
    for (const payload of [
      {
        event_kind: "awareness_event",
        description: "Customer Safety and Suicide Prevention Awareness outreach at Penn Station.",
      },
      {
        event_kind: "feedback_portal",
        description: "Feedback Portal launched and received 52 location-specific comments.",
      },
      {
        event_kind: "career event",
        description: "Students visited Zerega during Career Discovery Week, learning about job opportunities.",
      },
      {
        event_kind: "consultation",
        description: "Consultation with Community Boards 9, 10 and 11 during summer 2012.",
      },
      {
        event_kind: "ambassador_program",
        description: "Customer ambassador program launched; Ambassadors also deployed at stations.",
      },
      {
        event_kind: "interview",
        description: "Employer Interviews conducted as part of Alternatives Analysis public outreach.",
      },
      {
        event_kind: "feedback_session",
        description: "Feedback sessions at transit hubs for the project corridor.",
      },
      {
        event_kind: "resource fair",
        description: "Older Adult Resource Fair hosted at Lincoln Square.",
      },
      {
        event_kind: "career_day",
        description: "Government and Community Relations team attended the annual Career Day.",
      },
      {
        event_kind: "customer_service",
        description: "Customer Service team helping folks trade in unregistered MetroCards for OMNY cards.",
      },
      {
        event_kind: "kickoff",
        description: "Project kickoff meetings with community boards and elected officials' offices.",
      },
      {
        event_kind: "project_kickoff",
        description: "Project kickoff meetings with community boards and elected officials' offices.",
      },
      {
        event_kind: "educational program",
        description: "Government & Community Relations steMTA program at a Grade School.",
      },
    ]) {
      expect(event(payload).event_family).toBe("public_engagement");
    }
    expect(event({ event_kind: "feedback_portal", description: "Portal launched." }).event_family).toBe("other");
    expect(event({ event_kind: "career_event", description: "Internal staff career panel." }).event_family).toBe("other");
    expect(event({ event_kind: "kickoff", description: "Internal project kickoff meeting." }).event_family).toBe("other");
    expect(event({ event_kind: "customer_service", description: "Internal help-desk staffing update." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "community_event",
        event_name: "56th Annual African American Day Parade",
	        description: "B.E.G.I.N. Employee Resource Group participating in the African American Day Parade.",
	      }).event_family,
	    ).toBe("public_engagement");
	    expect(event({ event_kind: "community_event", description: "Spring clean-up at Lakeview Station supported by LIRR." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "lunch and learn", description: "Pride Express hosted a lunch and learn detailing the timeline of LGBTQ+ rights." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "walking tour", event_name: "Pride Express Village Historical Walking Tour" }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "Pride event", description: "Stonewall Historical Walking Tour - Pride Express" }).event_family).toBe("public_engagement");
		    expect(event({ event_kind: "Pride Month event", event_name: "Mayor's Annual LGBTQ+ Pride Reception", description: "Part of June Pride Month activities." }).event_family).toBe(
		      "public_engagement",
		    );
    expect(
      event({
        event_kind: "marketing_campaign",
        description: "Tap On, Get On OMNY fare payment system campaign reached 472 subway stations, 5,800 buses, and Staten Island Railway.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "tour",
        description: "LIRR hosted PCAC staff for a tour of LIRR facilities, including Jamaica Control Center and Hillside Support Facility.",
      }).event_family,
    ).toBe("public_engagement");
		    expect(event({ event_kind: "parade", description: "MTA Accessibility team's participation in the Disability Pride Parade." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "safety_event", event_name: "Customer Safety Day", description: "Safety event for LIRR customers." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "safety_campaign", description: "Rail Safety Week customer and employee outreach at stations." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "job fair", event_name: "LIRR Job Fair", description: "Represented jobs available in Queens." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "recruitment_event", description: "Recruitment Open House with potential job applicants." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "memorial", description: "Commemorative event honoring Garrett Goble with a mural unveiling." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "training", description: "ERG Leadership Training centered on developing strong leaders." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "observance", description: "Veterans Employee Resource Group held a noontime Memorial Day Observance." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "networking", description: "Young Professionals speed networking event for ERG members and MTA employees." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "charity drive", description: "All Generational hosted their annual winter toy and coat drive." }).event_family).toBe(
	      "public_engagement",
	    );
    expect(
      event({
        event_kind: "blood drive",
        description: "14th annual blood drive in partnership with New York Blood Center in Grand Central's Vanderbilt Hall.",
      }).event_family,
    ).toBe("public_engagement");
	    expect(event({ event_kind: "community/charity event", description: "Day of Giving collecting donations from customers at Penn Station." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "awareness campaign", description: "National Rail Safety Week public outreach at stations." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "advisory_committee", description: "Community Advisory Committee formed as part of public outreach." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "kickoff", description: "Project kickoff event with elected officials and on-street outreach to 500+ customers." }).event_family).toBe(
	      "public_engagement",
	    );
	    expect(event({ event_kind: "design period", description: "Continue to refine design based on traffic analysis and public feedback." }).event_family).toBe(
	      "public_engagement",
	    );
		    expect(event({ event_kind: "unveiling_ceremony", description: "Veterans locomotive unveiling ceremony." }).event_family).toBe("milestone");
		    expect(event({ event_kind: "conference", description: "Pre-proposal conference held on September 8, 2022, attended by New Flyer and Nova Bus." }).event_family).toBe(
		      "milestone",
		    );
		    expect(event({ event_kind: "conference", description: "First industry-wide C3RS Confidential Close Call Reporting System Symposium." }).event_family).toBe(
		      "public_engagement",
		    );
		    expect(event({ event_kind: "symposium", description: "MTA hosted a first-mile/last-mile symposium with over 100 attendees from county and local governments." }).event_family).toBe(
		      "public_engagement",
		    );
			    expect(event({ event_kind: "summit", description: "Annual On-Track Safety Summit with representatives from Metro-North, NJ Transit, PATH, Keolis, Amtrak, and MBTA." }).event_family).toBe(
			      "public_engagement",
			    );
			    expect(event({ event_kind: "safety summit", description: "On-Track Safety Summit with multi-agency railroad representatives." }).event_family).toBe(
			      "public_engagement",
			    );

			    expect(event({ event_kind: "customer_engagement_event", description: "Generic customer open house." }).event_family).toBe("other");
    expect(event({ event_kind: "customer_safety_event", description: "Safety announcement." }).event_family).toBe("other");
    expect(event({ event_kind: "help_desk_event", description: "Internal help desk staffing event." }).event_family).toBe("other");
    expect(event({ event_kind: "future_workshops", description: "Employee Resource Group workshops and meetings." }).event_family).toBe("other");
    expect(event({ event_kind: "virtual chat", description: "Internal project chat" }).event_family).toBe("other");
	    expect(event({ event_kind: "community_event", description: "Town Family Fun Day event utilizing parking lots." }).event_family).toBe("other");
	    expect(event({ event_kind: "ceremony", description: "Veterans Day wreath ceremony." }).event_family).toBe("public_engagement");
		    expect(event({ event_kind: "public event", description: "Sampling event of Bombay Sapphire and lemon Pellegrino." }).event_family).toBe("other");
		    expect(event({ event_kind: "conference", description: "Industry conference hosted by Metro-North and LIRR." }).event_family).toBe("other");
		    expect(event({ event_kind: "summit", description: "General annual summit." }).event_family).toBe("other");
		    expect(event({ event_kind: "parade", description: "St. Patrick's Day Parade; LIRR will operate extra train service." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "tour", description: "Young Professional tour of CBTC facilities." }).event_family).toBe("other");
	    expect(event({ event_kind: "special_event", description: "155th running of the Belmont Stakes; LIRR carried fans." }).event_family).toBe("other");
	    expect(event({ event_kind: "safety event", description: "Safety Focus Day for Maintenance of Equipment employees." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "holiday_market", description: "Annual holiday market with artisanal vendors sponsored by American Greetings. Public event." }).event_family).toBe(
	      "other",
	    );
			    expect(event({ event_kind: "public event", description: "Local artists showcased multiple oil paintings of New Yorkers." }).event_family).toBe("other");
			    expect(event({ event_kind: "safety summit", description: "Internal annual safety summit." }).event_family).toBe("other");
			  });

  it("maps station-prioritization public events without broad public-event matching", () => {
    expect(
      event({
        event_kind: "public event",
        description: "A public event was held where every geographic area across the system was reviewed and feedback was received on priority stations.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "public event",
        event_name: "Accessibility Priority Stations Public Event",
        description: "Public event where every geographic area across the system was reviewed and feedback received on priority stations for accessibility.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "public event", description: "A public event was held where feedback was received." }).event_family).toBe("other");
	    expect(event({ event_kind: "public event", description: "Annual holiday market with artisan vendors." }).event_family).toBe("other");
	    expect(event({ event_kind: "public_event", description: "Metro-North held its annual Open House with employees, retirees, and the public." }).event_family).toBe(
	      "public_engagement",
	    );
    expect(event({ event_kind: "public_event", description: "45th iteration of the NYC-permitted TD Five-Boro Bike Tour." }).event_family).toBe("other");
  });

  it("maps payload-proven employee resource group and ERG events without adjacent bucket broadening", () => {
    expect(
      event({
        event_kind: "employee resource group event",
        event_name: "B.E.G.I.N. A Celebration of the Culture: A Century of Black History",
        description: "B.E.G.I.N.'s Black History Month celebration centered on the 2026 theme.",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "employee resource group event",
        event_name: "Latinos & Friends: Cafecito Chat with Hector Garcia",
      }).event_family,
    ).toBe("public_engagement");
    expect(
      event({
        event_kind: "employee resource group event",
        event_name: "Young Professionals Speed Networking",
        description: "Young Professionals ERG hosted its second Professional Speed Networking event for ERG members and MTA employees.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "BEGIN: Leadership Conversations with MTA Presidents" }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({
        event_kind: "employee_resource_group_event",
        event_name: "EWT: ACS Making Strides Against Cancer Walk",
        description: "Supporting a cause.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Pride Express: Jeopardy with Bernie Wagenblast" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Abilities: Voices of Care" }).event_family).toBe("public_engagement");
    expect(
      event({
        event_kind: "employee_resource_group_event",
        event_name: "AAPI Heritage Month Program",
        description: "TransportAsian hosted a presentation focused on the Asian American Community.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Latinos & Friends: Hispanic Heritage Month Celebration" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_event", event_name: "56th Annual African American Day Parade" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Como Yo Spanish Program" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", description: "Latinos & Friends hosted a Shadow Day for members." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Making Strides Against Breast Cancer Walk" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Generations in the Workforce - A Conversation Across Generations" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Winter Toy and Coat Drive" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "From Storytelling to Support", description: "Working together on suicide prevention." }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({
        event_kind: "employee_resource_group_event",
        description: "MTA in collaboration with The Museum of Jewish Heritage held a conversation with Holocaust survivor Maritza Shelley.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee resource group event" }).event_family).toBe("other");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Back to School Photos" }).event_family).toBe("other");
    expect(event({ event_kind: "employee_resource_group_event", event_name: "Tabletop Model Train Project" }).event_family).toBe("other");
    expect(event({ event_kind: "ERG event", description: "B.E.G.I.N. Black History Month celebration." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "ERG event", description: "TransportAsian hosted a dynamic dialogues roundtable discussion." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "erg_event", description: "All member meeting allowing colleagues of the ten ERGs to network." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "ERG event" }).event_family).toBe("other");
    expect(event({ event_kind: "ERG membership drive", description: "All-Agency ERG Membership Drive." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "ERG event series", description: "Series of events celebrating Women's History Month." }).event_family).toBe("other");
	    expect(event({ event_kind: "employee_event", description: "Virtual Cafecito chat hosted by Latinos & Friends ERG." }).event_family).toBe(
	      "public_engagement",
	    );
    expect(event({ event_kind: "networking", description: "Professional speed networking for ERG members." }).event_family).toBe("public_engagement");
  });

  it("maps payload-proven ERG celebrations without drive or series broadening", () => {
    expect(event({ event_kind: "ERG Celebration", description: "B.E.G.I.N. celebrated Black History Month with focus on African American Leaders." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "ERG Celebration", description: "B.E.G.I.N. ERG celebrated the end of Kwanzaa with an Umoja after-work networking event." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "erg_celebration", description: "Empowering Women in Transportation led Women's History Month Celebration." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "ERG Celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "ERG membership drive", description: "All-Agency ERG Membership Drive." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "ERG event series", description: "Series of events celebrating Women's History Month." }).event_family).toBe("other");
    expect(event({ event_kind: "charity drive", description: "All Generational hosted their annual winter toy and coat drive." }).event_family).toBe("public_engagement");
  });

  it("maps payload-proven generic celebration events without broad celebration matching", () => {
    expect(event({ event_kind: "celebration", description: "B.E.G.I.N.'s Black History Month celebration at MTA Headquarters." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "celebration", description: "Empowering Women in Transportation (EWT) Women's History Month celebration." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "celebration", event_name: "Hispanic Heritage Month Celebration" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "celebration", description: "MTA celebration of Disability Pride Month with resource fairs across all five boroughs." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "celebration", description: "Pride Month celebrated by MTA with efforts to celebrate LGBTQIA+ customers and employees." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "celebration", description: "Transport Asian Employee Resource Group held an AAPI Heritage Month event." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "celebration", description: "MTA celebrated Earth Day with messaging displayed across digital screens systemwide." }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({ event_kind: "celebration", description: "MTA joined community leaders, elected officials, and NYC DOT to celebrate the Bronx local bus network redesign launch." })
        .event_family,
    ).toBe("launch");
    expect(event({ event_kind: "celebration", description: "Celebrating Congestion Pricing milestone." }).event_family).toBe("milestone");
    expect(event({ event_kind: "celebration", description: "Locust Manor's brand new elevators celebration scheduled by end of January." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "celebration", description: "Celebrating station improvements at St. Albans on the LIRR." }).event_family).toBe("milestone");
    expect(event({ event_kind: "celebration", description: "LIRR celebrated the all new Mineola Station, which opened exactly 100 years ago." }).event_family).toBe(
      "milestone",
    );
	    expect(event({ event_kind: "celebration", description: "MTA Earth Day celebration event." }).event_family).toBe("public_engagement");
	    expect(event({ event_kind: "celebration", description: "National Transit Employee Appreciation Day event at Penn Station." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "celebration", description: "Awards celebration for employees." }).event_family).toBe("other");
  });

  it("maps payload-proven employee engagement events without workforce or networking broadening", () => {
    expect(
      event({
        event_kind: "employee engagement event",
        event_name: "AAPL Heritage Month Celebration",
        description: "Virtual program celebrating prominent Asian Americans in US History, hosted by TransportAsian ERG.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee engagement event", description: "Informal Cafecito Chat hosted by Latinos & Friends ERG." }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({
        event_kind: "employee_engagement_event",
        description: "Transit-themed bingo night hosted by Young Professional ERG, open to all employees, with guided networking.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "employee engagement event" }).event_family).toBe("other");
	    expect(event({ event_kind: "employee_event", description: "Virtual Cafecito chat hosted by Latinos & Friends ERG." }).event_family).toBe(
	      "public_engagement",
	    );
    expect(event({ event_kind: "workforce event", description: "Return of the Bus Rodeo, an occasion to celebrate the workforce." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "networking event", description: "Professional speed networking for ERG members." }).event_family).toBe("public_engagement");
  });

  it("promotes stale other event family for public workshops during replay", () => {
    const out = event({ event_kind: "public workshop", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "public workshop" });
    expect(out.event_family).toBe("public_engagement");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("public workshop");

    const charrette = event({ event_kind: "design charrette", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "design charrette" });
    expect(charrette.event_family).toBe("public_engagement");
    expect(charrette.lifecycle_phase).toBe("other");
    expect(charrette.lifecycle_phase_other).toBe("design charrette");

    const boardReview = event({ event_kind: "community_board_review", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "community_board_review" });
    expect(boardReview.event_family).toBe("public_engagement");
    expect(boardReview.lifecycle_phase).toBe("other");
    expect(boardReview.lifecycle_phase_other).toBe("community_board_review");

    const walkThrough = event({ event_kind: "community_walk_through", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "community_walk_through" });
    expect(walkThrough.event_family).toBe("public_engagement");
    expect(walkThrough.lifecycle_phase).toBe("other");
    expect(walkThrough.lifecycle_phase_other).toBe("community_walk_through");

    const payloadWalkthrough = event({
      event_kind: "walkthrough",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "walkthrough",
      description: "Walkthrough with DOT Commissioner, NYCT President, Bronx BP, CM Feliz, CM Sanchez",
    });
    expect(payloadWalkthrough.event_family).toBe("public_engagement");
    expect(payloadWalkthrough.lifecycle_phase).toBe("other");
    expect(payloadWalkthrough.lifecycle_phase_other).toBe("walkthrough");

    const customer = event({
      event_kind: "customer_engagement",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "customer_engagement",
      description: "TransitTalk event where NYCT President engaged customers on OMNY and reduced-fare options.",
    });
    expect(customer.event_family).toBe("public_engagement");
    expect(customer.lifecycle_phase).toBe("other");
    expect(customer.lifecycle_phase_other).toBe("customer_engagement");

    const panel = event({
      event_kind: "panel_discussion",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "panel_discussion",
      description: "B.E.G.I.N. held a panel discussion centered on Advancing Black Excellence in the Workplace.",
    });
    expect(panel.event_family).toBe("public_engagement");
    expect(panel.lifecycle_phase).toBe("other");
    expect(panel.lifecycle_phase_other).toBe("panel_discussion");
  });

  it("promotes stale other event family for payload-proven employee resource group events during replay", () => {
    const out = event({
      event_kind: "employee resource group event",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "employee resource group event",
      event_name: "All Generational: Holiday Get Together",
      description: "All Generational invited members to a Holiday Get Together.",
    });
    expect(out.event_family).toBe("public_engagement");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("employee resource group event");

    const erg = event({
      event_kind: "ERG event",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "ERG event",
      event_name: "Memorial Day Celebration",
      description: "MTA Veteran's ERG held a noontime observance.",
    });
    expect(erg.event_family).toBe("public_engagement");
    expect(erg.lifecycle_phase).toBe("other");
    expect(erg.lifecycle_phase_other).toBe("ERG event");

    const engagement = event({
      event_kind: "employee engagement event",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "employee engagement event",
      event_name: "Grand Central Madison Tour",
      description: "Tour of Grand Central Madison hosted by Multicultural ERG.",
    });
    expect(engagement.event_family).toBe("public_engagement");
    expect(engagement.lifecycle_phase).toBe("other");
    expect(engagement.lifecycle_phase_other).toBe("employee engagement event");

    const celebration = event({
      event_kind: "ERG Celebration",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "ERG Celebration",
      event_name: "Umoja Celebration (Post Kwanzaa Celebration)",
      description: "B.E.G.I.N. ERG celebrated the end of Kwanzaa with an Umoja after-work networking event.",
    });
    expect(celebration.event_family).toBe("public_engagement");
    expect(celebration.lifecycle_phase).toBe("other");
    expect(celebration.lifecycle_phase_other).toBe("ERG Celebration");
  });

  it("maps public-comment agenda items to public engagement without broad agenda matching", () => {
    expect(event({ event_kind: "committee_agenda_item", description: "Public comment will be accepted on the 2025 Budget." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "information item", description: "Public comment will be accepted on the 2026 Budget." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "budget review", event_name: "2025 Preliminary Budgets (Public Comment)" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "committee_information", description: "Public comment will be accepted on the 2026 Budget." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "committee_budget_briefing", description: "Public comment will be accepted on the 2025 Budget." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "public_notice", description: "State Register notice soliciting public comments." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "regulatory_notice", description: "Notice soliciting public comments." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "public_release", description: "Release for public review and start of formal public comment period." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "scheduled_committee_agenda", description: "Public comment and committee review of the preliminary budget." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "committee_agenda_item", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "information_item", description: "Report on ridership trends based on monthly ticket sales data." }).event_family).toBe("governance");
    expect(event({ event_kind: "budget_review", description: "Review of the prior year's budget results." }).event_family).toBe("governance");
    expect(event({ event_kind: "public_notice", description: "Notice of proposed changes was published." }).event_family).toBe("other");
    expect(event({ event_kind: "committee_action", description: "Public comment will be accepted on the 2026 Budget." }).event_family).toBe("governance");
    expect(event({ event_kind: "board_submission", description: "Submitted to the Board after the 60-day public comment period." }).event_family).toBe("other");
  });

  it("promotes stale other event family for public-comment agenda items during replay", () => {
    const out = event({
      event_kind: "committee_information_item",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "committee_information_item",
      description: "Public comment will be accepted on the 2027 Budget.",
    });
    expect(out.event_family).toBe("public_engagement");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("committee_information_item");
  });

  it("maps committee report presentations to publication without broad agenda matching", () => {
    expect(
      event({
        event_kind: "committee_agenda_item",
        description:
          "A report will be presented to the Committee on Agency ridership trends during 2023 based on monthly ticket sales data and train ridership counts.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "information item",
        event_name: "Annual Elevator/Escalator Report",
        description: "Annual report to the Committee on system-wide reliability and availability for elevators and escalators throughout the system.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee information item",
        description: "Quarterly report to the Committee providing data on key EEO and Human Resources indicators.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "information_item",
        event_name: "Safety/Security Update",
        description: "The agency will provide a comprehensive report on Safety/Security.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee agenda item",
        event_name: "Safety/Security Update",
        description: "Comprehensive report on Safety/Security.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "recurring_agenda_item",
        event_name: "Safety Report",
        description: "A monthly report will be given highlighting key safety performance statistics and indicators.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee_recurring_item",
        event_name: "Financial Report",
        description: "A monthly report will be provided that compares the Railroad's actual financial performance against its budget and/or forecast.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee_recurring_item",
        event_name: "Operations Report",
        description: "A monthly report will be given highlighting key operating performance statistics and indicators.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "recurring_agenda_item",
        event_name: "Ridership Report",
        description: "A monthly report will be provided that compares actual monthly ticket sales, ridership and revenues against prior year results.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "recurring_information_item",
        event_name: "Key Performance Metric Report",
        description:
          "The Key Performance Metrics book provides the MTA Board and members of the public with a comprehensive overview of monthly LIRR and Metro-North performance indicators.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "recurring_agenda_item",
        description: "Key Performance Metrics Reports - monthly presentation of LIRR and Metro-North performance indicators.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "safety and security update",
        description: "The agency will provide comprehensive report on the Safety/Security.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "committee agenda item", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
    expect(
      event({
        event_kind: "budget_review",
        description: "MTA Bus will review its prior year's budget results and their implications for current and future budget performance will be presented to the Committee.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "budget_review", description: "MTA Bus will present a brief review of its 2022 Budget results." }).event_family).toBe("publication");
    expect(event({ event_kind: "budget_review", description: "Review of the prior year's budget results." }).event_family).toBe("governance");
    expect(event({ event_kind: "budget_review", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
	    expect(
	      event({
	        event_kind: "performance_review",
	        description: "A review of the prior year's performance of railroad service will be provided to the Committee.",
	      }).event_family,
	    ).toBe("publication");
    expect(
      event({
        event_kind: "operating review",
        event_name: "Final Review of 2023 Operating Results",
        date_text: "May 2024",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "operating review",
        event_name: "Preliminary Review of 2023 Operating Results",
        date_text: "January 2024",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "performance_review",
        description: "A review of the prior year's performance of railroad service.",
        date_text: "February 2025",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "performance summary",
        description: "LIRR year-end 2025 ridership and performance results with ridership and OTP.",
        date_text: "2025",
      }).event_family,
    ).toBe("publication");
	    expect(
	      event({
	        event_kind: "performance review",
        description: "A review of the prior year's budget results and their implications for current and future budget performance will be presented to the Committee.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "performance_review", description: "Review of the prior year's performance of railroad service." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "quarterly_update",
        description: "A quarterly report will be provided that highlights the progress made on track maintenance work to bring the infrastructure to a state of good repair.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee_agenda_item",
        event_name: "Track Program Quarterly Update",
        description: "A quarterly report highlighting progress made on track maintenance work to bring the infrastructure to a state of good repair.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "strategic priorities update",
        description: "In alignment with MTA's strategic priorities, a biannual report to the Committee on the Railroads' progress in delivering safe and reliable transportation and excellent customer service.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "strategic_update",
        description: "Biannual report on the Railroads' progress in delivering safe and reliable transportation and excellent customer service.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "Finance Committee action item",
        description: "March Action Item: All-Agency Annual Procurement Report - The Agencies and the MTA Procurement Division should be prepared to answer questions on this State-required report.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "Finance Committee action item",
        description: "May Action Item: MTA Annual Investment Report - The MTA Treasury Division should be prepared to answer questions on this State-required report.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "committee_information", event_name: "2024 Annual Ridership Report", description: "A report on ridership trends." }).event_family).toBe(
      "publication",
    );
    expect(
      event({
        event_kind: "committee_information",
        event_name: "Final Review of 2024 Operating Budget Results",
        description: "A review of the prior year's budget results.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "financial forecast",
        event_name: "2025 Mid-Year Forecast",
        description: "The agency will provide the 2025 Mid-Year Forecast financial information for revenue and expense by month.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee_agenda_item",
        event_name: "2024 Mid-Year Forecast",
        description: "The agency will provide the 2024 Mid-Year Forecast financial information for revenue and expense by month.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "information item",
        event_name: "2025 Mid-Year Forecast",
        description: "2025 Mid-Year Forecast - financial information for revenue and expense by month.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "information item",
        event_name: "2024 Annual Ridership Report",
        description: "Report on Metro-North's ridership trends during 2024 based on monthly ticket sales data and train ridership counts.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee briefing",
        event_name: "Annual Elevator/Escalator Report",
        description: "Annual report to the Committee on system-wide availability for elevators and escalators throughout the system.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee_agenda_item",
        event_name: "Diversity/EEO Report - 1st Quarter 2023",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "scheduled_committee_agenda",
        description: "Quarterly EEO and Diversity Report for NYCT and MTA Bus covering 3rd Quarter 2022.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "committee information item",
        event_name: "Grand Central Terminal Retail Development",
        description:
          "MTA Real Estate will provide an annual report on leasing and construction opportunities and financial and marketing information related to retail development in Grand Central Terminal.",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "information_item",
        event_name: "Grand Central Terminal Retail Development Mid-Year Operations Update",
        description:
          "MTA Real Estate will provide an annual report on leasing and construction opportunities and financial/marketing information related to retail development in Grand Central Terminal.",
      }).event_family,
    ).toBe("publication");
    expect(event({ event_kind: "certification", description: "Chair and CEO certified the attached budget and financial plan." }).event_family).toBe("publication");
    expect(event({ event_kind: "certification", description: "Certification of the 2025 Preliminary Budget July Financial Plan." }).event_family).toBe("publication");
    expect(event({ event_kind: "quarterly_update", description: "Quarterly update on project status." }).event_family).toBe("other");
    expect(event({ event_kind: "committee_information", event_name: "2025 Mid-Year Forecast", description: "Financial information by month." }).event_family).toBe(
      "other",
    );
		    expect(
		      event({
		        event_kind: "information_item",
		        event_name: "Adopted Budget/Financial Plan 2025",
		        description: "The Agency will present its revised 2025 Financial Plan reflecting the 2025 Adopted Budget.",
		      }).event_family,
		    ).toBe("publication");
    expect(
      event({
        event_kind: "financial plan update",
        description: "Presentation of revised 2025 Financial Plan",
      }).event_family,
    ).toBe("publication");
    expect(
      event({
        event_kind: "Financial Plan update",
        description: "Board updated on City, State, and federal actions to address $600m additional funding for 2023.",
      }).event_family,
    ).toBe("other");
    expect(event({ event_kind: "financial plan update", description: "General financial plan update." }).event_family).toBe("other");
    expect(event({ event_kind: "financial forecast" }).event_family).toBe("other");
    expect(event({ event_kind: "financial forecast", description: "General forecast discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "committee_information", event_name: "2024 Operations Summary", description: "Review of service performance." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "committee_information_item", description: "Annual report on retail activity." }).event_family).toBe("governance");
    expect(
      event({
        event_kind: "information_item",
        event_name: "Grand Central Terminal Retail Development",
        description: "Mid-Year Operations Update on retail development in Grand Central Terminal.",
      }).event_family,
    ).toBe("governance");
    expect(event({ event_kind: "information item", event_name: "Ridership update", description: "Ridership discussion." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee briefing", description: "The committee will be briefed on elevator repair planning." }).event_family).toBe("governance");
    expect(event({ event_kind: "information_item", description: "Diversity discussion for committee awareness." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_agenda_item", description: "Equal opportunity program update without report publication." }).event_family).toBe("governance");
    expect(event({ event_kind: "information_item", event_name: "Safety/Security Update", description: "Safety and security discussion." }).event_family).toBe("governance");
	    expect(event({ event_kind: "recurring_agenda_item", event_name: "President's Report", description: "A monthly report on safety, operations, and key initiatives." }).event_family).toBe(
	      "governance",
	    );
	    expect(
	      event({
	        event_kind: "recurring_agenda_item",
	        event_name: "President's Report",
	        description: "A monthly report will be provided highlighting major accomplishments and progress on key initiatives and performance indicators.",
	      }).event_family,
	    ).toBe("publication");
	    expect(event({ event_kind: "recurring_agenda_item", event_name: "MTA Police Report", description: "Monthly report highlighting significant police activities." }).event_family).toBe(
	      "publication",
	    );
    expect(event({ event_kind: "recurring_agenda_item", event_name: "Financial Report", description: "Financial report discussion." }).event_family).toBe("governance");
    expect(event({ event_kind: "operations_update", description: "Mid-year operations update with key performance metrics for H1 2025." }).event_family).toBe("publication");
    expect(event({ event_kind: "committee_agenda_item", event_name: "Track Program Quarterly Update" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_agenda_item", description: "Quarterly update on track maintenance planning." }).event_family).toBe("governance");
    expect(event({ event_kind: "training", description: "ERG Leadership Training centered on alignment with MTA Strategic Priorities." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "committee_agenda_item", event_name: "Progress on Way Ahead Strategic Plan" }).event_family).toBe("governance");
    expect(event({ event_kind: "Finance Committee action item", description: "March Action Item: procurement discussion." }).event_family).toBe("governance");
    expect(event({ event_kind: "scheduled_committee_agenda", description: "Adopted Budget/Financial Plan, ADA Compliance Report, and Fare Evasion quarterly reports." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "safety_update", description: "General safety update for committee awareness." }).event_family).toBe("other");
    expect(event({ event_kind: "certification", description: "Chair certified the budget and financial plan." }).event_family).toBe("other");
    expect(event({ event_kind: "certification", event_name: "Operation Lifesaver Authorized Volunteer" }).event_family).toBe("other");
    expect(event({ event_kind: "actuarial_certification", description: "Statement of Actuarial Opinion signed by the actuary." }).event_family).toBe("other");
    expect(event({ event_kind: "regulatory certification", description: "Certification of the mapping application for de-mapping." }).event_family).toBe("other");
	    expect(
	      event({
	        event_kind: "committee_briefing",
	        description: "Briefing on status of PTC implementation and close-out following full Positive Train Control functionality.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(
	      event({
	        event_kind: "project_update_briefing",
	        description: "The Committee will be briefed on the status of project implementation and close-out following full Positive Train Control functionality.",
	      }).event_family,
	    ).toBe("implementation");
    expect(event({ event_kind: "committee briefing", description: "The committee will be briefed on the status of project implementation." }).event_family).toBe("governance");
    expect(event({ event_kind: "information item", description: "Information item for committee discussion." }).event_family).toBe("governance");
  });

  it("promotes stale other event family for committee report presentations during replay", () => {
    const out = event({
      event_kind: "information_item",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "information_item",
      event_name: "2024 Annual Ridership Report",
      description:
        "A report will be presented to the Committee on Metro-North's ridership trends during 2024 based on monthly ticket sales data and train ridership counts.",
    });
    expect(out.event_family).toBe("publication");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("information_item");

    const budgetReview = event({
      event_kind: "budget_review",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "budget_review",
      description: "NYCT will review the prior year's budget results and their implications for current and future budget performance will be presented to the Committee.",
    });
    expect(budgetReview.event_family).toBe("publication");
    expect(budgetReview.lifecycle_phase).toBe("other");
    expect(budgetReview.lifecycle_phase_other).toBe("budget_review");

    const quarterlyUpdate = event({
      event_kind: "quarterly_update",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "quarterly_update",
      description: "Quarterly report on progress made on track maintenance work to bring the infrastructure to a state of good repair.",
    });
    expect(quarterlyUpdate.event_family).toBe("publication");
    expect(quarterlyUpdate.lifecycle_phase).toBe("other");
    expect(quarterlyUpdate.lifecycle_phase_other).toBe("quarterly_update");

    const committeeInfo = event({
      event_kind: "committee_information",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "committee_information",
      event_name: "Annual Elevator/Escalator Report",
      description: "Annual report on system-wide reliability and availability for elevators and escalators throughout the system.",
    });
    expect(committeeInfo.event_family).toBe("publication");
    expect(committeeInfo.lifecycle_phase).toBe("other");
    expect(committeeInfo.lifecycle_phase_other).toBe("committee_information");

    const financialForecast = event({
      event_kind: "financial forecast",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "financial forecast",
      description: "The agency will provide the 2024 Mid-Year Forecast financial information for revenue and expense by month.",
    });
    expect(financialForecast.event_family).toBe("publication");
    expect(financialForecast.lifecycle_phase).toBe("other");
    expect(financialForecast.lifecycle_phase_other).toBe("financial forecast");

    const agendaFinancialForecast = event({
      event_kind: "committee_agenda_item",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "committee_agenda_item",
      event_name: "2024 Mid-Year Forecast",
      description: "The agency will provide the 2024 Mid-Year Forecast financial information for revenue and expense by month.",
    });
    expect(agendaFinancialForecast.event_family).toBe("publication");
    expect(agendaFinancialForecast.lifecycle_phase).toBe("other");
    expect(agendaFinancialForecast.lifecycle_phase_other).toBe("committee_agenda_item");

    const ridershipReport = event({
      event_kind: "information_item",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "information_item",
      event_name: "2024 Annual Ridership Report",
      description: "Report on Metro-North's ridership trends during 2024 based on monthly ticket sales data and train ridership counts.",
    });
    expect(ridershipReport.event_family).toBe("publication");
    expect(ridershipReport.lifecycle_phase).toBe("other");
    expect(ridershipReport.lifecycle_phase_other).toBe("information_item");
  });

  it("maps payload-proven board and committee action approvals without broad agenda matching", () => {
    expect(event({ event_kind: "board_action", description: "License Agreement with Brooklyn Public Library - MTA Board approval" }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "board action", description: "MTA Finance seeks Board approval to allow for the issuance of new money bonds." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee_action", description: "Committee approval of the 2023 work plan" }).event_family).toBe("approval");
    expect(event({ event_kind: "committee_action", description: "The Committee will approve the Proposed Metro-North Railroad Committee Work Plan." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee_action", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe("approval");
    expect(event({ event_kind: "committee_action", description: "The Committee approved the minutes of the prior meeting." }).event_family).toBe("approval");
    expect(event({ event_kind: "board_action", description: "TA Committee board action to approve SIR 2024 Budget and Financial Plan" }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "board_action", description: "Board adoption of revised toll violation enforcement regulations." }).event_family).toBe("approval");
    expect(event({ event_kind: "board_action", description: "Adoption of 2025 Budget and 2025-2028 Financial Plan." }).event_family).toBe("approval");
    expect(event({ event_kind: "board_action", description: "MTA Board adoption of SIR 2023 November Forecast and the Four-Year Financial Plan." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee_action", description: "Annual presentation and formal adoption of the NYC Transit Committee Charter." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "recurring_agenda_item", event_name: "Approval of Minutes", description: "Approval of the official proceedings of the Committee Meeting." }).event_family).toBe(
      "approval",
    );
    expect(
      event({
        event_kind: "recurring agenda item",
        event_name: "Approval of Minutes",
        description: "The Committee Chair will request a motion to approve the minutes of the prior month's meeting.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "action_item", description: "Approval of 2026 Committee Work Plan - The Committee will approve the Proposed Work Plan." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee_agenda_item", description: "The Committee will approve the Proposed Long Island Rail Road Committee Work Plan for 2025." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "scheduled_committee_agenda", description: "Approval of the 2023 NYCT Committee Work Plan and operating-results reviews." }).event_family).toBe(
      "approval",
    );
    expect(
      event({
        event_kind: "committee information item",
        event_name: "Approval of 2026 Committee Work Plan",
        description: "The Committee will approve the Proposed Long Island Rail Road Committee Work Plan for 2026.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "committee_action_item", description: "Annual review of Long Island Committee Charter for Committee revision/approval" }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "procurement_action", description: "Metro-North seeks Board approval for a competitively solicited miscellaneous service contract." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "procurement_action", description: "Long Island Rail Road seeks Board approval to exercise Option 3 of the contract." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "board_action_request", description: "Request for Board approval of ERY TDR Disposition and Pricing Mechanism Policy." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "board_request", description: "LIRR requesting Board approval to exercise Option 3 of Contract 244941." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "procurement_action", description: "Declaration of an Immediate Operating Need issued and approved by MTA executives." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "option_exercise", description: "Board approved Option 2 for six dual-mode locomotives for CDOT." }).event_family).toBe("approval");
    expect(event({ event_kind: "rate_schedule_modification", description: "Previous Board approval event for modifying Vanderbilt Hall event rate schedule." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "procurement_modification", description: "Board approval of Modification No. 9 to Contract B40666-2." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "real_estate_license", description: "Board approved license with Web Food Products, Inc. for vehicle parking." }).event_family).toBe(
      "approval",
    );
	    expect(event({ event_kind: "real_estate_acquisition", description: "Board approved acquisition of property interests along Erskine Place." }).event_family).toBe(
	      "approval",
	    );
    expect(
      event({
        event_kind: "responsibility finding",
        description: "Accenture found responsible notwithstanding significant adverse information, approved by MTA Chief Administrative Officer.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "responsibility_finding", description: "Responsibility finding under review." }).event_family).toBe("other");
	    expect(event({ event_kind: "real_estate_lease", description: "Board approved lease with Beer Table LLC for retail space." }).event_family).toBe("approval");
    expect(event({ event_kind: "board_action", description: "MNR Board action on license agreement with Gateway Foods" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_action", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
    expect(
      event({
        event_kind: "board_action",
        description: "Adoption of Final Budget and Financial Plan - The Committee will recommend action to the Board on the Final Proposed Budget.",
      }).event_family,
    ).toBe("governance");
    expect(
      event({
        event_kind: "Finance Committee action item",
        description: "December Action Items: Adoption of Final Budget and Financial Plan (Committee recommends action to the Board), Authorization to Issue Bonds, and Approval of Proposed Work Plan.",
      }).event_family,
    ).toBe("governance");
    expect(event({ event_kind: "action_item", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "committee_action_item", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "budget recommendation", description: "The Committee will recommend action to the Board on the Final Proposed Budget for 2025." }).event_family).toBe(
      "governance",
    );
    expect(event({ event_kind: "action_item", description: "The Committee will approve the Proposed Work Plan." }).event_family).toBe("approval");
    expect(event({ event_kind: "board_submission", description: "Submitted to the Board for approval after public comment." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "committee_action",
        description: "Committee voted to recommend the procurement item for contract extension before the Board for approval",
      }).event_family,
    ).toBe("governance");
    expect(event({ event_kind: "board_action", description: "Recommendation to approve the 2023 PTASPs by the MTA Board" }).event_family).toBe("governance");
	    expect(event({ event_kind: "committee_agenda_item", description: "MTA Board approval of procurement actions." }).event_family).toBe("governance");
	    expect(event({ event_kind: "recurring_agenda_item", event_name: "Procurements", description: "List of procurement action items requiring Board approval." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "recurring_agenda_item", event_name: "Financial Report", description: "Financial report discussion." }).event_family).toBe("governance");
	    expect(event({ event_kind: "committee_agenda_item", description: "The Committee Chair will present a draft Metro-North Committee Work Plan for 2025." }).event_family).toBe(
	      "planning",
    );
    expect(event({ event_kind: "information_item", description: "2026 Proposed Committee Work Plan - The Committee Chair will present a draft work plan." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "committee_work_plan_proposal", description: "Presentation of draft 2026 LIRR Committee Work Plan." }).event_family).toBe("planning");
    expect(event({ event_kind: "committee_agenda_item", description: "Thanksgiving Holiday Service; Winter Track Work Programs; Proposed 2027 Committee Work Plan." }).event_family).toBe(
      "governance",
    );
    expect(
      event({
        event_kind: "postponement",
        description: "Bx6 SBS implementation delayed until 2023 to coincide with MetroCard retirement and OMNY full deployment.",
      }).event_family,
    ).toBe("pause");
	    expect(event({ event_kind: "postponement", description: "Postponed approval of proposed 2026 TBTA Committee Work Plan due to lack of quorum." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "postponement", description: "Postponed approval of Joint Agency Committee meeting minutes due to lack of quorum." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "board_submission", description: "Submitted to the Board for approval after the 60-day public comment period." }).event_family).toBe(
	      "other",
    );
    expect(event({ event_kind: "real_estate_license", description: "Submitted to the Board for approval after committee review." }).event_family).toBe("other");
    expect(event({ event_kind: "procurement_modification", description: "Recommendation to approve Modification No. 9 before the Board." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "rate_schedule_modification", description: "Postponed approval of proposed fee schedule modification." }).event_family).toBe("other");
    expect(event({ event_kind: "board_action_request", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
      "other",
    );
	    expect(event({ event_kind: "procurement_action", description: "Immediate Operating Need for maintenance services; award made in January 2026." }).event_family).toBe(
	      "milestone",
	    );
    expect(event({ event_kind: "procurement_action", description: "Proposed award of competitively solicited personal service contract." }).event_family).toBe("other");
  });

  it("promotes stale other event family for payload-proven board action approvals during replay", () => {
    const out = event({
      event_kind: "board_action",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "board_action",
      description: "MTA Board approval of the 2024 Annual Procurement Report filing",
    });
    expect(out.event_family).toBe("approval");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("board_action");

    const request = event({
      event_kind: "board_request",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "board_request",
      description: "LIRR requesting Board approval to exercise Option 3 of Contract 244941 for up to 44 dual-mode locomotives.",
    });
    expect(request.event_family).toBe("approval");
    expect(request.lifecycle_phase).toBe("other");
    expect(request.lifecycle_phase_other).toBe("board_request");

    const adoption = event({
      event_kind: "board_action",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "board_action",
      description: "MTA Board adoption of SIR 2023 November Forecast, 2024 Final Proposed Budget, and the Four-Year Financial Plan.",
    });
    expect(adoption.event_family).toBe("approval");
    expect(adoption.lifecycle_phase).toBe("other");
    expect(adoption.lifecycle_phase_other).toBe("board_action");
  });

  it("maps payload-proven committee charter reviews to approval without broad review matching", () => {
    expect(event({ event_kind: "annual review", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe("approval");
    expect(event({ event_kind: "charter_review", description: "Annual review of Long Island Committee Charter for Committee revision/approval." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee charter review", description: "Annual review of Long Island Committee Charter for Committee revision/approval." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee_review", event_name: "Review of Committee Charter", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "committee agenda item", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe("approval");
    expect(
      event({
        event_kind: "committee specific agenda item",
        event_name: "Review Committee Charter",
        description: "Annual review of Long Island Committee Charter for Committee revision/approval.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "committee information item", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe("approval");
    expect(event({ event_kind: "review", event_name: "Review of Committee Charter", description: "Annual review and approval of the MNR Committee Charter." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "annual review", description: "Annual review of Long Island Committee Charter." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_review", description: "Review of Long Island Committee Charter." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee action", description: "Review of Committee Charter by Committee Chair & Members." }).event_family).toBe("governance");
    expect(
      event({
        event_kind: "finance committee agenda item",
        description: "Finance Committee Charter presented to members to review and assess its adequacy.",
      }).event_family,
    ).toBe("governance");
	    expect(event({ event_kind: "committee_agenda_item", description: "Once annually, the Committee will be asked to formally adopt the Committee Charter." }).event_family).toBe(
	      "approval",
	    );
    expect(event({ event_kind: "budget_review", description: "Review and approval of the Final Proposed Budget." }).event_family).toBe("governance");
    expect(event({ event_kind: "performance_review", description: "A review of prior year's railroad service performance." }).event_family).toBe("other");
  });

  it("promotes stale other event family for committee charter review approvals during replay", () => {
    const out = event({
      event_kind: "committee_charter_review",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "committee_charter_review",
      description: "Annual review of Long Island Committee Charter for Committee revision/approval.",
    });
    expect(out.event_family).toBe("approval");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("committee_charter_review");
  });

		  it("maps exact completed agreement events to milestones without broad agreement matching", () => {
		    expect(event({ event_kind: "agreement signed" }).event_family).toBe("milestone");
    expect(event({ event_kind: "agreement_executed" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract option exercised" }).event_family).toBe("milestone");
    expect(event({ event_kind: "grant execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "legal_execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "licenses executed" }).event_family).toBe("milestone");
    expect(event({ event_kind: "execution" }).event_family).toBe("milestone");
    expect(
      event({
        event_kind: "test agreement",
        date_text: "October 2020",
        description: "Department of Buses entered into test agreement with Hayden AI for ABLE system development and certification testing.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "test agreement",
        date_text: "January 2021",
        description: "Department of Buses entered into test agreement with Seon for ABLE system development and certification testing.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "agreement",
        description: "Landmark agreement with TWU redefines the role of Station Agents and how they are deployed.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "holdover agreement", description: "Gateway Foods entered into a holdover agreement after prior license expired." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "license expiry", description: "Gateway Foods' prior license agreement expired." }).event_family).toBe("milestone");
    expect(
      event({
        event_kind: "letter_of_intent",
        description: "JPMC and MTA Parties entered into a Letter of Intent for Expanded Scope and contribute $50M.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "offer",
        description: "MTA Real Estate extended a formal offer to Consolidated Edison upon completion of an independent appraisal.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "formal offer",
        description: "MTA Real Estate extended a formal offer to the property owner upon completion of an independent appraisal.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "procurement_option_exercise",
        description: "Exercise of federally funded option to purchase additional 640 subway cars from Kawasaki.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "procurement modification",
        description: "Modification to contract with Cubic for OMNY software and hardware enhancements to CVMs.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "contract direction",
        description: "Contractor was directed to execute this modification; agreement reached on schedule adjustment and compensation.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "termination", description: "Termination for cause of contract W-32564." }).event_family).toBe("milestone");
    expect(event({ event_kind: "License Agreement Effective", description: "MNR and LAZ entered into Commuter Parking License Agreement." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "lease_renewal_agreement",
        description: "MABSTOA / NYCT lease renewal for a bus swing room. Term: five years. Compensation: monthly rent.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "sale", description: "NYS sold the Premises to a private entity." }).event_family).toBe("milestone");
    expect(event({ event_kind: "lease", description: "Lease with Beer Table LLC for retail space with 10 year term for retail sale." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "legal agreement",
        description: "MTA entered into historic legal agreement to make subway stations fully accessible.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "commercial_license", description: "New license for Pescatore Seafood Company for retail sale of seafood with 3-year term and rent." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "option_agreement_modification",
        description: "Modification to the Option Agreement for property interests to facilitate improvements to the RFK Bridge.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "lease termination agreement",
        description: "Surrender and early termination agreement with Rite-Aid for its lease in Grand Central Terminal.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "contract assignment", description: "Siemens ABLE contract assigned to Yunex Traffic LLC." }).event_family).toBe("milestone");
    expect(
      event({
        event_kind: "short_term_permit",
        description: "MNR Short Term Permit at Cortlandt Station Parking Lot 1 and 2 on the east side of Cortlandt Metro-North Station.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "agreement" }).event_family).toBe("other");
    expect(event({ event_kind: "test agreement", description: "Generic test agreement discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "request for information", description: "ABLE RFI issued for vendor review." }).event_family).toBe("milestone");
    expect(event({ event_kind: "lawsuit filed", description: "Hayden and Seon litigation related to ABLE." }).event_family).toBe("other");
    expect(event({ event_kind: "agreement effective date" }).event_family).toBe("other");
    expect(event({ event_kind: "legal agreement" }).event_family).toBe("other");
    expect(event({ event_kind: "letter of intent" }).event_family).toBe("other");
    expect(event({ event_kind: "holdover agreement" }).event_family).toBe("other");
    expect(event({ event_kind: "lease renewal agreement" }).event_family).toBe("other");
    expect(event({ event_kind: "license agreement effective" }).event_family).toBe("other");
    expect(event({ event_kind: "formal offer" }).event_family).toBe("other");
    expect(event({ event_kind: "proposed contract extension", description: "Proposed contract extension." }).event_family).toBe("other");
    expect(event({ event_kind: "contract closure", description: "Anticipate finalizing contract closure agreement." }).event_family).toBe("other");
    expect(event({ event_kind: "procurement_action", description: "Proposed award for future board consideration." }).event_family).toBe("other");
    expect(event({ event_kind: "permit", description: "Permit for an event luncheon." }).event_family).toBe("other");
    expect(event({ event_kind: "contract option period" }).event_family).toBe("other");
	    expect(event({ event_kind: "contract option term" }).event_family).toBe("other");
	  });

	  it("maps exact filing, execution, establishment, and activation event tails without broad buckets", () => {
	    expect(event({ event_kind: "filing" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "regulatory_filing" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "regulatory submission" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "submission" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "lease_execution" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "permit execution" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "program_establishment" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "program activation" }).event_family).toBe("implementation");
	    expect(event({ event_kind: "drill/exercise" }).event_family).toBe("implementation");
	    expect(event({ event_kind: "filing", event_family: "other" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "program activation", event_family: "other" }).event_family).toBe("implementation");
		    expect(event({ event_kind: "committee_agenda_item" }).event_family).toBe("governance");
		    expect(event({ event_kind: "information_item" }).event_family).toBe("governance");
		    expect(event({ event_kind: "board briefing" }).event_family).toBe("governance");
		    expect(event({ event_kind: "budget_action" }).event_family).toBe("governance");
		    expect(event({ event_kind: "policy revision" }).event_family).toBe("governance");
	    expect(event({ event_kind: "document_date" }).event_family).toBe("document_metadata");
	    expect(event({ event_kind: "document date" }).event_family).toBe("document_metadata");
	    expect(event({ event_kind: "staff_summary_date" }).event_family).toBe("document_metadata");
	    expect(event({ event_kind: "data_as_of_date" }).event_family).toBe("document_metadata");
	    expect(event({ event_kind: "design finalization" }).event_family).toBe("planning");
	    expect(event({ event_kind: "environmental_review_start" }).event_family).toBe("planning");
	    expect(event({ event_kind: "planned RFQ" }).event_family).toBe("planning");
	    expect(event({ event_kind: "project transfer" }).event_family).toBe("planning");
	    expect(event({ event_kind: "bus deployment" }).event_family).toBe("implementation");
	    expect(event({ event_kind: "naming announcement" }).event_family).toBe("milestone");
	    expect(
	      event({
	        event_kind: "operational_status",
	        description: "All LIRR trains operating with full PTC functionality on entire LIRR territory.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "operational_status" }).event_family).toBe("other");
	    expect(event({ event_kind: "contract extension" }).event_family).toBe("other");
	    expect(event({ event_kind: "upcoming_issuance" }).event_family).toBe("other");
	    expect(event({ event_kind: "lunch and learn" }).event_family).toBe("other");
	    expect(event({ event_kind: "delivery" }).event_family).toBe("other");
	    expect(event({ event_kind: "deployment" }).event_family).toBe("other");
	    expect(event({ event_kind: "fare increase" }).event_family).toBe("other");
	    expect(event({ event_kind: "proposed_fare_increase" }).event_family).toBe("other");
	  });

	  it("maps payload-proven contract endpoint periods without broad procurement matching", () => {
	    expect(
	      event({
	        event_kind: "contract option period",
	        description: "Two-year Option period for Access-A-Ride Primary Carrier contracts.",
	        date_text: "April 1, 2025 - March 31, 2027",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "contract option term",
	        description: "One-year extension option for a laser train module lease agreement.",
	        date_text: "January 2028-December 2028",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "contract renewal start",
	        description: "Start of second and final three-year renewal option for Hudson Rail Link bus service contract.",
	        date_text: "October 1, 2023",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "contract renewal end",
	        description: "End of second and final three-year renewal option for Hudson Rail Link bus service contract.",
	        date_text: "September 30, 2026",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "contract_term_start",
	        description: "Start of E-ZPass transponder contract term.",
	        date_text: "May 1, 2024",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "contract_option_exercise",
	        description: "Exercise of Option 2 of the services contract for an additional year.",
	        date_text: "through December 31, 2025",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "agreement effective date",
	        description: "Three-year license agreement with Dover Greens LLC, retroactive to January 1, 2026.",
	        date_text: "January 1, 2026",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "agreement_expiration",
	        description: "NYS Easement Agreement expired.",
	        date_text: "December 6, 2021",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "agreement_extension",
	        description: "Proposed extension of the Employer-Based Shuttle Agreement term to December 31, 2024.",
	        date_text: "December 31, 2024",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "contract_extension_end", description: "Proposed one-year extension term end.", date_text: "November 30, 2024" }).event_family).toBe(
	      "milestone",
	    );
	    expect(
	      event({
	        event_kind: "contract extension period",
	        description: "Three-year extension to contract for ultrasonic internal rail flaw inspections.",
	        date_text: "February 1, 2026-January 31, 2029",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "grant period",
	        description: "Coverage period for the NYSDOT CMAQ grant for connecting services.",
	        date_text: "January 1, 2026 through December 31, 2026",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "license_extension",
	        description: "Extension of license agreement for LAZ to operate commuter parking facilities.",
	        date_text: "24-month extension commencing on April 1, 2025",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "license expiration", description: "License agreement expired on July 31, 2025.", date_text: "July 31, 2025" }).event_family).toBe(
	      "milestone",
	    );
		    expect(
		      event({
		        event_kind: "license term",
		        description: "Term of temporary license agreement with Queens Ballpark Company LLC for access to property adjacent to Corona Substation.",
		        date_text: "December 4, 2023, to March 22, 2024",
		      }).event_family,
		    ).toBe("milestone");
		    expect(
		      event({
		        event_kind: "license term",
		        description: "Term of license between NYCT and Chashama Inc. for installation, maintenance, and display of artwork in three stations.",
		      }).event_family,
		    ).toBe("milestone");
		    expect(
		      event({
		        event_kind: "license term",
		        description: "Term of license between NYCT and NYC DOT for removal, installation, operation and maintenance of signage at St. George Ferry Terminal.",
		      }).event_family,
		    ).toBe("milestone");
		    expect(
		      event({
		        event_kind: "permit_term",
	        description: "Term of LIRR permit for parking and equipment storage for Webster Avenue Bridge Replacement Project.",
	        date_text: "January 6, 2025, to November 30, 2025",
	      }).event_family,
	    ).toBe("milestone");
	    expect(
	      event({
	        event_kind: "service_period",
	        description: "Technical support services for Onboard Validation Devices.",
	        date_text: "through July 31, 2030",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "lease expiration", description: "Starbucks' lease for the street-front retail space at 2 Broadway expired." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "contract option period", description: "Contract option discussion without a period or date." }).event_family).toBe("other");
	    expect(event({ event_kind: "license term", description: "Term of license for display of artwork at Grand Central Terminal." }).event_family).toBe("other");
	    expect(event({ event_kind: "document_date", description: "Date of the procurement agenda document.", date_text: "November 14, 2025" }).event_family).toBe(
	      "document_metadata",
	    );
	    expect(event({ event_kind: "staff_summary_date", description: "Staff summary date for contract award.", date_text: "November 14, 2025" }).event_family).toBe(
	      "document_metadata",
		    );
		    expect(event({ event_kind: "procurement", description: "Future procurement expected for a contract option." }).event_family).toBe("other");
		    expect(event({ event_kind: "procurement", description: "A single proposal was received from NY Waterway.", date_text: "October 25, 2024" }).event_family).toBe(
		      "milestone",
		    );
		    expect(event({ event_kind: "procurement", description: "Procurement for Bx6 SBS capital improvements." }).event_family).toBe("planning");
		    expect(event({ event_kind: "procurement", description: "Qualification & Procurement for modern fare gates." }).event_family).toBe("planning");
		    expect(event({ event_kind: "procurement", description: "A single proposal was received for future procurement." }).event_family).toBe("other");
	    expect(event({ event_kind: "board_action", description: "The Committee will recommend action to the Board on the Final Proposed Budget." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "public_event", description: "NYC-permitted marathon event crossing the bridge." }).event_family).toBe("other");
	    expect(event({ event_kind: "contract_modification", description: "MTAHQ Procurement approached a vendor to add locations to the contract." }).event_family).toBe(
	      "other",
	    );
	  });

	  it("maps payload-proven event tail records without broad action or delivery matching", () => {
	    expect(event({ event_kind: "contract extension", description: "Four-year extension of Contract CMM-1467 for ATS-A software maintenance." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "contract_period", description: "Base term of PMIS implementation and integration contract." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "contract_period", description: "Option year for PMIS post-implementation support." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "track work program update", description: "Winter track work programs including switch installations in West Side Yard." }).event_family).toBe(
	      "planning",
	    );
		    expect(
		      event({
		        event_kind: "budget_review",
		        description: "Review of the prior year's budget results and their implications for current and future budget performance.",
		      }).event_family,
		    ).toBe("publication");
	    expect(
	      event({
	        event_kind: "private event",
	        description: "Private lunch and reception to celebrate the announcement of Boldyn's cellular service in the subways.",
	      }).event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "private event", description: "Private reception in Vanderbilt Hall." }).event_family).toBe("other");
	    expect(event({ event_kind: "vehicle upgrade", description: "B46 to upgrade to longer, articulated buses." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "fleet upgrade", description: "B46 to upgrade to articulated buses." }).event_family).toBe("implementation");
		    expect(
		      event({
		        event_kind: "upcoming_issuance",
		        description: "Expects to issue approximately $1 billion fixed rate tax-exempt Transportation Revenue Refunding Green Bonds, Series 2024A.",
		      }).event_family,
		    ).toBe("milestone");
		    expect(
		      event({
		        event_kind: "access_license",
		        description: "Short-term access license to cross Metro Atrium Drive for delivery of construction materials for Penn Station Access Project. Term: four months.",
		      }).event_family,
		    ).toBe("milestone");
		    expect(event({ event_kind: "change_order", description: "Change Order 1 added two bus depots at a cost of $171,000." }).event_family).toBe(
		      "milestone",
		    );
		    expect(
		      event({
		        event_kind: "payment",
		        description: "Statutorily required MRT-2 escalator payments to Dutchess, Orange and Rockland counties totaling $6.4 million expected to be made.",
		      }).event_family,
		    ).toBe("milestone");
		    expect(
		      event({
		        event_kind: "announcement",
		        description: "Governor announced a proposal to proceed with the Central Business District Tolling Program with phased-in toll rates.",
		      }).event_family,
		    ).toBe("planning");
		    expect(event({ event_kind: "service plan update", description: "Thanksgiving holiday service schedule adjustment." }).event_family).toBe("planning");
		    expect(
		      event({
		        event_kind: "project update",
		        description: "The Committee will be briefed on the status of the East Side Access Support Projects.",
		      }).event_family,
		    ).toBe("governance");
		    expect(event({ event_kind: "expansion", description: "Expand Automated Camera Enforcement to two new routes in Manhattan." }).event_family).toBe(
		      "implementation",
		    );
		    expect(
		      event({
		        event_kind: "board_action",
		        description: "Authorization to enter into a lease agreement with Starbucks Corporation for a retail unit at 2 Broadway.",
		      }).event_family,
		    ).toBe("approval");
		    expect(event({ event_kind: "deployment", description: "Complete fleetwide deployment of OBC software." }).event_family).toBe("implementation");
		    expect(event({ event_kind: "deployment", description: "First R211T open gangway cars hit the tracks with enhanced accessibility features." }).event_family).toBe(
		      "implementation",
		    );
	    expect(
	      event({
	        event_kind: "safety incident",
	        description: "An injury occurred at Mineola Station, resulting in MTA issuing a stop work order. Work activities began to resume following the investigation.",
	      }).event_family,
	    ).toBe("pause");
	    expect(
	      event({
	        event_kind: "delivery",
	        description: "S&B installation of 471 TVMs and 114 TOMs begins 2025, majority by end of November 2025.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "project_schedule", description: "Construction Start for Bx6 SBS capital improvements." }).event_family).toBe(
	      "construction",
	    );
	    expect(event({ event_kind: "project_schedule", description: "Finalize Design for Bx6 SBS capital improvements." }).event_family).toBe("planning");
	    expect(event({ event_kind: "project_schedule", description: "Procurement for Bx6 SBS capital improvements." }).event_family).toBe("planning");
	    expect(event({ event_kind: "capital project", description: "Design and implement capital project for Bx6 SBS." }).event_family).toBe(
	      "implementation",
	    );
	    expect(event({ event_kind: "capital project", description: "Capital project including bus bulbs." }).event_family).toBe("implementation");

		    expect(event({ event_kind: "contract extension" }).event_family).toBe("other");
		    expect(event({ event_kind: "access_license" }).event_family).toBe("other");
		    expect(event({ event_kind: "change_order" }).event_family).toBe("other");
		    expect(event({ event_kind: "payment", description: "Generic vendor payment." }).event_family).toBe("other");
		    expect(event({ event_kind: "service plan update", description: "Service plan update." }).event_family).toBe("other");
		    expect(event({ event_kind: "project update", description: "General project update." }).event_family).toBe("other");
		    expect(event({ event_kind: "expansion", description: "Onboard up to 800 new customers if budget impact is as expected." }).event_family).toBe("other");
		    expect(event({ event_kind: "contract_period", description: "Pilot period for customer testing." }).event_family).toBe("other");
	    expect(event({ event_kind: "track work program update", description: "General project update." }).event_family).toBe("other");
	    expect(event({ event_kind: "budget_review", description: "The Committee will recommend action to the Board on the Final Proposed Budget for 2025." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "evaluation", description: "Evaluate SBS performance and study more robust options if supported by community." }).event_family).toBe("planning");
	    expect(event({ event_kind: "evaluation", description: "Annual program evaluation." }).event_family).toBe("other");
	    expect(event({ event_kind: "board_action", description: "The Committee will recommend action to the Board on the Final Proposed Budget for 2025." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "deployment", description: "Real-time passenger information coming to 86th Street." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "safety incident", description: "Gun shots were fired on an A train." }).event_family).toBe("incident");
	    expect(event({ event_kind: "delivery", description: "Expected delivery of remaining 15 Customer Service Point of Sale devices." }).event_family).toBe("planning");
	    expect(event({ event_kind: "project_schedule", description: "Project schedule overview." }).event_family).toBe("other");
	    expect(event({ event_kind: "capital project", description: "Upcoming capital project at Bay Parkway; water main project led by DEP." }).event_family).toBe(
	      "other",
	    );
	  });

	  it("promotes stale other event family for completed agreement milestones during replay", () => {
    const signed = event({ event_kind: "agreement signed", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "agreement signed" });
    expect(signed.event_family).toBe("milestone");
    expect(signed.lifecycle_phase).toBe("other");
    expect(signed.lifecycle_phase_other).toBe("agreement signed");

    const exercised = event({ event_kind: "contract option exercised", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "contract option exercised" });
    expect(exercised.event_family).toBe("milestone");
    expect(exercised.lifecycle_phase).toBe("other");
    expect(exercised.lifecycle_phase_other).toBe("contract option exercised");

    const grant = event({ event_kind: "grant execution", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "grant execution" });
    expect(grant.event_family).toBe("milestone");
    expect(grant.lifecycle_phase).toBe("other");
    expect(grant.lifecycle_phase_other).toBe("grant execution");
  });

  it("maps exact adoption and authorization event kinds to approval without broad action matching", () => {
    expect(event({ event_kind: "board adoption" }).event_family).toBe("approval");
    expect(event({ event_kind: "board_authorization" }).event_family).toBe("approval");
    expect(event({ event_kind: "board resolution" }).event_family).toBe("approval");
    expect(event({ event_kind: "board_resolution" }).event_family).toBe("approval");
    expect(event({ event_kind: "charter adoption/amendment" }).event_family).toBe("approval");
    expect(event({ event_kind: "contract authorization" }).event_family).toBe("approval");
    expect(event({ event_kind: "board ratification" }).event_family).toBe("approval");
    expect(event({ event_kind: "contract_ratification" }).event_family).toBe("approval");
    expect(event({ event_kind: "procurement ratification" }).event_family).toBe("approval");
    expect(event({ event_kind: "ratification" }).event_family).toBe("approval");
    expect(event({ event_kind: "board action" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_action" }).event_family).toBe("governance");
    expect(event({ event_kind: "resolution" }).event_family).toBe("other");
    expect(event({ event_kind: "ratification requested" }).event_family).toBe("other");
    expect(event({ event_kind: "recommended" }).event_family).toBe("other");
  });

  it("promotes stale other event family for adoption and authorization without lifecycle promotion", () => {
    const adoption = event({ event_kind: "board_adoption", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "board_adoption" });
    expect(adoption.event_family).toBe("approval");
    expect(adoption.lifecycle_phase).toBe("other");
    expect(adoption.lifecycle_phase_other).toBe("board_adoption");

    const authorization = event({ event_kind: "authorization", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "authorization" });
    expect(authorization.event_family).toBe("approval");
    expect(authorization.lifecycle_phase).toBe("other");
    expect(authorization.lifecycle_phase_other).toBe("authorization");

    const ratification = event({ event_kind: "board ratification", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "board ratification" });
    expect(ratification.event_family).toBe("approval");
    expect(ratification.lifecycle_phase).toBe("other");
    expect(ratification.lifecycle_phase_other).toBe("board ratification");

    const boardResolution = event({ event_kind: "board resolution", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "board resolution" });
    expect(boardResolution.event_family).toBe("approval");
    expect(boardResolution.lifecycle_phase).toBe("other");
    expect(boardResolution.lifecycle_phase_other).toBe("board resolution");
  });

  it("maps only Immediate Operating Need procurement declarations to approval", () => {
    expect(event({ event_kind: "Immediate Operating Need declaration" }).event_family).toBe("approval");
    expect(event({ event_kind: "immediate_operating_need_declaration" }).event_family).toBe("approval");
    expect(event({ event_kind: "declaration", description: "Declaration of Immediate Operating Need waiving formal competitive bidding" }).event_family).toBe("approval");
    expect(event({ event_kind: "declaration", description: "Immediate Operating Need approved for noncompetitive procurement award" }).event_family).toBe("approval");
    expect(event({ event_kind: "declaration", description: "Declaration of Immediate Operating Need for ABLE systems" }).event_family).toBe("approval");
    expect(event({ event_kind: "ION declaration", description: "ION declared and approved for urgent implementation of e-Citation System" }).event_family).toBe("approval");
    expect(event({ event_kind: "ION declaration and notice to proceed", description: "ION approved and Notice to Proceed issued to PowerTrunk" }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "declaration", description: "Emergency declaration for storm operations" }).event_family).toBe("other");
    expect(event({ event_kind: "declaration", description: "General declaration" }).event_family).toBe("other");
    expect(event({ event_kind: "ION declaration", description: "ION Network programming event." }).event_family).toBe("other");
    expect(event({ event_kind: "public event", description: "ION Network event to promote programming." }).event_family).toBe("other");
    expect(event({ event_kind: "certification", description: "Chair certified the budget and financial plan" }).event_family).toBe("other");
  });

  it("promotes stale other event family for Immediate Operating Need declarations during replay", () => {
    const out = event({
      event_kind: "declaration",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "declaration",
      description: "Immediate Operating Need declared by MTA Procurement, waiving competitive bidding",
    });
    expect(out.event_family).toBe("approval");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("declaration");

    const exact = event({
      event_kind: "immediate_operating_need_declaration",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "immediate_operating_need_declaration",
    });
    expect(exact.event_family).toBe("approval");
    expect(exact.lifecycle_phase).toBe("other");
    expect(exact.lifecycle_phase_other).toBe("immediate_operating_need_declaration");
  });

  it("maps only selection-committee evaluation decisions to approval", () => {
    expect(event({ event_kind: "evaluation", description: "MTA Selection Committee evaluated technical proposals and unanimously selected Sperry" }).event_family).toBe("approval");
    expect(event({ event_kind: "evaluation", description: "Selection Committee unanimously determined Loram was technically qualified to perform the work" }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "evaluation", description: "Evaluate SBS performance. Study more robust options if supported by community." }).event_family).toBe("planning");
    expect(event({ event_kind: "evaluation", description: "MTA will evaluate budget impacts and customer response" }).event_family).toBe("other");
  });

  it("promotes stale other event family for selection-committee evaluation decisions during replay", () => {
    const out = event({
      event_kind: "evaluation",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "evaluation",
      description: "MTA Selection Committee evaluated technical proposals and unanimously selected Sperry",
    });
    expect(out.event_family).toBe("approval");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("evaluation");
  });

  it("maps only approved contract modification events to approval", () => {
    expect(event({ event_kind: "plan_amendment", description: "FMTAC issued Excess Flood coverage amendment, effective May 1, 2025 and approved June 25, 2025." }).event_family).toBe(
      "approval",
    );
    expect(
      event({
        event_kind: "plan_amendment",
        event_family: "other",
        description: "FMTAC coverage plan amendment, effective May 1, 2025 and approved June 25, 2025.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "plan_amendment", description: "Coverage plan amendment effective May 1, 2025." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "policy_amendment",
        description: "Governance Guidelines amended and approved by the Chairman and a majority of the members of the MTA Board.",
      }).event_family,
    ).toBe("governance");
    expect(
      event({
        event_kind: "policy_amendment",
        description: "Request to amend the Policy Governing Event Fee Schedule for GCT Event Venues, replacing the current fee schedule.",
      }).event_family,
    ).toBe("governance");
    expect(event({ event_kind: "policy_amendment", description: "Request to amend policy coverage, effective after review and approved by staff." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_modification", description: "Board approved modification to East Harlem Community Collaborators JV contract." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "contract amendment", description: "Approval to amend a Public Works Contract with Triumph Construction Corp." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "contract_modification", description: "Ratification of a modification to add funding and implement an automated Revenue Recovery System." }).event_family).toBe(
      "approval",
    );
    expect(event({ event_kind: "contract_modification", description: "Modification #1 to Hayden contract awarded in the estimated amount of $63,477,161." }).event_family).toBe(
      "milestone",
    );
	    expect(event({ event_kind: "contract_modification", description: "Modification 1 to Primary Carrier contracts enabling installation of dual EV charging stations." }).event_family).toBe(
	      "milestone",
	    );
    expect(event({ event_kind: "contract_modification", description: "MTAHQ Procurement approached a vendor to add 38 new locations to the contract." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "contract extension", description: "Extension of contract term for one year." }).event_family).toBe("other");
    expect(event({ event_kind: "contract start", description: "Start of base four-year contract term." }).event_family).toBe("other");
    expect(event({ event_kind: "contract end", description: "End of contract term." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "license agreement", description: "Authorization to enter into a 10-year license." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "lease agreement", description: "Authorization to enter into a 5-year lease." }).event_family).toBe("milestone");
  });

  it("promotes stale other event family for approved contract modifications during replay", () => {
    const out = event({
      event_kind: "contract_amendment",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_amendment",
      description: "Approval to amend a Personal Service Contract with TransCore, LP; ratification of a modification to add funding.",
    });
    expect(out.event_family).toBe("approval");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("contract_amendment");
  });

  it("maps payload-proven project steps to planning or implementation without update broadening", () => {
    expect(event({ event_kind: "project_step", name: "Step 1: Data collection and analysis" }).event_family).toBe("planning");
    expect(event({ event_kind: "project_step", description: "Step 2: Corridor Selection and Concept Design" }).event_family).toBe("planning");
    expect(event({ event_kind: "project_step", description: "Step 3: Develop preferred plan for the corridor including street/station design" }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "project_step", description: "Step 4: Final Design plan; develop implementation plan and launch SBS service" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "project_step", description: "Step 5: Future action item" }).event_family).toBe("other");
    expect(event({ event_kind: "project update", description: "Briefing on status of project implementation and close-out." }).event_family).toBe("other");
    expect(event({ event_kind: "board update", description: "Board update on capital project goals." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee briefing", description: "Briefing on status of PTC implementation and close-out." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee review", description: "Finance Committee review of contract award." }).event_family).toBe("governance");
  });

  it("promotes stale other event family for payload-proven project steps during replay", () => {
    const planning = event({
      event_kind: "project_step",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "project_step",
      description: "Step 2: Conceptual design and traffic analysis",
    });
    expect(planning.event_family).toBe("planning");
    expect(planning.lifecycle_phase).toBe("other");
    expect(planning.lifecycle_phase_other).toBe("project_step");

    const implementation = event({
      event_kind: "project_step",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "project_step",
      description: "Step 4: Develop implementation plan, launch SBS service",
    });
    expect(implementation.event_family).toBe("implementation");
    expect(implementation.lifecycle_phase).toBe("other");
    expect(implementation.lifecycle_phase_other).toBe("project_step");
  });

  it("maps payload-proven project phases without generic phase broadening", () => {
    expect(event({ event_kind: "project_phase", description: "Data collection and analysis phase of Webster Avenue SBS project" }).event_family).toBe("planning");
    expect(event({ event_kind: "project phase", description: "Preferred corridor plan phase of Webster Avenue SBS project" }).event_family).toBe("planning");
    expect(event({ event_kind: "project_phase", description: "Final Design and Implementation phase of Webster Avenue SBS project" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "project_phase", description: "CAC Meetings and Public Open House to introduce project and discuss possible SBS designs" }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "project_phase", description: "General project phase to be determined" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "project_update",
        event_name: "LIRR/MNR PTC Project Update",
        description: "Briefing on the status of project implementation and close-out following full Positive Train Control functionality going into effect.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "project update", description: "Briefing on status of project implementation and close-out." }).event_family).toBe("other");
    expect(event({ event_kind: "project update", description: "East Side Access Support Projects Update." }).event_family).toBe("other");
    expect(event({ event_kind: "board update", description: "Board update on capital project goals." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee briefing", description: "Briefing on status of PTC implementation and close-out." }).event_family).toBe("governance");
    expect(event({ event_kind: "committee review", description: "Finance Committee review of contract award." }).event_family).toBe("governance");
  });

  it("promotes stale other event family for payload-proven project phases during replay", () => {
    const planning = event({
      event_kind: "project_phase",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "project_phase",
      description: "Design ideas phase of Webster Avenue SBS project",
    });
    expect(planning.event_family).toBe("planning");
    expect(planning.lifecycle_phase).toBe("other");
    expect(planning.lifecycle_phase_other).toBe("project_phase");

    const engagement = event({
      event_kind: "project_phase",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "project_phase",
      description: "CAC Meeting and Public Open House to review final draft plan",
    });
    expect(engagement.event_family).toBe("public_engagement");
    expect(engagement.lifecycle_phase).toBe("other");
    expect(engagement.lifecycle_phase_other).toBe("project_phase");

    const ptcUpdate = event({
      event_kind: "project_update",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "project_update",
      description: "The Committee will be briefed on the status of project implementation and close-out following full PTC functionality.",
    });
    expect(ptcUpdate.event_family).toBe("implementation");
    expect(ptcUpdate.lifecycle_phase).toBe("other");
    expect(ptcUpdate.lifecycle_phase_other).toBe("project_update");
  });

  it("maps payload-proven environmental reviews without deadline broadening", () => {
    expect(event({ event_kind: "environmental_review", description: "Formal environmental review process expected to begin in 2025." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "environmental review",
        description: "The team anticipates releasing a draft environmental impact statement (DEIS); environmental review commenced with publication of the scope.",
      }).event_family,
    ).toBe("planning");
    expect(
      event({
        event_kind: "environmental_review",
        description: "FHWA completed their Reevaluation process under NEPA confirming the tolling structure complies with the Environmental Assessment and FONSI remains valid.",
      }).event_family,
    ).toBe("approval");
    expect(event({ event_kind: "environmental review", description: "Target completion of environmental review for 34th Street SBS project." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "next_steps", description: "Formal environmental review process expected to begin." }).event_family).toBe("other");
    expect(event({ event_kind: "deadline", description: "Target completion of environmental review." }).event_family).toBe("other");
  });

  it("promotes stale other event family for payload-proven environmental reviews during replay", () => {
    const planning = event({
      event_kind: "environmental_review",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "environmental_review",
      description: "Environmental review commenced with publication of the scope for the EIS.",
    });
    expect(planning.event_family).toBe("planning");
    expect(planning.lifecycle_phase).toBe("other");
    expect(planning.lifecycle_phase_other).toBe("environmental_review");

    const approval = event({
      event_kind: "environmental_review",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "environmental_review",
      description: "FHWA completed their Reevaluation process under NEPA confirming the FONSI remains valid.",
    });
    expect(approval.event_family).toBe("approval");
    expect(approval.lifecycle_phase).toBe("other");
    expect(approval.lifecycle_phase_other).toBe("environmental_review");
  });

  it("maps payload-proven activations to implementation without deployment broadening", () => {
    expect(event({ event_kind: "activation", description: "AutoGate OMNY readers activated in revenue service." }).event_family).toBe("implementation");
    expect(event({ event_kind: "activation", description: "ACE began its 60-day warning period on the B15 and M31 routes." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "activation" }).event_family).toBe("other");
    expect(event({ event_kind: "deployment", description: "Bus Time displays deployed at most B46 SBS stops." }).event_family).toBe("implementation");
    expect(event({ event_kind: "service activation", description: "Service activation date." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "infrastructure_activation",
        description: "On-street pantograph charger expected to be in operation at Williamsburg Bridge Plaza.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event({
        event_kind: "infrastructure activation",
        description: "Metro-North eliminated dark territory by activating Centralized Traffic Control on the Waterbury Branch.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "infrastructure_activation", description: "Infrastructure activation date." }).event_family).toBe("other");
    expect(event({ event_kind: "service activation", description: "The new third track was put into service." }).event_family).toBe("implementation");
    expect(event({ event_kind: "deployment", description: "Complete fleetwide deployment of OBC software." }).event_family).toBe("implementation");
    expect(event({ event_kind: "deployment", description: "Real-time passenger information coming to 86th Street." }).event_family).toBe("implementation");
    expect(event({ event_kind: "software deployment", description: "FRA approval request will be filed for revenue testing and deployment in Jan 2024." }).event_family).toBe("other");
    expect(event({ event_kind: "delivery", description: "Expected delivery of first 15 devices." }).event_family).toBe("other");
  });

  it("promotes stale other event family for payload-proven activations during replay", () => {
    const out = event({
      event_kind: "activation",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "activation",
      description: "Final three bus lane enforcement camera routes activated.",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("activation");

    const infrastructure = event({
      event_kind: "infrastructure_activation",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "infrastructure_activation",
      description: "Activating Centralized Traffic Control on the 27-mile Waterbury Branch.",
    });
    expect(infrastructure.event_family).toBe("implementation");
    expect(infrastructure.lifecycle_phase).toBe("other");
    expect(infrastructure.lifecycle_phase_other).toBe("infrastructure_activation");

    const service = event({
      event_kind: "service activation",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "service_activation",
      description: "Five routes now have activated automated bus lane enforcement cameras.",
    });
    expect(service.event_family).toBe("implementation");
    expect(service.lifecycle_phase).toBe("other");
    expect(service.lifecycle_phase_other).toBe("service_activation");
  });

  it("maps post-implementation data collection to implementation without report-period broadening", () => {
    expect(event({ event_kind: "data collection", description: "Post-implementation data collection & monitoring" }).event_family).toBe("implementation");
    expect(event({ event_kind: "data_collection", description: "Post-implementation data collection and monitoring for Lexington Ave Bus Lane Enhancement" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "data_collection", description: "Data collection period for the Life in the Slow Lane report card." }).event_family).toBe("other");
    expect(event({ event_kind: "evaluation", description: "Evaluate SBS performance. Study more robust options if supported by community." }).event_family).toBe("planning");
    expect(event({ event_kind: "performance_review", description: "Review performance results." }).event_family).toBe("other");
    expect(event({ event_kind: "quarterly_update", description: "Quarterly update." }).event_family).toBe("other");
    expect(event({ event_kind: "data prepared", description: "Data prepared for annual results review." }).event_family).toBe("other");
  });

  it("promotes stale other event family for post-implementation data collection during replay", () => {
    const out = event({
      event_kind: "data_collection",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "data_collection",
      description: "Post-implementation data collection & monitoring",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("data_collection");
  });

  it("maps conducted proof-of-concept events to implementation without concept broadening", () => {
    expect(event({ event_kind: "proof of concept", description: "NYC Transit conducted a limited ABLE proof-of-concept." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "proof_of_concept", description: "Successful proof of concept for Front Facing Cameras." }).event_family).toBe("implementation");
    expect(event({ event_kind: "proof_of_concept", description: "Two-year no charge proof-of-concept pilot." }).event_family).toBe("implementation");
    expect(event({ event_kind: "proof_of_concept", description: "NYC Transit permitted to conduct limited ABLE proof-of-concept." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "proof_of_concept" }).event_family).toBe("other");
    expect(event({ event_kind: "next_steps", description: "Develop design ideas and preferred plan." }).event_family).toBe("other");
    expect(event({ event_kind: "next_steps", description: "Formal environmental review process expected to begin." }).event_family).toBe("other");
    expect(event({ event_kind: "evaluation", description: "Evaluate SBS performance." }).event_family).toBe("other");
    expect(event({ event_kind: "deployment", description: "Deployment schedule." }).event_family).toBe("other");
  });

  it("promotes stale other event family for conducted proof-of-concept events during replay", () => {
    const out = event({
      event_kind: "proof_of_concept",
      event_family: "other",
      lifecycle_phase: "proposed",
      description: "Successful proof of concept for Front Facing Cameras in 2022",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("proposed");
  });

  it("maps only actual delivery completion events to implementation", () => {
    expect(event({ event_kind: "delivery", description: "First two locomotives delivered on schedule and undergoing acceptance testing" }).event_family).toBe("implementation");
    expect(event({ event_kind: "delivery", description: "Delivery completion of all five low-floor electric buses" }).event_family).toBe("implementation");
    expect(event({ event_kind: "delivery_complete", description: "Anticipated completion of delivery for 45 diesel-battery hybrid option locomotives" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "delivery_complete", description: "Delivery of the 44 Dual-Mode Locomotives is scheduled to be completed" }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "delivery", description: "Expected delivery of first 15 Customer Service Point of Sale devices" }).event_family).toBe("planning");
    expect(event({ event_kind: "delivery", description: "Delivery of production buses now scheduled to begin in March 2024" }).event_family).toBe("milestone");
		    expect(event({ event_kind: "delivery", description: "Delivery of production buses now scheduled to be completed in September 2024" }).event_family).toBe("milestone");
    expect(event({ event_kind: "delivery_complete", description: "Delivery complete status update." }).event_family).toBe("other");
    expect(event({ event_kind: "delivery period", description: "Delivery of locomotives scheduled to begin in 2027 and be completed in fall 2027." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "delivery_period", description: "Delivery of 44 dual-mode locomotives scheduled to begin in 2027 and be completed in 2031." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "delivery period", description: "General delivery period discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "rolling_stock_delivery", description: "R211 Delivery" }).event_family).toBe("milestone");
    expect(event({ event_kind: "rolling_stock_delivery", description: "General delivery planning discussion." }).event_family).toBe("other");
  });

  it("maps scheduled delivery starts to milestones without generic delivery broadening", () => {
    expect(event({ event_kind: "delivery", description: "Delivery of 316 M-9A cars scheduled to commence with pilot cars in Q3 2029." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "delivery", description: "Pilot buses are scheduled to be provided to NYC Transit in January 2025 to expedite delivery." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "delivery", description: "Expected delivery of remaining 15 Customer Service Point of Sale devices." }).event_family).toBe("planning");
    expect(event({ event_kind: "delivery", description: "Nova Bus delivery of 100 clean diesel Option Buses starting in Q1 2027 and concluding in Q2 2027." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "delivery", description: "Receive Software Data Maintenance Facility delivery." }).event_family).toBe("milestone");
  });

  it("promotes stale other event family for scheduled delivery starts during replay", () => {
    const out = event({
      event_kind: "delivery",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "delivery",
      description: "Delivery of production buses now scheduled to begin in March 2024.",
    });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("delivery");
  });

  it("promotes stale other event family for actual delivery completion during replay", () => {
    const out = event({
      event_kind: "delivery",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "delivery",
      description: "Delivery completion of all five low-floor electric buses",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("delivery");

    const exact = event({
      event_kind: "delivery_complete",
      event_family: "other",
      lifecycle_phase: "completed",
      description: "Delivery of the 44 Dual-Mode Locomotives is scheduled to be completed",
    });
    expect(exact.event_family).toBe("implementation");
    expect(exact.lifecycle_phase).toBe("completed");
  });

  it("maps exact installation events to implementation while preserving installed lifecycle", () => {
    expect(event({ event_kind: "installation" }).event_family).toBe("implementation");
    expect(event({ event_kind: "installation" }).lifecycle_phase).toBe("installed");
    expect(event({ event_kind: "accessibility installation" }).event_family).toBe("implementation");
    expect(event({ event_kind: "accessibility_installation" }).lifecycle_phase).toBe("installed");
    expect(event({ event_kind: "infrastructure added" }).event_family).toBe("implementation");
    expect(event({ event_kind: "infrastructure_replacement" }).event_family).toBe("implementation");
    expect(event({ event_kind: "infrastructure upgrade" }).event_family).toBe("implementation");
    expect(event({ event_kind: "infrastructure_work" }).event_family).toBe("implementation");
    expect(event({ event_kind: "installation target", lifecycle_phase: "installed" }).event_family).toBe("implementation");
    expect(event({ event_kind: "installation target", lifecycle_phase: "installed" }).lifecycle_phase).toBe("installed");
    expect(event({ event_kind: "infrastructure failure" }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure issue" }).event_family).toBe("other");
    expect(event({ event_kind: "commissioning scheduled" }).event_family).toBe("other");
    expect(event({ event_kind: "anticipated start" }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure_project" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "infrastructure_project",
        description: "One bridge carrying the mainline tracks was fully replaced. The new bridge was constructed off-site.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "infrastructure_project", description: "Interlocking renewal in GCT, begins in January 2024." }).event_family).toBe(
      "implementation",
    );
    expect(
      event({
        event_kind: "infrastructure_project",
        description: "Walk Bridge replacement project at South Norwalk will begin in December 2023.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "infrastructure_project", description: "Bridge-replacement projects in Mt Vernon support state of good repair work." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "infrastructure_project", description: "Maintenance of Way rail and tie replacement supports schedule adjustments." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "infrastructure_project", description: "State of Good Repair work with schedule adjustments enacted." }).event_family).toBe("implementation");
    expect(event({ event_kind: "infrastructure_project", description: "LIRR Third Track." }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure_project", description: "Bridge-replacement projects at South St and Fulton Ave." }).event_family).toBe("other");
    expect(event({ event_kind: "delivery" }).event_family).toBe("other");
  });

  it("promotes stale other event family for installation during replay", () => {
    const out = event({ event_kind: "installation", event_family: "other", lifecycle_phase: "installed" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("installed");

    const accessibilityInstallation = event({ event_kind: "accessibility_installation", event_family: "other", lifecycle_phase: "installed" });
    expect(accessibilityInstallation.event_family).toBe("implementation");
    expect(accessibilityInstallation.lifecycle_phase).toBe("installed");

    const infrastructureWork = event({ event_kind: "infrastructure work", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "infrastructure work" });
    expect(infrastructureWork.event_family).toBe("implementation");
    expect(infrastructureWork.lifecycle_phase).toBe("other");
    expect(infrastructureWork.lifecycle_phase_other).toBe("infrastructure work");

    const infrastructureProject = event({
      event_kind: "infrastructure_project",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "infrastructure_project",
      description: "Metro-North and MTA Construction & Development began replacing superstructures of two bridges.",
    });
    expect(infrastructureProject.event_family).toBe("implementation");
    expect(infrastructureProject.lifecycle_phase).toBe("other");
    expect(infrastructureProject.lifecycle_phase_other).toBe("infrastructure_project");
  });

  it("maps exact schedule and timetable change events to implementation without lifecycle promotion", () => {
    expect(event({ event_kind: "schedule change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "schedule_change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "schedule adjustment" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service adjustment" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service modification" }).event_family).toBe("implementation");
    expect(event({ event_kind: "timetable change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "timetable_change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "timetable change", description: "Implemented a new weekday timetable." }).event_family).toBe("implementation");
    expect(event({ event_kind: "schedule change" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "schedule adjustment" }).lifecycle_phase).toBe("modified");
    expect(event({ event_kind: "service modification" }).lifecycle_phase).toBe("modified");
    expect(event({ event_kind: "project_step" }).event_family).toBe("other");
    expect(event({ event_kind: "evaluation" }).event_family).toBe("other");
    expect(event({ event_kind: "service plan update" }).event_family).toBe("other");
    expect(event({ event_kind: "rate_schedule_modification" }).event_family).toBe("other");
    expect(event({ event_kind: "price adjustment" }).event_family).toBe("other");
  });

  it("promotes stale other event family for schedule changes during replay", () => {
    const out = event({ event_kind: "schedule_change", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "schedule_change" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("schedule_change");
  });

  it("maps exact bond issuance and pricing events to milestones without agreement broadening", () => {
    expect(event({ event_kind: "bond issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond_issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "planned bond issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "upcoming_bond_issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond issuance planned" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond_pricing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond closing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond_remarketing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond sale" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bond_transaction" }).event_family).toBe("milestone");
    expect(event({ event_kind: "credit rating action" }).event_family).toBe("milestone");
    expect(event({ event_kind: "credit rating upgrade" }).event_family).toBe("milestone");
    expect(event({ event_kind: "credit_rating_upgrade" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ratings upgrade" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ratings_upgrade" }).event_family).toBe("milestone");
    expect(event({ event_kind: "grant announcement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "funding_allocation" }).event_family).toBe("milestone");
    expect(event({ event_kind: "financing closing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "debt_payoff" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "fuel hedge" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "upcoming_issuance" }).event_family).toBe("other");
	    expect(event({ event_kind: "issuance" }).event_family).toBe("other");
	    expect(event({ event_kind: "issuance", description: "MTA Real Estate issued a Request for Proposals for the lease of the MNR Hartsdale Station premises." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "issuance", description: "The Board Members Code of Ethics was originally issued in March 2006." }).event_family).toBe(
	      "governance",
	    );
	    expect(event({ event_kind: "issuance", description: "General issuance discussion." }).event_family).toBe("other");
	    expect(event({ event_kind: "financial_reconfiguration" }).event_family).toBe("other");
    expect(event({ event_kind: "budget_baseline" }).event_family).toBe("other");
    expect(event({ event_kind: "budget deal" }).event_family).toBe("other");
    expect(event({ event_kind: "budget_enactment" }).event_family).toBe("other");
    expect(event({ event_kind: "financial forecast" }).event_family).toBe("other");
    expect(event({ event_kind: "budget_review" }).event_family).toBe("governance");
    expect(event({ event_kind: "budget recommendation" }).event_family).toBe("other");
    expect(event({ event_kind: "price_adjustment" }).event_family).toBe("other");
	    expect(event({ event_kind: "proposed increase" }).event_family).toBe("other");
	    expect(event({ event_kind: "fare_change" }).event_family).toBe("other");
	    expect(event({ event_kind: "fare promotion adjustment" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "temporary_fare_promotion",
        description: "Approval to launch temporary fare promotions for Rockaway riders.",
      }).event_family,
    ).toBe("approval");
    expect(
      event({
        event_kind: "fare promotion adjustment",
        description: "OMNY weekly best fare will be adjusted so the seven-day period can begin on any day.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "temporary fare promotion" }).event_family).toBe("other");
		    expect(event({ event_kind: "license_agreement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_term" }).event_family).toBe("other");
  });

  it("maps payload-proven legal, finance, procurement, grant, and fleet tail milestones", () => {
    expect(event({ event_kind: "rating_upgrade", description: "Fitch Ratings upgraded MTA Transportation Revenue Bonds." }).event_family).toBe("milestone");
    expect(event({ event_kind: "rating_action", description: "Moody's Ratings upgraded the rating on MTA Transportation Revenue Bonds." }).event_family).toBe("milestone");
    expect(event({ event_kind: "court_order", description: "United States District Court issued a Memorandum and Order denying a preliminary injunction." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "lawsuit_filed", description: "Hayden filed the first of several lawsuits alleging patent infringement." }).event_family).toBe("milestone");
    expect(
      event({
        event_kind: "settlement agreement",
        description: "NYCT entered into a proposed settlement agreement to resolve class action lawsuits relating to accessibility for riders with mobility disabilities.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "request_for_information", description: "ABLE request for information issued to vendors." }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFP response", description: "Hudson Harbor was the only respondent to the RFP issued by MTA." }).event_family).toBe("milestone");
    expect(event({ event_kind: "proposal received", description: "A single proposal was received from Railware." }).event_family).toBe("milestone");
    expect(event({ event_kind: "pre_bid_conference", description: "Pre-bid conference for the ITSP solicitation." }).event_family).toBe("milestone");
    expect(event({ event_kind: "transaction_closing", description: "Scheduled closing of Transportation Revenue Refunding Bonds transaction." }).event_family).toBe("milestone");
    expect(event({ event_kind: "upcoming_transaction", description: "MTA expects to issue TBTA General Revenue Bonds, Series 2024A." }).event_family).toBe("milestone");
    expect(event({ event_kind: "refinancing", description: "TBTA Bond Anticipation Notes refinancing for Series 2021A and Series 2024A." }).event_family).toBe("milestone");
    expect(event({ event_kind: "remarketing", description: "Remarketing of TBTA General Revenue Variable Rate Refunding Bonds, Series 2018E." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "grant_period_start", description: "CMAQ grant coverage period start for connecting services." }).event_family).toBe("milestone");
    expect(event({ event_kind: "grant_period_end", description: "CMAQ grant coverage period end for connecting services." }).event_family).toBe("milestone");
    expect(event({ event_kind: "rolling_stock_retirement", description: "Goodbye 1964 R32 Retirement." }).event_family).toBe("milestone");

    expect(event({ event_kind: "rating_upgrade", description: "General rating discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "court_order", description: "Generic court update." }).event_family).toBe("other");
    expect(event({ event_kind: "lawsuit_filed", description: "Legal update without filing details." }).event_family).toBe("other");
    expect(event({ event_kind: "settlement", description: "Labor settlement discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "rfp_response" }).event_family).toBe("other");
    expect(event({ event_kind: "proposal_received", description: "General proposal workflow." }).event_family).toBe("other");
    expect(event({ event_kind: "pre_bid_conference", description: "General conference." }).event_family).toBe("other");
    expect(event({ event_kind: "transaction", description: "General business transaction." }).event_family).toBe("other");
    expect(event({ event_kind: "grant_period_start", description: "Generic grant timing." }).event_family).toBe("other");
    expect(event({ event_kind: "rolling_stock_retirement", description: "General fleet planning discussion." }).event_family).toBe("other");
  });

  it("promotes stale other event family for bond issuance during replay", () => {
    const out = event({ event_kind: "bond_issuance", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "bond_issuance" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("bond_issuance");
  });

  it("promotes stale other event family for bond transaction milestones during replay", () => {
    const out = event({ event_kind: "bond_remarketing", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "bond_remarketing" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("bond_remarketing");
  });

  it("promotes stale other event family for exact funding milestones during replay", () => {
    const allocation = event({ event_kind: "funding allocation", event_family: "other", lifecycle_phase: "funded" });
    expect(allocation.event_family).toBe("milestone");
    expect(allocation.lifecycle_phase).toBe("funded");

    const fuelHedge = event({ event_kind: "fuel_hedge", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "fuel_hedge" });
    expect(fuelHedge.event_family).toBe("milestone");
    expect(fuelHedge.lifecycle_phase).toBe("other");
    expect(fuelHedge.lifecycle_phase_other).toBe("fuel_hedge");
  });

  it("promotes stale other event family for credit rating upgrades during replay", () => {
    const action = event({ event_kind: "credit rating action", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "credit rating action" });
    expect(action.event_family).toBe("milestone");
    expect(action.lifecycle_phase).toBe("other");
    expect(action.lifecycle_phase_other).toBe("credit rating action");

    const out = event({ event_kind: "credit_rating_upgrade", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "credit_rating_upgrade" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("credit_rating_upgrade");

    const ratings = event({ event_kind: "ratings_upgrade", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "ratings_upgrade" });
    expect(ratings.event_family).toBe("milestone");
    expect(ratings.lifecycle_phase).toBe("other");
    expect(ratings.lifecycle_phase_other).toBe("ratings_upgrade");
  });

  it("maps exact procurement milestone events without contract boundary broadening", () => {
    expect(event({ event_kind: "RFP issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFP issued" }).event_family).toBe("milestone");
    expect(event({ event_kind: "rfp_issue" }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFP release" }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFP advertisement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "rfp_advertisement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFQ issued", description: "RFQ issued for 6 new ADA stations plus 5 elevator replacements." }).event_family).toBe("milestone");
    expect(event({ event_kind: "request_for_proposals" }).event_family).toBe("milestone");
    expect(event({ event_kind: "solicitation_issue" }).event_family).toBe("milestone");
    expect(event({ event_kind: "proposal_submission" }).event_family).toBe("milestone");
    expect(event({ event_kind: "proposal deadline" }).event_family).toBe("milestone");
    expect(event({ event_kind: "proposal_due" }).event_family).toBe("milestone");
    expect(event({ event_kind: "submission deadline" }).event_family).toBe("milestone");
    expect(event({ event_kind: "submission_deadline" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bid receipt" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bid_receipt" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bid submission" }).event_family).toBe("milestone");
    expect(event({ event_kind: "bid_submission" }).event_family).toBe("milestone");
    expect(event({ event_kind: "delivery start" }).event_family).toBe("milestone");
    expect(event({ event_kind: "delivery_start" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_issuance" }).event_family).toBe("milestone");
    expect(event({ event_kind: "agreement execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "agreement_execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "mou_execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "notice to proceed" }).event_family).toBe("milestone");
    expect(event({ event_kind: "notice_to_proceed" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ntp" }).event_family).toBe("milestone");
    expect(event({ event_kind: "fuel hedge execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "fuel_hedge_execution" }).event_family).toBe("milestone");
    expect(event({ event_kind: "RFP issuance" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "RFP issued" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "proposal_submission" }).lifecycle_phase).toBe("proposed");
    expect(event({ event_kind: "proposal deadline" }).lifecycle_phase).toBe("proposed");
    expect(event({ event_kind: "proposal_due" }).lifecycle_phase).toBe("proposed");
    expect(event({ event_kind: "bid receipt" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "bid submission" }).lifecycle_phase).toBe("proposed");
    expect(event({ event_kind: "delivery_start" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "contract execution" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "notice to proceed" }).lifecycle_phase).toBe("other");
	    expect(event({ event_kind: "license_agreement" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "license agreement" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "lease_agreement" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "lease agreement" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "license_agreement" }).lifecycle_phase).toBe("other");
	    expect(event({ event_kind: "lease_agreement" }).lifecycle_phase).toBe("other");
	    expect(event({ event_kind: "license_agreement_effective" }).event_family).toBe("other");
	    expect(event({ event_kind: "license term" }).event_family).toBe("other");
	    expect(event({ event_kind: "license_amendment" }).event_family).toBe("other");
		    expect(event({ event_kind: "lease execution" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "lease_renewal_agreement" }).event_family).toBe("other");
	    expect(event({ event_kind: "lease termination agreement" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_start" }).event_family).toBe("other");
    expect(event({ event_kind: "contract start", description: "Start of base four-year contract term." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_start", description: "Start of PTC Data Radio contract term." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_start", description: "Enterprise Asset Management Consulting Services contract start date." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_start", description: "General contract start discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "contract start", date_text: "May 1, 2026", description: "Start of contract term for Contract PSC-25-3079." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract start", date_text: "August 1, 2025", description: "Start of initial three-year term for portfolio management services." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "Contract start", date_text: "May 30, 2024", description: "Fare collection system contract base period start date." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_end" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_end", description: "End date for AAR Paratransit Supplemental Service contracts through March 31, 2033." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_end", description: "End of PTC Data Radio contract term." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_end", description: "Extended contract term end date for Small Business Mentoring Program contract through March 31, 2025." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_expiration" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_expiration", description: "Previous Masabi Contract 15590 scheduled to expire." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract expiration", description: "Current Aetna agreement expiring December 31, 2025." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "contract_expiration", description: "Zaro's license agreement expired and is currently operating month-to-month." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "expiration", description: "Bien Cuit's license agreement expired.", date_text: "August 31, 2025" }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "expiration", description: "Supplemental death benefit agreements reached in April 2020 expired." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "contract_expiration", description: "Contract lifecycle planning discussion." }).event_family).toBe("other");
	    expect(event({ event_kind: "expiration", description: "General expiration timeline." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_extension" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_term" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_term_end" }).event_family).toBe("other");
    expect(event({ event_kind: "contract_term_end", description: "End of E-ZPass transponder contract base term." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract term end", description: "Base contract term end date for M-9A Passenger Railcars contract." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_extension", description: "End of 12-month extension of CVS Health contract." }).event_family).toBe("milestone");
    expect(event({ event_kind: "contract_extension", description: "Extended contract term for 11 Transportation Planning contracts (12 months)." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_extension", description: "Proposed one-year extension of prognostic maintenance services test and evaluation." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "contract_extension", description: "General contract extension discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_extension", description: "Extension of unrelated project timeline." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_term", description: "Contract term for OEM Purchase Agreements for Replacement Parts, five years." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "contract_term",
        date_text: "April 1, 2021-March 31, 2026",
        description: "Original contract term for Transportation Planning and Conceptual Design Retainer.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "contract_term", description: "General contract term discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_term", description: "Contract terms and conditions overview." }).event_family).toBe("other");
    expect(event({ event_kind: "contract_modification" }).event_family).toBe("other");
    expect(event({ event_kind: "appraisal" }).event_family).toBe("other");
    expect(event({ event_kind: "appraisal", description: "MTA Real Estate solicited an appraisal from Goodman Marks for the premises." }).event_family).toBe("milestone");
    expect(event({ event_kind: "appraisal", description: "Completion of an independent appraisal of the property." }).event_family).toBe("milestone");
	    expect(event({ event_kind: "appraisal", description: "Effective date of valuation for the independent appraisal of required easements." }).event_family).toBe(
	      "milestone",
	    );
	    expect(event({ event_kind: "appraisal", description: "Appraisal topic for future review." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "easement agreement",
        description:
          "Permanent easement agreement between LIRR and property owners for installation and maintenance of aerial platform over property adjacent to LIRR right-of-way.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "easement_agreement",
        description: "LIRR Easement with Grantee at Cedarhurst Train Station for installation of an ADA ramp and stairway. Term: Permanent.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "easement_acquisition",
        description: "Acquisition of temporary and permanent easements from the City of New York in support of Second Avenue Subway Phase 2.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "easement_grant",
        description: "Grant of subsurface permanent easement for installation of a sanitary sewer force main crossing LIRR property. Term: Perpetual.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "discussion", description: "Discussions with TMHA led to request for permanent exclusive-use easement." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "formal offer", description: "MTA Real Estate extended a formal offer upon completion of appraisal of required easements." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "easement_agreement", description: "Generic easement agreement." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "Property Acquisition",
        description: "MTA acquired adjacent Block 1909 Lot 44 for the construction of SAS2's Ancillary A.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "property_acquisition",
        description: "Acquisition of property interests along Erskine Place in support of the Penn Station Access Project.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "property_acquisition", description: "Property acquisition topic for later review." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "contract amendment",
        description: "Amendment No. 1 for additional project management support services with $621,385 additional funding.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "contract_modification",
        description: "Contract with DiRAD was modified to add necessary services for enhanced self-service options.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "contract_modification", description: "MTA Strategic Initiatives approached MTAHQ Procurement to add locations." }).event_family).toBe(
      "other",
    );
    expect(
      event({
        event_kind: "procurement_action",
        description: "Immediate Operating Need for maintenance services; award made in January 2026 for a one-year term.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "procurement action",
        description: "Award of modification to Contract CS179 to replace fire standpipe valves.",
      }).event_family,
    ).toBe("milestone");
    expect(
      event({
        event_kind: "procurement_action",
        description: "Proposed award of competitively solicited personal service contract for construction management services.",
      }).event_family,
    ).toBe("other");
    expect(
      event({
        event_kind: "license_amendment",
        description: "Amendment to license for MTA Police Department vehicle parking, 26 parking spaces, two-year term.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "license_amendment" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "permit_agreement",
        description: "MNR Permit with Permittee for Poughkeepsie Station overflow event parking and shuttle bus pick up.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "permit_agreement" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "negotiation",
        description: "Negotiations were conducted between March and October 2023, centered on cybersecurity, pricing, and delivery.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "negotiation", description: "Negotiations were not required." }).event_family).toBe("other");
		    expect(event({ event_kind: "financial forecast" }).event_family).toBe("other");
    expect(event({ event_kind: "budget_review" }).event_family).toBe("governance");
    expect(event({ event_kind: "board submission" }).event_family).toBe("other");
    expect(event({ event_kind: "budget enactment" }).event_family).toBe("other");
    expect(event({ event_kind: "deadline" }).event_family).toBe("other");
    expect(
      event({
        event_kind: "procurement",
        description:
          "Public solicitation of bids for 470 battery-electric buses (380 standard and 90 articulated), projected to be deployed at 11 depots.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "procurement", description: "MNR Procurement issued notification of the RFP to 16 firms for ferry services." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "RFQ issued", description: "RFQ to be issued later this year for ADA at Borough Hall." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "procurement",
        event_name: "Request for Proposals Issuance",
        description: "MTA Real Estate issued RFP for licensing approximately 32,000 square feet of MNR property along Commerce Street.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "procurement", description: "Procurement for Bx6 SBS capital improvements." }).event_family).toBe("planning");
    expect(event({ event_kind: "procurement", description: "A single proposal was received from NY Waterway." }).event_family).toBe("other");
    expect(event({ event_kind: "procurement", description: "Qualification & Procurement for modern fare gates." }).event_family).toBe("planning");
    expect(event({ event_kind: "procurement" }).event_family).toBe("other");
    expect(event({ event_kind: "solicitation" }).event_family).toBe("other");
    expect(event({ event_kind: "solicitation", description: "Request for Information (RFI) issued seeking additional vendors." }).event_family).toBe("milestone");
    expect(event({ event_kind: "solicitation", description: "The solicitation was advertised in August 2022." }).event_family).toBe("milestone");
    expect(event({ event_kind: "solicitation", description: "A Request for Expression of Interest (RFEI) was first conducted before formal solicitation." }).event_family).toBe("milestone");
    expect(event({ event_kind: "solicitation", description: "Future procurement solicitation expected after design review." }).event_family).toBe("other");
    expect(event({ event_kind: "rfp_deadline" }).event_family).toBe("other");
    expect(event({ event_kind: "response deadline", description: "Responses due June 2021 for ADA stations RFQ." }).event_family).toBe("milestone");
    expect(event({ event_kind: "rfp_deadline", description: "Closing date for the RFP for space at 6309-6311 18th Avenue, Brooklyn." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "deployment_deadline", description: "Mandated field deployment date for the e-Citation system." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "go-live deadline", description: "Target date for MTA to go live with UKG Dimensions; effective date when UKG will only support Dimensions." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "target_deadline", description: "Target date for automated Revenue Recovery System to be in effect." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "option_deadline", description: "Deadline for exercising options for up to 131 additional buses." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "compliance deadline",
        description:
          "Deadline by which every lead locomotive and any car that could be used in a forward-facing position operating in commuter passenger service must be equipped with a CCTV system per FRA mandate.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "response deadline", description: "Response deadline for future planning discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "deployment_deadline", description: "Deployment deadline discussion." }).event_family).toBe("other");
    expect(event({ event_kind: "deadline", description: "Deadline for JusticeONE to be the only viable option to meet the March 31, 2026 deployment deadline." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "deadline", description: "Submissions due for MTA's first-ever Open Data Challenge." }).event_family).toBe("milestone");
    expect(event({ event_kind: "deadline", description: "Deadline for written submissions with comments about the Penn Station Access Project." }).event_family).toBe(
      "public_engagement",
    );
    expect(event({ event_kind: "deadline", description: "Target completion of environmental review." }).event_family).toBe("other");
    expect(event({ event_kind: "deadline", description: "If NYC DOT does not provide final plans by December 31, the expanded work will proceed." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "rfp_response" }).event_family).toBe("other");
    expect(event({ event_kind: "procurement_action" }).event_family).toBe("other");
  });

  it("promotes stale other event family for RFP issuance during replay", () => {
    const out = event({ event_kind: "proposal deadline", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "proposal deadline" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("proposed");
    expect(out.lifecycle_phase_other).toBeUndefined();

    const advertisement = event({ event_kind: "rfp_advertisement", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "rfp_advertisement" });
    expect(advertisement.event_family).toBe("milestone");
    expect(advertisement.lifecycle_phase).toBe("other");
    expect(advertisement.lifecycle_phase_other).toBe("rfp_advertisement");

    const submissionDeadline = event({ event_kind: "submission deadline", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "submission deadline" });
    expect(submissionDeadline.event_family).toBe("milestone");
    expect(submissionDeadline.lifecycle_phase).toBe("other");
    expect(submissionDeadline.lifecycle_phase_other).toBe("submission deadline");

    const bidSubmission = event({ event_kind: "bid_submission", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "bid_submission" });
    expect(bidSubmission.event_family).toBe("milestone");
    expect(bidSubmission.lifecycle_phase).toBe("proposed");
    expect(bidSubmission.lifecycle_phase_other).toBeUndefined();

    const deliveryStart = event({ event_kind: "delivery_start", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "delivery_start" });
    expect(deliveryStart.event_family).toBe("milestone");
    expect(deliveryStart.lifecycle_phase).toBe("other");
    expect(deliveryStart.lifecycle_phase_other).toBe("delivery_start");

    const solicitation = event({ event_kind: "solicitation", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "solicitation", description: "The solicitation was advertised in August 2022." });
    expect(solicitation.event_family).toBe("milestone");
    expect(solicitation.lifecycle_phase).toBe("other");
    expect(solicitation.lifecycle_phase_other).toBe("solicitation");
  });

  it("promotes stale other event family for contract execution milestones during replay", () => {
    const bidReceipt = event({ event_kind: "bid receipt", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "bid receipt" });
    expect(bidReceipt.event_family).toBe("milestone");
    expect(bidReceipt.lifecycle_phase).toBe("other");
    expect(bidReceipt.lifecycle_phase_other).toBe("bid receipt");

    const contractExecution = event({ event_kind: "contract execution", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "contract execution" });
    expect(contractExecution.event_family).toBe("milestone");
    expect(contractExecution.lifecycle_phase).toBe("other");
    expect(contractExecution.lifecycle_phase_other).toBe("contract execution");

	    const contractIssuance = event({ event_kind: "contract issuance", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "contract issuance" });
	    expect(contractIssuance.event_family).toBe("milestone");
	    expect(contractIssuance.lifecycle_phase).toBe("other");
	    expect(contractIssuance.lifecycle_phase_other).toBe("contract issuance");

	    const licenseAgreement = event({ event_kind: "license agreement", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "license agreement" });
	    expect(licenseAgreement.event_family).toBe("milestone");
	    expect(licenseAgreement.lifecycle_phase).toBe("other");
	    expect(licenseAgreement.lifecycle_phase_other).toBe("license agreement");

    const noticeToProceed = event({ event_kind: "notice to proceed", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "notice to proceed" });
    expect(noticeToProceed.event_family).toBe("milestone");
    expect(noticeToProceed.lifecycle_phase).toBe("other");
    expect(noticeToProceed.lifecycle_phase_other).toBe("notice to proceed");

    const fuelHedge = event({ event_kind: "fuel hedge execution", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "fuel hedge execution" });
    expect(fuelHedge.event_family).toBe("milestone");
    expect(fuelHedge.lifecycle_phase).toBe("other");
    expect(fuelHedge.lifecycle_phase_other).toBe("fuel hedge execution");
  });

  it("promotes stale other event family for contract-end milestones during replay", () => {
    const out = event({
      event_kind: "contract_end",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_end",
      description: "End of the market research retainer contracts 60-month term.",
    });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("contract_end");

    const termEnd = event({
      event_kind: "contract_term_end",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_term_end",
      description: "End of current contract term.",
    });
    expect(termEnd.event_family).toBe("milestone");
    expect(termEnd.lifecycle_phase).toBe("other");
    expect(termEnd.lifecycle_phase_other).toBe("contract_term_end");

    const term = event({
      event_kind: "contract_term",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_term",
      description: "Base term of contract 16000-0200 is two years with three one-year options.",
    });
    expect(term.event_family).toBe("milestone");
    expect(term.lifecycle_phase).toBe("other");
    expect(term.lifecycle_phase_other).toBe("contract_term");

    const extension = event({
      event_kind: "contract_extension",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_extension",
      description: "Start of 12-month extension of CVS Health contract.",
    });
    expect(extension.event_family).toBe("milestone");
    expect(extension.lifecycle_phase).toBe("expanded");

    const start = event({
      event_kind: "contract_start",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "contract_start",
      description: "Start of Caremark/CVS Health PBM contract.",
    });
    expect(start.event_family).toBe("milestone");
    expect(start.lifecycle_phase).toBe("other");
    expect(start.lifecycle_phase_other).toBe("contract_start");
  });

  it("maps exact plan release events to publication without announcement broadening", () => {
    expect(event({ event_kind: "plan release" }).event_family).toBe("publication");
    expect(event({ event_kind: "plan_release" }).event_family).toBe("publication");
    expect(event({ event_kind: "document release" }).event_family).toBe("publication");
    expect(event({ event_kind: "draft_plan_release" }).event_family).toBe("publication");
    expect(event({ event_kind: "environmental assessment release" }).event_family).toBe("publication");
    expect(event({ event_kind: "design_release" }).event_family).toBe("publication");
    expect(event({ event_kind: "release", description: "Better Buses Action Plan released April 2019." }).event_family).toBe("publication");
    expect(event({ event_kind: "announcement", description: "Announcement of the release of the Queens Bus Network Redesign Proposed Final Plan." }).event_family).toBe(
      "publication",
    );
    expect(event({ event_kind: "announcement", description: "Mayor de Blasio announces Vision Zero initiative to eliminate traffic fatalities in New York." }).event_family).toBe(
      "milestone",
    );
    expect(
      event({
        event_kind: "announcement",
        event_name: "Transit Improvement Summit",
        description: "Mayor and MTA Chair announced a collaborative effort to improve transit service.",
      }).event_family,
    ).toBe("planning");
    expect(
      event({
        event_kind: "announcement",
        description: "MTA and accessibility advocates reached a class action settlement affirming the MTA's commitment towards accessibility.",
      }).event_family,
    ).toBe("milestone");
    expect(event({ event_kind: "announcement", description: "Mayor and MTA announced the project restart for Fordham Road Bus Priority." }).event_family).toBe("milestone");
    expect(event({ event_kind: "public_review", description: "Environmental Assessment released for public review." }).event_family).toBe("publication");
    expect(event({ event_kind: "public_notice", description: "Issue the Public Notice online and in stations." }).event_family).toBe("publication");
    expect(event({ event_kind: "public_advertisement", description: "Public advertisement posted in NYS Contract Reporter." }).event_family).toBe("publication");
    expect(event({ event_kind: "plan release" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "release", description: "General release expected after committee review." }).event_family).toBe("other");
    expect(event({ event_kind: "announcement" }).event_family).toBe("other");
    expect(event({ event_kind: "announcement", description: "Governor announced a proposal to proceed with phased-in toll rates." }).event_family).toBe("other");
    expect(event({ event_kind: "announcement", description: "PANYNJ announcement to advance 2023 recommendations of Independent Panel of Transit Experts." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "announcement", description: "Mayor's State of the City announcement of improve bus speeds 25% by 2020." }).event_family).toBe("other");
    expect(event({ event_kind: "document_date" }).event_family).toBe("document_metadata");
	    expect(event({ event_kind: "filing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "public_notice" }).event_family).toBe("other");
    expect(event({ event_kind: "information_item" }).event_family).toBe("governance");
    expect(event({ event_kind: "quarterly_update" }).event_family).toBe("other");
    expect(event({ event_kind: "annual update" }).event_family).toBe("other");
    expect(event({ event_kind: "app update" }).event_family).toBe("other");
    expect(event({ event_kind: "design review" }).event_family).toBe("other");
    expect(event({ event_kind: "data prepared" }).event_family).toBe("other");
  });

  it("promotes stale other event family for plan releases during replay", () => {
    const out = event({ event_kind: "plan release", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "plan release" });
    expect(out.event_family).toBe("publication");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("plan release");

    const release = event({ event_kind: "release", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "release", description: "Better Buses Action Plan released April 2019." });
    expect(release.event_family).toBe("publication");
    expect(release.lifecycle_phase).toBe("other");
    expect(release.lifecycle_phase_other).toBe("release");

    const draftPlan = event({ event_kind: "draft plan release", event_family: "other", lifecycle_phase: "proposed", lifecycle_phase_other: "draft plan release" });
    expect(draftPlan.event_family).toBe("publication");
    expect(draftPlan.lifecycle_phase).toBe("proposed");
    expect(draftPlan.lifecycle_phase_other).toBeUndefined();
  });

  it("maps exact ribbon cutting events to milestones without ceremony broadening", () => {
    expect(event({ event_kind: "ribbon cutting" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ribbon-cutting ceremony" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ceremony", description: "Plaque unveiled at 250 Broadway honoring essential workers." }).event_family).toBe("milestone");
    expect(event({ event_kind: "ceremony", description: "Unveiling of the ASCE Historic Landmark plaque at the Hugh L. Carey Tunnel." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "ceremony", description: "Veterans ERG held a luncheon ceremony to commemorate Veterans Day." }).event_family).toBe(
      "public_engagement",
    );
    expect(
      event({
        event_kind: "ceremony",
        description: "MTA Veterans Employee Resource Group held a Memorial Day Observance to remember those who paid the ultimate sacrifice.",
      }).event_family,
    ).toBe("public_engagement");
    expect(event({ event_kind: "ceremony" }).event_family).toBe("other");
	    expect(event({ event_kind: "ceremony", description: "MTAPD Medal and Award Ceremony." }).event_family).toBe("milestone");
    expect(event({ event_kind: "ceremony", description: "Veterans Day ceremony and wreath laying in Grand Central Terminal." }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "ceremony and parade" }).event_family).toBe("other");
    expect(event({ event_kind: "celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "public event" }).event_family).toBe("other");
  });

  it("promotes stale other event family for ribbon cutting during replay", () => {
    const out = event({ event_kind: "ribbon cutting", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "ribbon cutting" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("ribbon cutting");

    const ceremony = event({
      event_kind: "ceremony",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "ceremony",
      description: "Unveiling of the ASCE Historic Landmark plaque.",
    });
    expect(ceremony.event_family).toBe("milestone");
    expect(ceremony.lifecycle_phase).toBe("other");
    expect(ceremony.lifecycle_phase_other).toBe("ceremony");

    const ergCeremony = event({
      event_kind: "ceremony",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "ceremony",
      description: "Veterans ERG held their annual Veteran Day Ceremony to commemorate Armed Service Veterans.",
    });
    expect(ergCeremony.event_family).toBe("public_engagement");
    expect(ergCeremony.lifecycle_phase).toBe("other");
    expect(ergCeremony.lifecycle_phase_other).toBe("ceremony");
  });

  it("maps exact anniversary events to milestones without celebration broadening", () => {
    expect(event({ event_kind: "anniversary" }).event_family).toBe("milestone");
    expect(event({ event_kind: "anniversary celebration" }).event_family).toBe("milestone");
    expect(event({ event_kind: "anniversary" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "cultural celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "heritage celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "ERG Celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "ceremony" }).event_family).toBe("other");
    expect(event({ event_kind: "public event" }).event_family).toBe("other");
  });

  it("promotes stale other event family for anniversaries during replay", () => {
    const out = event({ event_kind: "anniversary", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "anniversary" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("anniversary");
  });

  it("maps exact recognition and graduation events to milestones without social-event broadening", () => {
    expect(event({ event_kind: "acquisition" }).event_family).toBe("milestone");
    expect(event({ event_kind: "employee recognition" }).event_family).toBe("milestone");
    expect(event({ event_kind: "employee_recognition" }).event_family).toBe("milestone");
    expect(event({ event_kind: "graduation" }).event_family).toBe("milestone");
    expect(event({ event_kind: "debut" }).event_family).toBe("milestone");
    expect(event({ event_kind: "inaugural run" }).event_family).toBe("milestone");
    expect(event({ event_kind: "inaugural_run" }).event_family).toBe("milestone");
    expect(event({ event_kind: "inaugural ride" }).event_family).toBe("milestone");
    expect(event({ event_kind: "locomotive_unveiling" }).event_family).toBe("milestone");
    expect(event({ event_kind: "incorporation" }).event_family).toBe("milestone");
    expect(event({ event_kind: "leadership_change" }).event_family).toBe("milestone");
    expect(event({ event_kind: "creation" }).event_family).toBe("milestone");
    expect(event({ event_kind: "appointment" }).event_family).toBe("milestone");
    expect(event({ event_kind: "consolidation" }).event_family).toBe("milestone");
    expect(event({ event_kind: "retirement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "fleet retirement" }).event_family).toBe("milestone");
    expect(event({ event_kind: "graduation" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "acquisition" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "debut" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "inaugural run" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "incorporation" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "retirement" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "ceremony" }).event_family).toBe("other");
    expect(event({ event_kind: "celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "employee_resource_group_event" }).event_family).toBe("other");
    expect(event({ event_kind: "employee engagement event" }).event_family).toBe("other");
    expect(event({ event_kind: "deployment" }).event_family).toBe("other");
    expect(event({ event_kind: "fleet commissioning" }).event_family).toBe("other");
    expect(event({ event_kind: "fleet transition" }).event_family).toBe("other");
    expect(event({ event_kind: "fleet upgrade" }).event_family).toBe("other");
    expect(event({ event_kind: "vehicle upgrade", description: "Generic vehicle upgrade." }).event_family).toBe("other");
    expect(event({ event_kind: "in service date" }).event_family).toBe("other");
    expect(event({ event_kind: "personnel start" }).event_family).toBe("other");
    expect(event({ event_kind: "community event" }).event_family).toBe("other");
    expect(event({ event_kind: "training" }).event_family).toBe("other");
    expect(event({ event_kind: "certification" }).event_family).toBe("other");
    expect(event({ event_kind: "safety event" }).event_family).toBe("other");
    expect(event({ event_kind: "emergency exercise" }).event_family).toBe("other");
    expect(event({ event_kind: "parade" }).event_family).toBe("other");
    expect(event({ event_kind: "Pride event" }).event_family).toBe("other");
    expect(event({ event_kind: "Pride Month event" }).event_family).toBe("other");
    expect(event({ event_kind: "property acquisition" }).event_family).toBe("other");
    expect(event({ event_kind: "establishment" }).event_family).toBe("other");
    expect(event({ event_kind: "establishment", description: "Advisory Committee for Transit Accessibility (ACTA) was established as a successor to the CCC." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "establishment", description: "Program establishment topic for later review." }).event_family).toBe("other");
    expect(event({ event_kind: "advisory committee" }).event_family).toBe("other");
    expect(event({ event_kind: "current status" }).event_family).toBe("other");
    expect(event({ event_kind: "community partnership" }).event_family).toBe("other");
    expect(event({ event_kind: "annual update" }).event_family).toBe("other");
    expect(event({ event_kind: "annual plan update" }).event_family).toBe("other");
	    expect(event({ event_kind: "lease execution" }).event_family).toBe("milestone");
	    expect(event({ event_kind: "filing" }).event_family).toBe("milestone");
    expect(event({ event_kind: "public notice" }).event_family).toBe("other");
    expect(event({ event_kind: "contract option period" }).event_family).toBe("other");
    expect(event({ event_kind: "grant period" }).event_family).toBe("other");
    expect(event({ event_kind: "lunch and learn" }).event_family).toBe("other");
    expect(event({ event_kind: "panel discussion" }).event_family).toBe("other");
  });

  it("promotes stale other event family for recognition and graduation during replay", () => {
    const acquisition = event({ event_kind: "acquisition", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "acquisition" });
    expect(acquisition.event_family).toBe("milestone");
    expect(acquisition.lifecycle_phase).toBe("other");
    expect(acquisition.lifecycle_phase_other).toBe("acquisition");

    const creation = event({ event_kind: "creation", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "creation" });
    expect(creation.event_family).toBe("milestone");
    expect(creation.lifecycle_phase).toBe("other");
    expect(creation.lifecycle_phase_other).toBe("creation");

    const appointment = event({ event_kind: "appointment", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "appointment" });
    expect(appointment.event_family).toBe("milestone");
    expect(appointment.lifecycle_phase).toBe("other");
    expect(appointment.lifecycle_phase_other).toBe("appointment");

    const recognition = event({ event_kind: "employee recognition", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "employee recognition" });
    expect(recognition.event_family).toBe("milestone");
    expect(recognition.lifecycle_phase).toBe("other");
    expect(recognition.lifecycle_phase_other).toBe("employee recognition");

    const graduation = event({ event_kind: "graduation", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "graduation" });
    expect(graduation.event_family).toBe("milestone");
    expect(graduation.lifecycle_phase).toBe("other");
    expect(graduation.lifecycle_phase_other).toBe("graduation");

    const debut = event({ event_kind: "debut", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "debut" });
    expect(debut.event_family).toBe("milestone");
    expect(debut.lifecycle_phase).toBe("other");
    expect(debut.lifecycle_phase_other).toBe("debut");

    const inauguralRide = event({ event_kind: "inaugural ride", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "inaugural ride" });
    expect(inauguralRide.event_family).toBe("milestone");
    expect(inauguralRide.lifecycle_phase).toBe("other");
    expect(inauguralRide.lifecycle_phase_other).toBe("inaugural ride");

    const fleetRetirement = event({ event_kind: "fleet retirement", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "fleet retirement" });
    expect(fleetRetirement.event_family).toBe("milestone");
    expect(fleetRetirement.lifecycle_phase).toBe("other");
    expect(fleetRetirement.lifecycle_phase_other).toBe("fleet retirement");

    const inauguralRun = event({ event_kind: "inaugural run", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "inaugural run" });
    expect(inauguralRun.event_family).toBe("milestone");
    expect(inauguralRun.lifecycle_phase).toBe("other");
    expect(inauguralRun.lifecycle_phase_other).toBe("inaugural run");

    const retirement = event({ event_kind: "retirement", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "retirement" });
    expect(retirement.event_family).toBe("milestone");
    expect(retirement.lifecycle_phase).toBe("other");
    expect(retirement.lifecycle_phase_other).toBe("retirement");

    const incorporation = event({ event_kind: "incorporation", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "incorporation" });
    expect(incorporation.event_family).toBe("milestone");
    expect(incorporation.lifecycle_phase).toBe("other");
    expect(incorporation.lifecycle_phase_other).toBe("incorporation");

    const leadershipChange = event({ event_kind: "leadership_change", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "leadership_change" });
    expect(leadershipChange.event_family).toBe("milestone");
    expect(leadershipChange.lifecycle_phase).toBe("other");
    expect(leadershipChange.lifecycle_phase_other).toBe("leadership_change");

    const establishment = event({
      event_kind: "establishment",
      description: "The Advisory Committee for Transit Accessibility (ACTA) was established as a successor to the CCC.",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "establishment",
    });
    expect(establishment.event_family).toBe("milestone");
    expect(establishment.lifecycle_phase).toBe("other");
    expect(establishment.lifecycle_phase_other).toBe("establishment");
  });

  it("maps exact ridership record events to milestones without report broadening", () => {
    expect(event({ event_kind: "ridership record" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ridership_record" }).event_family).toBe("milestone");
    expect(event({ event_kind: "ridership record" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "announcement" }).event_family).toBe("other");
    expect(event({ event_kind: "financial forecast" }).event_family).toBe("other");
    expect(event({ event_kind: "quarterly_update" }).event_family).toBe("other");
  });

  it("promotes stale other event family for ridership records during replay", () => {
    const out = event({ event_kind: "ridership record", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "ridership record" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("ridership record");
  });

  it("maps exact unveiling events to milestones without ceremony broadening", () => {
    expect(event({ event_kind: "unveiling" }).event_family).toBe("milestone");
    expect(event({ event_kind: "vehicle unveiling" }).event_family).toBe("milestone");
    expect(event({ event_kind: "vehicle_unveiling" }).event_family).toBe("milestone");
    expect(event({ event_kind: "unveiling" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "rolling_stock_delivery" }).event_family).toBe("other");
    expect(event({ event_kind: "ceremony" }).event_family).toBe("other");
    expect(event({ event_kind: "celebration" }).event_family).toBe("other");
    expect(event({ event_kind: "public event" }).event_family).toBe("other");
    expect(event({ event_kind: "community event" }).event_family).toBe("other");
  });

  it("promotes stale other event family for unveilings during replay", () => {
    const out = event({ event_kind: "unveiling", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "unveiling" });
    expect(out.event_family).toBe("milestone");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("unveiling");

    const vehicle = event({ event_kind: "vehicle_unveiling", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "vehicle_unveiling" });
    expect(vehicle.event_family).toBe("milestone");
    expect(vehicle.lifecycle_phase).toBe("other");
    expect(vehicle.lifecycle_phase_other).toBe("vehicle_unveiling");
  });

  it("maps exact trackwork events to implementation without disruption broadening", () => {
    expect(event({ event_kind: "cutover" }).event_family).toBe("implementation");
    expect(event({ event_kind: "final cutover" }).event_family).toBe("implementation");
    expect(event({ event_kind: "final_cutover" }).event_family).toBe("implementation");
    expect(event({ event_kind: "signal cutover" }).event_family).toBe("implementation");
    expect(event({ event_kind: "signal_cutover" }).event_family).toBe("implementation");
    expect(event({ event_kind: "track work" }).event_family).toBe("implementation");
    expect(event({ event_kind: "trackwork" }).event_family).toBe("implementation");
    expect(event({ event_kind: "trackwork program" }).event_family).toBe("implementation");
    expect(event({ event_kind: "signal cutover" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "trackwork" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "weather event" }).event_family).toBe("other");
    expect(event({ event_kind: "signal testing" }).event_family).toBe("other");
    expect(event({ event_kind: "track maintenance" }).event_family).toBe("other");
    expect(event({ event_kind: "trackwork advisory" }).event_family).toBe("other");
    expect(event({ event_kind: "timetable change and trackwork advisory" }).event_family).toBe("other");
    expect(event({ event_kind: "trackwork advisory", description: "The Committee will be advised of plans to adjust schedules." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "committee_information_item",
        event_name: "Track Work Programs",
        description: "This is to inform the Long Island Committee of the MTA Long Island Rail Road's plans to adjust schedules to support various trackwork programs.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "committee information item", event_name: "May Timetable", description: "The Committee will be advised of plans to adjust schedules." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "committee_agenda_item", description: "The Committee will be advised of plans to adjust schedules." }).event_family).toBe("planning");
    expect(event({ event_kind: "service plan advisory", description: "The Committee will be advised of plans to adjust schedules." }).event_family).toBe("planning");
    expect(event({ event_kind: "information_item", description: "Track Work Programs - adjust schedules to support various trackwork programs." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "committee briefing",
        description: "LIRR plan to temporarily adjust schedules for Switch Installations near Jamaica supporting Jamaica Capacity Improvement Project.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "committee_agenda_item", description: "The Committee will be advised of operating results." }).event_family).toBe("governance");
    expect(event({ event_kind: "information_item", description: "Adjust schedules for staffing availability." }).event_family).toBe("governance");
    expect(event({ event_kind: "trackwork advisory", description: "General trackwork advisory for customers." }).event_family).toBe("other");
    expect(event({ event_kind: "activation" }).event_family).toBe("other");
    expect(event({ event_kind: "deployment" }).event_family).toBe("other");
  });

  it("promotes stale other event family for trackwork during replay", () => {
    const cutover = event({ event_kind: "cutover", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "cutover" });
    expect(cutover.event_family).toBe("implementation");
    expect(cutover.lifecycle_phase).toBe("other");
    expect(cutover.lifecycle_phase_other).toBe("cutover");

    const signalCutover = event({ event_kind: "signal cutover", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "signal cutover" });
    expect(signalCutover.event_family).toBe("implementation");
    expect(signalCutover.lifecycle_phase).toBe("other");
    expect(signalCutover.lifecycle_phase_other).toBe("signal cutover");

    const finalCutover = event({ event_kind: "final_cutover", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "final_cutover" });
    expect(finalCutover.event_family).toBe("implementation");
    expect(finalCutover.lifecycle_phase).toBe("other");
    expect(finalCutover.lifecycle_phase_other).toBe("final_cutover");

    const out = event({ event_kind: "trackwork", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "trackwork" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("trackwork");
  });

  it("maps completed closeout events to implementation without forecast broadening", () => {
    expect(event({ event_kind: "closeout", description: "Massapequa Pocket Track closeout completed" }).event_family).toBe("implementation");
    expect(event({ event_kind: "closeout", date_text: "November 2021 (Actual)", description: "Massapequa Pocket Track closeout" }).event_family).toBe(
      "implementation",
    );
	    expect(event({ event_kind: "closeout", description: "Mid-Suffolk Yard closeout forecast" }).event_family).toBe("other");
	    expect(event({ event_kind: "closeout", description: "Mid-Suffolk Yard closeout scheduled for July 2023" }).event_family).toBe("other");
	    expect(event({ event_kind: "closeout", description: "Mid-Suffolk Yard (Phase 1) closeout", date_text: "December 2022" }).event_family).toBe(
	      "implementation",
	    );
	    expect(event({ event_kind: "closeout", description: "Mid-Suffolk Yard closeout" }).event_family).toBe("other");
	    expect(
	      event({ event_kind: "ntsb_recommendation_closeout_request", description: "LIRR submitted formal request to NTSB for Closed-Acceptable Action status on R-18-003." })
	        .event_family,
	    ).toBe("milestone");
	    expect(event({ event_kind: "ntsb_recommendation_closeout_request", description: "NTSB recommendation status discussion." }).event_family).toBe("other");
	    expect(event({ event_kind: "project update", description: "Project implementation and close-out briefing following PTC functionality." }).event_family).toBe(
	      "other",
	    );
  });

  it("promotes stale other event family for completed closeout during replay", () => {
    const out = event({
      event_kind: "closeout",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "closeout",
      date_text: "November 2021 (Actual)",
      description: "Massapequa Pocket Track closeout",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("closeout");
  });

  it("maps payload-proven emergency exercises and drills to implementation without training broadening", () => {
    expect(
      event({
        event_kind: "emergency exercise",
        description: "Annual Emergency Management Exercise scenario with crew evacuation and local fire responders.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event({
        event_kind: "emergency_drill",
        description: "Full-scale emergency drill simulating a fire; crews practiced evacuations and safety protocols.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "emergency exercise" }).event_family).toBe("other");
    expect(event({ event_kind: "training", description: "Emergency response training with tactical exercises using railroad equipment." }).event_family).toBe("other");
    expect(event({ event_kind: "safety event", description: "Safety Focus Day on hazards, fatigue, and PPE compliance." }).event_family).toBe("implementation");
    expect(event({ event_kind: "certification", description: "Operation Lifesaver Authorized Volunteer certification." }).event_family).toBe("other");
  });

  it("promotes stale other event family for payload-proven emergency drills during replay", () => {
    const out = event({
      event_kind: "emergency_drill",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "emergency_drill",
      description: "Metro-North held a full-scale emergency drill simulating a fire on a train.",
    });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("emergency_drill");
  });

  it("maps exact holiday service events to implementation without lifecycle promotion", () => {
    expect(event({ event_kind: "holiday getaway service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday_getaway_service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday_service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday service program" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday_service_program" }).event_family).toBe("implementation");
    expect(event({ event_kind: "seasonal service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "seasonal_service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "special event service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "special_event_service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "special service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "special_service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "holiday_service" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "seasonal service" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "weather event" }).event_family).toBe("other");
    expect(event({ event_kind: "special_event" }).event_family).toBe("other");
    expect(event({ event_kind: "service_period" }).event_family).toBe("other");
  });

  it("promotes stale other event family for holiday service during replay", () => {
    const out = event({ event_kind: "holiday_service", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "holiday_service" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("holiday_service");

    const getaway = event({ event_kind: "holiday_getaway_service", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "holiday_getaway_service" });
    expect(getaway.event_family).toBe("implementation");
    expect(getaway.lifecycle_phase).toBe("other");
    expect(getaway.lifecycle_phase_other).toBe("holiday_getaway_service");

    const seasonal = event({ event_kind: "seasonal service", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "seasonal service" });
    expect(seasonal.event_family).toBe("implementation");
    expect(seasonal.lifecycle_phase).toBe("other");
    expect(seasonal.lifecycle_phase_other).toBe("seasonal service");

    const program = event({ event_kind: "holiday_service_program", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "holiday_service_program" });
    expect(program.event_family).toBe("implementation");
    expect(program.lifecycle_phase).toBe("other");
    expect(program.lifecycle_phase_other).toBe("holiday_service_program");

    const specialEventService = event({ event_kind: "special_event_service", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "special_event_service" });
    expect(specialEventService.event_family).toBe("implementation");
    expect(specialEventService.lifecycle_phase).toBe("other");
    expect(specialEventService.lifecycle_phase_other).toBe("special_event_service");
  });

	  it("maps exact service disruption and outage events to pause without incident broadening", () => {
	    expect(event({ event_kind: "service disruption" }).event_family).toBe("pause");
	    expect(event({ event_kind: "service outage" }).event_family).toBe("pause");
	    expect(event({ event_kind: "outage" }).event_family).toBe("pause");
    expect(event({ event_kind: "service disruption" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "accident" }).event_family).toBe("incident");
    expect(event({ event_kind: "derailment" }).event_family).toBe("incident");
    expect(event({ event_kind: "safety incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "weather event" }).event_family).toBe("other");
    expect(event({ event_kind: "policy announcement", description: "Governor Hochul announced her intention to pause the implementation of the Central Business District Tolling Program." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "policy announcement", description: "Governor Hochul announced her intention to pause the implementation of CBDTP." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "policy announcement", description: "Governor Hochul announces five-point plan to protect New Yorkers on the subway." }).event_family).toBe("planning");
	    expect(event({ event_kind: "policy announcement", description: "Mayor announces policy launch one year after plan launched." }).event_family).toBe("other");
	  });

	  it("maps explicit shutdown, closure, and resumption records without broad incident matching", () => {
	    expect(event({ event_kind: "strike", description: "LIRR service is shut down." }).event_family).toBe("pause");
	    expect(event({ event_kind: "strike_over", description: "The LIRR strike is over. Please bear with us as we work to restore service." }).event_family).toBe(
	      "implementation",
	    );
	    expect(event({ event_kind: "station closure", description: "Closure of East Norwalk Station for underground retention system installation." }).event_family).toBe(
	      "pause",
	    );
	    expect(event({ event_kind: "tunnel closure", description: "Closure of the East River Tunnel." }).event_family).toBe("pause");
	    expect(
	      event({
	        event_kind: "signal upgrade",
	        description: "Signal system upgrade will require a shutdown of train service through the area. Bus service will be provided.",
	      }).event_family,
	    ).toBe("pause");
	    expect(event({ event_kind: "service incident", description: "Two cars separated in revenue service; fleet removed from service." }).event_family).toBe("pause");
	    expect(event({ event_kind: "maintenance_outage", description: "Escalators were taken out of service and returned to service after handrail work." }).event_family).toBe(
	      "pause",
	    );
	    expect(event({ event_kind: "weather disruption", description: "Heavy rainfall caused Metro-North service suspended and LIRR delays." }).event_family).toBe("pause");
	    expect(
	      event({
	        event_kind: "natural disaster",
	        description: "Flash flooding snarling Hudson Line service, with washouts and flooding on the tracks. Service was restored systemwide.",
	      }).event_family,
	    ).toBe("pause");
	    expect(event({ event_kind: "storm damage", description: "Storm damage caused service suspensions on Hudson Line and upper Harlem Line." }).event_family).toBe(
	      "pause",
	    );
	    expect(
	      event({
	        event_kind: "work resumption",
	        description: "Agreed protocols allowed work to resume on right-of-way activities for the LIRR Expansion Project.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(
	      event({
	        event_kind: "temporary_bus_lane_installation",
	        description: "Temporary bus lanes installed during the G Train shutdown for shuttles.",
	      }).event_family,
	    ).toBe("implementation");
	    expect(event({ event_kind: "project announcement", description: "Mayor and MTA Chairman announced the project restart." }).event_family).toBe("milestone");

    expect(event({ event_kind: "power_outage", description: "Power outage at Grand Central Terminal; train service not interrupted." }).event_family).toBe("other");
    expect(event({ event_kind: "contract closure", description: "Anticipate finalizing contract closure agreement." }).event_family).toBe("other");
    expect(event({ event_kind: "special event", description: "NYC Triathlon bridge closure with event participants." }).event_family).toBe("other");
    expect(event({ event_kind: "pilot_end", description: "Fare collection resumed on pilot routes." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "emergency drill", description: "Tunnel evacuation drill with emergency responders." }).event_family).toBe("implementation");
	    expect(event({ event_kind: "training", description: "Emergency response training with tactical exercises using railroad equipment." }).event_family).toBe("other");
	    expect(event({ event_kind: "incident", description: "Fiery crash on I-95; Metro-North added service." }).event_family).toBe("incident");
	  });

	  it("maps signal testing to pause only when payload proves direct service impact", () => {
    expect(
      event({
        event_kind: "signal testing",
        description: "Weekend signal testing: two of four main tracks out of service. Bus service replaces train service.",
      }).event_family,
    ).toBe("pause");
    expect(
      event({
        event_kind: "signal testing",
        description: "Weekend signal testing: eastbound trains bypass stops and no service at Bellerose Station.",
      }).event_family,
    ).toBe("pause");
    expect(event({ event_kind: "signal testing" }).event_family).toBe("other");
    expect(event({ event_kind: "signal testing", description: "Signal testing before a cutover." }).event_family).toBe("other");
    expect(event({ event_kind: "signal testing", description: "Signal-testing contract update." }).event_family).toBe("other");
    expect(event({ event_kind: "trackwork advisory", description: "Signal-testing contract update." }).event_family).toBe("other");
  });

  it("promotes stale other event family for service-impact signal testing during replay", () => {
    const out = event({
      event_kind: "signal testing",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "signal testing",
      description: "Weekend signal testing: two of four main tracks out of service; bus service replaces train service.",
    });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("signal testing");
  });

  it("maps incidents to pause only when payload proves service impact", () => {
    expect(event({ event_kind: "incident", description: "Trespasser Strike at Forest Hills causing 78 late trains." }).event_family).toBe("pause");
    expect(event({ event_kind: "incident", description: "Incident caused 135 late trains and delayed customers over a two-day period." }).event_family).toBe("pause");
    expect(event({ event_kind: "incident", description: "Transformer fault caused explosion, disrupting service on A, C, F, and G lines for hours." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "incident", description: "Required full closure of tunnel; South Tube reopened after temporary repair." }).event_family).toBe("pause");
    expect(event({ event_kind: "incident", description: "Slow-speed collision on the 1 line north of the 96 St Station. No serious injuries." }).event_family).toBe(
      "incident",
    );
    expect(
      event({
        event_kind: "rescue",
        description: "Station Agent and Police Officers assisted a customer who collapsed onto subway tracks at Lafayette Station.",
      }).event_family,
    ).toBe("incident");
    expect(
      event({
        event_kind: "rescue",
        description: "Train operator rescued a person who was on the elevated structure between stations on the 7 line.",
      }).event_family,
    ).toBe("incident");
    expect(event({ event_kind: "rescue", description: "Customer rescue training and community outreach." }).event_family).toBe("other");
    expect(event({ event_kind: "derailment", description: "Caused 135 late trains." }).event_family).toBe("incident");
    expect(event({ event_kind: "safety incident", description: "Incident caused delays." }).event_family).toBe("incident");
  });

  it("maps payload-proven physical incident tails without storm or issue broadening", () => {
    expect(event({ event_kind: "shooting", description: "Mass shooting on a Manhattan-bound N train in Brooklyn." }).event_family).toBe("incident");
    expect(
      event({
        event_kind: "electrical fault",
        description: "Electrical fault occurred to the Rectifier No. 1 transformer, requiring its replacement.",
      }).event_family,
    ).toBe("incident");
    expect(
      event({
        event_kind: "power_outage",
        description: "Power outage at Grand Central Terminal caused by feeder failure; power restored to upper level within 20 minutes.",
      }).event_family,
    ).toBe("incident");
    expect(event({ event_kind: "flooding_event", description: "High tide flooding near Croton Harmon after a storm." }).event_family).toBe("incident");
    expect(
      event({
        event_kind: "infrastructure failure",
        description: "Embankment and wall collapse covering the entire 4-track segment of the Hudson Line.",
      }).event_family,
    ).toBe("incident");
    expect(event({ event_kind: "damage", description: "Superstorm Sandy flooded two tracks in Amtrak's East River Tunnel." }).event_family).toBe("incident");
    expect(event({ event_kind: "damage_event", description: "East River tunnel tubes damaged by 2012 Superstorm Sandy." }).event_family).toBe("incident");
    expect(event({ event_kind: "fatality", description: "Pedestrian fatality at Roosevelt Av/75th St intersection." }).event_family).toBe("incident");
    expect(event({ event_kind: "infrastructure_issue", description: "Amtrak track condition causing 60 late trains." }).event_family).toBe("pause");
    expect(event({ event_kind: "operational_issue", description: "Five events due to Low Adhesion causing 66 late trains." }).event_family).toBe("pause");

    expect(event({ event_kind: "shooting", description: "Safety campaign after a shooting." }).event_family).toBe("other");
    expect(event({ event_kind: "power_outage", description: "Power outage at Grand Central Terminal; train service not interrupted." }).event_family).toBe("other");
    expect(event({ event_kind: "damage", description: "Damage assessment meeting for future repairs." }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure_issue", description: "General infrastructure issue discussed in committee materials." }).event_family).toBe("other");
    expect(event({ event_kind: "operational_issue", description: "General operational issue discussed in committee materials." }).event_family).toBe("other");
    expect(event({ event_kind: "storm", description: "Record-setting flash flooding event referenced as comparison to Ophelia." }).event_family).toBe("other");
    expect(event({ event_kind: "winter storm operations", description: "MTA operated through Winter Storm Fern while other agencies were unable to maintain service." }).event_family).toBe(
      "other",
    );
  });

  it("promotes stale other event family for service-impact incidents during replay", () => {
    const out = event({
      event_kind: "incident",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "incident",
      description: "Providence and Worcester freight train engine caught fire, temporarily suspending New Haven Line service north of Stamford.",
    });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("incident");
  });

  it("promotes stale other event family for CBDTP pause policy announcements during replay", () => {
    const out = event({
      event_kind: "policy announcement",
      description: "Governor Hochul announced her intention to pause the implementation of the Central Business District Tolling Program.",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "policy announcement",
    });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("policy announcement");
  });

  it("maps weather events to pause only when payload proves service disruption", () => {
    expect(event({ event_kind: "weather_event", description: "Remnants of Hurricane Ida caused severe flooding and extensive service disruptions." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "weather event", description: "Tropical Storm Henri prompted suspension of New Haven Line service and curtailment of other service." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "weather event", description: "Winter Storm Gail caused late/canceled/terminated trains." }).event_family).toBe("pause");
    expect(event({ event_kind: "weather_event", description: "Winter Storm Hernando brought snow; LIRR implemented planned shutdown." }).event_family).toBe("pause");
    expect(event({ event_kind: "storm", description: "Tropical Storm Ophelia brought record-setting flash flooding to NYC, impacting MTA subway, bus, Metro-North, LIRR, and Bridges & Tunnels operations." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "delay", description: "Bx6 SBS realignment to Story Avenue corridor delayed to 2023." }).event_family).toBe("pause");
    expect(event({ event_kind: "deferral", description: "S-Program deferred to 2023 due to lack of funding." }).event_family).toBe("pause");
    expect(event({ event_kind: "disruption", description: "Disruption to a sub-supplier caused a 4-month schedule revision." }).event_family).toBe("pause");
    expect(event({ event_kind: "potential_strike", description: "A Long Island Rail Road strike could be called as early as Saturday, suspending all LIRR service." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "weather event", description: "Winter Storm Fern impacted the region; MTA maintained operations." }).event_family).toBe("other");
    expect(event({ event_kind: "storm", description: "Record-setting flash flooding event referenced as comparison to Ophelia." }).event_family).toBe("other");
    expect(event({ event_kind: "winter storm operations", description: "MTA operated through Winter Storm Fern while other major transit agencies were unable to maintain service." }).event_family).toBe(
      "other",
    );
    expect(event({ event_kind: "strike_averted", description: "No LIRR strike - Service will continue uninterrupted." }).event_family).toBe("milestone");
    expect(event({ event_kind: "weather event", description: "Winter storm passed through the region." }).event_family).toBe("other");
    expect(event({ event_kind: "safety incident", description: "Flooding caused delays." }).event_family).toBe("incident");
  });

  it("promotes stale other event family for weather disruption during replay", () => {
    const out = event({
      event_kind: "weather_event",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "weather_event",
      description: "Heavy rainfall caused flooding across subway and Metro-North systems.",
    });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("weather_event");
  });

  it("maps exact conviction events to enforcement without incident broadening", () => {
    expect(event({ event_kind: "conviction" }).event_family).toBe("enforcement");
    expect(event({ event_kind: "conviction" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "safety_incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "accident" }).event_family).toBe("incident");
    expect(event({ event_kind: "derailment" }).event_family).toBe("incident");
  });

  it("promotes stale other event family for convictions during replay", () => {
    const out = event({ event_kind: "conviction", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "conviction" });
    expect(out.event_family).toBe("enforcement");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("conviction");
  });

  it("promotes stale other event family for service disruptions during replay", () => {
    const out = event({ event_kind: "service disruption", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "service disruption" });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("service disruption");
  });

  it("maps exact track outage events to pause without trackwork advisory broadening", () => {
    expect(event({ event_kind: "track outage" }).event_family).toBe("pause");
    expect(event({ event_kind: "track work outage" }).event_family).toBe("pause");
    expect(event({ event_kind: "trackwork outage" }).event_family).toBe("pause");
    expect(event({ event_kind: "planned track outage" }).event_family).toBe("pause");
    expect(event({ event_kind: "track maintenance", description: "Both main tracks taken out of service for approximately 24 hours." }).event_family).toBe(
      "pause",
    );
    expect(event({ event_kind: "track_maintenance", description: "Bus service replaces train service for approximately 30 hours." }).event_family).toBe("pause");
    expect(event({ event_kind: "track outage" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "track maintenance", description: "General track maintenance update." }).event_family).toBe("other");
    expect(
      event({
        event_kind: "scheduled maintenance",
        description: "Switch work at Valley Interlocking, where buses will replace train service overnight for eight hours.",
      }).event_family,
    ).toBe("pause");
    expect(
      event({
        event_kind: "scheduled_maintenance",
        description: "Switch work in Jamaica. Bus service will replace westbound train service at Queens Village and Hollis.",
      }).event_family,
    ).toBe("pause");
    expect(event({ event_kind: "scheduled maintenance", description: "Scheduled maintenance window for station cleaning." }).event_family).toBe("other");
    expect(event({ event_kind: "maintenance window", description: "Switch work where buses will replace train service." }).event_family).toBe("other");
    expect(event({ event_kind: "trackwork advisory" }).event_family).toBe("other");
    expect(event({ event_kind: "trackwork_program_update" }).event_family).toBe("other");
    expect(event({ event_kind: "track work program update" }).event_family).toBe("other");
    expect(event({ event_kind: "timetable change and trackwork advisory" }).event_family).toBe("other");
    expect(event({ event_kind: "incident" }).event_family).toBe("incident");
    expect(event({ event_kind: "weather event" }).event_family).toBe("other");
  });

  it("promotes stale other event family for track outages during replay", () => {
    const out = event({ event_kind: "track outage", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "track outage" });
    expect(out.event_family).toBe("pause");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("track outage");

    const maintenance = event({
      event_kind: "track_maintenance",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "track_maintenance",
      description: "Single main track out of service for approximately 30 hours for track maintenance.",
    });
    expect(maintenance.event_family).toBe("pause");
    expect(maintenance.lifecycle_phase).toBe("other");
    expect(maintenance.lifecycle_phase_other).toBe("track_maintenance");

    const scheduled = event({
      event_kind: "scheduled maintenance",
      event_family: "other",
      lifecycle_phase: "planned",
      description: "Switch work at Valley Interlocking, where buses will replace train service overnight for eight hours.",
    });
    expect(scheduled.event_family).toBe("pause");
    expect(scheduled.lifecycle_phase).toBe("planned");
  });

  it("maps exact policy effective dates to implementation without generic effective-date broadening", () => {
    expect(event({ event_kind: "policy effective date" }).event_family).toBe("implementation");
    expect(event({ event_kind: "policy effective date" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "restriction_effective", description: "101 Av SB left turn restriction goes into effect" }).event_family).toBe("implementation");
    expect(event({ event_kind: "effective date" }).event_family).toBe("other");
    expect(event({ event_kind: "document_date" }).event_family).toBe("document_metadata");
    expect(event({ event_kind: "contract_start" }).event_family).toBe("other");
    expect(event({ event_kind: "agreement effective date" }).event_family).toBe("other");
  });

  it("promotes stale other event family for policy effective dates during replay", () => {
    const out = event({ event_kind: "policy effective date", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "policy effective date" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("policy effective date");
  });

  it("maps exact toll and fare/toll increase events to implementation without proposed-fare broadening", () => {
    expect(event({ event_kind: "toll increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "toll_increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "fare/toll increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "fare_toll_increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "toll change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "toll_change" }).event_family).toBe("implementation");
    expect(event({ event_kind: "toll increase" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "fare increase" }).event_family).toBe("other");
    expect(event({ event_kind: "fare_increase" }).event_family).toBe("other");
    expect(event({ event_kind: "fare and toll increase" }).event_family).toBe("other");
    expect(event({ event_kind: "proposed_fare_increase" }).event_family).toBe("other");
    expect(event({ event_kind: "proposed_rate_change" }).event_family).toBe("other");
    expect(event({ event_kind: "fare increase", description: "Fare increases went into effect across MTA subways, buses, and commuter railroads." }).event_family).toBe("implementation");
    expect(event({ event_kind: "fare_change", description: "New fares take effect on January 1, 2026." }).event_family).toBe("implementation");
    expect(event({ event_kind: "tolling_change", description: "Verrazzano-Narrows Bridge split tolling implemented." }).event_family).toBe("implementation");
    expect(event({ event_kind: "tax_rate_change", description: "Payroll Mobility Tax rate increased effective January 1." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "fare_system_change", description: "MetroCard will no longer be accepted; tap-and-go required for subways and buses." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "fare_system_change", description: "MetroCards will no longer be sold." }).event_family).toBe("implementation");
    expect(event({ event_kind: "fare_system_change", description: "The $1 OMNY card fee promotion will end; price will increase to $2." }).event_family).toBe(
      "implementation",
    );
    expect(
      event({
        event_kind: "proposed_fare_toll_increase",
        description: "Baseline November Plan includes fare and toll rate increases in January 2026 projected to increase farebox revenues by 4% and toll revenues by 7.5%.",
      }).event_family,
    ).toBe("planning");
    expect(
      event({
        event_kind: "proposed_rate_change",
        description: "Proposed fare and toll rate increase yielding 4% overall increase in farebox and toll revenues, projected to generate $287 million.",
      }).event_family,
    ).toBe("planning");
    expect(
      event({
        event_kind: "proposed_fare_increase",
        description: "Proposed 4% fare and toll increase assumed for implementation in March 2025.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "service_end", description: "MetroCard sales end date." }).event_family).toBe("milestone");
    expect(event({ event_kind: "service_end", description: "This past Friday was the last day of operation for the LaserTrain." }).event_family).toBe("milestone");
    expect(event({ event_kind: "system_sunset", description: "UKG Workforce Central platform end of life - will no longer be licensed or supported." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "software end-of-life", description: "UKG Workforce Central reaches end of life and will no longer be licensed and supported." }).event_family).toBe(
      "milestone",
    );
    expect(event({ event_kind: "fare increase", description: "CTDOT proposed 5% fare increase for New Haven Line fares." }).event_family).toBe("other");
    expect(event({ event_kind: "fare increase", description: "An increase in fares and tolls projected to generate an annualized increase." }).event_family).toBe("other");
    expect(event({ event_kind: "proposed_fare_increase" }).event_family).toBe("other");
    expect(event({ event_kind: "fare_change", description: "New fares are expected to take effect if the proposal is approved." }).event_family).toBe("other");
    expect(event({ event_kind: "tolling_change", description: "Split tolling could be implemented after future review." }).event_family).toBe("other");
    expect(event({ event_kind: "tax_rate_change", description: "Payroll Mobility Tax projected rate increase." }).event_family).toBe("other");
    expect(event({ event_kind: "fare_system_change", description: "Fare system modernization update for committee review." }).event_family).toBe("other");
    expect(event({ event_kind: "toll adjustment" }).event_family).toBe("other");
    expect(event({ event_kind: "fare adjustment" }).event_family).toBe("other");
    expect(event({ event_kind: "rate schedule modification" }).event_family).toBe("other");
    expect(event({ event_kind: "support_end", description: "Vendor support may end for an older system." }).event_family).toBe("other");
  });

  it("promotes stale other event family for exact toll and fare/toll increases during replay", () => {
    const toll = event({ event_kind: "toll increase", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "toll increase" });
    expect(toll.event_family).toBe("implementation");
    expect(toll.lifecycle_phase).toBe("other");
    expect(toll.lifecycle_phase_other).toBe("toll increase");

    const fareToll = event({ event_kind: "fare/toll increase", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "fare/toll increase" });
    expect(fareToll.event_family).toBe("implementation");
    expect(fareToll.lifecycle_phase).toBe("other");
    expect(fareToll.lifecycle_phase_other).toBe("fare/toll increase");

    const tollChange = event({ event_kind: "toll_change", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "toll_change" });
    expect(tollChange.event_family).toBe("implementation");
    expect(tollChange.lifecycle_phase).toBe("other");
    expect(tollChange.lifecycle_phase_other).toBe("toll_change");

    const effectiveFare = event({
      event_kind: "fare increase",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "fare increase",
      description: "Fare increases went into effect across MTA subways, buses, and commuter railroads.",
    });
    expect(effectiveFare.event_family).toBe("implementation");
    expect(effectiveFare.lifecycle_phase).toBe("other");
    expect(effectiveFare.lifecycle_phase_other).toBe("fare increase");

    const newFares = event({
      event_kind: "fare_change",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "fare_change",
      description: "New fares take effect on January 1, 2026.",
    });
    expect(newFares.event_family).toBe("implementation");
    expect(newFares.lifecycle_phase).toBe("other");
    expect(newFares.lifecycle_phase_other).toBe("fare_change");
  });

  it("maps exact service expansion and restoration events to implementation without generic service broadening", () => {
    expect(event({ event_kind: "commissioning" }).event_family).toBe("implementation");
    expect(event({ event_kind: "commissioning" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "emergency_exercise", description: "Metro-North conducted annual emergency preparedness exercise." }).event_family).toBe("implementation");
    expect(event({ event_kind: "emergency_exercise" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "service addition" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service_addition" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service expansion" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service expansion" }).lifecycle_phase).toBe("expanded");
    expect(event({ event_kind: "service increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service_increase" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service_restoration" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service restoration" }).lifecycle_phase).toBe("resumed");
    expect(event({ event_kind: "service resumption" }).event_family).toBe("implementation");
    expect(event({ event_kind: "service resumption" }).lifecycle_phase).toBe("resumed");
    expect(event({ event_kind: "return to service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "return to service" }).lifecycle_phase).toBe("resumed");
    expect(event({ event_kind: "special service" }).event_family).toBe("implementation");
    expect(event({ event_kind: "special_service" }).event_family).toBe("implementation");
    expect(
      event({
        event_kind: "signal cutover and commissioning",
        description: "Great Neck Pocket Track signal cutover and commissioning.",
        raw_text: "Signal Cutover: December 2, 2022 (Actual). Commissioning: December 2, 2022 (Actual).",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "station_accessibility", description: "Three new elevators placed into service at Gun Hill Road." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "fleet_commissioning", description: "The M7 railcars were originally put into service in 2002." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "service_upgrade", description: "Tunnels now have enhanced cellular service with 5G and LTE coverage." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "safety_installation", description: "Completed installation of permanent polycarbonate barriers on local buses." }).event_family).toBe(
      "implementation",
    );
    expect(event({ event_kind: "proof_of_concept_completed", description: "A successful proof of concept was completed in 2024." }).event_family).toBe(
      "implementation",
    );
    expect(
      event({
        event_kind: "signal cutover and commissioning",
        event_family: "other",
        lifecycle_phase: "other",
        description: "Great Neck Pocket Track signal cutover and commissioning.",
      }).event_family,
    ).toBe("implementation");
    expect(
      event({
        event_kind: "proof of concept completed",
        event_family: "other",
        lifecycle_phase: "completed",
        description: "Successful proof of concept for Revenue Recovery System resulting in positive identification and police interdiction of persistent toll violators.",
      }).event_family,
    ).toBe("implementation");
    expect(event({ event_kind: "service disruption" }).event_family).toBe("pause");
    expect(event({ event_kind: "service announcement" }).event_family).toBe("other");
    expect(event({ event_kind: "service activation" }).event_family).toBe("other");
    expect(event({ event_kind: "station_accessibility", description: "Station accessibility project update." }).event_family).toBe("other");
    expect(event({ event_kind: "service_upgrade", description: "Service upgrade proposal." }).event_family).toBe("other");
    expect(event({ event_kind: "signal cutover and commissioning", description: "Signal cutover and commissioning scheduled for next year." }).event_family).toBe("other");
    expect(event({ event_kind: "proof_of_concept_completed", description: "Proof of concept proposal text." }).event_family).toBe("other");
    expect(event({ event_kind: "special event" }).event_family).toBe("other");
    expect(event({ event_kind: "service period" }).event_family).toBe("other");
    expect(event({ event_kind: "activation" }).event_family).toBe("other");
    expect(event({ event_kind: "deployment" }).event_family).toBe("other");
    expect(event({ event_kind: "closeout" }).event_family).toBe("other");
    expect(event({ event_kind: "delivery" }).event_family).toBe("other");
    expect(event({ event_kind: "project update" }).event_family).toBe("other");
    expect(event({ event_kind: "training" }).event_family).toBe("other");
    expect(event({ event_kind: "certification" }).event_family).toBe("other");
    expect(event({ event_kind: "emergency exercise" }).event_family).toBe("other");
  });

  it("promotes stale other event family and lifecycle for service restoration during replay", () => {
    const commissioning = event({ event_kind: "commissioning", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "commissioning" });
    expect(commissioning.event_family).toBe("implementation");
    expect(commissioning.lifecycle_phase).toBe("other");
    expect(commissioning.lifecycle_phase_other).toBe("commissioning");

    const emergencyExercise = event({ event_kind: "emergency_exercise", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "emergency_exercise" });
    expect(emergencyExercise.event_family).toBe("implementation");
    expect(emergencyExercise.lifecycle_phase).toBe("other");
    expect(emergencyExercise.lifecycle_phase_other).toBe("emergency_exercise");

    const addition = event({ event_kind: "service_addition", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "service_addition" });
    expect(addition.event_family).toBe("implementation");
    expect(addition.lifecycle_phase).toBe("other");
    expect(addition.lifecycle_phase_other).toBe("service_addition");

    const specialService = event({ event_kind: "special service", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "special service" });
    expect(specialService.event_family).toBe("implementation");
    expect(specialService.lifecycle_phase).toBe("other");
    expect(specialService.lifecycle_phase_other).toBe("special service");

    const out = event({ event_kind: "service restoration", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "service restoration" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("resumed");
    expect(out.lifecycle_phase_other).toBeUndefined();
  });

  it("maps exact pilot execution events to implementation while preserving piloted lifecycle", () => {
    expect(event({ event_kind: "pilot" }).event_family).toBe("implementation");
    expect(event({ event_kind: "pilot program" }).event_family).toBe("implementation");
    expect(event({ event_kind: "pilot_test" }).event_family).toBe("implementation");
    expect(event({ event_kind: "testing" }).event_family).toBe("implementation");
    expect(event({ event_kind: "fare pilot program" }).event_family).toBe("implementation");
    expect(event({ event_kind: "pilot program" }).lifecycle_phase).toBe("piloted");
    expect(event({ event_kind: "pilot_test" }).lifecycle_phase).toBe("piloted");
    expect(event({ event_kind: "testing" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "pilot duration" }).event_family).toBe("other");
    expect(event({ event_kind: "pilot period" }).event_family).toBe("other");
    expect(event({ event_kind: "pilot conclusion" }).event_family).toBe("other");
    expect(event({ event_kind: "pilot extension" }).event_family).toBe("other");
    expect(event({ event_kind: "proof_of_concept" }).event_family).toBe("other");
  });

  it("promotes stale other event family for pilot execution during replay", () => {
    const out = event({ event_kind: "pilot program", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "pilot program" });
    expect(out.event_family).toBe("implementation");
    expect(out.lifecycle_phase).toBe("piloted");
    expect(out.lifecycle_phase_other).toBeUndefined();

    const testing = event({ event_kind: "testing", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "testing" });
    expect(testing.event_family).toBe("implementation");
    expect(testing.lifecycle_phase).toBe("other");
    expect(testing.lifecycle_phase_other).toBe("testing");
  });

  it("maps exact planning, study, and design events to planning without phase/review broadening", () => {
    expect(event({ event_kind: "planning" }).event_family).toBe("planning");
    expect(event({ event_kind: "study" }).event_family).toBe("planning");
    expect(event({ event_kind: "analysis" }).event_family).toBe("planning");
    expect(event({ event_kind: "alternatives_analysis_selection" }).event_family).toBe("planning");
    expect(event({ event_kind: "study start" }).event_family).toBe("planning");
    expect(event({ event_kind: "study phase" }).event_family).toBe("planning");
    expect(event({ event_kind: "study_initiation" }).event_family).toBe("planning");
    expect(event({ event_kind: "design" }).event_family).toBe("planning");
    expect(event({ event_kind: "design start" }).event_family).toBe("planning");
    expect(event({ event_kind: "design phase" }).event_family).toBe("planning");
    expect(event({ event_kind: "design refinement" }).event_family).toBe("planning");
    expect(event({ event_kind: "design development" }).event_family).toBe("planning");
    expect(event({ event_kind: "design selection" }).event_family).toBe("planning");
    expect(event({ event_kind: "planning phase" }).event_family).toBe("planning");
    expect(event({ event_kind: "plan development" }).event_family).toBe("planning");
    expect(event({ event_kind: "proposal development" }).event_family).toBe("planning");
    expect(event({ event_kind: "proposal_development" }).event_family).toBe("planning");
	    expect(event({ event_kind: "board proposal" }).event_family).toBe("planning");
	    expect(event({ event_kind: "board_proposal" }).event_family).toBe("planning");
    expect(event({ event_kind: "corridor identification" }).event_family).toBe("planning");
    expect(event({ event_kind: "corridor_identification" }).event_family).toBe("planning");
	    expect(event({ event_kind: "corridor selection" }).event_family).toBe("planning");
	    expect(event({ event_kind: "corridor_selection" }).event_family).toBe("planning");
    expect(event({ event_kind: "project identification" }).event_family).toBe("planning");
	    expect(event({ event_kind: "scoping start" }).event_family).toBe("planning");
    expect(event({ event_kind: "proposal", description: "3rd Avenue Complete Street Proposal from E. 96th to 128th Streets." }).event_family).toBe("planning");
    expect(event({ event_kind: "proposal refinement", description: "Refine proposal based on community feedback; continue site visits and data collection." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "estimated_start", event_name: "Construction Start", description: "Estimated construction start for the 79th Street Crosstown SBS Capital Project." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "estimated need date", description: "Estimated time frame when the property interests would be needed for the Project." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "revenue_service_target", description: "Second Avenue Subway Phase 2 revenue service target date." }).event_family).toBe("planning");
    expect(event({ event_kind: "planned_procurement", description: "RFP release currently planned to occur by the third quarter of 2025." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "testing planned", description: "OBC Software 1.4 revenue service testing and deployment to commence." }).event_family).toBe("planning");
    expect(event({ event_kind: "engineering review", description: "Engineering review and approval of draft proposal." }).event_family).toBe("planning");
    expect(event({ event_kind: "study_period", description: "On-street surveys for merchants and bus riders. Continue traffic analysis and project design." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "evaluation", description: "Evaluate SBS performance. Study more robust options if supported by community." }).event_family).toBe(
      "planning",
    );
    expect(
      event({
        event_kind: "performance_evaluation",
        description: "Present busway performance data and project modifications if needed.",
      }).event_family,
    ).toBe("planning");
    expect(event({ event_kind: "study" }).lifecycle_phase).toBe("studied");
    expect(event({ event_kind: "study start" }).lifecycle_phase).toBe("studied");
    expect(event({ event_kind: "analysis" }).lifecycle_phase).toBe("studied");
    expect(event({ event_kind: "planning" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "design" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "design selection" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "board proposal" }).lifecycle_phase).toBe("proposed");
    expect(event({ event_kind: "corridor selection" }).lifecycle_phase).toBe("other");
    expect(event({ event_kind: "analysis snapshot" }).event_family).toBe("other");
    expect(event({ event_kind: "evaluation", description: "Pilot evaluation period for customer response." }).event_family).toBe("other");
    expect(event({ event_kind: "performance_review", description: "Review of the prior year's performance of railroad service." }).event_family).toBe("other");
    expect(event({ event_kind: "board action" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee action" }).event_family).toBe("governance");
    expect(event({ event_kind: "project_step" }).event_family).toBe("other");
    expect(event({ event_kind: "project_phase" }).event_family).toBe("other");
    expect(event({ event_kind: "project_schedule" }).event_family).toBe("other");
    expect(event({ event_kind: "environmental_review" }).event_family).toBe("other");
    expect(event({ event_kind: "proposal", description: "Generic proposal." }).event_family).toBe("other");
    expect(event({ event_kind: "environmental_review", description: "General environmental review status." }).event_family).toBe("other");
    expect(event({ event_kind: "issuance" }).event_family).toBe("other");
	    expect(event({ event_kind: "submission" }).event_family).toBe("milestone");
    expect(event({ event_kind: "next_steps" }).event_family).toBe("other");
    expect(event({ event_kind: "next_steps", description: "Analyze traffic and transit data. Develop Conceptual Design." }).event_family).toBe("planning");
    expect(event({ event_kind: "next_steps", description: "Continue data analysis and develop design ideas; CAC meeting and develop preferred plan." }).event_family).toBe(
      "planning",
    );
    expect(event({ event_kind: "next_steps", description: "Next steps will be provided in a future update." }).event_family).toBe("other");
    expect(event({ event_kind: "performance_review" }).event_family).toBe("other");
    expect(event({ event_kind: "budget_review" }).event_family).toBe("governance");
    expect(event({ event_kind: "committee_review" }).event_family).toBe("governance");
    expect(event({ event_kind: "signal testing" }).event_family).toBe("other");
    expect(event({ event_kind: "design workshop" }).event_family).toBe("public_engagement");
    expect(event({ event_kind: "evaluation" }).event_family).toBe("other");
    expect(event({ event_kind: "delivery" }).event_family).toBe("other");
    expect(event({ event_kind: "infrastructure_project" }).event_family).toBe("other");
  });

  it("promotes stale other event family for planning events during replay", () => {
    const out = event({ event_kind: "design phase", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "design phase" });
    expect(out.event_family).toBe("planning");
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("design phase");

    const proposalDevelopment = event({ event_kind: "proposal development", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "proposal development" });
    expect(proposalDevelopment.event_family).toBe("planning");
    expect(proposalDevelopment.lifecycle_phase).toBe("proposed");
    expect(proposalDevelopment.lifecycle_phase_other).toBeUndefined();

    const boardProposal = event({ event_kind: "board proposal", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "board proposal" });
    expect(boardProposal.event_family).toBe("planning");
    expect(boardProposal.lifecycle_phase).toBe("proposed");
    expect(boardProposal.lifecycle_phase_other).toBeUndefined();

	    const corridorSelection = event({ event_kind: "corridor selection", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "corridor selection" });
	    expect(corridorSelection.event_family).toBe("planning");
	    expect(corridorSelection.lifecycle_phase).toBe("other");
	    expect(corridorSelection.lifecycle_phase_other).toBe("corridor selection");

    const corridorIdentification = event({
      event_kind: "corridor identification",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "corridor identification",
    });
    expect(corridorIdentification.event_family).toBe("planning");
    expect(corridorIdentification.lifecycle_phase).toBe("other");
    expect(corridorIdentification.lifecycle_phase_other).toBe("corridor identification");

	    const designSelection = event({ event_kind: "design selection", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "design selection" });
    expect(designSelection.event_family).toBe("planning");
    expect(designSelection.lifecycle_phase).toBe("other");
    expect(designSelection.lifecycle_phase_other).toBe("design selection");

    const nextSteps = event({
      event_kind: "next_steps",
      description: "Summer 2014: Traffic and parking data collection, transit operations data collection and analysis, develop routing concepts. Fall 2014: CAC Meeting #2.",
      event_family: "other",
      lifecycle_phase: "other",
      lifecycle_phase_other: "next_steps",
    });
    expect(nextSteps.event_family).toBe("planning");
    expect(nextSteps.lifecycle_phase).toBe("other");
    expect(nextSteps.lifecycle_phase_other).toBe("next_steps");
  });

  it("promotes stale other event companions during replay", () => {
    const out = event({ event_kind: "opening", event_family: "other", lifecycle_phase: "other", lifecycle_phase_other: "opening" });
    expect(out.event_family).toBe("launch");
    expect(out.lifecycle_phase).toBe("launched");
    expect(out.lifecycle_phase_other).toBeUndefined();
  });

  it("canonicalizes legacy concrete event-family values during replay", () => {
    expect(event({ event_kind: "press_release", event_family: "press_release" }).event_family).toBe("publication");
    expect(event({ event_kind: "postponement", event_family: "postponement" }).event_family).toBe("pause");
    expect(event({ event_kind: "tolling program commencement", event_family: "tolling_program_commencement" }).event_family).toBe("launch");
    expect(event({ event_kind: "press_release", event_family: "approval" }).event_family).toBe("approval");
  });

  it("passes unrecognized kinds through as other + lifecycle_phase_other", () => {
    const out = event({ event_kind: "Public Hearing" });
    expect(out.lifecycle_phase).toBe("other");
    expect(out.lifecycle_phase_other).toBe("Public Hearing");
  });
});

describe("event scalar date promotion", () => {
  it("promotes a scalar date_normalized + date_precision from the best date field", () => {
    const out = event({ event_kind: "launch", event_date: "March 5, 2019" });
    expect(out.date_normalized).toBe("2019-03-05");
    expect(out.date_precision).toBe("day");
    expect(typeof out.date_normalized).toBe("string");
  });

  it("wins the date_normalized key over the generic object form when a top-level date is present", () => {
    const out = event({ event_kind: "launch", date: "2019-03-05" });
    // The collision case: generic normalizeDateFields would write an object to date_normalized;
    // the event scalar promotion runs first and wins, so the promoted TEXT column stays usable.
    expect(typeof out.date_normalized).toBe("string");
    expect(out.date_normalized).toBe("2019-03-05");
  });

  it("overwrites a stale object date_normalized carried by a re-normalized journal", () => {
    // Journals submitted before S2.1 stored date_normalized as the generic object form. At
    // materialize the payload is re-normalized; the scalar must replace the object so the promoted
    // TEXT column populates instead of coercing to NULL.
    const out = event({ event_kind: "launch", date: "2019-03-05", date_normalized: { raw_text: "2019-03-05", normalized_date: "2019-03-05", precision: "day", confidence: "submitted_iso" } });
    expect(out.date_normalized).toBe("2019-03-05");
    expect(typeof out.date_normalized).toBe("string");
  });

  it("leaves the scalar date unset when no date parses", () => {
    const out = event({ event_kind: "launch", date_text: "sometime soon" });
    expect(out.date_normalized).toBeUndefined();
    expect(out.date_precision).toBe("unknown");
  });
});

describe("project scalar date promotion", () => {
  it("uses completion dates before launch dates for the project sort key", () => {
    const out = project({ project_name: "Test project", completion_date: "May 2024", launch_date: "January 2023" });
    expect(out.date_normalized).toBe("2024-05");
    expect(out.date_precision).toBe("month");
    expect(out.date_source_field).toBe("completion_date");
  });

  it("normalizes bare project years", () => {
    const out = project({ project_name: "Year project", year: "2019" });
    expect(out.date_normalized).toBe("2019");
    expect(out.date_precision).toBe("year");
    expect(out.date_source_field).toBe("year");
  });

  it("marks undated projects with unknown precision", () => {
    const out = project({ project_name: "Undated project" });
    expect(out.date_normalized).toBeUndefined();
    expect(out.date_precision).toBe("unknown");
    expect(out.date_source_field).toBeUndefined();
  });

  it("preserves raw project date literals", () => {
    const input = { project_name: "Raw project", completion_date: "May 2024", launch_date: "January 2023" };
    const out = project(input);
    expect(out.completion_date).toBe(input.completion_date);
    expect(out.launch_date).toBe(input.launch_date);
  });
});

describe("source published-date fold (C2.6 first pass)", () => {
  it("folds the best available date literal into a normalized scalar + precision", () => {
    expect(source({ publication_date: "2021" }).published_date_normalized).toBe("2021");
    expect(source({ publication_date: "2021" }).published_date_precision).toBe("year");
    expect(source({ date_text: "June 2020" }).published_date_normalized).toBe("2020-06");
    expect(source({ date_text: "June 2020" }).published_date_precision).toBe("month");
  });
});

describe("source authority_tier (C7)", () => {
  it("derives a tier from the document's own classification fields", () => {
    expect(source({ content_type: "monitoring report" }).authority_tier).toBe("official_evaluation");
    expect(source({ content_type: "presentation", title: "Board Committee Agenda" }).authority_tier).toBe("board_material");
    expect(source({ content_type: "press release" }).authority_tier).toBe("press_release");
    expect(source({ content_type: "brochure" }).authority_tier).toBe("plan_document");
  });

  it("leaves authority_tier unset when no signal is present (S2.7 enriches)", () => {
    expect(source({ publisher: "Anonymous" }).authority_tier).toBeUndefined();
  });
});

describe("source gap kind normalization", () => {
  it("maps common source-stated data caveats without marking gaps resolved", () => {
    expect(gap({ gap_kind: "preliminary_data" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "preliminary results" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "provisional_data" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "data_subject_to_change" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "data_not_yet_available" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "data not available" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "methodology_difference" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "methodology note" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "data_comparability" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "data_provenance" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "rounding_discrepancy" }).gap_kind_normalized).toBe("rounding_note");
    expect(gap({ gap_kind: "data_exclusion" }).gap_kind_normalized).toBe("data_exclusion");
    expect(gap({ gap_kind: "excluded_funding" }).gap_kind_normalized).toBe("data_exclusion");
    expect(gap({ gap_kind: "pending analysis" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "under_review" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "data_quality" }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(gap({ gap_kind: "data precision" }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(gap({ gap_kind: "data_estimation" }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(gap({ gap_kind: "methodological_caveat" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "measurement_baseline_note" }).gap_kind_normalized).toBe("methodology_or_comparability");

    expect(gap({ gap_kind: "deferred" }).gap_kind_normalized).toBe("deferred_data");
    expect(gap({ gap_kind: "data_collection_suspension" }).gap_kind_normalized).toBe("data_collection_suspension");
    expect(gap({ gap_kind: "not_collected" }).gap_kind_normalized).toBe("data_not_collected");
    expect(gap({ gap_kind: "empty_source" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "no_data" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "date_uncertainty" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "draft_status" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "pending_final_report" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "tentative dates" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "errata" }).gap_kind_normalized).toBe("correction");
    expect(gap({ gap_kind: "data_removed" }).gap_kind_normalized).toBe("correction");
    expect(gap({ gap_kind: "data_revision" }).gap_kind_normalized).toBe("correction");
    expect(gap({ gap_kind: "documentation_quality" }).gap_kind_normalized).toBe("correction");
    expect(gap({ gap_kind: "contingent_forecast" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "design_refinement_uncertainty" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "reporting_delay" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "filing_in_progress" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "status_pending" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "work_continuation" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "work continuation" }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ gap_kind: "data_reliability" }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(gap({ gap_kind: "temporal_scope" }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "no_active_hedges" }).gap_kind_normalized).toBe("data_exclusion");
    expect(gap({ gap_kind: "survey_not_conducted" }).gap_kind_normalized).toBe("data_not_collected");
    expect(gap({ gap_kind: "unknown environmental review level" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "unidentified" }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ gap_kind: "date_inconsistency" }).gap_kind_normalized).toBe("correction");
    expect(gap({ gap_kind: "implementation_challenge" }).gap_kind_normalized).toBe("other");
    expect(gap({ gap_kind: "partial_extraction" }).gap_kind_normalized).toBe("other");
    expect(gap({ gap_kind: "scope_limitation" }).gap_kind_normalized).toBe("other");
    expect(gap({ gap_kind: "risk" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "financial_risk" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "completion_risk" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "contingent_financing" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "contingent_program" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "funding_gap" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "funding_uncertainty" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "program_underperformance" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "staffing_shortage" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ gap_kind: "structural_imbalance" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(gap({ description: "Note: This work will continue into 2023." }).gap_kind_normalized).toBeUndefined();
  });

  it("derives a gap kind from no-kind payloads only when the caveat is explicit", () => {
    expect(
      gap({
        missing_information: "No specific source or nature of $600 million in additional funding/MTA actions identified.",
        gap_text: "The 2023 budget assumes $600 million in additional government funding and/or additional MTA actions, both of which have not yet been specified.",
      }).gap_kind_normalized,
    ).toBe("data_unavailable");
    expect(
      gap({
        gap_kind: "incident",
        missing_information: "As-built drawings did not depict signal cables at the location where they were severed.",
        description: "There were no indications or signal monuments identifying the signal cables.",
      }).gap_kind_normalized,
    ).toBe("data_unavailable");
    expect(gap({ gap_kind: "incident", description: "Generic incident context." }).gap_kind_normalized).toBe("other");
    expect(
      gap({
        missing_information: "LIRR and MNR farebox recovery calculations use a revised methodology that differs from the statistics presented in this table.",
      }).gap_kind_normalized,
    ).toBe("methodology_or_comparability");
    expect(gap({ description: "Totals may not add due to rounding." }).gap_kind_normalized).toBe("rounding_note");
    expect(gap({ description: "Rows are excluded from this report because the source table omits them." }).gap_kind_normalized).toBe("data_exclusion");
    expect(gap({ description: "Traffic analysis is ongoing and DOT will provide results after completion." }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ description: "Data may vary by +/- 4% due to variations in reporting methodology." }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ description: "Fare machine outages affected ridership data accuracy during certain months." }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(gap({ description: "The data in this report can not be statistically compared because the rating scale and attribute listings are not standardized." }).gap_kind_normalized).toBe(
      "methodology_or_comparability",
    );
    expect(gap({ description: "Expected gallons purchased are based on pre covid consumption." }).gap_kind_normalized).toBe("methodology_or_comparability");
    expect(gap({ description: "Analysis assumes all traffic will continue to use the corridor with no assumed mode shift." }).gap_kind_normalized).toBe(
      "methodology_or_comparability",
    );
    expect(
      gap({
        description: "Due to a global time keeping issue, employee hours of work were estimated for February 2022.",
      }).gap_kind_normalized,
    ).toBe("data_quality_caveat");
    expect(gap({ description: "More employees with disabilities may exist but many employees have not self-identified." }).gap_kind_normalized).toBe(
      "data_quality_caveat",
    );
    expect(gap({ description: "Safety data initially presented in the original version was removed from this version due to a calculation error." }).gap_kind_normalized).toBe(
      "correction",
    );
    expect(gap({ description: "Source note contains typographical errors." }).gap_kind_normalized).toBe("correction");
    expect(gap({ description: "Workplace Violence data will have additional security records added; updated data will be reflected in future reporting." }).gap_kind_normalized).toBe(
      "correction",
    );
    expect(gap({ description: "The Y-T-D 2021 violations issued count has been updated from previously reported figures." }).gap_kind_normalized).toBe("correction");
    expect(gap({ description: "DOT applied for additional federal grants; approval status unknown at time of meeting." }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ description: "The full impact is unknown at this time and could affect the procurement approach." }).gap_kind_normalized).toBe("data_unavailable");
    expect(gap({ description: "The ultimate extent of the COVID-19 impact cannot be reasonably estimated at this time." }).gap_kind_normalized).toBe(
      "data_unavailable",
    );
    expect(
      gap({
        gap_kind: "contextual_caveat",
        gap_text: "All MTA operations, finances, and performance indicators have been severely impacted by this unprecedented global crisis.",
        description: "Covid-19 pandemic severely impacted 2020 performance indicators; data reflects unprecedented ridership declines and operational changes.",
      }).gap_kind_normalized,
    ).toBe("methodology_or_comparability");
    expect(gap({ gap_kind: "caveat", gap_text: "Due to COVID-19 Pandemic all capital contract awards were put on 90-day moratorium." }).gap_kind_normalized).toBe(
      "other",
    );
    expect(gap({ description: "The second semi-annual DBE report is currently on hold due to recent program changes." }).gap_kind_normalized).toBe(
      "pending_analysis",
    );
    expect(gap({ description: "Next exam status TBD, waiting on notification from NYDFS." }).gap_kind_normalized).toBe("pending_analysis");
    expect(gap({ description: "Overtime spending figures may need to be revised due to a timekeeping outage." }).gap_kind_normalized).toBe(
      "data_quality_caveat",
    );
    expect(gap({ description: "After-install data covers only one week, which may not be representative." }).gap_kind_normalized).toBe("data_quality_caveat");
    expect(
      gap({
        gap_kind: "scope_gap",
        gap_text:
          "Document is an all-agency annual procurement report listing MTA contract transactions only; does not contain bus route, corridor, project, treatment, event, claim, or metric information relevant to transit service improvements.",
        missing_information: "No bus routes, SBS services, corridors, transit improvement projects, treatments, events, claims, or metrics",
      }).gap_kind_normalized,
    ).toBe("data_unavailable");
    expect(
      gap({
        gap_kind: "caveat",
        gap_text: "No site visits were performed during April & May 2020 due to the COVID-19 pandemic. Virtual site visits began on June 29, 2020.",
      }).gap_kind_normalized,
    ).toBe("data_not_collected");
    expect(
      gap({
        gap_kind: "time_constraint",
        description: "Time did not permit a discussion of the activities on this block.",
        missing_information: "Curbside activities on two blocks were not discussed.",
      }).gap_kind_normalized,
    ).toBe("data_not_collected");
    expect(
      gap({
        gap_kind: "time_constraint",
        description: "Meeting time constraints prevented discussion of curbside activities on two blocks of 34th Street.",
        missing_information: "Curbside activity discussion for blocks from Tenth to Twelfth Avenues.",
      }).gap_kind_normalized,
    ).toBe("data_not_collected");
    expect(
      gap({
        gap_kind: "implementation_challenge",
        gap_text: "Developing alternative method for fare machine installation on bridge structure.",
        missing_information: "Exploring options for powering fare machines, as there are no nearby 24-hour DOT-owned street lights.",
      }).gap_kind_normalized,
    ).toBe("pending_analysis");
    expect(
      gap({
        gap_kind: "stated_limitation",
        gap_text: "Certain improvements could not be completed with in-house materials. Pedestrian safety measures need permanent material.",
        missing_information: "Timeline for permanent material installation.",
      }).gap_kind_normalized,
    ).toBe("pending_analysis");
    expect(
      gap({
        gap_kind: "scope_limitation",
        gap_text: "Several factors were outside the scope of this study and could not be evaluated in detail.",
        missing_information:
          "A next phase would need structural analysis, would require more in-depth analysis of zoning, would need further analysis of access, and would need to be finalized for funding and permitting.",
      }).gap_kind_normalized,
    ).toBe("pending_analysis");
    expect(
      gap({
        gap_kind: "scope_limitation",
        gap_text: "Many factors in a reactivation were outside the scope of this study, or could not be evaluated in detail",
        missing_information:
          "Structural bridge analysis, zoning change studies, freight network demand changes, final station designs, value capture analysis, governance/operations plan, funding and permitting processes",
        description: "The study identifies multiple factors that need further analysis in future studies",
      }).gap_kind_normalized,
    ).toBe("pending_analysis");
    expect(
      gap({
        gap_kind: "stated_scope_limitation",
        gap_text: "Routes with running time changes only - Q29",
        missing_information: "Q29 headway and capacity data not shown because the route only has running time changes.",
      }).gap_kind_normalized,
    ).toBe("data_exclusion");

    expect(gap({ description: "General caveat text without an actionable data limitation." }).gap_kind_normalized).toBeUndefined();
    expect(gap({ description: "Figures are subject to revision after close." }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ description: "Updated proposal text." }).gap_kind_normalized).toBeUndefined();
    expect(gap({ description: "Only key sections were read from a large source document." }).gap_kind_normalized).toBeUndefined();
    expect(gap({ gap_kind: "analysis limitation", description: "General analysis limitation." }).gap_kind_normalized).toBe("other");
    expect(gap({ gap_kind: "scope_gap", description: "General source scope note." }).gap_kind_normalized).toBe("other");
    expect(gap({ gap_kind: "stated_scope_limitation", description: "Route scope limitation for future analysis." }).gap_kind_normalized).toBe("other");
    expect(gap({ description: "The financial plan includes risk that ridership recovery may be slower than expected." }).gap_kind_normalized).toBeUndefined();
    expect(gap({ gap_kind: "caveat", description: "General caveat text without an actionable data limitation." }).gap_kind_normalized).toBe("other");
  });

  it("promotes stale runner-owned other companions when source text has a deterministic source-gap kind", () => {
    expect(gap({ gap_kind: "preliminary_data", gap_kind_normalized: "other" }).gap_kind_normalized).toBe("provisional_data");
    expect(gap({ gap_kind: "financial_risk", gap_kind_normalized: "other" }).gap_kind_normalized).toBe("risk_or_contingency");
    expect(
      gap({
        gap_kind: "data_caveat",
        gap_kind_normalized: "other",
        gap_text: "Figures are preliminary and subject to change.",
      }).gap_kind_normalized,
    ).toBe("provisional_data");
  });
});

describe("project document_time_status", () => {
	  it("normalizes board-approval and award status literals with precedence", () => {
	    expect(project({ status: "pending Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "Board approval sought for award November 2022" }).document_time_status).toBe("planned");
    expect(project({ status: "proposed for Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "approved for award" }).document_time_status).toBe("approved");
    expect(project({ status: "awarded" }).document_time_status).toBe("approved");
    expect(project({ status: "ratified" }).document_time_status).toBe("approved");
    expect(project({ status: "directed by law" }).document_time_status).toBe("approved");
    expect(project({ status: "FEMA Reimbursement Secured" }).document_time_status).toBe("approved");
    expect(project({ status: "FONSI secured" }).document_time_status).toBe("approved");
    expect(project({ status: "funding added" }).document_time_status).toBe("approved");
    expect(project({ status: "initial investment received" }).document_time_status).toBe("approved");
    expect(project({ status: "lease authorized" }).document_time_status).toBe("approved");
    expect(project({ status: "option exercised" }).document_time_status).toBe("approved");
    expect(project({ status: "ordered" }).document_time_status).toBe("approved");
    expect(project({ status: "purchase authorized" }).document_time_status).toBe("approved");
    expect(project({ status: "Locally Preferred Alternative" }).document_time_status).toBe("approved");
    expect(project({ status: "Ratification of ION declaration and contract award" }).document_time_status).toBe("approved");
    expect(project({ status: "committed" }).document_time_status).toBe("other");
    expect(project({ status: "approval" }).document_time_status).toBe("other");
		    expect(project({ status: "ratification" }).document_time_status).toBe("other");
		    expect(project({ status: "Ratification" }).document_time_status).toBe("other");
		  });

  it("maps exact checked project-name statuses to implemented without broad checklist matching", () => {
    expect(project({ project_name: "Replacing Old Train Cars", status: "Replacing Old Train Cars \u2713" }).document_time_status).toBe("implemented");
    expect(project({ project_name: "Saving Taxpayer Money", status: "Saving Taxpayer Money \u2713" }).document_time_status).toBe("implemented");
    expect(project({ project_name: "Saving Taxpayer Money", status: "Saving Taxpayer Money" }).document_time_status).toBe("other");
    expect(project({ project_name: "Saving Taxpayer Money", status: "Taxpayer Money \u2713" }).document_time_status).toBe("other");
    expect(project({ status: "Some Checklist Item \u2713" }).document_time_status).toBe("other");
    expect(project({ project_name: "FEMA Reimbursement", status: "FEMA Reimbursement Secured \u2713" }).document_time_status).toBe("approved");
  });

  it("uses submitted source context for exact project status gates without storing context", () => {
    const fulton = project(
      {
        project_name: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
        project_type: "signal modernization",
        description: "Replacement of 79-year-old signaling equipment on the Liberty Line.",
        project_family: "capital_or_infrastructure",
      },
      {
        raw_text: "the project is moving forward, with the RFQ already released and the RFP expected within weeks.",
      },
    );
    expect(fulton.document_time_status).toBe("planned");
    expect(fulton.raw_text).toBeUndefined();
    expect(fulton.evidence_quotes).toBeUndefined();
    expect(
      project({
        project_name: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
        project_type: "signal modernization",
        description: "Replacement of 79-year-old signaling equipment on the Liberty Line.",
        project_family: "capital_or_infrastructure",
      }).document_time_status,
    ).toBeUndefined();

    expect(
      project(
        {
          project_name: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
          project_type: "construction",
          description: "Construct Phase 3B of LIRR's Sandy Restoration and Resiliency Project.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: [
            "A publicly advertised, competitively solicited and negotiated contract to Posillico Civil, Inc. in the amount of $38,092,008 to construct Phase 3B.",
          ],
        },
      ).document_time_status,
    ).toBe("approved");

    expect(
      project(
        {
          project_name: "Webster Avenue Low-Income Housing Development",
          project_type: "real estate development",
          description: "Development of an approximately 550-unit low-income housing development.",
          project_family: "real_estate_or_property",
        },
        {
          evidence_quotes: ["Webster Development intends to utilize the MTA Property Interests to facilitate the development of the Project."],
        },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Flushing bundle",
          project_type: "State of Good Repair",
          description: "Seven-station Flushing bundle bringing State of Good Repair work to stations between 52 St and 111 St on the 7 line.",
          project_family: "capital_or_infrastructure",
        },
        {
          raw_text: "The seven-station Flushing bundle, which will bring State of Good Repair work to most of the stations between 52 St and 111 St.",
        },
      ).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Flushing bundle",
        project_type: "State of Good Repair",
        description: "Seven-station Flushing bundle between 52 St and 111 St.",
        project_family: "capital_or_infrastructure",
      }).document_time_status,
    ).toBeUndefined();

    expect(
      project(
        {
          project_name: "Direct Fixation Track Replacement",
          project_type: "NYCT capital project",
          description: "Direct Fixation Track Replacement project for the 63rd Street and Jamaica lines.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: ["NYCT has proposed internal budget adjustments to support its Direct Fixation Track Replacement project."],
        },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Fulton-Liberty Line CBTC Project",
          project_type: "signal replacement",
          description: "Largest signal and track replacement project in MTA history, including CBTC implementation.",
          project_family: "capital_or_infrastructure",
        },
        {
          raw_text: "The Fulton-Liberty Line Project will be the largest signal and track replacement project in MTA history.",
        },
      ).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Fulton-Liberty Line CBTC Project",
        project_type: "signal replacement",
        description: "Generic signal replacement project.",
        project_family: "capital_or_infrastructure",
      }).document_time_status,
    ).toBeUndefined();

    expect(
      project(
        {
          project_name: "Enhanced Station Initiative at White Plains station",
          project_type: "station improvement",
          description: "Construction of an extension to the island platform as well as a new side platform.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: ["Completed the renovation work on the Enhanced Station Improvement initiative at White Plains station."],
        },
      ).document_time_status,
    ).toBe("implemented");
    expect(
      project(
        {
          project_name: "Zero-Emission commitment",
          project_type: "initiative",
          description: "New York City Transit's Zero-Emission commitment including charging infrastructure installation.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: [
            "President Davey spoke about the continued progress on New York City Transit's Zero-Emission commitment and the first partnership for charging infrastructure installation.",
          ],
        },
      ).document_time_status,
    ).toBe("active");
    expect(
      project(
        {
          project_name: "Moodna Viaduct timber replacement and inspection",
          project_type: "capital improvement",
          description: "Capital project supported by scheduled bus services under MNR contract.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: [
            "Additional funding is needed for the continuation of scheduled bus services to support capital projects, such as the New Canaan Branch cyclical trackwork and Moodna Viaduct timber replacement and inspection projects.",
          ],
        },
      ).document_time_status,
    ).toBe("active");
    expect(
      project(
        {
          project_name: "New Canaan Branch cyclical trackwork",
          project_type: "capital improvement",
          description: "Capital project supported by scheduled bus services under MNR contract.",
          project_family: "capital_or_infrastructure",
        },
        {
          evidence_quotes: [
            "Additional funding is needed for the continuation of scheduled bus services to support capital projects, such as the New Canaan Branch cyclical trackwork and Moodna Viaduct timber replacement and inspection projects.",
          ],
        },
      ).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Enhanced Station Initiative at White Plains station",
        project_type: "station improvement",
        description: "Construction of station improvements at White Plains station.",
        project_family: "capital_or_infrastructure",
      }).document_time_status,
    ).toBeUndefined();
  });

  it("marks exact mixed implemented/planned BRT corridor bundle as program context", () => {
    expect(
      project({
        project_name: "BRT Phase I Corridors",
        project_type: "Bus Rapid Transit",
        description: "First phase of BRT corridors including implemented and planned SBS projects.",
        project_family: "sbs_or_brt",
      }).document_time_status,
    ).toBe("program_context");

    expect(
      project({
        project_name: "BRT Phase I Corridors",
        project_type: "Bus Rapid Transit",
        description: "Single BRT corridor project planned for implementation.",
        project_family: "sbs_or_brt",
      }).document_time_status,
    ).toBeUndefined();
  });

  it("maps exact scout-backed project status gates from payload and source context", () => {
    const checkedTitleCases: Array<[JsonObject, string, string]> = [
      [
        {
          project_name: "Increase Ridership",
          description: "MTA initiative to increase subway ridership, highlighted by celebration of one billion subway rides in 2023",
        },
        "Increase Ridership \u2713",
        "implemented",
      ],
      [
        {
          project_name: "Achieve Financial Stability",
          description: "NYS Budget eliminates projected deficits through 2027",
          project_family: "finance_or_funding",
        },
        "NYS Budget Eliminates Projected Deficits Through 2027\nAchieve Financial Stability \u2713",
        "implemented",
      ],
      [
        {
          project_name: "Increase Accessibility",
          description: "MTA accessibility initiative including Fully Accessible Grand St Station",
          project_family: "accessibility_or_safety",
        },
        "Increase Accessibility \u2713",
        "implemented",
      ],
      [
        {
          project_name: "Promoting Public Safety",
          description: "MTA initiative promoting public safety, including homeless outreach partnership with NYC Department of Homeless Services",
          project_family: "accessibility_or_safety",
        },
        "Promoting Public Safety \u2713",
        "implemented",
      ],
      [
        {
          project_name: "Advance Congestion Pricing",
          description: "MTA initiative to advance congestion pricing",
          project_family: "fare_program",
        },
        "Advance Congestion Pricing \u2713",
        "implemented",
      ],
      [
        {
          project_name: "14 St F/M/L Upgrades",
          project_type: "station upgrades",
          description: "14 St Subway Station Upgrades",
          project_family: "capital_or_infrastructure",
        },
        "14 St F/M/L Upgrades \u2713",
        "implemented",
      ],
      [
        {
          project_name: "42 St Shuttle 5G Cell Service",
          project_type: "cell service installation",
          description: "5G Cell Service on the 42 St Shuttle",
          project_family: "technology_system",
        },
        "42 St Shuttle 5G Cell Service \u2713",
        "implemented",
      ],
    ];

    for (const [payload, raw_text, status] of checkedTitleCases) {
      expect(project(payload, { raw_text }).document_time_status).toBe(status);
      expect(project(payload).document_time_status).toBeUndefined();
    }

    expect(
      project(
        {
          project_name: "LIRR Babylon Station Renovation",
          project_type: "station renovation",
          description: "Better Babylon Station - Renovation of LIRR Babylon Station",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "Concrete structure under construction.\nLIRR Babylon Station Renovation \u2713" },
      ).document_time_status,
    ).toBe("under_construction");

    expect(
      project(
        {
          project_name: "MOW Situation Room",
          project_type: "facility",
          description: "Emergency management situation room at Livingston Plaza for managing major subway incidents and inclement weather events",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "Establishing the MOW Situation Room, specifically designed to manage major subway incidents." },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "F/M swap service change",
          project_type: "service change",
          description: "Subway service change involving F and M lines.",
          project_family: "service_change",
        },
        { raw_text: "Planning, implementing, and communicating the F/M swap service change leading up to and during implementation." },
      ).document_time_status,
    ).toBe("active");

    expect(
      project(
        {
          project_name: "Bridges and Tunnels Capital Maintenance Projects",
          project_type: "capital_maintenance",
          description: "Multiple capital projects including cable dehumidification and fire suppression systems.",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "Contracts will be issued to monitor and maintain the systems and are expected to be awarded in 2028." },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Metro-North Harrison Station TOD",
          project_type: "transit-oriented development",
          description: "Transit-oriented development at Metro-North Harrison Station including Harrison Garage opening and parking structure",
          project_family: "real_estate_or_property",
        },
        { raw_text: 'A press conference for the Harrison Garage opening. A sign reads "MTA Harrison Garage Opens".' },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "Incredible Advocates",
          description: "MTA initiative recognizing advocates",
        },
        { raw_text: "Incredible Advocates \u2713" },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "Elevator EL 616 7th Av & 33rd St",
          project_type: "elevator",
          description: "Long Island & Subway Elevator at 7th Av & 33rd St",
          project_family: "accessibility_or_safety",
        },
        {
          raw_text:
            "Long Island & Subway Elevator EL 616 7th Av & 33rd St. Alternate Accessible Travel Information If the elevator is out of service, use the elevator at the northwest corner of 33rd St and 7th Av.",
        },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "Beach 67 St ADA Project",
          description: "ADA accessibility project at Beach 67th Street station with alternate accessible travel information",
          project_family: "accessibility_or_safety",
        },
        {
          raw_text:
            "Alternate Accessible Travel Information If this elevator is out of service: Use nearby elevator EL-481 to take a bus to Rockaway-44th Ave.",
        },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "CBTC Queens Boulevard West Line - Phase 1",
          project_type: "signal modernization",
          description: "CBTC signaling project on the Queens Boulevard West Line with Siemens.",
          project_family: "capital_or_infrastructure",
        },
        {
          raw_text:
            "Contract S-48004-1 provides Communication Based Train Control equipment for the CBTC signaling project on the Queens Boulevard West Line. C&D requests that the Board ratify a modification to the Contract.",
        },
      ).document_time_status,
    ).toBe("planned");

    for (const projectName of [
      "Metro-North Park Avenue Viaduct Phase 2 Acceleration",
      "NYCT Elevated Structures Enhanced Overcoating Program",
      "LIRR Hollis Station Accessibility and Platform Upgrades",
    ]) {
      const payload = {
        project_name: projectName,
        project_type: "core infrastructure",
        description: `${projectName} under the plan amendment key core infrastructure project list.`,
        project_family: "capital_or_infrastructure",
      };
      expect(project(payload, { raw_text: `Key Core Infrastructure Projects\n${projectName}` }).document_time_status).toBe("planned");
      expect(project(payload).document_time_status).toBeUndefined();
    }

    expect(
      project(
        {
          project_name: "Railroad Crossing Elimination (RCE) Grant Program",
          project_type: "grant program",
          description: "$573M available FFY 2022, maximum state award ~$115M",
          project_family: "finance_or_funding",
        },
        { raw_text: "Grade Crossing Projects - Future" },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Model G Train Project",
          project_type: "train project",
          description: "Model G Train Project Sets a New Standard",
          project_family: "other",
        },
        { raw_text: "Model G Train Project Sets a New Standard" },
      ).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "2022 Bus Strategy",
          project_type: "strategy",
          description:
            "Four-pillar strategy: 1) Expand bus priority and traffic enforcement, 2) Continually improve the network, 3) Strengthen accessibility and customer engagement, 4) Transition to a zero-emissions fleet",
          project_family: "bus_priority",
        },
        {
          raw_text:
            "2022 Bus Strategy\n1 Expand bus priority and traffic enforcement 2 Continually improve the network 3 Strengthen accessibility and customer engagement 4 Transition to a zero-emissions fleet",
        },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Hunter College/68 St",
          project_type: "ADA accessibility",
          description: "ADA accessibility project at Hunter College/68 St station.",
          project_family: "accessibility_or_safety",
        },
        { raw_text: "Schedule: Q4 2024. Case Study At Hunter College/68 St, close coordination with DEP avoided water line disruption." },
      ).document_time_status,
    ).toBe("active");

    expect(
      project({
        project_name: "ADA Upgrades at Lindenhurst LIRR",
        description: "Fully Accessible Amityville & Lindenhurst - Increase Appeal for Customers - Knocking out Capital Projects",
        project_family: "accessibility_or_safety",
      }).document_time_status,
    ).toBe("implemented");

    expect(
      project(
        {
          project_name: "LIRR Expansion (Third Track)",
          project_type: "construction",
          description: "C&D safety report for LIRR Expansion (Third Track) project covering December 8, 2021 through January 4, 2022",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "LIRR EXPANSION (THIRD TRACK)" },
      ).document_time_status,
    ).toBe("under_construction");

    expect(
      project(
        {
          project_name: "Construction of a third track between Floral Park and Hicksville",
          project_type: "rail infrastructure",
          description: "Construction of a third track between Floral Park and Hicksville by MTA Long Island Railroad.",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "Continued progress on infrastructure work including construction of a third track between Floral Park and Hicksville." },
      ).document_time_status,
    ).toBe("active");

    expect(
      project(
        {
          project_name: "Conveyance of property interests in the Wakefield section of the Bronx",
          project_type: "transit-oriented development",
          description: "Conveyance of property interests in the Wakefield section of the Bronx to facilitate adjacent transit-oriented development",
          project_family: "real_estate_or_property",
        },
        {
          raw_text:
            "Authorization to conditionally designate Webster Leasing as the successful proposer under the RFP. The entry into the Transaction Documents will be subject to further MTA/MNR Board action.",
        },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Tibbets Brook Daylighting Project",
          description: "NYC DEP project to install a combination of open channel and closed conduit for the Tibbetts Brook Daylighting Project.",
          project_family: "capital_or_infrastructure",
        },
        {
          raw_text:
            "ACTION REQUESTED: Authorization to grant a permanent easement. NYC DEP is requesting to be granted a permanent easement. As part of the project, NYC DEP will provide BN Yard with major rail infrastructure upgrades.",
        },
      ).document_time_status,
    ).toBe("planned");

    expect(
      project(
        {
          project_name: "Third Track Main Line Expansion",
          project_type: "capital project",
          description: "LIRR main line expansion project requiring flagging",
          project_family: "capital_or_infrastructure",
        },
        { raw_text: "LIRR higher mainly due to more Third Track Main Line Expansion flagging requirements." },
      ).document_time_status,
    ).toBe("active");

    expect(project({ project_name: "Increase Ridership", description: "Generic ridership initiative." }, { raw_text: "Strengthen and Expand the Network \u2713" }).document_time_status).toBeUndefined();
    expect(
      project({
        project_name: "LIRR Babylon Station Renovation",
        project_type: "station renovation",
        description: "Better Babylon Station - Renovation of LIRR Babylon Station",
        project_family: "capital_or_infrastructure",
      }).document_time_status,
    ).toBeUndefined();
  });

			  it("maps payload-proven residual status action literals without broad approval or launch matching", () => {
	    expect(
	      project({
	        status: "approval",
	        project_type: "public works contract modification",
	        description: "Modify contract for HOV/Bus Lane Operations at the Verrazzano-Narrows Bridge.",
	      }).document_time_status,
	    ).toBe("approved");
	    expect(
	      project({
	        status: "approval",
	        project_type: "public works contract amendment",
	        description: "Extension of Median Barrier Transfer Services under a capital project contract.",
	      }).document_time_status,
	    ).toBe("approved");
	    expect(
	      project({
	        status: "ratification",
	        project_type: "personal service contract modification",
	        description: "Implement an automated Revenue Recovery System with support and maintenance.",
	      }).document_time_status,
	    ).toBe("approved");
	    expect(
	      project({
	        status: "Ratification",
	        project_type: "Infrastructure Rehabilitation",
	        description: "Modification No. 11 to Contract P-36700 for transformer and rectifier replacement.",
	      }).document_time_status,
	    ).toBe("approved");
	    expect(
	      project({
	        status: "amendment",
	        project_type: "procurement",
	        description: "Award of amendment to Personal Service contract for Project Management Office Consultant Services.",
	      }).document_time_status,
	    ).toBe("approved");
	    expect(
	      project({
	        status: "weekend of May 17-18, 2025",
	        project_type: "signal testing and cutover",
	        description: "Two tracks out of service while signal testing is performed.",
	      }).document_time_status,
	    ).toBe("planned");
	    expect(
	      project({
	        status: "weekends of May 3-4 and May 17-18, 2025",
	        project_type: "concrete tie installation and rail replacement",
	        description: "Single main track out of service.",
	      }).document_time_status,
	    ).toBe("planned");
	    expect(
	      project({
	        status: "Both buses and depot charging infrastructure will proceed",
	        project_type: "zero-emission buses",
	        description: "Electric bus procurement and depot charging infrastructure build-out.",
	      }).document_time_status,
	    ).toBe("planned");
		    expect(
		      project({
		        status: "launching",
		        project_type: "infrastructure reconstruction",
		        description: "Full reconstruction of West 255th Street with drainage upgrades, retaining wall, and station parking lot reconstruction.",
		      }).document_time_status,
		    ).toBe("under_construction");
		    expect(
		      project({
		        status: "substantial completion anticipated Fall 2024",
		        project_type: "ADA accessibility",
		        description: "Will make two stations fully accessible with nine new elevators.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "various completion percentages",
		        project_type: "flag repair",
		        description: "Flag repairs replacing deteriorated LIRR infrastructure at various completion stages, including viaduct work at 100%.",
		      }).document_time_status,
		    ).toBe("active");
		    expect(
		      project({
		        status: "completion goal",
		        description: "Completion goal for 400 NYCT hybrid-electric buses.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "launching",
		        project_type: "Select Bus Service",
		        description: "B44 Select Bus Service launching along Nostrand/Rogers Avenues.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "launching May 20 to June 14, 2024",
		        description: "Student MetroCard raffle for students who swipe to travel to or from school.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        project_name: "Long-term Fare Gate Strategy",
		        project_family: "fare_program",
		        program: "2025-2029 Capital Program",
		        description: "Long-term fare gate strategy as part of the 2025-2029 Capital Program.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        project_name: "Long-term Fare Gate Strategy",
		        program: "2025-2029 Capital Program",
		        description: "Long-term fare gate strategy as part of the 2025-2029 Capital Program.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        project_name: "Metro-North Laser Train Technology Adoption",
		        description:
		          "Metro-North will pilot laser train technology at higher speeds to remove leaf debris from tracks; high-pressure rail-washer trains are also used.",
		      }).document_time_status,
		    ).toBe("pilot");
		    expect(
		      project({
		        project_name: "Fare Policy Update",
		        project_family: "fare_program",
		        description: "General fare policy discussion.",
		      }).document_time_status,
		    ).toBeUndefined();
		    expect(
		      project({
		        status: "Annual Update",
		        project_type: "Agency Safety Plan",
		        description: "Agency Safety Plan/System Safety Program Plan for Buses.",
		      }).document_time_status,
		    ).toBe("active");
		    expect(
		      project({
		        status: "Year 1 (July 1, 2023 - June 30, 2024) Progress Report",
		        project_type: "strategic plan",
		        description: "Year 1 progress report for the Five-Year Diversity, Equity, and Inclusion Strategic Plan.",
		      }).document_time_status,
		    ).toBe("active");
		    expect(
		      project({
		        status: "Concurrent delays: R211 deliveries, conventional signal equipment manufacturing",
		        project_type: "CBTC signal modernization",
		        description: "8th Avenue Line CBTC signal modernization affected by R211 and signal equipment delays.",
		      }).document_time_status,
		    ).toBe("active");
		    expect(
		      project({
		        status: "conditional designation",
		        project_type: "real estate development",
		        description: "Conditional designation of developer for a 99-year ground lease transit-oriented development.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "accelerated",
		        project_type: "ADA accessibility",
		        description: "Acceleration of LIRR ADA program with stations slated for accessibility upgrades.",
		      }).document_time_status,
		    ).toBe("active");
		    expect(
		      project({
		        status: "Beginning Sep 3",
		        project_type: "signal modernization",
		        description: "Crosstown Line signal modernization; beginning Sep 3 trains resume.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "construction_pushed_to_2025",
		        project_type: "infrastructure_repair",
		        description: "East River Tunnel repair and construction project for tracks damaged by Superstorm Sandy.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "announced",
		        project_type: "bus procurement",
		        description: "Electric bus procurement increase with overhead chargers; first buses expected in late 2022.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "recommended",
		        project_type: "route revision",
		        description: "Revise the B63 travel path in each direction.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "executed",
		        project_type: "short-term access permit",
		        description: "Permit for Town of Cortlandt to use parking lots at Cortlandt Station.",
		      }).document_time_status,
		    ).toBe("implemented");
		    expect(
		      project({
		        status: "reviewed",
		        project_type: "policy code",
		        description: "Policy code originally adopted and revised multiple times; reviewed by the Board.",
		      }).document_time_status,
		    ).toBe("approved");
		    expect(
		      project({
		        status: "reviewed",
		        project_type: "policy directive",
		        description:
		          "All Agency Policy Directive No. 11-041 - Whistleblower Protection; protect MTA employees from retaliation and ensure compliance with applicable law.",
		      }).document_time_status,
		    ).toBe("approved");
		    expect(
		      project({
		        status: "reported",
		        project_type: "service improvement initiative",
		        description: "Initiative for targeted improvements on 28 lower performing routes that will benefit 20% of bus ridership.",
		      }).document_time_status,
		    ).toBe("active");
    expect(
      project({
        project_name: "2025-29 TBTA Capital Plan",
        project_type: "capital plan",
        status: "presented",
        description: "Presented by President Sheridan and C&D SVP/Chief Engineer Joe Keane at the TBTA Committee meeting.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Preteckt",
        project_type: "AI maintenance system",
        status: "discussed",
        description: "Uses Artificial Intelligence to create maintenance repair plans before failures actually occur.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Cracking Down on Toll Evasion",
        status: "listed under Achieve Financial Stability & Viability",
        description: "Achieve Financial Stability & Viability - cracking down on toll evasion.",
      }).document_time_status,
    ).toBe("active");
		    expect(
		      project({
		        status: "committed",
		        project_type: "bus priority infrastructure",
		        description: "Mayor committed to implement 150 miles of new bus lanes and busways.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "Purchase new dual-mode locomotives for LIRR",
		        project_type: "rolling stock",
		        description: "More support for replacing aging railcars and locomotives.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(
		      project({
		        status: "new",
		        project_type: "state of good repair",
		        description: "New $40 million project for state of good repair on the Port Jervis branch.",
		      }).document_time_status,
		    ).toBe("planned");
		    expect(project({ status: "approval", description: "General approval note." }).document_time_status).toBe("other");
		    expect(project({ status: "ratification", description: "General ratification note." }).document_time_status).toBe("other");
		    expect(project({ status: "reviewed", description: "General policy review." }).document_time_status).toBe("other");
		    expect(project({ status: "reported", description: "General reported initiative." }).document_time_status).toBe("other");
    expect(project({ status: "presented", project_type: "capital plan", description: "Generic capital plan presentation." }).document_time_status).toBe("other");
    expect(project({ status: "discussed", project_type: "AI maintenance system", description: "Generic AI discussion." }).document_time_status).toBe("other");
		    expect(project({ status: "launching", description: "Select Bus Service launching next month." }).document_time_status).toBe("other");
	    expect(project({ status: "weekend of May 17-18, 2025", description: "General weekend date." }).document_time_status).toBe("other");
	    expect(project({ status: "substantial completion anticipated Fall 2024" }).document_time_status).toBe("other");
	    expect(project({ status: "construction_pushed_to_2025" }).document_time_status).toBe("other");
	    expect(project({ status: "various completion percentages" }).document_time_status).toBe("other");
	  });

  it("maps payload-proven missing document-time status buckets without generic defaults", () => {
    expect(
      project({
        project_type: "grant authorization",
        description: "Secure Board approval to file for and accept Federal grants for Federal Fiscal Year 2024.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "procurement",
        description: "LIRR seeks Board approval for a public works contract to Sperry Rail for Rail Flaw Testing and Joint Bar Inspection services.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "procurement",
        description: "Metro-North requested Board to declare competitive bidding impractical and authorize a competitive RFP to procure coach cars.",
      }).document_time_status,
	    ).toBe("planned");
    expect(
      project({
        project_name: "Fordham Road Bus Lane Redesign Initiative",
        project_type: "bus_lane_redesign",
        project_family: "bus_lane",
        description: "Update on the Fordham Road Bus Lane Redesign initiative in the Bronx, N.Y. provided by President Richard Davey, NYCT",
      }).document_time_status,
    ).toBe("active");
	    expect(
	      project({
	        project_name: "Fordham Plaza Project",
	        project_type: "plaza project",
        description: "E 189th will become one-way WB as part of the Fordham Plaza project.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Long Island Rail Road Queens Interlocking Signal System Project",
        project_type: "design-build",
        description: "Contract 6398 will upgrade the LIRR Queens Interlocking Signal System.",
      }).document_time_status,
    ).toBe("planned");
    expect(project({ project_name: "Ordering New Rail Cars", project_type: "procurement", description: "Ordering new rail cars." }).document_time_status).toBe(
      "planned",
	    );
	    expect(project({ project_name: "Fordham Plaza Project", project_type: "plaza project", description: "General plaza project." }).document_time_status).toBeUndefined();
    expect(
      project({
        project_name: "Fordham Road Bus Lane Redesign Initiative",
        project_type: "bus_lane_redesign",
        project_family: "bus_lane",
        description: "General Fordham Road bus lane redesign note.",
      }).document_time_status,
    ).toBeUndefined();

	    expect(
	      project({
        project_type: "contract modification",
        description: "Five-year extension of contract for GRC System SaaS and technical support.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "real estate disposition",
        description: "Authorization to convey fee simple title of 2.41 acres to New York State Parks.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "contract_option_exercise",
        description: "Exercise of Option 1 for 640 additional subway cars under the procurement contract.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "grant-funded safety improvement",
        description: "2020 FHWA/CARSI Grant - Grade Crossing Safety Improvements at 9 MNR crossings - $22M.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "LIRR capital project",
        description: "Work at Penn Station funded by $15 million in additional FRA grant funding.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "accessibility project",
        description: "Section 130 Grants funded grade crossing safety improvements.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Local Law 195 of 2019",
        project_type: "legislation",
        project_family: "legislation",
        description: "Required DOT to construct 150 miles of protected bus lanes. Codified as NYC Administrative Code section 19-199.1.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "resiliency",
        project_family: "capital_or_infrastructure",
        description: "Funding for new projects to mitigate flash floods and extreme weather on the subway system.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "accessibility improvement",
        project_family: "accessibility_or_safety",
        description: "Funding to support Bridges and Tunnels efforts to improve access for bicyclists and pedestrians.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Grand Central Terminal Train Shed and Park Avenue Viaduct Work",
        project_type: "infrastructure improvement",
        description: "Work on Grand Central Terminal Train Shed and Park Avenue Viaduct.",
        _merged_field_values: {
          description: [
            "Sector 1 is under construction, focusing on complete replacement of approximately 70,000 square feet over the Upper Level of the Train Shed.",
          ],
        },
      }).document_time_status,
    ).toBe("under_construction");
    expect(
      project({
        project_name: "Grand Central Terminal Train Shed and Park Avenue Viaduct Work",
        project_type: "infrastructure improvement",
        description: "Work on Grand Central Terminal Train Shed and Park Avenue Viaduct.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_type: "grant program",
        project_family: "finance_or_funding",
        description: "$573M available FFY 2022, maximum state award ~$115M.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_type: "network_expansion",
        project_family: "capital_or_infrastructure",
        description: "Federal request of $373.70 million for FFY 2026.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_type: "legislation",
        description: "General legislation discussion.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_name: "TBTA Payroll Mobility Tax Senior Lien Refunding Green Bonds Series 2024B and Bond Anticipation Notes Series 2024C",
        project_type: "bond issuance",
        project_family: "finance_or_funding",
        description: "In May 2024, MTA expects to issue TBTA Payroll Mobility Tax bonds.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "bond issuance",
        project_family: "finance_or_funding",
        description: "Bond issuance summary.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_name: "Purchase of 475 Battery-Electric Buses",
        project_type: "bus procurement",
        project_family: "capital_or_infrastructure",
        description: "Net increase of $22 million based on bid results for purchase of 475 battery-electric buses.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Purchase 92 Express Buses",
        project_type: "bus procurement",
        project_family: "capital_or_infrastructure",
        description: "Increase of $47.2 million based on the most recent estimates.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Purchase of 475 Battery-Electric Buses",
        project_type: "bus procurement",
        description: "Net increase of $22 million based on bid results for purchase of 475 battery-electric buses.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Purchase 92 Express Buses",
        project_type: "bus procurement",
        description: "Increase of $47.2 million based on the most recent estimates.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "bus procurement",
        project_family: "capital_or_infrastructure",
        description: "Bus procurement update.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_type: "ADA accessibility",
        description: "Temporary access agreement with a property owner for access to property adjacent to a subway station in connection with the ADA Elevator Project.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "maintenance contract",
        description: "Maintenance and support services for the MTA Bus Camera Security System.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "procurement",
        description: "Five-year sole source contract with Plasser American Corporation for replacement parts, repair services, troubleshooting, and training for Maintenance-of-Way equipment.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "bus service contract",
        description: "Fixed-route scheduled feeder bus service operated between MNR stations and surrounding neighborhoods. Contract modification for final three-year option.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "capital project",
        description: "Contract with FOS Development Corporation for concrete and steel repairs in the tunnel.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "procurement and installation",
        description: "Noncompetitive contract to Scheidt & Bachmann USA to replace and upgrade fare collection solution.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "operations and maintenance contract",
        description: "Contract to George S. Hall, Inc. for operation and maintenance of Grand Central Madison Concourse.",
      }).document_time_status,
    ).toBe("approved");

    expect(project({ project_type: "safety campaign", description: "Campaign launched to prevent subway surfing fatalities." }).document_time_status).toBe(
      "implemented",
    );
    expect(project({ project_type: "infrastructure", description: "Platform heating systems installed at New Hyde Park as part of the 3rd Track Project." }).document_time_status).toBe(
      "implemented",
    );
    expect(project({ project_type: "service_frequency_increase", description: "First round of off-peak service frequency increases took effect on the G, J, and M lines." }).document_time_status).toBe(
      "implemented",
    );
    expect(
      project({
        project_name: "A Shuttle",
        project_type: "shuttle",
        description: "Shuttle bus project where supervisors ensured customer service.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_name: "University Ave/EL Grant Dedicated Bus Lane",
        project_type: "Dedicated Bus Lane",
        project_family: "bus_lane",
        description: "Dedicated bus lane and bus boarding islands project in the Bronx.",
      }).document_time_status,
    ).toBe("implemented");
    expect(project({ project_type: "shuttle", description: "Shuttle bus project supervision." }).document_time_status).toBeUndefined();

    expect(project({ project_type: "tolling program", description: "Developing CBDT toll structure and preparing the MTA for Central Business District Tolling." }).document_time_status).toBe(
      "active",
    );
    expect(project({ project_type: "shuttle service", description: "Supplemental shuttle bus services put in place in October 2020, expected to continue through contract term." }).document_time_status).toBe(
      "active",
    );
    expect(project({ project_type: "program", description: "Progress being made with the ABLE camera program." }).document_time_status).toBe("active");
    expect(
      project({
        project_name: "Beacon Track 3 Platform Restoration",
        project_type: "infrastructure restoration",
        project_family: "capital_or_infrastructure",
        description: "Restoration of the Track 3 Beacon Station platform, including restored platform surface and new ADA-compliant ramp.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "infrastructure restoration",
        project_family: "capital_or_infrastructure",
        description: "Restoration of a platform surface and new ADA-compliant ramp.",
      }).document_time_status,
    ).toBeUndefined();

    expect(
      project({
        project_type: "signal_modernization",
        description: "Signal modernization contractual needs estimated at $23 million annually starting in 2026.",
      }).document_time_status,
    ).toBe("planned");
    expect(project({ project_name: "Co-op City Station", project_type: "station", description: "Future Co-op City Station as part of Penn Station Access." }).document_time_status).toBe(
      "planned",
    );
    expect(project({ project_type: "bus and safety improvements", description: "DOT will reconstruct Woodhaven Boulevard and implement bus and safety improvements." }).document_time_status).toBe(
      "planned",
    );
    expect(project({ project_type: "curb regulation changes", description: "Proposed curb regulation changes on 126th Street." }).document_time_status).toBe("planned");
    expect(project({ project_type: "centralized service", description: "A centralized call center proposed to deliver a One MTA customer experience." }).document_time_status).toBe(
      "planned",
    );
    expect(project({ project_type: "legislative proposal", description: "A legislative proposal for five fare-free bus routes." }).document_time_status).toBe("planned");
    expect(
      project({
        project_type: "ADA accessibility",
        project_family: "accessibility_or_safety",
        description: "ADA accessibility project at 168 St station; value engineering identified utilization of existing ventilation shaft.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "ADA accessibility",
        project_family: "accessibility_or_safety",
        description: "Zoning For Accessibility project at 57th St station; developer building accessible entrance at no cost to MTA.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Platform Components at 43 Stations",
        project_type: "ADA accessibility",
        project_family: "accessibility_or_safety",
        description: "MTA's first P3 package of ADA stations and first Progressive Design Build to bring 43 stations into state of good repair.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_type: "accessibility project",
        description: "Success story project at Floral Park station on Long Island Rail Road, featuring a ribbon-cutting ceremony.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_type: "station renewal",
        description: "Success story project renewing the White Plains station on Metro-North Railroad.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_type: "operating efficiency program",
        project_family: "internal_operations",
        status: "identified",
        description: "MTA committed to saving $500 million in recurring operating costs, starting with $100 million 2023.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "operating efficiency initiative",
        project_family: "internal_operations",
        description: "Install cameras on 700 additional buses.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "operating efficiency initiative",
        project_family: "internal_operations",
        description: "Develop work standards that will optimize work and increase inspection throughput.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "technology_platform",
        description: "Standardizes inspection protocols, enabling real-time reporting of hazards such as scaffold integrity and traffic control compliance.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "safety_program",
        description: "Collaborated with Station Operations to implement a proactive voluntary stretching initiative aimed at reducing overexertion injuries.",
      }).document_time_status,
    ).toBe("implemented");
    expect(project({ project_type: "public_outreach_program", description: "Program providing opportunities for MNR to educate riders and the public." }).document_time_status).toBe(
      "active",
    );
    expect(project({ project_type: "internal dispatching application", description: "Application supports bus operations and bus management." }).document_time_status).toBe("active");
    expect(project({ project_type: "customer survey", description: "Biannual online Customers Count survey conducted last two weeks of May." }).document_time_status).toBe(
      "implemented",
    );
    expect(project({ project_name: "Tremont Av Safety Project", project_type: "safety", description: "Safety project on Tremont Avenue conducted in 2016." }).document_time_status).toBe(
      "implemented",
    );
    expect(
      project({
        project_type: "infrastructure",
        description: "Includes replacement or rehabilitation of 22 bridges; one LIRR mainline bridge was fully replaced at end of October 2023.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_type: "engineering control",
        project_family: "other",
        description: "Engineering control initiative achieving 75% reduction in vehicular collisions.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_type: "engineering control",
        description: "Engineering control initiative achieving 30% reduction in vehicular collisions.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_type: "station renovation",
        description: "29 stations renovated so far, on pace to complete 50 by end of 2023.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Partnership for Inclusive Internships (PII) program",
        project_type: "internship program",
        description: "New paid internship program; first group of six summer interns hosted.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Jamaica OTP Task Force",
        project_type: "performance improvement",
        description: "A dedicated task force established to improve Jamaica on-time performance.",
      }).document_time_status,
    ).toBe("active");
    expect(project({ project_name: "Bronx Ambassadors Program", project_type: "customer service program", description: "Return of the Bronx Ambassadors Program." }).document_time_status).toBe(
      "active",
    );
    expect(
      project({
        project_name: "Grand Central Madison Weekend Contractor Maintenance",
        project_type: "maintenance",
        description: "Weekend contractor maintenance at Grand Central Madison with one of two main tracks out of service.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Subway Cell Connectivity",
        description: "Partnership with Boldyn Networks to bring continuous cell connectivity; Times Square Shuttle completely connected.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Park Avenue Viaduct Job Fair",
        project_type: "community event",
        description: "Metro-North partnered with workforce organizations to host a job fair and connected East Harlem community members with construction jobs.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_name: "Governor Hochul's Transparency Initiative",
        project_type: "executive initiative",
        description: "Renewed commitment to transparency and accountability through open data, memorialized in the MTA's published Transparency Plan.",
      }).document_time_status,
    ).toBe("implemented");
    expect(
      project({
        project_name: "MTA Open Data Update",
        project_type: "data initiative",
        description: "MTA Open Data Update - daily ridership data for MTA bus and subway lines.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Platform Barriers Project",
        project_type: "safety initiative",
        project_family: "accessibility_or_safety",
        description: "New safety-focused platform barrier initiative to install static platform barriers at select stations systemwide.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Track Trespassing Initiatives",
        project_type: "safety initiative",
        project_family: "accessibility_or_safety",
        description: "Funding for Track Trespassing Task Force including Platform Screen Doors pilot and Track Intrusion Detection Systems.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Station Accessibility (ADA)",
        project_type: "accessibility",
        project_family: "accessibility_or_safety",
        description: "Making subway stations accessible per a legal settlement, including new elevator and ramp installations and other accessibility features.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "MTA Accessibility Expansion",
        project_type: "ADA accessibility",
        project_family: "accessibility_or_safety",
        description: "Announcing New ADA Stations - MTA Accessibility Expansion program.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "NYCT Atlantic Cable Shop Relocation",
        project_type: "relocation",
        project_family: "real_estate_or_property",
        description: "A lease with Generation Next Realty, Inc. for the relocation of the NYCT Atlantic Cable Shop to 2016 Pitkin Avenue in Brooklyn.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Automotive Fueling Station Project",
        project_type: "fueling_station",
        description: "Acquisition of 4 Fisher Lane from 4 Fisher Lane Realty Co., LLC in support of the Automotive Fueling Station project in North White Plains, NY.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Harlem and Hudson Power Improvements",
        project_type: "infrastructure",
        description: "Acquisition of property interests for construction, operation, maintenance and access to a new electrical substation.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_name: "Saturday Summer Savings",
        project_type: "discount program",
        project_family: "fare_program",
        description:
          "Each Saturday in July and August, monthly ticket holders can travel anywhere the LIRR goes. Promotional $1.00 tickets can be purchased via the TrainTime app.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Saturday Summer Savings",
        project_type: "discount program",
        project_family: "fare_program",
        description:
          "Each Saturday in July and August, monthly ticket holders can travel anywhere the LIRR goes. The promotional $1 tickets can be purchased via the TrainTime app.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Verrazzano-Narrows Bridge Approach Construction (VN 84)",
        project_type: "capital construction",
        project_family: "capital_or_infrastructure",
        description: "Construction on approaches to the Verrazzano-Narrows Bridge, eligible for reimbursement from capital program.",
      }).document_time_status,
    ).toBe("under_construction");
    expect(
      project({
        project_name: "Contact Center as a Service",
        project_type: "IT services",
        project_family: "technology_system",
        description: "Expansion of MTA implementation of Contact Center as a Service to NYC Transit's Paratransit Department.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Fordham Plaza Redevelopment",
        project_type: "redevelopment",
        project_family: "capital_or_infrastructure",
        description: "Redevelopment adding 250,000 square feet of office space and a proposed charter school. Includes a bus only street.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Congestion Relief Projects Moving Forward",
        project_type: "program",
        description: "Congestion relief projects moving forward.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "A Line initiative",
        project_type: "improvement_initiative",
        description: "Strategies and improvements regarding the A Line discussed by Demetrius Crichlow, Senior Vice President, Subways.",
      }).document_time_status,
    ).toBe("active");
	    expect(
	      project({
	        project_name: "Additional NYCT Initiatives",
	        project_type: "operating efficiency initiative",
	        project_family: "internal_operations",
	        description: "16 additional initiatives detailed in financial plan.",
	      }).document_time_status,
	    ).toBe("active");
    expect(
      project({
        project_name: "Additional NYCT Initiatives",
        project_type: "operating efficiency initiative",
        project_family: "other",
        description: "16 additional initiatives detailed in financial plan.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Optimize Overtime Utilization",
        project_type: "operating efficiency initiative",
        description: "Range of strategies including enforcement of existing timekeeping rules and reduction of overtime in targeted right areas.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Paratransit Vehicle Surveillance Camera System",
        project_type: "safety equipment",
        description: "Outfit 1,188 Paratransit vehicles with an on-board vehicle surveillance camera system and cloud video storage.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Eagle Teams Expansion",
        project_type: "fare enforcement",
        description: "Expansion of Eagle Teams to provide fare validation and enforcement as recommended by the Fare Evasion Blue Ribbon Panel.",
      }).document_time_status,
    ).toBe("planned");
    expect(project({ project_name: "Transforming Jamaica", description: "Transforming Jamaica - Take the Survey Online." }).document_time_status).toBe(
      "study",
    );
    expect(
      project({
        project_name: "NYC DOT Brooklyn Bus Priority Corridors",
        project_type: "bus priority corridors",
        project_family: "bus_priority",
        description:
          "17 priority corridors identified in Brooklyn as part of the Brooklyn Bus Network Redesign. MTA and NYC DOT coordinating to improve the Brooklyn bus network.",
      }).document_time_status,
    ).toBe("planned");
    expect(
      project({
        project_name: "Westbound Bypass",
        project_type: "network_expansion",
        description: "Other Network Expansion project. Federal request of $373.70 million for FFY 2026.",
      }).document_time_status,
    ).toBe("planned");
    for (const [project_name, project_type] of [
      ["Concrete Tie Installation and Rail Replacement on the Main Line", "track work"],
      ["Switch Installation near Floral Park", "track work"],
      ["Van Wyck Bridge Waterproofing", "maintenance"],
      ["ADA Station Rehabilitation at Forest Hills Stations", "rehabilitation"],
      ["ADA Station Rehabilitation at Hollis Station", "rehabilitation"],
      ["ADA Station Reconstruction on the Montauk Branch", "rehabilitation"],
      ["Signal Construction and Maintenance between Jamaica and Queens Village", "infrastructure"],
      ["Valley Stream Station Rehabilitation", "rehabilitation"],
    ]) {
      expect(
        project({
          project_name,
          project_type,
          description: `${project_name} in scheduled capital-program materials.`,
        }).document_time_status,
      ).toBe("planned");
    }
    expect(
      project({
        project_name: "Connecticut Track Program",
        project_type: "capital",
        project_family: "capital_or_infrastructure",
        description: "Capital track program on the New Haven Line in Connecticut with lower than expected project activity.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Harmon to Poughkeepsie Signal System Project",
        project_type: "capital",
        project_family: "capital_or_infrastructure",
        description: "Capital project on the Hudson Line with lower than expected project activity.",
      }).document_time_status,
    ).toBe("active");

    expect(project({ project_type: "ADA accessibility", description: "Generic accessibility project." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "ADA accessibility", project_family: "accessibility_or_safety", description: "Generic accessibility project." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "operating efficiency initiative", description: "Generic operating efficiency initiative." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "operating efficiency initiative", description: "16 additional initiatives detailed in financial plan." }).document_time_status).toBeUndefined();
    expect(project({ project_name: "Additional Initiatives", project_type: "operating efficiency initiative", description: "16 additional initiatives detailed in financial plan." }).document_time_status).toBeUndefined();
    expect(
      project({
        project_name: "A Line initiative",
        project_type: "improvement_initiative",
        description: "Strategies and improvements regarding the A Line were discussed.",
      }).document_time_status,
    ).toBeUndefined();
    expect(project({ project_type: "technology platform", description: "Generic technology platform." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "station renewal", description: "Station renewal discussed in committee materials." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "contract", description: "General contract for services." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "contract", description: "Generic contract extension discussion without actual extension terms." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "capital project", description: "Signal replacement is part of a multi-year design-build contract." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "grant program", description: "Federal grant program available for FFY 2022." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "proposal", description: "Proposal not implemented." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "customer survey", description: "Generic customer survey." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "safety", description: "Safety project conducted by staff." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "maintenance", description: "Weekend contractor maintenance with one of two main tracks out of service." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "capital construction", description: "General bridge construction summary." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "IT services", description: "General contact center implementation." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "redevelopment", description: "General redevelopment project." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "engineering control", description: "Engineering control initiative for operating procedures." }).document_time_status).toBeUndefined();
    expect(
      project({
        project_type: "competitive procurement",
        description: "Best-and-final offer after negotiations, a 17% reduction from initial cost proposal.",
      }).document_time_status,
    ).toBeUndefined();
    expect(project({ project_type: "community event", description: "Generic job fair." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "executive initiative", description: "Transparency plan discussion." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "data initiative", description: "Open data portal discussion." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "safety initiative", description: "New project will be considered." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "safety initiative", description: "Track trespassing initiative discussion." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "ADA accessibility", description: "Announcing accessibility goals." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "relocation", project_family: "real_estate_or_property", description: "Generic relocation lease." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "fueling_station", description: "Generic fueling station acquisition." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "discount program", project_family: "fare_program", description: "Generic discount program." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "program", description: "Generic program moving forward." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "safety equipment", description: "Generic camera system." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "fare enforcement", description: "Generic Eagle Teams discussion." }).document_time_status).toBeUndefined();
    expect(project({ project_name: "Transforming Somewhere", description: "Take the Survey Online." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "network_expansion", description: "Federal request for future expansion." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "track work", project_family: "capital_or_infrastructure", description: "Generic track work." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "rehabilitation", project_family: "capital_or_infrastructure", description: "Generic rehabilitation." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "maintenance", project_family: "capital_or_infrastructure", description: "Generic bridge waterproofing." }).document_time_status).toBeUndefined();
    expect(
      project({
        project_name: "Connecticut Track Program",
        project_type: "capital",
        project_family: "capital_or_infrastructure",
        description: "Generic capital track program.",
      }).document_time_status,
    ).toBeUndefined();
    expect(
      project({
        project_type: "capital",
        project_family: "capital_or_infrastructure",
        description: "Lower than expected capital spending.",
      }).document_time_status,
    ).toBeUndefined();
    expect(project({ status: "presented" }).document_time_status).toBe("other");
    expect(
      project({
        project_name: "Concourse Line Structural Work",
        project_type: "construction",
        status: "presented",
        document_time_status: "other",
        description: "Construction work on the B and D subway lines with associated service changes.",
      }).document_time_status,
    ).toBe("under_construction");
    expect(project({ status: "reported" }).document_time_status).toBe("other");
    expect(project({ status: "discussed" }).document_time_status).toBe("other");
  });

	  it("normalizes active and implemented status literals beyond the first-pass vocabulary", () => {
    expect(project({ status: "in progress" }).document_time_status).toBe("active");
    expect(project({ status: "underway" }).document_time_status).toBe("active");
    expect(project({ status: "launched" }).document_time_status).toBe("implemented");
    expect(project({ status: "substantially complete" }).document_time_status).toBe("implemented");
    expect(project({ status: "In Construction (11% complete)" }).document_time_status).toBe("under_construction");
    expect(project({ status: "construction commenced January 2022, street level demolition began January 17, 2023" }).document_time_status).toBe("under_construction");
    expect(project({ status: "early construction stages" }).document_time_status).toBe("under_construction");
    expect(project({ status: "groundbreaking" }).document_time_status).toBe("under_construction");
    expect(project({ status: "groundbreaking occurred April 3, 2025" }).document_time_status).toBe("under_construction");
    expect(project({ status: "about to begin work" }).document_time_status).toBe("under_construction");
    expect(project({ status: "begun" }).document_time_status).toBe("under_construction");
    expect(project({ status: "75% complete" }).document_time_status).toBe("active");
    expect(project({ status: "0% complete" }).document_time_status).toBe("active");
    expect(project({ status: "100% complete" }).document_time_status).toBe("implemented");
    expect(project({ status: "nearing completion" }).document_time_status).toBe("active");
    expect(project({ status: "nearing substantial completion" }).document_time_status).toBe("active");
    expect(project({ status: "wrapping up" }).document_time_status).toBe("active");
    expect(project({ status: "wrapping up (as of March 2021)" }).document_time_status).toBe("active");
    expect(project({ status: "finishing up" }).document_time_status).toBe("active");
    expect(project({ status: "in development" }).document_time_status).toBe("active");
    expect(project({ status: "in development/roll-out" }).document_time_status).toBe("active");
    expect(project({ status: "in procurement" }).document_time_status).toBe("active");
    expect(project({ status: "on schedule and on budget" }).document_time_status).toBe("active");
    expect(project({ status: "on-going" }).document_time_status).toBe("active");
    expect(project({ status: "early phase" }).document_time_status).toBe("active");
    expect(project({ status: "in its early stages" }).document_time_status).toBe("active");
    expect(project({ status: "kick-off" }).document_time_status).toBe("active");
    expect(project({ status: "Moving forward" }).document_time_status).toBe("active");
    expect(project({ status: "phasing in early 2023" }).document_time_status).toBe("active");
    expect(project({ status: "Project completion slated for July 2023, currently in last phase of construction" }).document_time_status).toBe("active");
    expect(project({ status: "property acquisition phase" }).document_time_status).toBe("active");
    expect(project({ status: "Restart station reconstruction and ADA upgrades at Hollis LIRR; procurement for subway station renewals at Briarwood EF" }).document_time_status).toBe(
      "active",
    );
    expect(project({ status: "Resume procurements on Verrazzano-Narrows Bridge ramp reconstruction and main cable dehumidification" }).document_time_status).toBe("active");
    expect(project({ status: "service restored September 3, 2024; continues until Q3 2027" }).document_time_status).toBe("active");
    expect(project({ status: "scaling up" }).document_time_status).toBe("active");
    expect(project({ status: "expanding" }).document_time_status).toBe("active");
    expect(project({ status: "extended" }).document_time_status).toBe("active");
    expect(project({ status: "supported during this timetable" }).document_time_status).toBe("active");
    expect(project({ status: "supported during this timetable to improve state of good repair and reliability" }).document_time_status).toBe("active");
    expect(project({ status: "partially in service" }).document_time_status).toBe("active");
    expect(project({ status: "testing" }).document_time_status).toBe("active");
    expect(project({ status: "Refabricated track components have been delivered and installation is progressing" }).document_time_status).toBe("active");
    expect(project({ status: "nearing end of civil work, now focused on installing track and systems while finishing stations" }).document_time_status).toBe("active");
    expect(project({ status: "implementation started January 2024" }).document_time_status).toBe("active");
    expect(project({ status: "draft" }).document_time_status).toBe("study");
    expect(project({ status: "draft proposal" }).document_time_status).toBe("study");
    expect(project({ status: "concept phase" }).document_time_status).toBe("study");
    expect(project({ status: "Conceptual" }).document_time_status).toBe("study");
    expect(project({ status: "Design" }).document_time_status).toBe("study");
    expect(project({ status: "design phase" }).document_time_status).toBe("study");
    expect(project({ status: "In design" }).document_time_status).toBe("study");
    expect(project({ status: "in design phase" }).document_time_status).toBe("study");
    expect(project({ status: "In final stages of design" }).document_time_status).toBe("study");
    expect(project({ status: "pre-implementation" }).document_time_status).toBe("study");
    expect(project({ status: "public workshop" }).document_time_status).toBe("study");
    expect(project({ status: "public workshop conducted" }).document_time_status).toBe("study");
    expect(project({ status: "outreach" }).document_time_status).toBe("study");
    expect(project({ status: "hearings" }).document_time_status).toBe("study");
    expect(project({ status: "existing conditions" }).document_time_status).toBe("study");
    expect(project({ status: "Existing Conditions Meeting" }).document_time_status).toBe("study");
    expect(project({ status: "Scoping" }).document_time_status).toBe("study");
    expect(project({ status: "in service" }).document_time_status).toBe("implemented");
    expect(project({ status: "fully back in service" }).document_time_status).toBe("implemented");
    expect(project({ status: "Closed out" }).document_time_status).toBe("implemented");
    expect(project({ status: "concluded" }).document_time_status).toBe("implemented");
    expect(project({ status: "deployed April 2026" }).document_time_status).toBe("implemented");
    expect(project({ status: "Existing" }).document_time_status).toBe("implemented");
    expect(project({ status: "expanded" }).document_time_status).toBe("implemented");
    expect(project({ status: "expanded beyond GCT to North White Plains" }).document_time_status).toBe("implemented");
    expect(project({ status: "expanded from 7 to 45 locations" }).document_time_status).toBe("implemented");
    expect(project({ status: "live" }).document_time_status).toBe("implemented");
    expect(project({ status: "post-implementation evaluation" }).document_time_status).toBe("implemented");
    expect(project({ status: "superseded" }).document_time_status).toBe("implemented");
    expect(project({ status: "All trains operating with full PTC functionality" }).document_time_status).toBe("implemented");
    expect(project({ status: "Deployed, successfully used during two past snow events" }).document_time_status).toBe("implemented");
    expect(project({ status: "substantial completion" }).document_time_status).toBe("implemented");
    expect(project({ status: "substantial completion at end of January 2023" }).document_time_status).toBe("implemented");
    expect(project({ status: "implementation" }).document_time_status).toBe("active");
    expect(project({ status: "expanding to 27 additional platforms" }).document_time_status).toBe("active");
    expect(project({ status: "on hold" }).document_time_status).toBe("stalled_resuming");
    expect(project({ status: "work stopped and suspended after incident on March 13, 2021" }).document_time_status).toBe("stalled_resuming");
    expect(project({ status: "various completion percentages" }).document_time_status).toBe("other");
    expect(project({ status: "completion goal" }).document_time_status).toBe("other");
    expect(project({ status: "substantial completion anticipated Fall 2024" }).document_time_status).toBe("other");
    expect(project({ status: "launching" }).document_time_status).toBe("other");
    expect(project({ status: "executed" }).document_time_status).toBe("other");
    expect(project({ status: "reviewed" }).document_time_status).toBe("other");
    expect(project({ status: "presented" }).document_time_status).toBe("other");
	    expect(project({ status: "Annual Update" }).document_time_status).toBe("other");
	    expect(project({ status: "beginning" }).document_time_status).toBe("other");
	    expect(project({ status: "Beginning Sep 3" }).document_time_status).toBe("other");
	    expect(project({ status: "construction pushed to 2025" }).document_time_status).toBe("other");
    expect(project({ project_type: "pilot", description: "Pilot of 2-gate Wide Aisle Gate." }).document_time_status).toBe("pilot");
    expect(project({ project_type: "pilot program", description: "One-year pilot license for bike storage." }).document_time_status).toBe("pilot");
    expect(project({ project_type: "fare pilot program", description: "Temporary fare pilot promotions." }).document_time_status).toBe("pilot");
    expect(project({ description: "Pilot program started in July 2023." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "initiative", project_family: "pilot", description: "Includes pilot programs in ten communities." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "safety initiative", description: "Includes Platform Screen Doors pilot." }).document_time_status).toBeUndefined();
    expect(project({ status: "ongoing", project_type: "pilot" }).document_time_status).toBe("active");
	  });

  it("normalizes pending award and approval status literals as planned", () => {
    expect(project({ project_type: "design-build accessibility upgrades", description: "Contract awarded for accessibility upgrades at eight stations." }).document_time_status).toBe(
      "approved",
    );
    expect(project({ project_type: "licensing program", description: "Board approved extension of the Grand Central Terminal retail license." }).document_time_status).toBe(
      "approved",
    );
    expect(project({ project_type: "procurement", description: "Ratification of awards for ABLE Systems procurement contract." }).document_time_status).toBe("approved");
    expect(project({ project_type: "procurement ratification", description: "Ratification of Immediate Operating Need for paratransit vehicle purchase." }).document_time_status).toBe(
      "approved",
    );
    expect(project({ project_type: "rolling stock procurement", description: "Contracted for acquisition of dual-mode locomotives." }).document_time_status).toBe("approved");
    expect(project({ project_type: "bus_procurement", description: "Award of purchase contract B40715 for procurement of 224 buses." }).document_time_status).toBe(
      "approved",
    );
    expect(
      project({
        project_type: "procurement_contract",
        description: "Award of an estimated quantity purchase contract for as-needed supply and delivery of office supplies.",
      }).document_time_status,
    ).toBe("approved");
    expect(
      project({
        project_type: "infrastructure maintenance",
        description: "Bridge painting work for state of good repair. Construction commenced December 2022, substantial completion slated for December 2026.",
      }).document_time_status,
    ).toBe("under_construction");
    expect(project({ description: "Flood protection work at the Corona Substation building; work began in December 2023 and anticipated completion in Q2 2024." }).document_time_status).toBe(
      "under_construction",
    );
    expect(
      project({
        project_type: "Track Maintenance",
        description: "Track maintenance project supported during the March 4, 2024 - May 19, 2024 timetable period.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "Crossing Renewal",
        description: "Crossing renewal track work program during the March 2024 timetable period.",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_type: "signalization",
        description: "Signalization project from Babylon to Patchogue supported during the September 5, 2023 timetable.",
      }).document_time_status,
    ).toBe("active");
    expect(project({ project_type: "capital improvement", description: "Project supported by scheduled bus services." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "track work", description: "Track work program." }).document_time_status).toBeUndefined();
    expect(project({ description: "Pilot program started in July 2023." }).document_time_status).toBeUndefined();
    expect(project({ description: "DOT will reconstruct the corridor." }).document_time_status).toBeUndefined();
    expect(project({ description: "Award of purchase contract; request for approval by the Board." }).document_time_status).toBeUndefined();
    expect(project({ description: "Campaign initiative launched for customers." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "procurement", description: "Award recommended for Board approval for a bus procurement contract." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "procurement", description: "Board approval requested for contract award." }).document_time_status).toBeUndefined();
    expect(project({ project_type: "procurement", description: "Request for approval for award of a purchase contract." }).document_time_status).toBeUndefined();
    expect(project({ status: "pending award" }).document_time_status).toBe("planned");
    expect(project({ status: "Award pending Board approval December 2022" }).document_time_status).toBe("planned");
    expect(project({ status: "pending MTA Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "submitted for MTA Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "requesting Board approval to award contract" }).document_time_status).toBe("planned");
    expect(project({ status: "award recommended" }).document_time_status).toBe("planned");
    expect(project({ status: "award recommended for Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "Board approval to award" }).document_time_status).toBe("planned");
    expect(project({ status: "committee recommended Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "ratification requested" }).document_time_status).toBe("planned");
    expect(project({ status: "RFP" }).document_time_status).toBe("planned");
    expect(project({ status: "RFP pending" }).document_time_status).toBe("planned");
    expect(project({ status: "RFP released" }).document_time_status).toBe("planned");
    expect(project({ status: "pending RFP authorization" }).document_time_status).toBe("planned");
    expect(project({ status: "recommended for approval" }).document_time_status).toBe("planned");
    expect(project({ status: "recommended for Board approval" }).document_time_status).toBe("planned");
    expect(project({ status: "under procurement" }).document_time_status).toBe("planned");
    expect(project({ status: "under solicitation" }).document_time_status).toBe("planned");
    expect(project({ status: "public solicitation of bids" }).document_time_status).toBe("planned");
    expect(project({ status: "Packages of already-designed stations to begin procurement" }).document_time_status).toBe("planned");
    expect(project({ status: "In negotiations with multiple developers; selection expected by summer 2021" }).document_time_status).toBe("planned");
    expect(project({ status: "Conditional designation pending" }).document_time_status).toBe("planned");
    expect(project({ status: "CRISI Grant application submitted to FRA" }).document_time_status).toBe("planned");
    expect(project({ status: "future" }).document_time_status).toBe("planned");
    expect(project({ status: "next project to advance" }).document_time_status).toBe("planned");
    expect(project({ status: "upcoming" }).document_time_status).toBe("planned");
    expect(project({ status: "upcoming Q1 2025" }).document_time_status).toBe("planned");
    expect(project({ status: "upcoming six-weekend project spanning July and August" }).document_time_status).toBe("planned");
    expect(project({ status: "Beginning in Q2 2025 through 2027" }).document_time_status).toBe("planned");
    expect(project({ status: "implementation begins Mid-July" }).document_time_status).toBe("planned");
    expect(project({ status: "coming expansion" }).document_time_status).toBe("planned");
    expect(project({ status: "Coming in May 2014" }).document_time_status).toBe("planned");
    expect(project({ status: "work currently anticipated to begin by the second quarter of 2024" }).document_time_status).toBe("planned");
    expect(project({ status: "next steps - upcoming projects" }).document_time_status).toBe("planned");
    expect(project({ status: "transmitted to DDC for design and construction" }).document_time_status).toBe("planned");
    expect(project({ status: "supported during May 2025 timetable" }).document_time_status).toBe("planned");
    expect(project({ status: "expected to open in March 2021" }).document_time_status).toBe("planned");
    expect(project({ status: "forecasted completion March 2024" }).document_time_status).toBe("planned");
    expect(project({ status: "Forecast award December 2022, Substantial completion forecasted December 2024 (on target)" }).document_time_status).toBe("planned");
    expect(project({ status: "Fulton Avenue and South Street Bridges slated to be fully replaced by May 2025" }).document_time_status).toBe("planned");
    expect(project({ project_type: "work plan", project_name: "Approval of 2024 NYCT Committee Work Plan" }).document_time_status).toBe("planned");
	    expect(project({ project_type: "committee work plan", description: "Annual work plan for the Metro-North Railroad Committee." }).document_time_status).toBe(
	      "planned",
	    );
	    expect(project({ project_type: "assessment", project_family: "planning_or_report", description: "Twenty-year needs assessment for the MTA network." }).document_time_status).toBe(
	      "study",
	    );
	    expect(project({ project_type: "needs assessment", project_family: "planning_or_report", description: "Capital needs assessment for 2025-2044." }).document_time_status).toBe(
	      "study",
	    );
	    expect(project({ project_type: "alternatives analysis", project_family: "planning_or_report", description: "Evaluate transit alternatives for the corridor." }).document_time_status).toBe(
	      "study",
	    );
	    expect(project({ project_type: "alternatives analysis", description: "Study to evaluate alternatives for improving crosstown transit service." }).document_time_status).toBe(
	      "study",
	    );
	    expect(project({ project_type: "study", project_family: "planning_or_report", description: "BRT feasibility study." }).document_time_status).toBe("study");
    expect(
      project({
        project_name: "MTA Diversity, Equity & Inclusion Strategic Plan 2025 - 2030",
        project_type: "strategic plan",
        project_family: "planning_or_report",
        description: "MTA in Motion: Leading With Bold Vision and Momentum",
      }).document_time_status,
    ).toBe("active");
    expect(
      project({
        project_name: "Metro-North One",
        project_type: "strategic plan",
        project_family: "planning_or_report",
        description: "Metro-North One is our strategic plan that will carry us to 2033, our 50th anniversary.",
      }).document_time_status,
    ).toBe("active");
	    expect(project({ project_type: "strategic plan", project_family: "planning_or_report", description: "Five-year strategic plan." }).document_time_status).toBeUndefined();
	    expect(project({ project_type: "assessment", description: "General operational review." }).document_time_status).toBeUndefined();
	    expect(project({ status: "recommended" }).document_time_status).toBe("other");
    expect(project({ status: "approval" }).document_time_status).toBe("other");
    expect(project({ status: "ratification" }).document_time_status).toBe("other");
    expect(project({ status: "Ratification of ION declaration and contract award" }).document_time_status).toBe("approved");
    expect(project({ status: "Conditional designation" }).document_time_status).toBe("other");
    expect(project({ status: "Conditional designation of Gotham Organization as selected proposer" }).document_time_status).toBe("other");
    expect(project({ status: "announced" }).document_time_status).toBe("other");
    expect(project({ status: "new" }).document_time_status).toBe("other");
    expect(project({ status: "various completion percentages" }).document_time_status).toBe("other");
    expect(project({ project_type: "work plan" }).document_time_status).toBeUndefined();
    expect(project({ project_type: "program", description: "Annual committee work plan context." }).document_time_status).toBeUndefined();
  });

  it("promotes stale other project companions during replay without replacing concrete values", () => {
    expect(project({ status: "awarded", document_time_status: "other" }).document_time_status).toBe("approved");
    expect(project({ status: "awarded", document_time_status: "planned" }).document_time_status).toBe("planned");
    expect(project({ document_time_status: "construction_began_june_2016_anticipated_completion_summer_2017" }).document_time_status).toBe(
      "under_construction",
    );
    expect(project({ project_type: "busway", project_family: "other" }).project_family).toBe("busway");
    expect(project({ project_type: "busway", project_family: "planning_or_report" }).project_family).toBe("planning_or_report");
    expect(
      project({
        project_name: "Transforming Jamaica",
        description: "Transforming Jamaica - Take the Survey Online",
        document_time_status: "study",
      }).project_family,
    ).toBe("planning_or_report");
    expect(project({ project_name: "Survey Online", description: "Take the Survey Online" }).project_family).toBeUndefined();
  });

  it("maps exact asset SGR, station, track, and signal project types to capital infrastructure", () => {
    expect(project({ project_type: "state of good repair" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station SGR" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge_sgr" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track maintenance" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_name: "A/C Signal Modernization", description: "A/C Signal Modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Communications-Based Train Control for the Queens Boulevard West Line - Phase 1",
        description: "CBTC signaling project on the Queens Boulevard West Line.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal testing", project_name: "Signal Testing East of Jamaica Station" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_name: "63rd St Line Track Reconstruction", description: "Major track reconstruction project between Queens and Manhattan." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_name: "Jamaica Capacity Improvement", description: "Realignment of track, switch installation, and third rail infrastructure." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_name: "Main Line Expansion", description: "Third track work and interlocking reconstruction." }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_name: "Crossing Renewal", description: "Railroad crossing rehabilitation and crossing renewal work." }).project_family).toBe(
      "capital_or_infrastructure",
    );
	    expect(project({ project_name: "Pelham Substation Replacement", description: "Substation replacement connected to the third rail system." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
    expect(project({ project_name: "LED Light Conversion", description: "LED light conversions will start in February for all stations." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_name: "Subway station LED lighting replacement", description: "Replace all 150,000 subway station lights with LEDs." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_name: "Metropolitan Av / Lorimer St elevator project", description: "Opened new elevators at stations, with updated staircases and lighting." }).project_family).toBeUndefined();
    expect(project({ project_name: "LED office lighting procurement", description: "Replace office lights with LEDs." }).project_family).toBeUndefined();
	    expect(project({ project_name: "400 NYCT Hybrid-Electric Buses", description: "Completion goal for 400 NYCT hybrid-electric buses." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
    expect(project({ project_name: "Electric Bus Order", description: "Electric bus order increased from 45 to 60 buses." }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_name: "R211 Open-Gangway Subway Cars", description: "R211 open-gangway subway cars introduced on C and A lines." }).project_family).toBe(
      "capital_or_infrastructure",
    );
	    expect(project({ project_name: "PSA Dual-Mode Locomotives", description: "Design, manufacturing, testing, and delivery of 13 dual-mode locomotives." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(
	      project({
	        project_name: "Joint Track Safety Audit Program",
	        description: "Audits selected work zones for compliance with current NYCT Roadway Worker Protection rules.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_name: "Joint Track Safety Audit Team Expansion",
	        description: "Additional auditors will select audit types based on trend analyses.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_name: "Metro-North Laser Train Technology Adoption",
	        description:
	          "Metro-North will pilot laser train technology at higher speeds to remove leaf debris from tracks. High-pressure rail-washer trains are also used.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(project({ project_name: "Heritage Series Locomotives", description: "Locomotive rebranding and vinyl wrap for heritage series." }).project_family).toBeUndefined();
    expect(project({ project_name: "Locomotive 222 Restoration", description: "Locomotive restoration and inaugural run." }).project_family).toBeUndefined();
    expect(project({ project_name: "Laser Train", description: "Laser train technology adoption." }).project_family).toBeUndefined();
    expect(project({ project_name: "Battery-Electric AAR Pilot", description: "Pilot with battery-electric Access-A-Ride vans and cutaway buses." }).project_family).toBeUndefined();
    expect(project({ project_name: "Joint Track Safety Audit", description: "Joint track safety audit performed by auditors." }).project_family).toBeUndefined();
    expect(project({ project_name: "Harlem Line Track Outage", description: "Planned track outage with shuttle bus services." }).project_family).toBeUndefined();
    expect(project({ project_name: "Track Intrusion Detection", description: "Track intrusion detection system procurement." }).project_family).toBeUndefined();
    expect(project({ project_type: "station improvement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station renovation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station rehabilitation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "ADA station rehabilitation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station renewal" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "roadway widening" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "design-build" }).project_family).toBe("other");
    expect(project({ project_type: "procurement" }).project_family).toBe("other");
    expect(project({ project_type: "roadway maintenance" }).project_family).toBe("other");
    expect(project({ project_type: "program" }).project_family).toBe("other");
    expect(project({ project_type: "license agreement" }).project_family).toBe("real_estate_or_property");
    expect(
      project({
        project_type: "remediation",
        project_name: "Yaphank Landfill Remediation Project",
        description:
          "Investigation and remediation of property in the vicinity of the Town of Brookhaven Landfill including acquisition of temporary and permanent easements on adjacent properties.",
      }).project_family,
    ).toBe("real_estate_or_property");
    expect(project({ project_type: "rehabilitation" }).project_family).toBe("other");
    expect(project({ project_type: "remediation", description: "General remediation cleanup." }).project_family).toBe("other");
    expect(project({ project_type: "operating efficiency initiative" }).project_family).toBe("internal_operations");
    expect(project({ project_name: "Traffic Signal Priority", description: "Transit Signal Priority / TSP project." }).project_family).toBeUndefined();
    expect(project({ project_type: "signal testing", description: "General software signal testing." }).project_family).toBe("other");
  });

  it("maps exact vehicle fleet procurement project types to capital infrastructure without generic procurement broadening", () => {
    expect(project({ project_type: "bus procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "electric bus procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "rolling stock procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "rail car procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "railcar_procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "rolling stock" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "subway car procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "zero-emission bus deployment" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "procurement" }).project_family).toBe("other");
    expect(project({ project_type: "personal service contract" }).project_family).toBe("other");
    expect(project({ project_type: "miscellaneous service contract" }).project_family).toBe("other");
    expect(project({ project_type: "noncompetitive procurement" }).project_family).toBe("other");
    expect(project({ project_type: "procurement modification" }).project_family).toBe("other");
    expect(project({ project_type: "public works contract" }).project_family).toBe("other");
    expect(project({ project_type: "design-build contract" }).project_family).toBe("other");
    expect(project({ project_type: "technology initiative" }).project_family).toBe("technology_system");
    expect(project({ project_type: "technology platform" }).project_family).toBe("technology_system");
    expect(project({ project_type: "procurement guidelines" }).project_family).toBe("policy_program");
    expect(project({ project_type: "procurement guideline update" }).project_family).toBe("other");
    expect(project({ project_type: "challenge", description: "Open Data Challenge using the MTA open data library." }).project_family).toBe("data_program");
    expect(project({ project_type: "challenge", description: "General innovation challenge." }).project_family).toBe("other");
  });

  it("canonicalizes legacy project-family subtypes during replay", () => {
    expect(project({ project_type: "bike lane", project_family: "bike_lane" }).project_family).toBe("bike_facility");
    expect(project({ project_type: "bike boulevard", project_family: "bike_boulevard" }).project_family).toBe("bike_facility");
    expect(project({ project_type: "greenway", project_family: "greenway" }).project_family).toBe("bike_facility");
    expect(project({ project_type: "bus priority corridor", project_family: "bus_priority_corridor" }).project_family).toBe("bus_priority");
    expect(project({ project_type: "transit_signal_priority", project_family: "transit_signal_priority_program" }).project_family).toBe("signal_priority");
    expect(project({ project_type: "transit_signal_priority", project_family: "signal_priority" }).project_family).toBe("signal_priority");
  });

  it("maps generic procurement projects only when payload proves vehicle purchase or delivery", () => {
    expect(project({ project_type: "procurement", description: "Purchase of 135 standard diesel buses and 84 standard hybrid-electric buses." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "procurement", description: "Furnish and Deliver 224 low-floor 60-foot diesel buses from New Flyer." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_type: "procurement",
        description: "Exercise an option for design, manufacturing, testing, and delivery of 13 Dual-Mode Locomotives.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "procurement", description: "Rolling Stock Procurement - Next Generation R211 subway car." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "procurement", description: "Procure coach cars for the Penn Station Access route." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(
	      project({
	        project_type: "RFP procurement",
	        description: "Request for Proposals to solicit and evaluate proposals from railcar manufacturers for procurement of coach cars operating on the PSA route.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "procurement", description: "Exercise an option to purchase additional R252 flatcars and related non-car items." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "procurement", description: "Ordering new rail cars." }).project_family).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement ratification",
	        description: "Ratification of Immediate Operating Need for purchase of 20 Paratransit Ford Cutaway buses and 20 Paratransit Ford Transit vans.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "procurement", description: "Competitively negotiated miscellaneous service contracts for emergency bus services." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "RFP procurement", description: "Request for Proposals for management consulting services." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "Purchase agreement for railcar parts, components, and repair services." }).project_family).toBe(
	      "other",
	    );
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Five-year OEM sole-source contract for window assemblies from Custom Glass Solutions for LIRR, MNR, and NYC Transit.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description:
	          "Purchase agreement for OEM replacement HVAC and propulsion parts with Mitsubishi Electric Power Products, Inc. LIRR on behalf of itself, Metro-North and New York City Transit.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Five-year OEM sole-source contract for lighting parts from Luminator Technology Group for LIRR and MNR.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Original Equipment Manufacturers purchase agreement for M7 Propulsion System Equipment Upgrade Overhaul and Bench Test Equipment.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Wabtec OEM purchase agreement for parts, components, and repair services for railcars, coach cars, locomotives, and subway cars.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Five-year OEM sole-source contract for engineer seats and seating component parts from USSC for LIRR and MNR.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "OEM sole source purchase agreement",
	        description: "Five-year contract for replacement parts from Mitsubishi Electric Power Products as OEM for HVAC and propulsion replacement parts for LIRR M-7, MNR M-7 and M-8 electric railcars, and NYC Transit subway cars.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement - sole-source contract",
	        description: "Five-year estimated quantity contract for sole-source replacement parts from Kawasaki Rail Car for truck components, car body replacement parts, assemblies, and kits for multiple rolling stock fleets.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement/contract award",
	        description: "Replacement of the LIRR AVRM audio visual recording monitoring system on M7 fleets, C3 coaches, Diesel-Electric Dual Mode 30, and the M3 fleet, totaling 1,087 railcars.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "procurement", description: "OEM purchase agreement for office supplies and copy paper for LIRR." }).project_family).toBe(
	      "internal_operations",
	    );
	    expect(project({ project_type: "OEM sole source purchase agreement", description: "OEM purchase agreement for office supplies and copy paper." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "procurement/contract award", description: "Award a contract for customer survey software." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "Design, manufacture, test and deliver train simulator systems for locomotive fleets." }).project_family).toBe(
	      "technology_system",
	    );
	    expect(
	      project({
	        project_type: "procurement ratification",
	        description: "Interim technology solution contracts for Paratransit scheduling, dispatching, AVLM, and IVR continuity.",
	      }).project_family,
	    ).toBe("technology_system");
  });

  it("maps generic procurement projects only when payload proves rail infrastructure maintenance or inspection", () => {
    expect(project({ project_type: "procurement", description: "Rail Grinding Services for LIRR, Metro-North, and NYC Transit." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "procurement", description: "Rail Flaw Testing and Joint Bar Inspection services using ultrasonic testing." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "procurement", description: "Critical systems upgrade for two Track Geometry Cars." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "procurement", description: "Lease laser train modules for railhead-based cleaning of rail surfaces." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_type: "testing and inspection",
        description: "Ultrasonic rail testing and track geometry vehicle testing",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "procurement", description: "Supply and delivery of office supplies and copy paper." }).project_family).toBe(
      "internal_operations",
    );
    expect(project({ project_type: "procurement", description: "Replacement parts and repair services for maintenance-of-way equipment." }).project_family).toBe(
      "other",
    );
	    expect(project({ project_type: "procurement", description: "Worldwide inspection and testing services." }).project_family).toBe("internal_operations");
    expect(project({ project_type: "testing and inspection", description: "General software acceptance testing and inspection." }).project_family).toBe("other");
    expect(project({ project_type: "testing and inspection", description: "Train simulator systems testing for locomotive fleets." }).project_family).toBe("other");
	  });

	  it("maps fare-evasion turnstile sleeves and fins procurements only with bounded fare payload proof", () => {
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Emergency quantity contract to furnish and install fare evasion turnstile sleeves and fins.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Fare Evasion Turnstile Sleeves and Stainless-Steel Vertical Fins program to test technologies to prevent fare evasion.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "procurement", description: "E-ZPass electronic transponder procurement and related tolling services." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "procurement", description: "Procurement of replacement turnstile components for general station maintenance." }).project_family).toBe(
	      "other",
	    );
	  });

	  it("maps procurement-stage platform screen door and track intrusion detection projects to safety only with exact asset proof", () => {
	    expect(project({ project_type: "procurement", project_name: "Platform Screen Doors", description: "RFQ released; RFP to follow." }).project_family).toBe(
	      "accessibility_or_safety",
	    );
	    expect(project({ project_type: "procurement", project_name: "Track Intrusion Detection System", description: "Procurement to begin this year." }).project_family).toBe(
	      "accessibility_or_safety",
	    );
	    expect(project({ project_type: "procurement", project_name: "Station platform procurement", description: "General station platform materials." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "procurement", description: "Procurement of generic camera equipment." }).project_family).toBe("other");
	  });

  it("maps ITSP solicitations to signal priority only with bus transit-signal-priority proof", () => {
    expect(
      project({
        project_type: "RFP",
        project_name: "INTELLIGENT TRANSPORTATION SIGNAL PRIORITY PROGRAM",
        description: "NYCT requesting proposals for an Intelligent Transit Signal Priority System (ITSP) for NYCT and MTA Bus Company.",
      }).project_family,
    ).toBe("signal_priority");
    expect(project({ project_type: "RFP", description: "Request for Proposals for management consulting services." }).project_family).toBe("other");
    expect(project({ project_type: "RFP", description: "Intelligent transportation platform for internal planning analytics." }).project_family).toBe("other");
    expect(project({ project_type: "procurement", description: "Traffic signal controller procurement for general roadway timing." }).project_family).toBe("other");
  });

	  it("maps ABLE system procurements to enforcement only with procurement-action proof", () => {
	    expect(
	      project({
	        project_type: "procurement",
	        project_name: "ABLE Systems Procurement",
	        description: "Ratification of awards for purchase, installation, operation, and maintenance of ABLE systems.",
	      }).project_family,
	    ).toBe("enforcement_program");
	    expect(project({ project_type: "procurement", description: "Procurement of generic camera equipment." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "ABLE program overview without procurement action." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "Replacement of AVLM and HASTUS software support systems." }).project_family).toBe("technology_system");
	  });

	  it("maps exact zero-emission fleet and depot project types to capital infrastructure without broad transition matching", () => {
    expect(project({ project_type: "fleet electrification" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "fleet conversion" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "fleet replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "fleet_transformation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "fleet transition" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "locomotive acquisition and replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "locomotive procurement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "depot redevelopment" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "locomotive restoration" }).project_family).toBe("other");
    expect(project({ project_type: "transition" }).project_family).toBe("other");
    expect(project({ project_type: "transformation" }).project_family).toBe("other");
    expect(project({ project_type: "redevelopment" }).project_family).toBe("other");
    expect(project({ project_type: "procurement" }).project_family).toBe("other");
  });

		  it("maps real-estate development charging projects before the real-estate fallback", () => {
	    expect(
	      project({
	        project_type: "real estate development",
	        description:
	          "Long-term ground leasing and development of a site for a new warehouse and distribution facility including an NYCT Facility for future use as an electric bus charging facility.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "real_estate_development",
	        description: "Development of a site including an NYCT Facility for use as an electric bus charging facility sized to accommodate standard MTA buses.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "real estate development",
	        description: "Development of industrial property via ground lease; NYCT Mobile Wash and Material Storage Units will relocate.",
	      }).project_family,
		    ).toBe("real_estate_or_property");
	    expect(
	      project({
	        project_type: "real estate development",
	        description: "Development of an approximately 550-unit low-income housing development adjacent to the subject property.",
	      }).project_family,
		    ).toBe("real_estate_or_property");
		    expect(project({ project_type: "real estate development", description: "Generic NYCT Facility relocation without charging proof." }).project_family).toBe(
		      "real_estate_or_property",
		    );
		    expect(project({ project_type: "real estate development" }).project_family).toBe("real_estate_or_property");
		  });

	  it("maps exact initiative records only with bounded safety, charging, or pilot proof", () => {
	    expect(
	      project({
	        project_type: "initiative",
	        project_name: "Zero-Emission commitment",
	        description: "NYCT zero-emission commitment with NYPA partnership for charging infrastructure installation.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "initiative",
	        project_name: "Integration of Safety Management System into Contracts",
	        description: "Embed SMS safety expectations, hazard identification, risk mitigation, and OSHA compliance into contractor agreements.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_type: "initiative",
	        project_name: "Integration of Safety Management System (SMS) into Contracts",
	        description: "C&D is collaborating with Legal and Contracts to finalize updates to Division 1 requirements and embed SMS provisions into future consultant and contractor agreements.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_type: "initiative",
	        project_name: "MTA First-Mile/Last-Mile Initiative",
	        description: "Includes station assessments and first-mile/last-mile pilot programs in ten communities.",
	      }).project_family,
	    ).toBe("pilot");
	    expect(
	      project({
	        project_type: "initiative",
	        description: "Hire five employees to optimize MoW infrastructure projects, overtime analytics, scheduling, and reporting.",
	      }).project_family,
	    ).toBe("other");
		    expect(project({ project_type: "initiative", description: "Zero-emission commitment overview without charging infrastructure." }).project_family).toBe("other");
		    expect(project({ project_type: "initiative", description: "First-mile last-mile station assessments without pilot programs." }).project_family).toBe("other");
		    expect(project({ project_type: "initiative", description: "Safety initiative update." }).project_family).toBe("other");
		  });

  it("maps non-transit administrative project types to extended bounded families", () => {
    expect(project({ project_type: "transit-oriented development" }).project_family).toBe("real_estate_or_property");
    expect(project({ project_type: "retail_agreement" }).project_family).toBe("real_estate_or_property");
    expect(project({ project_type: "alternative dispute resolution program" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "apprenticeship_program" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "cleaning initiative" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "personal service retainer contract" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "staffing initiative" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "community event" }).project_family).toBe("customer_experience");
    expect(project({ project_type: "cultural programming" }).project_family).toBe("customer_experience");
    expect(project({ project_type: "customer service program" }).project_family).toBe("customer_experience");
    expect(project({ project_type: "customer survey" }).project_family).toBe("customer_experience");
    expect(project({ project_type: "cell service installation" }).project_family).toBe("technology_system");
    expect(project({ project_type: "drone program" }).project_family).toBe("technology_system");
    expect(project({ project_type: "IT services" }).project_family).toBe("technology_system");
    expect(project({ project_type: "communications upgrade" }).project_family).toBe("technology_system");
    expect(project({ project_type: "bond issuance" }).project_family).toBe("finance_or_funding");
    expect(project({ project_type: "grant authorization" }).project_family).toBe("finance_or_funding");
    expect(project({ project_type: "project_family", project_family: "property agreement" }).project_family).toBe("real_estate_or_property");
    expect(project({ project_type: "project_family", project_family: "customer service" }).project_family).toBe("customer_experience");
  });

	  it("maps contract-shaped support projects only with bounded payload proof", () => {
	    expect(project({ project_type: "procurement", description: "New York Tolling Authorities Customer Contact Center Services." }).project_family).toBe("fare_program");
    expect(
      project({
        project_type: "procurement",
        description: "Customer service center system with license plate and owner identification services plus transponder distribution.",
      }).project_family,
    ).toBe("fare_program");
    expect(project({ project_type: "procurement", description: "HASTUS Scheduling System Upgrade for MTA Bus and NYC Transit." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "contract modification", description: "Governance, Risk, and Compliance GRC System SaaS support extension." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "Personal Service Contract", description: "UKG Kronos workforce management system day-to-day support." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "Design-Build", description: "Digital Audio Call Recording System with PBX hardware and software." }).project_family).toBe(
      "technology_system",
    );
	    expect(project({ project_type: "procurement", description: "Supply and delivery of office supplies and copy paper." }).project_family).toBe(
	      "internal_operations",
	    );
	    expect(project({ project_type: "procurement", description: "Two-year contract extension for worldwide inspection and testing services." }).project_family).toBe(
	      "internal_operations",
	    );
	    expect(project({ project_type: "contract modification", description: "Management Consultant Services multi-agency contracts extension." }).project_family).toBe(
	      "internal_operations",
	    );
    expect(project({ project_type: "Personal Service Contract", description: "Investment Portfolio Manager for FMTAC assets." }).project_family).toBe(
      "finance_or_funding",
    );
	    expect(project({ project_type: "program", description: "Allows customers with strollers to board buses and park strollers in a dedicated area." }).project_family).toBe(
	      "customer_experience",
	    );
		    expect(project({ project_type: "program", description: "The committee will receive an update on Drug & Alcohol Statistics." }).project_family).toBe(
		      "internal_operations",
		    );
		    expect(
		      project({
		        project_type: "professional services contract",
		        description: "Homeless outreach staffing services in support of the MTA Homeless Security and Quality of Life Program.",
		      }).project_family,
		    ).toBe("accessibility_or_safety");
		    expect(project({ project_type: "insurance procurement", description: "Owner Controlled Insurance Program OCIP procurement for capital projects." }).project_family).toBe(
		      "finance_or_funding",
		    );
		    expect(project({ project_type: "maintenance program", description: "Graffiti removal program cleaned graffiti off buildings and bridges." }).project_family).toBe(
		      "internal_operations",
		    );
		    expect(
		      project({
		        project_type: "mental health co-response outreach program",
	        description: "SCOUT subway co-response teams pair NYC clinicians with MTAPD officers to assist individuals in crisis.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(project({ project_type: "task force", description: "Track Trespassing Task Force launched to address track intrusion." }).project_family).toBe(
	      "accessibility_or_safety",
	    );
	    expect(
	      project({
	        project_type: "initiative",
	        description:
	          "Hire employees to staff a new Productivity/Efficiency Team to optimize MoW infrastructure projects for the Capital Program, overtime analytics, and project scheduling.",
	      }).project_family,
		    ).toBe("internal_operations");
		    expect(project({ project_type: "procurement", description: "Generic procurement package." }).project_family).toBe("other");
		    expect(project({ project_type: "professional services contract", description: "General outreach staffing services." }).project_family).toBe("other");
		    expect(project({ project_type: "insurance procurement", description: "General insurance procurement." }).project_family).toBe("other");
		    expect(project({ project_type: "maintenance program", description: "General station maintenance program." }).project_family).toBe("other");
			    expect(project({ project_type: "contract modification", description: "Generic contract extension." }).project_family).toBe("other");
		    expect(project({ project_type: "program", description: "General program update." }).project_family).toBe("other");
	  });

	  it("maps residual support and property project aliases with bounded proof", () => {
	    expect(
	      project({
	        project_type: "implementation",
	        description: "Support E-ZPass electronic toll collection with electronic transponders.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(
	      project({
	        project_type: "regulatory change",
	        description: "Toll violation fee changes for tolled bridges and tunnels.",
	      }).project_family,
	    ).toBe("other");
	    expect(
	      project({
	        project_type: "noncompetitive contract award",
	        description: "Lease laser train modules for railhead-based cleaning of rail surfaces.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Preventative maintenance, inspection, repair and parts supply for car hoists and truck turntables.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "signaling maintenance contract",
	        description: "Maintenance and support services for CBTC, ATS, SSI, and other signaling systems.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "operations and maintenance contract",
	        description: "Grand Central Madison concourse, ventilation power, and communication rooms operations.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "geometry improvement" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "yard track extension" }).project_family).toBe("other");
	    expect(project({ project_type: "zero-emission buses" }).project_family).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "contract modification",
	        description: "Continuation of Emergency and Scheduled Bus Services with bus companies.",
	      }).project_family,
	    ).toBe("other");
	    expect(
	      project({
	        project_type: "procurement - contract modification",
	        description: "Exercise option years for Access-A-Ride primary carrier contracts for paratransit.",
	      }).project_family,
	    ).toBe("other");
    expect(
      project({
        project_type: "paratransit service",
        description: "Contingency Recovery Rides for Access-A-Ride customers, extended until June 2023.",
      }).project_family,
    ).toBe("service_change");
    expect(project({ project_type: "paratransit service", description: "Generic Access-A-Ride service discussion." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "Modification to Miscellaneous Service Contract",
	        description: "Contact Center as a Service using Genesys Cloud for paratransit.",
	      }).project_family,
	    ).toBe("technology_system");
	    expect(
	      project({
	        project_type: "noncompetitive miscellaneous service contract",
	        description: "zCloud implementation and data center maintenance managed services for the mainframe.",
	      }).project_family,
	    ).toBe("technology_system");
	    expect(
	      project({
	        project_type: "service agreement extension",
	        description: "Open Trip Planner hosting, support, mobility data hub expansion, and OTP 2.0 upgrade.",
	      }).project_family,
	    ).toBe("technology_system");
	    expect(
	      project({
	        project_type: "license expansion",
	        description: "Wireless cellular and Wi-Fi system in tunnels, stations, and along the right of way.",
	      }).project_family,
	    ).toBe("technology_system");
	    expect(project({ project_type: "traffic control system" }).project_family).toBe("technology_system");
	    expect(project({ project_type: "training_equipment" }).project_family).toBe("technology_system");
	    expect(
	      project({
	        project_type: "modification to personal service contract",
	        description: "Transportation planning and conceptual design retainer research services.",
	      }).project_family,
	    ).toBe("planning_or_report");
	    expect(
	      project({
	        project_type: "retainer contract panel",
	        description: "Transportation planning and conceptual design contracts.",
	      }).project_family,
	    ).toBe("planning_or_report");
	    expect(
	      project({
	        project_type: "design",
	        description: "Design services for Penn Station reconstruction.",
	      }).project_family,
	    ).toBe("planning_or_report");
	    expect(project({ project_type: "needs assessment" }).project_family).toBe("planning_or_report");
	    expect(project({ project_type: "lease extension" }).project_family).toBe("real_estate_or_property");
	    expect(project({ project_type: "lease modification" }).project_family).toBe("real_estate_or_property");
	    expect(project({ project_type: "real estate disposition" }).project_family).toBe("real_estate_or_property");
	    expect(project({ project_type: "real estate / development rights transfer" }).project_family).toBe("real_estate_or_property");
	    expect(
	      project({
	        project_type: "relocation",
	        description: "Lease with a realty company for cable shop relocation to a facility.",
	      }).project_family,
	    ).toBe("real_estate_or_property");
	    expect(project({ project_type: "competitive personal service contracts", description: "Dental benefits services and dental benefits plans." }).project_family).toBe(
	      "internal_operations",
	    );
	    expect(project({ project_type: "medical benefits program" }).project_family).toBe("internal_operations");
	    expect(project({ project_type: "MTA Interagency administrative element" }).project_family).toBe("internal_operations");
	    expect(project({ project_type: "contract extension", description: "Small Business Mentoring Program annual update." }).project_family).toBe("other");
	    expect(project({ project_type: "public awareness campaign" }).project_family).toBe("customer_experience");
	    expect(project({ project_type: "public_outreach_program" }).project_family).toBe("customer_experience");
	    expect(project({ project_type: "refinancing" }).project_family).toBe("finance_or_funding");
	    expect(project({ project_type: "resolution", description: "Supplemental resolutions for bond refundings and refunding policy." }).project_family).toBe(
	      "finance_or_funding",
	    );
	    expect(project({ project_type: "contract extension", description: "Generic contract extension." }).project_family).toBe("other");
	    expect(project({ project_type: "relocation", description: "Generic relocation project." }).project_family).toBe("other");
	    expect(project({ project_type: "resolution", description: "Generic policy resolution." }).project_family).toBe("other");
	    expect(project({ project_type: "service agreement extension", description: "Generic service agreement extension." }).project_family).toBe("other");
	  });

			  it("maps contract option exercises to capital infrastructure only when payload proves vehicles", () => {
	    expect(
	      project({
        project_type: "contract_option_exercise",
        description: "Exercise Option 1 for 640 additional R211 subway cars replacing the R46 fleet.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "contract modification / option exercise",
        description: "Purchase 45 additional diesel-battery hybrid locomotives and related non-car items.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "option exercise on existing contract",
        description: "Exercise of Option B to purchase 52 R252 flatcars and related non-car items for NYC Transit.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "procurement option election",
        description: "Exercise of Option 3 to purchase up to 44 additional dual-mode locomotives and related non-car items.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "procurement option exercise",
        description: "Exercise an option for design, manufacturing, testing, and delivery of six dual-mode locomotives.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "option exercise - CBTC equipment",
        description: "Exercise Option 1 to furnish additional carborne CBTC equipment for 128 R211 operating units.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "contract_option_exercise", description: "Exercise an administrative contract option." }).project_family).toBe("other");
	    expect(project({ project_type: "contract modification / option exercise", description: "Exercise option for general services." }).project_family).toBe("other");
	    expect(project({ project_type: "option exercise on existing contract", description: "Exercise an administrative contract option." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement option election", description: "Exercise option for general services." }).project_family).toBe("other");
	    expect(project({ project_type: "option exercise - CBTC equipment", description: "Exercise option for software support services." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement modification", description: "Modify a vehicle procurement contract." }).project_family).toBe("other");
	  });

		  it("maps procurement modifications only when payload proves vehicles or bridge structural work", () => {
		    expect(
		      project({
		        project_type: "procurement modification",
	        description: "Modify purchase contract for 60 low-floor all-electric buses and install an early warning detection system for thermal events.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement modification",
	        description: "Exercise locomotive option for 13 B+AC dual-mode locomotives for Penn Station Access rolling stock.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "procurement modification",
	        description: "Additional structural steel quantities and fire standpipe repairs on the main span of the Verrazzano-Narrows Bridge.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "procurement modification", description: "Modify a vehicle procurement contract." }).project_family).toBe("other");
		    expect(project({ project_type: "procurement modification", description: "Modify procurement for software support services." }).project_family).toBe("other");
		  });

		  it("maps CNG fueling facility operation and maintenance only with physical facility payload proof", () => {
		    expect(
		      project({
		        project_type: "procurement",
		        description: "Operation and maintenance of compressed natural gas CNG fueling facilities for buses.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(
		      project({
		        project_type: "contract_modification",
		        description: "Three-year option extension for operation and maintenance of CNG fueling facilities for DOB and MTABC.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "fuel hedging program", description: "Fuel hedge program for ULSD and CNG." }).project_family).toBe("finance_or_funding");
		    expect(project({ project_type: "procurement", description: "Procurement of fuel services." }).project_family).toBe("other");
		  });

	  it("maps contract modifications only when payload proves accessibility, infrastructure, or bounded support systems", () => {
	    expect(project({ project_type: "contract modification", description: "Continued maintenance of elevators and escalators in Grand Central Madison." }).project_family).toBe(
	      "accessibility_or_safety",
    );
    expect(
      project({
        project_type: "contract modification",
        description: "Add a new Emergency Elevator 2-Way Communication System into the existing emergency communications system.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "Contract Modification", description: "Three-year extension for Ultrasonic Internal Rail Flaw Inspections." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_type: "Contract Modification",
        description: "Exercise Option 2 of post-award consulting services contract with C2K Partners to support the R34211 Option 2 Subway Car Contract for the purchase of 435 additional subway cars.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "contract_modification",
        description: "Modification 6 for post-award consulting services for the R211 Subway Car Contract.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "contract modification",
        project_name: "ESA Systems Facilities Contract Modification (CS179.415)",
        description: "Retroactive modification to ESA Systems Facilities contract for design drawings, device relocation, and access restraints at Grand Central Terminal.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "contract modification", description: "Extend a management consultant services contract." }).project_family).toBe(
      "internal_operations",
    );
	    expect(project({ project_type: "contract modification", description: "Extend GRC system software as a service and technical support." }).project_family).toBe(
	      "technology_system",
	    );
	    expect(project({ project_type: "contract_modification", description: "Enterprise Asset Management consulting services across MTA agencies." }).project_family).toBe("technology_system");
	    expect(project({ project_type: "contract modification", description: "Upgrade HASTUS scheduling system licensing and support." }).project_family).toBe("technology_system");
	    expect(project({ project_type: "contract modification", description: "Continuation of emergency and scheduled bus services." }).project_family).toBe("other");
	    expect(project({ project_type: "contract modification", description: "General Grand Central Terminal contract modification." }).project_family).toBe("other");
	    expect(project({ project_type: "contract modification", description: "ESA Systems Facilities contract modification at Grand Central Terminal." }).project_family).toBe("other");
	  });

  it("maps exact rail and tie replacement project types to capital infrastructure without generic work broadening", () => {
    expect(project({ project_type: "rail replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "Rail Replacement and Maintenance" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "concrete tie installation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "concrete tie installation and rail replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track surfacing" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "switch maintenance" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "maintenance" }).project_family).toBe("other");
    expect(project({ project_type: "installation" }).project_family).toBe("other");
    expect(project({ project_type: "equipment replacement" }).project_family).toBe("other");
    expect(project({ project_type: "systems upgrade" }).project_family).toBe("other");
  });

  it("maps emergency repairs only with rail equipment fire-damage proof", () => {
    expect(
      project({
        project_type: "Emergency Repair",
        description: "Emergency repair service contract on R251 Vacuum Train 4 to repair fire damage to Filter Car 2, including fabrication and installation of a new filter car module.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "emergency repair",
        description: "Emergency repair service contract to replace fire-damaged filter car interior workings on a vacuum train.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "emergency repair", description: "Emergency repair service contract for office water damage." }).project_family).toBe("other");
    expect(project({ project_type: "emergency repair", description: "Repair fire damage to a back-office room." }).project_family).toBe("other");
    expect(project({ project_type: "emergency repair", description: "Repair fire damage to rail office equipment." }).project_family).toBe("other");
    expect(project({ project_type: "repair", description: "Repair fire damage to Filter Car 2 on a vacuum train." }).project_family).toBe("other");
  });

  it("maps exact signal infrastructure project types without testing or contract-modification broadening", () => {
    expect(project({ project_type: "signal upgrade" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal cutover" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signals" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "communications and signal upgrade" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal testing" }).project_family).toBe("other");
    expect(project({ project_type: "signaling system contract modification" }).project_family).toBe("other");
    expect(project({ project_type: "communications upgrade" }).project_family).toBe("technology_system");
    expect(project({ project_type: "cell service installation" }).project_family).toBe("technology_system");
  });

  it("maps signal testing projects only with track outage plus signal-cutover infrastructure proof", () => {
    expect(
      project({
        project_type: "signal testing",
        description: "Three of four main tracks will be out of service while signal testing is performed in advance of a signal cutover. The modernized signal system will improve routing.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "signal testing and cutover",
        description: "Two of four main tracks out of service between Queens Village and Jamaica while signal testing is performed.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal testing" }).project_family).toBe("other");
    expect(project({ project_type: "signal testing", description: "Signal testing before a cutover." }).project_family).toBe("other");
    expect(project({ project_type: "signal testing", description: "Main tracks out of service for a timetable adjustment." }).project_family).toBe("other");
    expect(project({ project_type: "signal testing", description: "Signal testing contract update." }).project_family).toBe("other");
  });

	  it("maps signal and control-system contract-shaped projects only with payload proof", () => {
	    expect(
	      project({
	        project_type: "equipment supply",
        description: "Supply and delivery of Positive Train Control PTC data radios.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "systems upgrade",
        description: "Replace Master Terminal Units at the Power Control Center for the traction power control system.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "systems upgrade",
        description: "Upgrade the asynchronous fiber optic network to SONET technology.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "federally funded sole-source contract",
	        description: "Positive Train Control software upgrades and Automatic Train Control support.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "Positive Train Control Implementation",
	        description: "MNR PTC implementation with full Positive Train Control functionality across the territory.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "PTC software upgrades, technical support, and field qualification services for Metro-North M8 fleet.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "noncompetitive purchases and public works contract",
	        description: "Positive Train Control systems engineering and technical support for LIRR and Metro-North Railroad.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "service contract",
	        project_name: "PTC Software Upgrade for MNR M-8 Fleet",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "signaling system contract modification",
	        description: "Engineering support for installation of a Communication Based Train Control signaling system.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "signaling system contract modification",
        description: "Carborne controller software updates for CBTC wayside communication.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "software upgrade",
        description: "Software upgrades to R211 carborne CBTC equipment to comply with the updated interoperability interface specification.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "consulting",
        project_name: "General Engineering Consultant Services for NYCT Communications Based Train Control Program",
        description: "Design, engineering, procurement support and program administration for implementing the next CBTC phase for NYCT subway service.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "equipment supply", description: "Supply office equipment." }).project_family).toBe("other");
    expect(project({ project_type: "systems upgrade", description: "Upgrade business systems." }).project_family).toBe("other");
	    expect(project({ project_type: "federally funded sole-source contract", description: "Federally funded professional services." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "PTC policy support and reporting services." }).project_family).toBe("other");
	    expect(project({ project_type: "noncompetitive purchases and public works contract", description: "Technical support for office software." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "positive train control implementation", description: "Implementation planning update." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "service contract", description: "Software upgrade for business support systems." }).project_family).toBe("other");
	    expect(project({ project_type: "signaling system contract modification", description: "Administrative modification." }).project_family).toBe("other");
    expect(project({ project_type: "software upgrade", description: "Software upgrade for business support systems." }).project_family).toBe("other");
    expect(project({ project_type: "software upgrade", description: "Traffic control system software upgrade for dispatch operations." }).project_family).toBe("other");
		    expect(project({ project_type: "consulting", description: "Program and project controls policies, stakeholder reporting, training, and internal implementation." }).project_family).toBe(
		      "internal_operations",
		    );
		    expect(project({ project_type: "communications upgrade", description: "Bus command center communications upgrade." }).project_family).toBe("technology_system");
			    expect(project({ project_type: "cell service installation", description: "5G cell service on the shuttle." }).project_family).toBe("technology_system");
		    expect(project({ project_type: "signal testing", description: "Signal testing before a cutover." }).project_family).toBe("other");
		    expect(project({ project_type: "technology upgrade", description: "Technology platform upgrade." }).project_family).toBe("technology_system");
		  });

	  it("maps contract awards only when payload proves terminal infrastructure operation and maintenance", () => {
	    expect(
	      project({
	        project_type: "contract award",
	        description: "Operation and maintenance of Grand Central Madison Terminal and related facility assets supporting LIRR infrastructure.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "contract_award", description: "Purchase, installation and maintenance of Bus Operator Simulator systems." }).project_family).toBe(
		      "technology_system",
		    );
	    expect(project({ project_type: "contract award", description: "General professional services contract award." }).project_family).toBe("other");
	  });

		  it("maps noncompetitive procurements only when payload proves assets or crew-dispatch systems", () => {
	    expect(
	      project({
	        project_type: "noncompetitive procurement",
	        description: "Supply and delivery of Positive Train Control PTC Data Radios for Metro-North Railroad and Long Island Rail Road.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "noncompetitive procurement",
	        description: "Five-year estimated quantities contract for OEM circuit breakers at AC traction power substations.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "Noncompetitive Procurement",
	        project_name: "Upgrade of Critical Systems on TGC3 and TGC4",
	        description: "Upgrade critical systems on two NYC Transit-owned Track Geometry Cars to achieve another 15 years of operational life.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "noncompetitive procurement", description: "Deliver and implement HASTUS Crew Dispatch and Management System." }).project_family).toBe(
		      "technology_system",
		    );
		    expect(project({ project_type: "noncompetitive procurement", description: "Noncompetitive award to deliver and implement a HASTUS CDMS for rail crew dispatch." }).project_family).toBe(
		      "technology_system",
		    );
		    expect(
		      project({
		        project_type: "sole-source procurement",
		        description: "Sole-source estimated quantity contract for replacement parts from NFI Parts for NYC Transit and MTA Bus Company bus fleets.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "noncompetitive procurement", description: "General noncompetitive procurement of professional services." }).project_family).toBe(
		      "other",
		    );
	  });

		  it("maps broad program labels only with bounded accessibility or enforcement payload proof", () => {
		    expect(project({ project_type: "program", description: "Elevate Transit: Zoning for Accessibility includes ADA upgrade projects." }).project_family).toBe(
		      "accessibility_or_safety",
		    );
	    expect(project({ project_type: "program", description: "Progress being made with the ABLE camera program." }).project_family).toBe("enforcement_program");
	    expect(
	      project({
	        project_type: "program",
	        description: "Cops, Cameras & Care program including NYPD and MTAPD presence, continued rollout of cameras, and social-service outreach.",
	      }).project_family,
	    ).toBe("enforcement_program");
	    expect(project({ project_type: "program", description: "Drone as First Responder program launched with NYS Law Enforcement Technology Grant." }).project_family).toBe(
	      "enforcement_program",
	    );
	    expect(project({ project_type: "program", description: "Bus corridor planning and outreach program." }).project_family).toBe("other");
	    expect(project({ project_type: "program", description: "Open stroller program for bus boarding." }).project_family).toBe("other");
		    expect(project({ project_type: "program", description: "Drug and alcohol statistics update." }).project_family).toBe("other");
		  });

			  it("maps Bus Camera Security System contract extensions only with BCSS maintenance proof", () => {
			    expect(
			      project({
			        project_type: "procurement",
		        description: "Modification to extend maintenance services for buses and depots equipped with Bus Camera Security Systems BCSS.",
		      }).project_family,
		    ).toBe("enforcement_program");
		    expect(
		      project({
		        project_type: "modification",
		        description: "Extend maintenance and support services for the MTA Bus Camera Security System.",
		      }).project_family,
		    ).toBe("enforcement_program");
			    expect(project({ project_type: "procurement", description: "Procurement of generic camera equipment." }).project_family).toBe("other");
			    expect(project({ project_type: "modification", description: "Extend generic security services." }).project_family).toBe("other");
			  });

			  it("maps security grant programs only with enforcement/security payload proof", () => {
			    expect(
			      project({
			        project_type: "grant program",
			        description:
			          "Security grant program covering Transit Security Grant Program TSGP, Port Security Grant Program PSGP, Urban Area Security Initiative UASI, and NYC District Attorney Fare Evasion Funding.",
			      }).project_family,
			    ).toBe("enforcement_program");
				    expect(project({ project_type: "grant program", project_name: "Security Grant Program Past Utilization", description: "$58M grant funding total across multiple years." }).project_family).toBe(
				      "finance_or_funding",
				    );
				    expect(project({ project_type: "grant program", description: "Railroad Crossing Elimination RCE grant program funding opportunity." }).project_family).toBe(
				      "finance_or_funding",
				    );
				    expect(project({ project_type: "grant program", description: "General safety grant program update." }).project_family).toBe("finance_or_funding");
			  });

			  it("maps MTAPD public-safety software procurements only with police-system proof", () => {
			    expect(
			      project({
			        project_type: "procurement",
			        description: "Provide and maintain an integrated Public Safety Suite System for the MTA Police Department.",
			      }).project_family,
			    ).toBe("enforcement_program");
			    expect(
			      project({
			        project_type: "competitive procurement",
			        description: "Replace MTAPD Tiburon Public Safety software with records retrieval and field reporting.",
			      }).project_family,
			    ).toBe("enforcement_program");
			    expect(
			      project({
			        project_type: "Noncompetitive Miscellaneous Service Contract (ION Ratification)",
			        description: "JusticeONE e-Citation System implementation for the MTA EAGLE Team and MTAPD.",
			      }).project_family,
			    ).toBe("enforcement_program");
			    expect(project({ project_type: "procurement", description: "Procurement of a general public safety outreach platform." }).project_family).toBe("other");
			    expect(project({ project_type: "competitive procurement", description: "General software replacement for customer service." }).project_family).toBe("other");
			    expect(
			      project({
			        project_type: "Noncompetitive Miscellaneous Service Contract (ION Ratification)",
			        description: "JusticeONE software implementation for general back-office workflows.",
			      }).project_family,
			    ).toBe("other");
			    expect(
			      project({
			        project_type: "Noncompetitive Miscellaneous Service Contract (ION Ratification)",
			        description: "e-Citation software contract for a general back-office citation workflow.",
			      }).project_family,
			    ).toBe("other");
			  });

  it("maps radio-system design-build replacements only with communications-infrastructure proof", () => {
    expect(
      project({
        project_type: "Design-Build",
        description: "Replace existing radio dispatch console systems and upgrade radio and network communications equipment at field locations.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "Design-Build",
        description: "New digital radio system with base radio sites, command-center fit-out, and computer aided dispatch.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "systems replacement",
        description: "UHF T-Band Radio System Replacement using a regional radio system.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "Noncompetitive Miscellaneous Service Agreement (ION Ratification)",
        description: "Maintenance and support for the NYCT DOB Bus Radio System at the Bus Command Center with critical infrastructure upgrades and geographic redundancy.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "procurement",
        description: "Extend maintenance support and technical assistance for a VHF radio system.",
      }).project_family,
    ).toBe("technology_system");
    expect(
      project({
        project_type: "Design-Build",
        description: "Upgrade PBX hardware and install a digital audio call recording system.",
      }).project_family,
    ).toBe("technology_system");
    expect(
      project({
        project_type: "Design-Build",
        description: "Install CCTV cameras and electronic monitoring systems at stations.",
      }).project_family,
    ).toBe("other");
    expect(
      project({
        project_type: "Noncompetitive Miscellaneous Service Agreement (ION Ratification)",
        description: "Maintenance and support services for a generic radio system.",
      }).project_family,
    ).toBe("other");
  });

  it("maps subway Customer Service Centers only with station-facing center proof", () => {
    expect(
      project({
        project_type: "customer service",
        description: "Comprehensive Customer Service Centers in the subway system providing direct support with OMNY and Reduced-Fare applications.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "customer service initiative",
        description: "Opening 15 Customer Service Centers in targeted high-traffic subway stations.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "customer service initiative",
        description: "Customer Service Center openings bring Reduced-Fare applications and OMNY support to communities.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "technology implementation", description: "Transform customer call centers into a multi-channel contact center." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "technology implementation", description: "Customer Relationship Management CRM solution with knowledge management." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "customer service initiative", description: "Improve customer service training and outreach." }).project_family).toBe("other");
  });

  it("maps station parking construction and repair only with infrastructure proof", () => {
    expect(
      project({
        project_type: "parking garage and transportation hub",
        description: "New 5-level parking garage and transportation hub at Southeast Station with pedestrian bridge to station platforms.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "parking expansion",
        description: "Expanded parking facilities at Croton Falls station by constructing a new 450-space surface parking lot.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "parking facility",
        description: "New almost 600-space parking garage at Harrison Station for Metro-North customers.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "structural repairs",
        description: "Critical structural repairs to the Poughkeepsie Station Garage including roof system, gutter repairs, and elevator replacement.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "station refresh",
        description: "Improvements to cleanliness, aesthetics, and safety at nine stations, including tactile warning strips, stair contrast, and improved lighting.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "station refresh program",
        description: "Station refresh program launched during planned closures to do deep cleaning and tackle visible problems at stations.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "station renovation program",
        description: "Station cosmetic upgrades combined with planned weekend outages, relamping stations with LED lighting.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "station maintenance",
        description: "Subway station refresh program including power washing, light fixture replacement, and water intrusion prevention.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "upgrade",
        description: "Upgrading lighting in every single subway station with brighter LED bulbs.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "parking permit", description: "Short-term parking permit for a Thanksgiving shopping event." }).project_family).toBe(
      "real_estate_or_property",
    );
	    expect(project({ project_type: "parking fee structure", description: "Establish parking fees for spaces in a newly constructed parking garage." }).project_family).toBe(
	      "other",
	    );
	    expect(
	      project({
	        project_type: "parking fee structure",
	        description: "Establish parking fees for 300 daily parking spaces in the newly constructed LIRR Westbury Parking Garage.",
	      }).project_family,
	    ).toBe("fare_program");
    expect(project({ project_type: "license agreement", description: "Operate and maintain a commuter parking lot under a revenue-share license." }).project_family).toBe(
      "real_estate_or_property",
    );
    expect(
      project({
        project_type: "license agreement",
        description: "MTA C&D constructing an above-grade signal tower for Rockaway Line resiliency with a staging area for construction.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "license agreement",
        description: "Temporary parking for approximately 60 buses during ongoing construction at Kingsbridge Bus Depot.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "license agreement", description: "Retail kiosk concession at Grand Central Terminal." }).project_family).toBe(
      "real_estate_or_property",
    );
    expect(project({ project_type: "license agreement", description: "Five-year license for storage of non-hazardous materials and vehicle parking." }).project_family).toBe(
      "real_estate_or_property",
    );
    expect(project({ project_type: "station refresh" }).project_family).toBe("other");
    expect(project({ project_type: "station maintenance", description: "Routine station maintenance contract." }).project_family).toBe("other");
    expect(project({ project_type: "rehabilitation", description: "Repair exit corridors and spaces at a fleet facility." }).project_family).toBe("other");
  });

  it("maps direct fare and toll products without tolling contract broadening", () => {
    expect(
      project({
        project_type: "tolling program implementation",
        description: "MTA implementation of congestion pricing as directed by State Legislature law.",
      }).project_family,
    ).toBe("fare_program");
    expect(project({ project_type: "pricing program", description: "Congestion Pricing benefits and CBD tolling program context." }).project_family).toBe(
      "fare_program",
    );
    expect(project({ project_type: "congestion pricing", description: "MTA secures FONSI for historic Congestion Pricing Program." }).project_family).toBe(
      "fare_program",
    );
	    expect(project({ project_type: "mobile application", description: "Free mobile application for E-ZPass and Tolls by Mail account management and toll payment." }).project_family).toBe(
	      "fare_program",
	    );
	    expect(project({ project_type: "discount program", description: "Monthly ticket holders can buy $1 promotional tickets via TrainTime." }).project_family).toBe(
	      "fare_program",
	    );
			    expect(project({ project_type: "public hearings", description: "Public hearings on fare changes." }).project_family).toBe("fare_program");
			    expect(
			      project({
			        project_name: "Student MetroCard Incentive Program",
			        description:
			          "Launch student incentive program to encourage Student MetroCard usage; students who swipe their student MetroCard to travel to or from school enter a raffle.",
			      }).project_family,
			    ).toBe("fare_program");
			    expect(
			      project({
			        project_name: "Long-term Fare Gate Strategy",
		        program: "2025-2029 Capital Program",
		        description: "Long-term fare gate strategy as part of the 2025-2029 Capital Program.",
		      }).project_family,
		    ).toBe("fare_program");
		    expect(
		      project({
		        project_name: "Safe, Accessible, and Modern Fare Gate RFI",
		        description: "12 RFI submissions received; in-lab testing summer 2024, in-system testing in 2025.",
		      }).project_family,
		    ).toBe("fare_program");
		    expect(project({ project_name: "Station access RFI", description: "12 RFI submissions received; in-lab testing summer 2024." }).project_family).toBeUndefined();
		    expect(project({ project_name: "Fare policy update", description: "Public hearing on fare changes." }).project_family).toBeUndefined();
		    expect(project({ project_type: "implementation", description: "NCBA E-ZPass toll collection implementation with back-office customer service support." }).project_family).toBe(
		      "fare_program",
		    );
	    expect(project({ project_type: "congestion pricing", description: "Environmental review for a transit-adjacent street project near the charging zone." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "regulatory change", description: "Proposal to lower administrative toll violation fees." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "regulatory change",
	        description: "Proposal to lower administrative toll violation fees across tolled bridge and tunnel facilities.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(
	      project({
	        project_type: "procurement - personal service contracts",
	        description: "Toll collection consultant support services for planning, evaluation of toll system upgrades, and toll-related infrastructure.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "procurement", description: "E-ZPass electronic transponder procurement and related tolling services." }).project_family).toBe(
	      "other",
	    );
    expect(
      project({
        project_type: "procurement",
        description: "Procurement contracts to provide transponders and related services for the E-ZPass Electronic Toll Collection System.",
      }).project_family,
    ).toBe("fare_program");
    expect(
      project({
        project_type: "procurement contract",
        description: "Estimated quantity contracts to provide E-ZPass electronic transponders and related equipment for the Electronic Toll Collection System.",
      }).project_family,
    ).toBe("fare_program");
    expect(project({ project_type: "procurement", description: "Transponder Distribution Services for MTA Bridges and Tunnels." }).project_family).toBe("fare_program");
    expect(
      project({
        project_type: "personal service contract",
        description: "Personal service contract with TransCore LP to install and maintain an all-electronic and open-road tolling system cashless tolling system at MTA Bridges and Tunnels toll facilities.",
      }).project_family,
    ).toBe("fare_program");
    expect(
      project({
        project_type: "procurement",
        description: "Amendment to personal service contract with TransCore LP to exercise three one-year option renewals for cashless tolling maintenance services at TBTA toll facilities.",
      }).project_family,
    ).toBe("fare_program");
    expect(
      project({
        project_type: "procurement amendment",
        description:
          "Amendment to personal service contract PSC-13-2949 with TransCore LP to exercise three one-year option renewals for cashless tolling maintenance services at all TBTA toll facilities.",
      }).project_family,
    ).toBe("fare_program");
    expect(project({ project_type: "personal service contract", description: "Cashless tolling maintenance services." }).project_family).toBe("other");
    expect(project({ project_type: "procurement amendment", description: "Amendment to renew tolling program consultant support." }).project_family).toBe(
      "other",
    );
	    expect(project({ project_type: "procurement", description: "Customer contact center services for tolling authorities." }).project_family).toBe("fare_program");
    expect(project({ project_type: "Personal Service Contract", description: "Revenue assessments and environmental review of TBTA toll-related actions." }).project_family).toBe(
      "other",
    );
  });

  it("maps exact rail track and signal infrastructure types without outage or contract broadening", () => {
    expect(project({ project_type: "rail expansion" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal and communications upgrade" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track extension and signal cutover" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "pocket track" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track and signal repair" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signal system modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track work and maintenance" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "track replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Harlem Line Planned Track Outage",
        project_type: "track outage",
        description: "Planned track outage on the Harlem Line from July 13, 2026 to August 30, 2026.",
      }).project_family,
    ).toBe("service_change");
    expect(project({ project_type: "track outage" }).project_family).toBe("other");
    expect(project({ project_type: "schedule change" }).project_family).toBe("other");
    expect(project({ project_type: "signal testing" }).project_family).toBe("other");
    expect(project({ project_type: "signal testing and cutover" }).project_family).toBe("other");
    expect(project({ project_type: "signaling maintenance contract" }).project_family).toBe("other");
    expect(project({ project_type: "traffic control system software upgrade" }).project_family).toBe("technology_system");
    expect(project({ project_type: "real estate easement" }).project_family).toBe("real_estate_or_property");
  });

		  it("maps exact station upgrade and redevelopment project types without generic upgrade broadening", () => {
	    expect(project({ project_type: "station upgrade" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station upgrades" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station improvements" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station repair" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station enhancement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "platform refurbishment" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station_redevelopment" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "station improvement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "new station" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "platform repair" }).project_family).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "signage improvement",
        description: "Updating signage on multiple Grand Central Terminal station platforms to meet ADA and safety code compliance.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "station reopening",
        description: "Reopening of Breakneck Ridge station following safety enhancement work. Station improvements are part of the Breakneck Connector segment.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "station reopening" }).project_family).toBe("other");
    expect(project({ project_type: "station reopening", description: "Weekend-only stop along the Hudson Line." }).project_family).toBe("other");
    expect(project({ project_type: "station refresh" }).project_family).toBe("other");
    expect(project({ project_type: "upgrade", description: "LED lighting upgrade for office space." }).project_family).toBe("other");
    expect(project({ project_type: "signage improvement" }).project_family).toBe("other");
    expect(project({ project_type: "signage improvement", description: "Updated retail signage at a station storefront." }).project_family).toBe("other");
    expect(project({ project_type: "upgrade" }).project_family).toBe("other");
    expect(project({ project_type: "redevelopment" }).project_family).toBe("other");
    expect(project({ project_type: "real estate development" }).project_family).toBe("real_estate_or_property");
  });

  it("maps exact physical asset project types without generic facility or repair broadening", () => {
    expect(project({ project_type: "crossing rehabilitation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "elevated structure steel repairs and painting" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "component repairs" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "concrete coring" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "grade separation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "facility improvement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "facility upgrade" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "structural repairs design-bid-build" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "tunnel lighting installation" }).project_family).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "MOW Situation Room",
        project_type: "facility",
        description: "Emergency management situation room at Livingston Plaza for managing major subway incidents and inclement weather events.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "facility transformation",
        description:
          "Transformation of a former warehouse and office complex into a centralized headquarters for LIRR Engineering Department Force Account with training areas and indoor material storage.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Henry Hudson Bridge Structural Rehabilitation and Painting",
        description: "Structural rehabilitation and painting of the steel arch and approach structures at the Henry Hudson Bridge.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_name: "Bridge Timbers", description: "Bridge Timbers CT only - 460 timbers planned." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_name: "Hammels Wye and South Channel Bridge Reconstruction",
        description: "Reconstruction of the Hammels Wye and South Channel Bridge connecting the A train to the Rockaway Peninsula.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Line Structure Component Repair Program, Eastern Parkway Line",
        description: "Concrete and steel repairs in the tunnel along the Eastern Parkway IRT Line.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_name: "Line Structures Repair", description: "$50 million savings across 15 line structure projects closed out in 2024." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_name: "Structural repairs on the Eastern Parkway Line", description: "2020 project award." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "facility" }).project_family).toBe("other");
    expect(project({ project_type: "facility", description: "Office consolidation situation room for administrative planning." }).project_family).toBe("other");
    expect(project({ project_type: "facility", description: "Emergency management office space." }).project_family).toBe("other");
    expect(project({ project_type: "facility transformation" }).project_family).toBe("other");
    expect(project({ project_type: "facility transformation", description: "Office consolidation and space planning for administrative teams." }).project_family).toBe("other");
    expect(project({ project_type: "facility replacement" }).project_family).toBe("other");
    expect(project({ project_type: "repair" }).project_family).toBe("other");
    expect(project({ project_type: "component work" }).project_family).toBe("other");
    expect(project({ project_name: "Bike Racks on Bus Routes Crossing Bridges", description: "Installation of bike racks on buses crossing bridges." }).project_family).toBeUndefined();
    expect(project({ project_name: "Line Structure Service Contract", description: "Service contract for line structure repair support." }).project_family).toBeUndefined();
    expect(project({ project_name: "RFK Bridge Fender and ADA Ramp", description: "Fender rehabilitation and ADA ramp reconstruction at RFK Bridge." }).project_family).toBeUndefined();
    expect(project({ project_name: "Cashless Tolling", description: "Cashless tolling replacement at Verrazzano bridge." }).project_family).toBeUndefined();
    expect(project({ project_name: "Bridge Safety Fence", description: "Bridge safety fence replacement." }).project_family).toBeUndefined();
  });

  it("maps demolition and facility replacement only with physical facility payload proof", () => {
    expect(project({ project_type: "demolition", description: "Demolition of the old Hempstead Substation." }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "demolition", description: "Demolition of a bridge plaza widening structure." }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "facility replacement", description: "Replacement bus terminal with 25 bus bays and electrified fleet charging." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "demolition", description: "Program closeout and administrative demolition." }).project_family).toBe("other");
    expect(project({ project_type: "facility replacement", description: "Replacement office lease." }).project_family).toBe("other");
    expect(
      project({
        project_type: "facility relocation",
        description: "Temporary bus terminal swing space lease with GJDC while the permanent replacement bus terminal is constructed.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "facility relocation",
        description: "Temporary Bus Terminal swing space lease with Greater Jamaica Development Corporation to serve bus operations pending completion of Replacement Bus Terminal.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "facility relocation", description: "Temporary bus parking lease." }).project_family).toBe("other");
    expect(project({ project_type: "facility relocation", description: "Temporary office relocation lease." }).project_family).toBe("other");
    expect(project({ project_type: "facility relocation", description: "Cable shop relocation lease." }).project_family).toBe("other");
    expect(project({ project_type: "facility relocation" }).project_family).toBe("other");
  });

  it("maps maintenance-shop acquisitions and permanent terminal relocations only with facility proof", () => {
    expect(
      project({
        project_type: "facility acquisition",
        description: "Purchase of 57,000 square foot building for continued operation of NYCT's Bedford Avenue Maintenance Shop.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "real estate acquisition",
        description: "Purchase of 57,000 sq ft building for continued operation of the NYCT Central Maintenance Facility.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "terminal relocation",
        description: "Relocation of Jamaica Bus Terminal to a new state-of-the-art facility.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "facility acquisition", description: "Acquire office space for administrative staff." }).project_family).toBe("other");
    expect(project({ project_type: "real estate acquisition", description: "Acquire rail-adjacent property rights." }).project_family).toBe("other");
    expect(project({ project_type: "terminal relocation", description: "Temporary bus terminal swing-space lease." }).project_family).toBe("other");
  });

  it("maps installation projects only with signal, tactile, or IT-rack station payload proof", () => {
    expect(project({ project_type: "installation", description: "Delivery and installation of signal huts on the Montauk Branch." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "installation", description: "Tactile installation at 25 LIRR stations." }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "installation", description: "Installation of IT racks at all stations." }).project_family).toBe("technology_system");
    expect(project({ project_type: "installation", description: "Tactile reference without station work." }).project_family).toBe("other");
    expect(project({ project_type: "installation", description: "Generic installation work." }).project_family).toBe("other");
  });

	  it("maps ticketing equipment and service projects to fare programs only with fare payload proof", () => {
	    expect(project({ project_type: "equipment replacement", description: "Replace ticket vending machines and ticket office machines." }).project_family).toBe("fare_program");
	    expect(project({ project_type: "technology upgrade", description: "Rollout of next-generation Ticket Vending Machines TVMs." }).project_family).toBe("fare_program");
	    expect(project({ project_type: "service contract", description: "Mobile Ticketing Program for TrainTime." }).project_family).toBe("fare_program");
	    expect(
	      project({
	        project_type: "digital service launch",
	        description: "TrainTime app launch for LIRR and Metro-North customers to purchase tickets and view schedules.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "Mobile ticketing program", description: "Continue administering the Mobile Ticketing Program for LIRR and MNR with OMNY integration.", program: "TrainTime" }).project_family).toBe(
	      "fare_program",
	    );
	    expect(
	      project({
	        project_type: "procurement and installation",
	        description: "Replace and upgrade fare collection solution including Ticket Vending Machines and Ticket Office Machines.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(
	      project({
	        project_type: "contract modification",
	        description: "Enhance and expand the use of Onboard Validation Devices OVDs from Select Bus Service routes to regular bus service routes.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "contract_modification", description: "Continued maintenance of ticket selling systems." }).project_family).toBe("fare_program");
	    expect(project({ project_type: "equipment replacement", description: "Replacement of audio visual recording monitoring systems with CCTV cameras." }).project_family).toBe(
	      "other",
	    );
	    expect(
	      project({
	        project_type: "equipment replacement",
	        description:
	          "Replacement of LIRR's current Audio-Visual Recording Monitoring system on M7 fleets, C3 coaches, Diesel-Electric Dual Mode 30, and adding the system to the M3 fleet, totaling 1,087 railcars.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "digital service launch", description: "Launch a real-time map and customer alerts app." }).project_family).toBe("other");
	    expect(project({ project_type: "technology upgrade", description: "Paratransit technology platform upgrade." }).project_family).toBe("technology_system");
	    expect(project({ project_type: "service contract", description: "General service contract." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "contract modification",
	        description: "Ratification of a modification to the contract for All-Electronic Open-Road Tolling to implement an automated Revenue Recovery System for toll evasion and recovering tolls.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "contract modification", description: "Open-road tolling contract support using OCR and DMV lookups." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement and installation", description: "General procurement and installation services." }).project_family).toBe("other");
	  });

  it("maps exact ADA and access project types without parking, real-estate, or technology broadening", () => {
    expect(project({ project_type: "ADA enhancements" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "ADA improvement" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "ADA improvements" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "ADA rehabilitation" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "ADA upgrades" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "access solution" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "elevator" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "elevator installation" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "elevator rehabilitation" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "elevator replacement" }).project_family).toBe("accessibility_or_safety");
    expect(project({ project_type: "escalator replacement" }).project_family).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "design and retrofit",
        description: "Design and retrofit of the Department of Buses operator cockpit door on express bus fleets.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "design and testing",
        description: "Design and test fully enclosed cockpits on local buses for bus operator safety.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "parking facility" }).project_family).toBe("other");
    expect(project({ project_type: "facility replacement" }).project_family).toBe("other");
    expect(project({ project_type: "technology platform" }).project_family).toBe("technology_system");
    expect(project({ project_type: "installation" }).project_family).toBe("other");
    expect(project({ project_type: "rehabilitation" }).project_family).toBe("other");
    expect(project({ project_type: "equipment replacement" }).project_family).toBe("other");
    expect(project({ project_type: "design and testing", description: "Design and test a customer survey process." }).project_family).toBe("other");
    expect(project({ project_name: "Beach 67 St ADA Project", description: "ADA accessibility project at Beach 67th Street station." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_name: "ADA Upgrades at Lindenhurst LIRR", description: "Fully accessible station improvements at Lindenhurst." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_name: "Increase Accessibility", description: "Increase accessibility at Grand St Station." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_name: "ADA compliance portal", description: "Web accessibility compliance update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Access-A-Ride van pilot", description: "Accessible paratransit service pilot." }).project_family).toBeUndefined();
  });

  it("maps SafeWork technology platforms only with safety-compliance payload proof", () => {
    expect(
      project({
        project_type: "technology platform",
        project_name: "SafeWork Platform",
        description: "Standardizes inspection protocols with real-time reporting of hazards including scaffold integrity, electrical safety, and traffic control compliance.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "technology platform", description: "Paratransit Technology System for scheduling, dispatching, and AVLM." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "technology platform", description: "General hazard dashboard without inspection protocols or compliance proof." }).project_family).toBe(
      "technology_system",
    );
  });

  it("maps paratransit eligibility assessment centers without technology or service broadening", () => {
    expect(
      project({
        project_type: "paratransit facility",
        description: "Opening of the Queens Assessment Center for independent eligibility assessment of applicants for paratransit service.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "personal/miscellaneous service contract modification",
        description: "Modify eligibility assessment services for Paratransit and Reduced-Fare to add an Assessment Center in Brooklyn.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "technology platform", description: "Paratransit Technology System for scheduling, dispatching, and AVLM." }).project_family).toBe(
      "technology_system",
    );
    expect(
      project({
        project_type: "paratransit service",
        description: "Contingency Recovery Rides for Access-A-Ride customers, extended until June 2023.",
      }).project_family,
    ).toBe("service_change");
    expect(project({ project_type: "paratransit service", description: "Generic paratransit service discussion." }).project_family).toBe("other");
    expect(project({ project_type: "personal/miscellaneous service contract modification", description: "Modify paratransit contact center software." }).project_family).toBe(
      "other",
    );
  });

  it("maps station access elevator and escalator projects only with access-asset proof", () => {
    expect(
      project({
        project_type: "design-build-finance-maintain (P3)",
        description: "ADA accessibility upgrades at 13 NYCT subway stations including 21 new elevators and 14 elevator replacements.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "station access improvement",
        description: "New pathway with two escalators and an elevator in Grand Central's Biltmore Room connecting to Grand Central Madison.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "modification to contract",
        description: "Add a new Emergency Elevator 2-Way Communication System with text messaging capabilities for hearing- and speech-impaired individuals.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "design and engineering",
        description: "Design services for accessibility improvements, ADA upgrades, station rehabilitation work, and escalator replacement.",
      }).project_family,
    ).toBe("accessibility_or_safety");
	    expect(
	      project({
	        project_type: "corridor project",
	        description: "42nd St Corridor projects including escalators and elevators at Grand Central Station and Times Square Shuttle.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(project({ project_type: "project management services", description: "Continued project management services for escalator replacement." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "project management services",
	        description:
	          "Continued project management services for 42nd Street Corridor projects including escalator replacement at Grand Central and new elevators at Bryant Park-42nd Street.",
	      }).project_family,
	    ).toBe("accessibility_or_safety");
	    expect(project({ project_type: "installation", description: "Installation of IT racks at all 125 LIRR stations." }).project_family).toBe(
	      "technology_system",
	    );
	    expect(project({ project_type: "station", description: "Future Co-op City Station as part of the Penn Station Access Project." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "station", description: "Generic station planning discussion." }).project_family).toBe("other");
	    expect(project({ project_type: "yard expansion", description: "New Rochelle Yard expansion including retaining wall construction in support of Penn Station Access." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "yard", description: "New Rochelle Yard expansion including retaining wall construction in support of Penn Station Access." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "yard track extension", description: "Yard track extension concept." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "yard track extension",
	        description: "Port Washington Yard Track extensions near the station contingent on real estate acquisition.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	  });

  it("maps contract-delivery projects to accessibility only when payload proves access assets", () => {
    expect(
      project({
        project_type: "design-build",
        description: "Design-build services for ADA upgrades at five NYCT stations, including new ADA-compliant elevators.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "Design-Bid-Build A+B",
        description: "Widening of existing pedestrian path and new ADA-compliant bike/pedestrian ramp connections.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "design-build contract",
        description: "Installation of fixed fire suppression systems at the Hugh L. Carey Tunnel and Queens-Midtown Tunnel.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "design-build",
        description: "Replace fixed-block relay-based signal system with CBTC system and wireless network cabling.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "design-build",
        description: "Upgrade the supervisory control and data acquisition SCADA system at the Power Control Center.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "design-build",
        description: "Replacement of the Park Avenue Viaduct in Manhattan.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
  });

  it("maps public-private partnership projects to accessibility only when payload proves access assets", () => {
    expect(
      project({
        project_type: "public-private partnership",
        description: "Design, construction, financing and maintenance of ADA accessibility upgrades including new elevators at selected subway stations.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "public-private partnership",
        description: "Mixed-use residential and retail development with a replacement parking garage.",
      }).project_family,
    ).toBe("other");
  });

  it("maps viaduct rehabilitation P3 records only with train-shed or viaduct rehabilitation proof", () => {
    expect(
      project({
        project_type: "viaduct rehabilitation / public-private partnership",
        description: "Amendment to expand JPMC's rehabilitation work on the Grand Central Terminal Train Shed to include Sector 2.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "community event",
        description: "Job fair connected community members with construction jobs for the Park Avenue Viaduct project.",
      }).project_family,
    ).toBe("customer_experience");
    expect(
      project({
        project_type: "viaduct rehabilitation / public-private partnership",
        description: "Public-private partnership planning discussion for viaduct-adjacent real estate.",
      }).project_family,
    ).toBe("other");
  });

	  it("maps exact service expansion and improvement project types without customer-service broadening", () => {
	    expect(project({ project_type: "service expansion" }).project_family).toBe("service_change");
	    expect(project({ project_type: "service_improvement" }).project_family).toBe("service_change");
	    expect(project({ project_type: "service enhancement" }).project_family).toBe("service_change");
    expect(project({ project_type: "service increase" }).project_family).toBe("service_change");
    expect(project({ project_type: "redesign", description: "Bus network redesign project in Queens." }).project_family).toBe("bus_network_redesign");
    expect(project({ project_type: "route revision", description: "Revise the travel path of the B63 in each direction." }).project_family).toBe("service_change");
    expect(project({ project_type: "routing change", description: "Implementation of a new permanent routing of the southbound M125." }).project_family).toBe(
      "service_change",
    );
    expect(
      project({
        project_type: "service addition",
        project_name: "Ronkonkoma Relief",
        description: "New additional train departing Penn Station and arriving at Ronkonkoma, added to keep up with demand on the Ronkonkoma Branch.",
      }).project_family,
    ).toBe("service_change");
    expect(project({ project_type: "service addition", description: "New customer service desk added to a station." }).project_family).toBe("other");
    expect(project({ project_type: "service addition", description: "Additional service planning discussion." }).project_family).toBe("other");
    expect(project({ project_type: "holiday_service_program", description: "Extra westbound and eastbound trains for the Thanksgiving Day Parade." }).project_family).toBe(
      "service_change",
    );
    expect(project({ project_type: "holiday_service_program", description: "Holiday customer event and seasonal station decorations." }).project_family).toBe("other");
    expect(project({ project_type: "seasonal service", description: "Holiday lights trains operate on regularly scheduled trains." }).project_family).toBe(
      "service_change",
    );
    expect(
      project({
        project_type: "schedule change",
        description: "Proposal to adjust B, D, N, Q and R schedules weekday evenings to accommodate work train movements.",
      }).project_family,
    ).toBe("service_change");
    expect(
      project({
        project_type: "procurement",
        description: "Emergency and Scheduled Bus Services between stations for railroad passengers during track outages and service disruptions.",
      }).project_family,
    ).toBe("service_change");
    expect(
      project({
        project_type: "competitive procurement - miscellaneous service contract",
        description: "Furnish emergency and scheduled bus services for railroad passengers between stations during scheduled and emergency track outages.",
      }).project_family,
    ).toBe("service_change");
    expect(project({ project_type: "seasonal service", description: "Holiday customer event and seasonal station decorations." }).project_family).toBe("other");
    expect(project({ project_type: "schedule change", description: "Administrative schedule for committee reporting." }).project_family).toBe("other");
    expect(project({ project_type: "procurement", description: "Procurement of general bus equipment and maintenance services." }).project_family).toBe("other");
    expect(
      project({
        project_type: "service improvement initiative",
        description: "Targeted improvements on 28 lower performing routes that will benefit 20% of bus ridership.",
      }).project_family,
    ).toBe("service_change");
    expect(
      project({
        project_type: "program",
        project_name: "Bus Forward",
        description: "Program to target bus corridor segments identified by speed, reliability, and long slow trips, with planning, outreach, and implementation.",
      }).project_family,
    ).toBe("bus_priority");
    expect(
      project({
        project_type: "strategy",
        project_name: "2022 Bus Strategy",
        description:
          "Four-pillar strategy: expand bus priority and traffic enforcement, continually improve the network, strengthen accessibility and customer engagement, and transition to a zero-emissions fleet.",
      }).project_family,
    ).toBe("bus_priority");
    expect(project({ project_type: "customer service initiative" }).project_family).toBe("other");
    expect(project({ project_type: "customer_service_program" }).project_family).toBe("customer_experience");
    expect(project({ project_type: "operating efficiency initiative" }).project_family).toBe("internal_operations");
    expect(project({ project_type: "initiative" }).project_family).toBe("other");
	    expect(project({ project_type: "program" }).project_family).toBe("other");
    expect(project({ project_type: "program", description: "Allows customers with strollers to board buses and park strollers in a dedicated area." }).project_family).toBe(
      "customer_experience",
    );
    expect(project({ project_type: "program", description: "Bus corridor planning and outreach program." }).project_family).toBe("other");
    expect(project({ project_type: "program", description: "Speed and reliability dashboard for bus routes." }).project_family).toBe("other");
    expect(project({ project_type: "data initiative", description: "MTA Open Data update with daily ridership data for bus and subway lines." }).project_family).toBe(
      "data_program",
    );
    expect(project({ project_type: "data initiative", description: "Internal analytics update for operating staff." }).project_family).toBe("other");
    expect(project({ project_type: "dashboard", project_name: "Capital Program Dashboard", description: "Unveiling a new Capital Program Dashboard with the 2025-2029 Capital Program." }).project_family).toBe(
      "data_program",
    );
    expect(project({ project_type: "dashboard", description: "Security assessment dashboard for operations staff." }).project_family).toBe("other");
    expect(project({ project_type: "strategy", description: "Climate resilience roadmap with capital projects, design practices, operating actions, and interagency actions." }).project_family).toBe(
      "planning_or_report",
    );
    expect(project({ project_type: "route revision", description: "Administrative revision to route documentation." }).project_family).toBe("other");
    expect(project({ project_type: "redesign", description: "Station plaza redesign project." }).project_family).toBe("other");
    expect(project({ project_type: "service improvement initiative", description: "Improve customer service training and outreach." }).project_family).toBe("other");
	  });

	  it("maps ferry service records only when payload proves named ferry-route service", () => {
	    expect(
	      project({
	        project_type: "service",
	        description: "Weekend ferry service between Haverstraw and Ossining scheduled to meet Hudson Line trains.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(
	      project({
	        project_type: "ferry service",
	        description: "Ferry service connecting Newburgh and Beacon.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(
	      project({
	        project_type: "procurement",
	        description: "Ferry services contract for the Haverstraw-Ossining and Newburgh-Beacon routes.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(
	      project({
	        project_type: "interagency agreement",
	        description:
	          "Metro-North to reimburse City of Newburgh for lease payments for parking and ferry landing facilities used by the Newburgh-Beacon Ferry.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(
	      project({
	        project_type: "interagency agreement",
	        description: "Ninth MOU for reimbursement of Ferry Landing/Parking Lease for the Newburgh-Beacon ferry.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(project({ project_type: "grant", description: "Grant to support connecting services for Metro-North stations." }).project_family).toBe("finance_or_funding");
	    expect(project({ project_type: "interagency agreement", description: "Lease payments for parking and ferry landing facilities." }).project_family).toBe("other");
	    expect(project({ project_type: "interagency agreement", description: "Lease payments for parking facilities near a ferry landing." }).project_family).toBe("other");
	    expect(project({ project_type: "procurement", description: "Procurement for ferry terminal facilities." }).project_family).toBe("other");
	  });

	  it("maps exact alternatives analysis to planning/report without broad analysis matching", () => {
	    expect(project({ project_type: "alternatives analysis" }).project_family).toBe("planning_or_report");
    expect(project({ project_type: "alternatives_analysis" }).project_family).toBe("planning_or_report");
    expect(project({ project_type: "analysis" }).project_family).toBe("other");
    expect(project({ project_type: "performance analysis" }).project_family).toBe("other");
  });

  it("maps exact proof-of-concept project types to pilot without broad concept matching", () => {
    expect(project({ project_type: "proof of concept" }).project_family).toBe("pilot");
    expect(project({ project_type: "proof_of_concept" }).project_family).toBe("pilot");
    expect(project({ project_type: "conceptual design" }).project_family).toBe("other");
    expect(project({ project_type: "concept planning" }).project_family).toBe("planning_or_report");
  });

  it("maps needs assessments to planning/report only with payload proof", () => {
    expect(project({ project_type: "assessment", description: "Long-term capital needs assessment for the MTA network." }).project_family).toBe(
      "planning_or_report",
    );
    expect(project({ project_type: "assessment" }).project_family).toBe("other");
    expect(project({ project_type: "assessment", description: "Safety assessment of operating conditions." }).project_family).toBe("other");
  });

  it("maps exact tolling programs to fare program without contract broadening", () => {
    expect(project({ project_type: "tolling program" }).project_family).toBe("fare_program");
    expect(project({ project_type: "fare and toll policy" }).project_family).toBe("fare_program");
    expect(project({ project_type: "contract modification" }).project_family).toBe("other");
    expect(project({ project_type: "procurement modification" }).project_family).toBe("other");
  });

  it("maps exact SBS upgrade project types without bus-stop or street broadening", () => {
    expect(project({ project_type: "SBS Upgrade" }).project_family).toBe("sbs_or_brt");
    expect(project({ project_type: "sbs_upgrade" }).project_family).toBe("sbs_or_brt");
    expect(project({ project_type: "sbs_launch" }).project_family).toBe("sbs_or_brt");
    expect(
      project({
        project_type: "transportation improvements",
        description:
          "Project to improve transportation on 125th Street, including proposed M60 Select Bus Service with off-board fare collection, dedicated offset bus lanes, and SBS amenities.",
      }).project_family,
    ).toBe("sbs_or_brt");
    expect(project({ project_type: "bus stop improvement" }).project_family).toBe("other");
    expect(project({ project_type: "street improvement" }).project_family).toBe("other");
    expect(project({ project_type: "bus reroute" }).project_family).toBe("other");
    expect(project({ project_type: "bus service contract" }).project_family).toBe("other");
    expect(project({ project_type: "transportation improvements", description: "Generic street and parking improvements near bus service." }).project_family).toBe(
      "other",
    );
  });

	  it("maps exact bicycle network project types without generic network broadening", () => {
	    expect(project({ project_type: "bicycle_network" }).project_family).toBe("bike_facility");
	    expect(project({ project_type: "Bicycle Network" }).project_family).toBe("bike_facility");
    expect(project({ project_name: "Permanent Bike Racks on Bus Routes Crossing Bridges", description: "Installation of permanent bike racks on four bus routes crossing bridges." }).project_family).toBe(
      "bike_facility",
    );
    expect(project({ project_name: "Cross-Bay Bridge Bicycle and Pedestrian Improvements", description: "Cycling allowed on temporary shared use path." }).project_family).toBe("bike_facility");
    expect(
      project({
        project_name: "Secure Bike Storage Pod at Grand Central Terminal",
        description: "Installation of Oonee secure bike storage pod at Grand Central Terminal.",
      }).project_family,
    ).toBe("bike_facility");
    expect(project({ project_name: "Generic bridge access study", description: "General pedestrian ramp access discussion at a bridge." }).project_family).toBeUndefined();
    expect(project({ project_name: "Bike and bus route planning", description: "General bike and bus route discussion on a corridor." }).project_family).toBeUndefined();
	    expect(
	      project({
	        project_type: "small business mentoring program",
        description: "Installation of bicycle racks and related work at 14 Metro-North Stations.",
      }).project_family,
    ).toBe("bike_facility");
    expect(project({ project_type: "network expansion" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "system expansion", description: "Ronkonkoma Double Track system expansion completed on time in 2018." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "street improvement" }).project_family).toBe("other");
    expect(project({ project_type: "bus reroute" }).project_family).toBe("other");
    expect(project({ project_type: "small business mentoring program", description: "Small business mentoring services and loan repayment administration." }).project_family).toBe(
      "other",
    );
  });

	  it("maps capacity improvements only when payload proves rail infrastructure work", () => {
	    expect(
	      project({
	        project_type: "capacity improvement",
        description: "Stage 1: Platform F and associated station tracks. Stage 2: MET Interlocking, Beaver Interlocking, and Union Crossover.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "capacity improvement" }).project_family).toBe("other");
	    expect(project({ project_type: "capacity improvement", description: "Increase operating capacity through schedule adjustments." }).project_family).toBe("other");
	    expect(project({ project_type: "network expansion", description: "Second Avenue Subway Phase 1 within the capital program." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "system expansion", description: "Double track expansion on the Ronkonkoma Branch." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "resiliency", description: "Strategy includes capital projects, operating actions, and interagency actions." }).project_family).toBe("other");
	  });

	  it("maps predictive-maintenance technology only with rolling-stock or repair-plan payload proof", () => {
	    expect(
	      project({
	        project_type: "technology initiative",
	        project_name: "Rolling Stock Predictive Maintenance Application",
	        description: "Implement predictive maintenance solutions powered by artificial intelligence and machine learning for rolling stock.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "AI maintenance system",
	        description: "Uses Artificial Intelligence to create maintenance repair plans before failures actually occur.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "technology initiative", description: "Paratransit customers receive authorization for taxis through the MYMTA Web/APP." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "technology implementation", description: "Transform customer call centers into a multi-channel contact center." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "technology initiative", description: "Artificial intelligence dashboard for customer outreach." }).project_family).toBe("technology_system");
	  });

	  it("maps bus maintenance systems only with bus asset-management or predictive-maintenance proof", () => {
	    expect(
	      project({
	        project_type: "IT system replacement",
	        description: "Replace aging EAM systems used to manage vehicle assets, maintenance work orders, labor, and material expenses for bus and non-revenue fleets.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "IT system implementation",
	        description: "Replace 29-year-old CMMS in 27 bus depots and four shops with a new Hexagon Enterprise Asset Management system for the Department of Buses and MTA Bus Company.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "miscellaneous service contract modification",
	        description: "Preteckt prognostic maintenance services for NYCT Department of Buses and MTA Bus Company, increasing the quantity of buses monitored.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "predictive maintenance initiative",
	        description: "Application of predictive maintenance strategies to signal, bus telematics and on-board bus technology assets.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "analytics expansion",
	        description: "Expanding Prognostic Maintenance analytics for the Department of Buses.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "IT system replacement", description: "Replace aging enterprise applications for finance reporting." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "IT system implementation", description: "Implement a customer contact center CRM platform." }).project_family).toBe("other");
	    expect(project({ project_type: "miscellaneous service contract modification", description: "Modify software support services for office systems." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "predictive maintenance initiative", description: "Predictive analytics dashboard for customer outreach." }).project_family).toBe(
	      "other",
	    );
	  });

	  it("maps resiliency projects only when payload proves flood-mitigation infrastructure work", () => {
	    expect(
	      project({
	        project_type: "resiliency",
	        description: "Funding for new projects to mitigate flash floods and extreme weather on the subway system.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "resiliency", name: "Preventing Stair Flooding", description: "Increasing Resiliency - Preventing Stair Flooding." }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(
	      project({
	        project_type: "Disaster Recovery Restoration",
	        description: "New grant funded project to address Superstorm Sandy damage at the Coney Island Complex through the Sandy restoration program.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
		    expect(
		      project({
		        project_type: "resilience / climate protection",
		        description: "Protecting over 20 miles of the Hudson Line from climate threats including torrential rain flooding and sea level rise flooding.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "resiliency", description: "Increasing Resiliency - Fortifying MNR's Hudson Line." }).project_family).toBe(
		      "capital_or_infrastructure",
		    );
		    expect(project({ project_type: "resilience", description: "Bundling the Hammels Wye and the South Channel Bridge projects together." }).project_family).toBe(
		      "capital_or_infrastructure",
		    );
		    expect(project({ project_type: "resiliency", description: "Strategy includes capital projects, operating actions, and interagency actions." }).project_family).toBe("other");
		    expect(
		      project({
		        project_type: "climate resilience strategy",
		        description: "Shield subway stations and tunnels by keeping stormwater out. Includes capital projects and track drain cleaning.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "climate resilience strategy", description: "Strategy to reduce Metro-North flooding affecting the Hudson Line." }).project_family).toBe(
		      "capital_or_infrastructure",
		    );
		    expect(
		      project({
		        project_type: "strategy",
		        description: "Climate Resilience Roadmap assessment of current and future climate vulnerabilities and implementation framework.",
		      }).project_family,
		    ).toBe("planning_or_report");
		    expect(project({ project_type: "License Agreement", description: "License agreement for staging area on DEP property for resiliency improvements." }).project_family).toBe(
		      "real_estate_or_property",
		    );
	  });

  it("maps security programs only when payload proves camera enforcement context", () => {
    expect(project({ project_type: "security program", description: "System-wide camera expansion with CCTV in subway cars and station camera feeds." }).project_family).toBe(
      "enforcement_program",
    );
    expect(project({ project_type: "security", description: "Monitor security cameras and retrieve electronic video data for law enforcement agencies." }).project_family).toBe(
      "enforcement_program",
    );
    expect(project({ project_type: "security initiative", description: "Security Command Center staff respond to camera video requests and deploy camera units." }).project_family).toBe(
      "enforcement_program",
    );
    expect(project({ project_type: "security program", description: "Security staffing and patrol coordination program." }).project_family).toBe("other");
    expect(project({ project_type: "security initiative", description: "Security staffing and patrol coordination initiative." }).project_family).toBe("other");
  });

  it("maps GCT security-system replacements only with bounded safety-infrastructure proof", () => {
    expect(
      project({
        project_type: "security system replacement",
        project_name: "Bringing Metro-North's Security Systems into State of Good Repair",
        description: "Replacement of security systems throughout Grand Central Terminal, the Grand Central Train Shed, and the Park Avenue Tunnel.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "security system replacement", description: "Replacement of security systems." }).project_family).toBe("other");
    expect(project({ project_type: "security system replacement", description: "Security systems support contract for office facilities." }).project_family).toBe("other");
  });

  it("maps conductor-cab camera deployments only with worker-safety proof", () => {
    expect(project({ project_type: "deployment", description: "Conductor cab cameras deployed in every conductor cab as part of frontline worker safety efforts." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_type: "deployment", description: "Camera deployment schedule for transit facilities." }).project_family).toBe("other");
    expect(project({ project_type: "deployment", description: "Frontline worker safety outreach and training deployment." }).project_family).toBe("other");
    expect(project({ project_type: "deployment", description: "Conductor cab camera deployment schedule." }).project_family).toBe("other");
  });

  it("maps PTASP and agency safety plan projects only with explicit safety-plan proof", () => {
    expect(project({ project_name: "NYCT Agency Safety Plan", description: "Agency Safety Plan/System Safety Program Plan for Buses." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ name: "2023 Public Transportation Agency Safety Plan - Department of Buses", description: "2023 PTASP for NYCT Department of Buses." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ name: "2023 Public Transportation Agency Safety Plan - Department of Subways", description: "2023 PTASP for NYCT Department of Subways." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_name: "Promoting Public Safety", description: "General public safety update." }).project_family).toBeUndefined();
    expect(project({ project_name: "NTSB Recommendations Update", description: "Safety recommendations update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Joint Track Safety Audit Program", description: "Joint track safety audit program." }).project_family).toBeUndefined();
  });

  it("maps operating-efficiency initiatives to enforcement only when payload proves bus camera enforcement", () => {
    expect(
      project({
        project_type: "operating efficiency initiative",
        description: "Expand Automated Bus Lane Enforcement by installing cameras on 700 additional buses.",
      }).project_family,
    ).toBe("enforcement_program");
    expect(project({ project_type: "operating efficiency initiative", description: "Install cameras on additional buses for ABLE." }).project_family).toBe(
      "enforcement_program",
    );
    expect(project({ project_type: "operating efficiency initiative", description: "Optimize overtime utilization and timekeeping rules." }).project_family).toBe(
      "internal_operations",
    );
    expect(project({ project_type: "operating efficiency initiative", description: "Improve employee availability and customer service coverage." }).project_family).toBe(
      "internal_operations",
    );
    expect(project({ project_type: "operating efficiency initiative", description: "Use technology to identify bus maintenance needs." }).project_family).toBe(
      "internal_operations",
    );
  });

  it("maps bus predictive-maintenance operating-efficiency initiatives only with explicit predictive bus maintenance proof", () => {
    expect(
      project({
        project_type: "operating efficiency initiative",
        project_name: "Roll out Bus Predictive Maintenance",
        description: "Use technology to more efficiently identify maintenance needs, reducing incidents on the road while lowering costs.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "operating efficiency initiative", description: "Use technology to identify bus maintenance needs." }).project_family).toBe(
      "internal_operations",
    );
    expect(project({ project_type: "operating efficiency initiative", description: "Railroads train scheduling uses passenger loading data and technology to optimize resources." }).project_family).toBe(
      "internal_operations",
    );
    expect(project({ project_type: "operating efficiency initiative", description: "Rolling stock inspection process improvements and resource optimization." }).project_family).toBe(
      "internal_operations",
    );
  });

	  it("maps maintenance contracts only when payload proves camera or accessibility assets", () => {
	    expect(project({ project_type: "maintenance contract", description: "Maintenance and support services for the bus camera security system." }).project_family).toBe(
	      "enforcement_program",
	    );
	    expect(
	      project({
	        project_type: "Miscellaneous Service Contract",
	        description: "Maintenance and support services for the MTA Bus Camera Security System.",
	      }).project_family,
	    ).toBe("enforcement_program");
	    expect(project({ project_type: "maintenance contract", description: "Maintenance, inspection, and repair services for station escalators." }).project_family).toBe(
	      "accessibility_or_safety",
	    );
	    expect(project({ project_type: "maintenance contract", description: "General maintenance and support services." }).project_family).toBe("other");
		    expect(project({ project_type: "Miscellaneous Service Contract", description: "Implement HASTUS crew dispatch and management software." }).project_family).toBe(
		      "technology_system",
		    );
	    expect(project({ project_type: "Miscellaneous Service Contract", description: "Small business mentoring services and loan repayment administration." }).project_family).toBe(
	      "internal_operations",
	    );
	  });

  it("maps obsolete rail-car disposal service contracts only with fleet-asset disposal proof", () => {
    expect(
      project({
        project_type: "miscellaneous service contract",
        description: "Removal and disposal of obsolete subway/rail cars for NYC Transit, LIRR, and MNR.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "miscellaneous service contract", description: "Removal and disposal of office furniture and miscellaneous equipment." }).project_family).toBe(
      "other",
    );
    expect(project({ project_type: "miscellaneous service contract", description: "MTA-wide Energy Management System for utility billing data management." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "miscellaneous service contract", description: "Small Business Development and Mentoring Program management contract." }).project_family).toBe(
      "internal_operations",
    );
  });

  it("maps engineering controls only when payload proves safety outcomes", () => {
    expect(project({ project_type: "engineering control", description: "Roadway improvement achieving 75% reduction in vehicular collisions." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_type: "engineering control", description: "Engineering control initiative for operating procedures." }).project_family).toBe("other");
  });

  it("maps street improvements only when payload proves bus-priority context", () => {
    expect(project({ project_type: "street improvement", description: "Launched Select Bus Service with bus lanes, signal timing, and bus stop amenities." }).project_family).toBe(
      "bus_priority",
    );
    expect(project({ project_type: "Street Improvement Project", description: "Project included bus lanes and bus boarding islands at bus stops." }).project_family).toBe("bus_priority");
    expect(
      project({
        project_type: "Major Transportation Project",
        description:
          "Street design project including bus lanes, daylighting, pedestrian safety islands, signal-protected pedestrian crossings, signal retiming, dedicated vehicle loading/unloading zones, bus stops, and painted pedestrian curb extensions.",
      }).project_family,
    ).toBe("bus_priority");
    expect(project({ project_type: "street improvement", description: "Roadway resurfacing and sidewalk repair project." }).project_family).toBe("other");
    expect(project({ project_type: "Major Transportation Project", description: "Bus lanes and general corridor discussion." }).project_family).toBe("other");
    expect(
      project({
        project_type: "curbside changes",
        description: "Curbside changes including bus lanes, truck loading zones, turn bays, taxi stand relocation, and parking changes.",
      }).project_family,
    ).toBe("street_redesign");
    expect(project({ project_type: "curbside changes", description: "Curbside bus lane discussion without curb regulation or parking changes." }).project_family).toBe(
      "other",
    );
    expect(
      project({
        project_name: "Lexington Avenue, 60th Street to 52nd Street Offset Bus Lane",
        description: "NYC DOT proposes converting the existing curbside bus lane into an offset bus lane to improve bus operations.",
      }).project_family,
    ).toBe("bus_lane");
    expect(
      project({
        project_name: "116th Street, Morningside Avenue to Pleasant Avenue Study",
        description: "Studying bus priority and pedestrian safety improvements on 116th Street. Study area serves ten bus routes carrying daily riders.",
      }).project_family,
    ).toBe("bus_priority");
    expect(project({ project_name: "Traffic Signal Priority", description: "Transit Signal Priority / TSP project." }).project_family).toBeUndefined();
    expect(project({ project_name: "Depot work", description: "Bus depot painting project." }).project_family).toBeUndefined();
  });

  it("maps street conversions only with concrete two-way street access proof", () => {
    expect(
      project({
        project_type: "street conversion",
        description: "CB7 and Sheraton request for 2-way conversion of 39 Av between Prince St and Main St. Increases access opportunities to Sheraton and parking from Prince St.",
      }).project_family,
    ).toBe("street_redesign");
    expect(project({ project_type: "street conversion", description: "General street conversion study." }).project_family).toBe("other");
    expect(project({ project_type: "street conversion", description: "Utility conversion work below the street." }).project_family).toBe("other");
  });

  it("maps bus stop improvements only when payload proves boarding-stop context", () => {
    expect(
      project({
        project_type: "bus_stop_improvement",
        description: "Add bus boarding island and painted pedestrian space, lengthen bus stop, improve accessibility and pedestrian safety.",
      }).project_family,
    ).toBe("bus_priority");
    expect(
      project({
        project_type: "curb extension / bus bulb",
        description: "Curb extension bus bulb proposals for the 125th Street and Lexington Avenue intersection.",
      }).project_family,
    ).toBe("bus_priority");
    expect(project({ project_type: "bus stop improvement" }).project_family).toBe("other");
    expect(project({ project_type: "bus_stop_improvement", description: "General streetscape improvement near transit." }).project_family).toBe("other");
    expect(project({ project_type: "curb extension", description: "Curb extension proposal for pedestrian space." }).project_family).toBe("other");
    expect(project({ project_type: "curbside changes", description: "Bus lanes, truck loading zones, turn bays, taxi stand relocation, and parking changes." }).project_family).toBe(
      "other",
    );
    expect(project({ project_type: "curb regulation changes", description: "Metered parking, truck loading zones, and turn bays on 126th Street." }).project_family).toBe(
      "street_redesign",
    );
  });

  it("maps transit priority projects only with bus-stop accessibility proof", () => {
    expect(
      project({
        project_type: "transit priority",
        description:
          "Proposal to relocate B14 bus stops to southern pedestrian malls, install ADA ramps, remove Rochester Avenue bus stop, and retain right turn bays.",
      }).project_family,
    ).toBe("bus_priority");
    expect(project({ project_type: "transit priority", description: "Targeted transit priority treatments." }).project_family).toBe("other");
    expect(project({ project_type: "transit priority", description: "No bus lanes. Signal timing and corridor discussion." }).project_family).toBe("other");
  });

  it("maps streetscape improvements only with pedestrian or curb-extension safety proof", () => {
    expect(
      project({
        project_type: "streetscape improvement",
        description: "DDC streetscape construction on East 86th Street, including pedestrian improvements, bus bulbs, and neckdowns.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "streetscape improvement", description: "General streetscape improvement near transit." }).project_family).toBe("other");
    expect(project({ project_type: "streetscape improvement", description: "Retail plaza landscaping and wayfinding updates." }).project_family).toBe("other");
  });

		  it("maps bus reroutes only when payload proves route or service changes", () => {
		    expect(
		      project({
		        project_type: "bus reroute",
	        name: "M100 Reroute in East Harlem",
	        description: "Proposed reroute to eliminate an unsafe left turn, reduce delays, and increase service on 125th Street.",
      }).project_family,
	    ).toBe("service_change");
		    expect(project({ project_type: "bus reroute" }).project_family).toBe("other");
		    expect(project({ project_type: "bus_reroute", description: "Bus-priority planning discussion." }).project_family).toBe("other");
		    expect(
		      project({
		        project_type: "service_frequency_increase",
		        description: "Off-peak service frequency increases on the G, J, and M lines, reducing waiting times on weekends.",
		      }).project_family,
		    ).toBe("service_change");
		  });

		  it("maps bus service contracts only when payload proves fixed-route feeder service", () => {
		    expect(
		      project({
		        project_type: "bus service contract",
		        description: "Fixed-route scheduled feeder bus service between Metro-North stations and surrounding neighborhoods.",
	      }).project_family,
	    ).toBe("service_change");
	    expect(project({ project_type: "bus service contract" }).project_family).toBe("other");
		    expect(project({ project_type: "bus service contract", description: "Continuation of emergency and scheduled bus services." }).project_family).toBe("other");
		    expect(project({ project_type: "bus service contract", description: "General bus operations contract." }).project_family).toBe("other");
		  });

			  it("maps employer-based shuttle agreement amendments only with shuttle-agreement proof", () => {
			    expect(
			      project({
			        project_type: "agreement amendment",
		        description: "Amendment to extend the term of the Westchester County Employer-Based Shuttle Agreement.",
		      }).project_family,
		    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "interagency agreement",
			        description: "Amendment to extend Employer-Based Shuttle Agreement and subsidize shuttles providing connecting bus service to Metro-North stations.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "memorandum_of_understanding",
			        description: "MOU reimburses the City of Newburgh for lease payments for parking and ferry landing facilities used by the Newburgh-Beacon Ferry.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(project({ project_type: "agreement amendment", description: "Amendment to extend a professional services agreement." }).project_family).toBe("other");
				    expect(project({ project_type: "shuttle", description: "Shuttle bus project supervision." }).project_family).toBe("other");
					    expect(project({ project_type: "grant", description: "Grant to support connecting services for Metro-North stations." }).project_family).toBe("finance_or_funding");
				  });

			  it("maps named shuttle and rail-link service records without as-needed bus-service broadening", () => {
			    expect(
			      project({
			        project_name: "A Shuttle",
			        project_type: "shuttle",
			        description: "Shuttle bus project where supervisors ensured customer service.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "shuttle service",
			        description: "Supplemental Bridgeport/Waterbury Shuttle bus services due to increased ridership.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "rail and shuttle bus service",
			        description: "South Fork Commuter Connection coordinated weekday train and shuttle bus service between Speonk and Montauk.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "contract modification",
			        description: "Exercise renewal option and provide additional funding for continuation of Hudson Rail Link bus services.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "contract modification",
			        description: "Continuation of as-needed Emergency and Scheduled Bus Services with five bus companies for MNR.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_type: "procurement - contract modification",
			        description: "Exercise of Option years for Primary Carrier Transportation Service for Access-A-Ride paratransit service.",
			      }).project_family,
			    ).toBe("service_change");
			    expect(
			      project({
			        project_name: "Access-A-Ride Primary Carrier Service Option Years",
			        project_type: "procurement - contract modification",
			        status: "proposed for Board approval",
			        description: "Exercise of Option years for three Primary Carrier contracts for Access-A-Ride paratransit service.",
			        document_time_status: "planned",
			        project_family: "other",
			      }).project_family,
			    ).toBe("service_change");
			    expect(project({ project_type: "shuttle", description: "Shuttle bus project supervision." }).project_family).toBe("other");
			    expect(project({ project_type: "contract modification", description: "Continuation of emergency and scheduled bus services." }).project_family).toBe("other");
			    expect(project({ project_name: "Paratransit Procurement", description: "Procurement contract for Access-A-Ride paratransit service providers." }).project_family).toBeUndefined();
			    expect(
			      project({
			        project_type: "procurement - contract modification",
			        description: "Exercise of Option years for Primary Carrier contracts.",
			      }).project_family,
			    ).toBe("other");
			    expect(
			      project({
			        project_type: "procurement - contract modification",
			        description: "Exercise of Option years for Access-A-Ride paratransit service providers.",
			      }).project_family,
			    ).toBe("other");
			    expect(project({ project_type: "shuttle service", description: "Generic shuttle service discussion." }).project_family).toBe("other");
			  });

			  it("maps HOV bus-lane operations modifications only with Verrazzano bus-lane proof", () => {
			    expect(
			      project({
			        project_type: "public works contract modification",
			        description: "Modify contract for HOV/Bus Lane Operations at the Verrazzano-Narrows Bridge.",
			      }).project_family,
			    ).toBe("bus_priority");
			    expect(
			      project({
			        project_type: "contract modification",
			        description: "Barrier Transfer Machine operations and HOV/Bus Lane services at VNB.",
			      }).project_family,
			    ).toBe("bus_priority");
			    expect(project({ project_type: "public works contract amendment", description: "Median Barrier Transfer Services Extension on the Verrazzano-Narrows Bridge." }).project_family).toBe(
			      "other",
			    );
			    expect(
			      project({
			        project_type: "public works contract amendment",
			        description: "Median Barrier Transfer Services Extension on the Verrazzano-Narrows Bridge until services are performed under capital project VN-84B.",
			      }).project_family,
			    ).toBe("capital_or_infrastructure");
			    expect(project({ project_type: "contract modification", description: "General HOV operations contract." }).project_family).toBe("other");
			  });

			  it("maps maintenance projects only when payload proves rail or bridge infrastructure work", () => {
		    expect(project({ project_type: "maintenance", description: "Waterproofing of the Van Wyck Bridge." }).project_family).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "maintenance",
	        description: "Bridge maintenance, mud remediation, thermite welding, and track surfacing on the Montauk Branch.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "maintenance",
	        description: "Significant increase in infrastructure in vertical equipment, fire systems, and HVAC requiring inspection, preventive, and reactive maintenance.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "maintenance",
	        description: "Grand Central Madison contractor maintenance and wireless cellular installation supported during the timetable.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "maintenance",
	        description: "Weekend contractor maintenance at Grand Central Madison with one of two main tracks out of service.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "maintenance", description: "Weekend contractor maintenance with one of two main tracks out of service." }).project_family).toBe("other");
	    expect(project({ project_type: "maintenance", description: "Contractor maintenance and wireless cellular installation." }).project_family).toBe("other");
	    expect(project({ project_type: "maintenance", description: "General maintenance requirements for new assets." }).project_family).toBe("other");
	    expect(project({ project_type: "maintenance", description: "HVAC maintenance scheduling and contractor staffing update." }).project_family).toBe("other");
	  });

	  it("maps rehabilitation projects only when payload proves station or tunnel infrastructure work", () => {
	    expect(project({ project_type: "rehabilitation", name: "ADA Station Rehabilitation at Babylon" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "rehabilitation", name: "ADA Station Reconstruction on the Montauk Branch" }).project_family).toBe(
	      "capital_or_infrastructure",
	    );
	    expect(project({ project_type: "rehabilitation", name: "East River Tunnel Hurricane Sandy Rehabilitation" }).project_family).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "rehabilitation",
	        project_name: "Rehabilitation of Hugh L. Carey Tunnel Manhattan Plaza",
	        description: "Rehabilitation of the Hugh L. Carey Tunnel entrance with electrical and communications systems, structural retaining wall repairs, and drainage improvements.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "rehabilitation",
	        project_name: "RFK Fleet Garage Exit Corridor Repairs",
	        description:
	          "Rehabilitation and repair of exit corridors and miscellaneous spaces at MTA Bridges and Tunnels' RFK Fleet Garage at Randall's Island, including additional civil, mechanical and electrical work.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "rehabilitation", description: "General rehabilitation project update." }).project_family).toBe("other");
	    expect(project({ project_type: "rehabilitation", project_name: "L Train Tunnel Project", description: "Mentioned under Strengthen & Expand Network section." }).project_family).toBe(
	      "other",
	    );
    expect(
      project({
        project_type: "rehabilitation",
        project_name: "L Train Tunnel Project",
        description: "Mentioned under Strengthen & Expand Network section.",
        _merged_field_values: {
          description: ["Night and weekend shutdown approach cut six months off the schedule and $100 million off the budget"],
        },
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "rehabilitation", project_name: "Rutgers Tube project", description: "Night and weekend shutdown approach with similarly impressive results." }).project_family).toBe(
	      "other",
	    );
    expect(
      project({
        project_type: "rehabilitation",
        project_name: "Rutgers Tube project",
        description: "Night and weekend shutdown approach with similarly impressive results.",
        _merged_field_values: {
          description: ["Final rehabilitation of a Superstorm Sandy damaged tunnel"],
        },
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "rehabilitation", name: "Rockaways Rehab Project" }).project_family).toBe("other");
    expect(
      project({
        project_type: "rehabilitation",
        project_name: "Rockaways Rehab Project",
        description: "Rehabilitation project in the Rockaways with progress by Schiavone Construction, MTA C&D, and the Department of Subways.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "rehabilitation", description: "Repair exit corridors and spaces at a fleet facility." }).project_family).toBe("other");
	  });

	  it("maps bridge and rail inspection contracts only when payload proves infrastructure work", () => {
	    expect(
	      project({
        project_type: "inspection",
        name: "2022 Biennial Bridge Inspections - Robert F. Kennedy and Verrazzano-Narrows Bridges",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "personal_service_contracts",
	        description: "2021 Biennial Bridge Inspection & Design of Miscellaneous Structural Repairs at Throgs Neck and Bronx-Whitestone bridges.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "Personal Service Contract",
	        project_name: "2021 Routine Tunnel Inspections at the Queens-Midtown and Hugh L. Carey Tunnels",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "public_works_contract",
	        description: "Five-year contract for FRA-mandated ultrasonic rail flaw and joint bar inspection services for LIRR and MNR.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "contract extension",
	        description: "One-year extension for continued FRA-mandated ultrasonic rail testing and joint bar detection services.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "public work contract",
	        description: "Three-year contract for a Continuous Work Platform to Loram Maintenance of Way for railway maintenance work.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "public work contract",
	        description: "Rail vacuum services excavating ballast, mud, and debris along the railway in electrified territory.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "public_works_contract", description: "Partial building demolition of the LIRR section of the building." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "public_works_contract", description: "Partial building demolition for a general office building." }).project_family).toBe("other");
	    expect(project({ project_type: "public work contract", description: "General public work contract administration services." }).project_family).toBe("other");
	    expect(
	      project({
	        project_type: "contract extension",
	        description:
	          "Small Business Mentoring Program goal for the current year is 70 projects totaling $75 million, with projects awarded, bidding, pending an award, and pending bid opening.",
	      }).project_family,
	    ).toBe("internal_operations");
	    expect(project({ project_type: "contract extension", description: "Small Business Mentoring Program contract extension." }).project_family).toBe("other");
    expect(
      project({
        project_type: "personal_service_contracts",
        project_name: "Miscellaneous Intelligent Transportation System & Operations Systems Consultant Design Services on an As-Needed Basis",
        description:
          "B&T competitively solicited personal service contracts to four firms for ITS and Operations Systems consultant design services on an as-needed basis, aggregate estimated amount of $15 million over five years.",
      }).project_family,
    ).toBe("technology_system");
	    expect(
	      project({
	        project_type: "personal_service_contracts",
	        description: "Intelligent Transportation System and Operations Systems consultant design services on an as-needed basis.",
	      }).project_family,
	    ).toBe("other");
	    expect(project({ project_type: "Personal Service Contract", description: "Project management consultant services for customer service center contracts." }).project_family).toBe(
	      "internal_operations",
	    );
	    expect(
	      project({
	        project_type: "Personal Service Contract",
	        description: "Traffic and Revenue Assessments and Environmental Review of TBTA Toll-Related Actions.",
	      }).project_family,
	    ).toBe("fare_program");
	    expect(project({ project_type: "Personal Service Contract", description: "Revenue assessments and environmental review of toll-related actions." }).project_family).toBe(
	      "other",
	    );
	    expect(project({ project_type: "inspection", description: "General inspection services." }).project_family).toBe("other");
		  });

	  it("maps NYPA energy-efficiency agreements only with MCRA project proof", () => {
	    expect(
	      project({
	        project_type: "energy efficiency agreement",
	        description: "Master Cost Recovery Agreement (MCRA) between NYPA and MTA for energy efficiency projects.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "energy efficiency agreement", description: "General energy efficiency agreement." }).project_family).toBe("other");
	  });

	  it("maps design-bid-build records only when payload proves bridge or viaduct structural work", () => {
	    expect(
	      project({
	        project_type: "Design-Bid-Build",
	        description: "Structural rehabilitation at Robert F. Kennedy Bridge with steel and concrete repairs and strengthening of bridge spans.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(
	      project({
	        project_type: "Design-Bid-Build",
	        description: "Steel and concrete rehabilitation of Bronx and Queens viaducts with replacement of bearings.",
	      }).project_family,
	    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "Design-Bid-Build", description: "General design-bid-build delivery package." }).project_family).toBe("other");
	    expect(project({ project_type: "Design-Bid-Build", description: "Technology system implementation." }).project_family).toBe("other");
	  });

	  it("maps design-build public works contracts only when payload proves physical infrastructure work", () => {
    expect(
      project({
        project_type: "design-build public works contract",
        name: "Electrical Power Resiliency, Utility and Building Improvements at the Henry Hudson Bridge",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "design_build_public_works_contract",
        description: "Replacement of tower elevator systems and miscellaneous repairs at the Marine Parkway-Gil Hodges Memorial Bridge.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "Design-Build Public Works",
        description:
          "New Pedestrian Walkway and Fender System Rehabilitation at the Robert F. Kennedy Bridge, connecting to a future greenway project.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "design-build public works contract",
        description: "New pedestrian walkway and fender rehabilitation at the Robert F. Kennedy Bridge.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "design-build public works contract", description: "General public works contract delivery." }).project_family).toBe("other");
    expect(project({ project_type: "design-build contract", description: "General design-build contract delivery." }).project_family).toBe("other");
  });

  it("maps design-build delivery to capital infrastructure only with physical infrastructure payload proof", () => {
    expect(project({ project_type: "design-build", description: "CBTC signal system on the G Line with interlockings and track work." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "Design-Build", description: "Rehabilitation of bridge spans, main cables, anchorage structures, and painting." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "design-build contract", description: "Fire suppression system at the Hugh L. Carey Tunnel and Queens-Midtown Tunnel." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "design-build", description: "Flood mitigation elements at NYCT substations." }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "Design-Build", description: "Circulation improvements at Grand Central-42nd Street Station." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "Design-Build", description: "Laser intrusion detection system in under-river subway tubes and subway stations." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(project({ project_type: "Design-Build", description: "Installation of electronic monitoring and detection systems at the Bronx-Whitestone and Robert F. Kennedy Bridges." }).project_family).toBe(
      "accessibility_or_safety",
    );
    expect(
      project({
        project_type: "Design-Build",
        description: "Overhaul and replacement of facility monitoring and safety systems at the Hugh L. Carey Tunnel and Queens Midtown Tunnel, including security infrastructure, CCTV, access control, intrusion detection, fire alarm monitoring, and real-time digital traffic signs.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_type: "Design-Build",
        description: "Facility monitoring and safety systems at Hugh L. Carey Tunnel and QMT, including security infrastructure, access control, intrusion detection, and secondary fire alarm generator monitoring.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(project({ project_type: "Design-Build", description: "Replace and upgrade PA/CIS public address and customer information sign system along the Canarsie Line." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(project({ project_type: "Design-Build", description: "Installation of CCTV cameras at station fare control areas." }).project_family).toBe("enforcement_program");
    expect(project({ project_type: "Design-Build", description: "Radio system upgrades and private branch exchange audio call recording." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "Design-Build", description: "Connection-Oriented Ethernet network upgrade to enhance CCTV streaming capacity." }).project_family).toBe(
      "technology_system",
    );
    expect(project({ project_type: "design-build", description: "Public Address/Customer Information Sign PA/CIS upgrade." }).project_family).toBe("other");
    expect(project({ project_type: "Design-Build", description: "Facility monitoring and safety systems with security infrastructure." }).project_family).toBe(
      "other",
    );
	  });

  it("maps no-type named physical infrastructure surfaces only with bounded asset-work proof", () => {
    expect(
      project({
        project_name: "Babylon Station Full Reconstruction",
        description: "$125 million full reconstruction of Babylon Station, rehabilitating platforms and other station components.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "LIRR 33rd Street Concourse",
        description: "New LIRR concourse at 33rd Street at Penn Station, opening early 2023.",
        status: "under construction",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Canarsie Tube",
        description: "On-time completion without full closure $100 million under budget.",
        status: "Completed",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Pleasantville Substation",
        description: "Construction of a new electrical substation to strengthen the traction power system on the Harlem Line.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Phase 1 of the Reconstruction of the VNB Upper level Brooklyn and Staten Island Approach and Anchors Spans",
        description: "Replace deck on Brooklyn Approach and replace structural steel and decks of Anchorages.",
      }).project_family,
    ).toBe("capital_or_infrastructure");

    expect(
      project({
        project_name: "Metro-North Hudson Line Climate Resilience Blueprint",
        description:
          "Will rebuild critical infrastructure, including culverts, drainage, retaining walls, slopes, shorelines, and track, with attention focused on a 20-mile stretch between Riverdale and Croton-Harmon.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Climate Resilience Hudson Line Design Stabilization",
        description: "Climate Resilience Hudson Line Design Stabilization",
        program: "MTA Metro-North Railroad",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "Hudson Line resiliency",
        status: "initial investment received",
        description: "Metro-North received $20 million from the State budget for an initial investment in Hudson Line resiliency.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_name: "Interboro Express", description: "Major capital project listed in MTA Board Update on Federal Funding." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_name: "Tibbets Brook Daylighting Project",
        description: "Install a combination of open channel and closed conduit to redirect base water flow out of the Broadway sewer.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(
      project({
        project_name: "VNB Safety Fence",
        description: "Design-build project for installation of a safety fence on the upper and lower level suspended spans of the Verrazzano-Narrows Bridge.",
      }).project_family,
    ).toBe("capital_or_infrastructure");

    expect(project({ project_name: "Subway Cell Connectivity", description: "Bring continuous cell connectivity throughout subway tunnels." }).project_family).toBeUndefined();
    expect(project({ project_name: "Verrazano Bridge Bi-Directional Cashless Tolling", description: "2020 completion project." }).project_family).toBe("fare_program");
    expect(project({ project_name: "Two-way Tolling at the Verrazzano-Narrows Bridge", description: "Reconfiguration of tolling area to enable two-way tolling." }).project_family).toBe(
      "fare_program",
    );
    expect(project({ project_name: "Verrazzano Bridge Work", description: "Bridge maintenance and median barrier transfer services." }).project_family).toBeUndefined();
    expect(project({ project_name: "GCT Retail Licensing Modification", description: "Short-term retail licensing at Grand Central Terminal." }).project_family).toBeUndefined();
    expect(
      project({
        project_name: "Second Avenue Subway 125th Street Westward Extension",
        description: "Planning analysis of a westward extension of Second Avenue Subway along 125th Street, potentially allowing tunnel boring machines to continue.",
      }).project_family,
    ).toBe("planning_or_report");
    expect(
      project({
        project_name: "Second Avenue Subway 125th Street Westward Extension",
        description: "Planning analysis of a westward extension of Second Avenue Subway along 125th Street without tunnel-boring-machine detail.",
      }).project_family,
    ).toBeUndefined();
    expect(project({ project_name: "Climate resilience blueprint", description: "Strategy includes capital projects, operating actions, and interagency actions." }).project_family).toBeUndefined();
    expect(project({ project_name: "Model G Train Project", description: "Model G Train Project Sets a New Standard." }).project_family).toBeUndefined();
  });

  it("maps no-type planning, policy, technology, safety, and pilot surfaces only with exact payload proof", () => {
    expect(
      project({
        project_name: "2024 Corporate Governance Committee Work Plan",
        description: "Recurring and specific agenda items, including governance principles, by-laws revisions, committee charters, and 2025 work plan approval.",
      }).project_family,
    ).toBe("planning_or_report");
    expect(
      project({
        project_name: "125 St Tunnel",
        status: "advancing planning",
        description: "Potential expansion project mentioned as advancing planning in the 2025-2029 Capital Plan discussion.",
      }).project_family,
    ).toBe("planning_or_report");
    expect(
      project({
        project_name: "MTA Governance Guidelines 2023 Revision",
        description:
          "Revisions to comply with Public Authorities Law Section 1264(1), adding Chief Compliance Officer to conflict of interest section, and changing JCOPE to COELIG to comply with the Ethics Commission Reform Act of 2022.",
      }).project_family,
    ).toBe("policy_program");
    expect(
      project({
        project_name: "Subway Cell Connectivity",
        description: "Partnership with Boldyn Networks to bring continuous cell connectivity throughout 250 miles of subway tunnels.",
      }).project_family,
    ).toBe("technology_system");
    expect(
      project({
        project_name: "MTA Governance, Risk, and Compliance System",
        description: "GRC System SaaS and technical support for a five-year period.",
      }).project_family,
    ).toBe("technology_system");
    expect(
      project({
        project_name: "TBTA Drone Program",
        description: "Advanced technologies to redefine security and operational excellence for TBTA infrastructure, employees, and customers.",
      }).project_family,
    ).toBe("technology_system");
    expect(
      project({
        project_name: "Detectable Warning Surfaces (DWS) Installation",
        description: "Continued work to install Detectable Warning Surfaces at remaining stations.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_name: "Metropolitan Av / Lorimer St elevator project",
        description: "Opened new elevators at Metropolitan Av G and Lorimer St L stations in Brooklyn. Included constructing six new elevators.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_name: "Elevators and escalator replacements citywide",
        status: "awarded",
        description: "2020 project award.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_name: "Installation of Electronic Monitoring & Detection Systems at the Bronx-Whitestone Bridge and the RFK Bridge",
        description: "Installation of electronic traffic monitoring and fire detection systems at the Bronx-Whitestone Bridge and RFK Bridge.",
      }).project_family,
    ).toBe("accessibility_or_safety");
    expect(
      project({
        project_name: "CRZ Timepoint Pilot",
        description: "Pilot evaluating removal of timepoints on seven selected routes to enhance route performance.",
      }).project_family,
    ).toBe("pilot");

    expect(project({ project_name: "Corporate Governance Work Plan", description: "General governance work plan discussion." }).project_family).toBeUndefined();
    expect(
      project({
        project_name: "Interboro Express",
        status: "advancing planning",
        description: "Potential expansion project mentioned as advancing planning in the 2025-2029 Capital Plan discussion.",
      }).project_family,
    ).toBeUndefined();
    expect(project({ project_name: "Governance Guidelines", description: "Committee governance guidelines update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Wireless maintenance", description: "Contractor maintenance and wireless cellular installation." }).project_family).toBeUndefined();
    expect(project({ project_name: "Monitoring systems", description: "Electronic monitoring systems update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Route service changes", description: "Route performance and service efficiency improvements." }).project_family).toBeUndefined();
  });

  it("maps no-type project-family cleanup targets only with bounded payload proof", () => {
    const cases: Array<[JsonObject, string]> = [
      [
        {
          project_name: "Broadway, 157th Street to 220th Street",
          description:
            "Exploring a potential project on Broadway between 157th and 220th St in cooperation with MTA. Study will identify ways to improve bus speeds and reliability.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "Dekalb & Lafayette Avenues",
          description: "NYC DOT and MTA seek to improve B38 bus service and pedestrian and cyclist safety on Dekalb and Lafayette Avenues.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "Eastern Parkway from Schenectady Avenue to Ralph Avenue Accessibility Improvements",
          description: "Aims to create ADA-accessible ramps and bus stops, as well as improve B14 reliability.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "Fordham Road, Major Deegan Expressway to Boston Road",
          description: "Nine bus routes carry 93,700 daily riders. Will evaluate potential design improvements to improve bus speeds and reliability.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "Victory Boulevard from Bay Street to Wild Avenue Bus Service Improvements",
          description: "NYC DOT and MTA seek to improve bus service and safety for all mode users on Victory Boulevard.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "Woodhaven Boulevard, Queens Boulevard to 107th Avenue",
          description:
            "Proposing transit and pedestrian safety improvements along Woodhaven Boulevard. Includes curb extensions, median widenings, raised crosswalks, and new landscaping.",
        },
        "bus_priority",
      ],
      [
        {
          project_name: "42nd Street Corridor Projects",
          description:
            "Three ongoing 42nd Street Corridor projects including escalator replacement at Grand Central Flushing Line, circulation improvements at Grand Central-42nd Street Station, and new elevators at Bryant Park-42nd Street and Fifth Avenue Station.",
          status: "active",
        },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "RFK Bridge",
          description: "Fender rehab and ADA ramp completed on-time and 16% under budget",
          status: "Completed",
        },
        "accessibility_or_safety",
      ],
      [{ project_name: "11 New ADA stations", description: "2020 completion - 11 new ADA accessible stations", status: "completed" }, "accessibility_or_safety"],
      [
        {
          project_name: "ADA Upgrades at Lindenhurst LIRR",
          description: "Fully Accessible Amityville & Lindenhurst - Increase Appeal for Customers - Knocking out Capital Projects",
        },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "Capital Program ADA Accessibility",
          description: "14 new stations completed since onset of COVID, awarding contracts for improvements at another 26",
          status: "ongoing",
        },
        "accessibility_or_safety",
      ],
      [
        { project_name: "LIRR ADA Stations", description: "LIRR ADA Stations project", status: "next steps - upcoming projects" },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "Williams Bridge ADA Station Improvements",
          description: "Acquisition of property interests by negotiated settlement or eminent domain for ADA station improvements at Williams Bridge Station",
          status: "ongoing",
        },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "Mets-Willets Point Station ADA Accessibility Improvements",
          description: "ADA accessibility improvements at Mets-Willets Point station funded by developer at own expense",
          status: "planning",
        },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "battery-electric Access-A-Ride (AAR) van pilot program",
          description: "First of 15 electric vans and cutaway buses to enter service in a pilot program for AAR this year.",
        },
        "pilot",
      ],
      [
        {
          project_name: "DOB's Route Improvement Initiative",
          description: "Program to improve service on historically low performing bus routes, beginning with the B12 in January 2024",
        },
        "service_change",
      ],
      [
        {
          project_name: "AAR E-hail Service Expansion",
          description: "Expanding E-hail service for Paratransit (AAR) to improve service.",
        },
        "service_change",
      ],
      [
        {
          project_name: "MNR Service to Albany",
          description: "Metro-North to launch one daily roundtrip between Grand Central Terminal and Albany",
          status: "announced",
        },
        "service_change",
      ],
      [{ project_name: "City Ticket Expansion", description: "City Ticket Expansion" }, "fare_program"],
      [{ project_name: "Advancing Congestion Pricing", description: "Mentioned under Strengthen & Expand Network section" }, "fare_program"],
      [{ project_name: "Advance Congestion Pricing", description: "MTA initiative to advance congestion pricing" }, "fare_program"],
      [
        {
          project_name: "Cracking Down on Toll Evasion",
          description: "Achieve Financial Stability & Viability - cracking down on toll evasion",
        },
        "enforcement_program",
      ],
      [{ project_name: "FEMA Reimbursement Secured", description: "Achieve Financial Stability & Viability - FEMA Reimbursement secured" }, "finance_or_funding"],
      [
        {
          project_name: "125th Street Curb Regulations",
          description: "New truck loading zones on 125th Street and new parking on 124th and 126th Streets",
        },
        "street_redesign",
      ],
      [
        {
          project_name: "Department of Buses North Star",
          description: "Increase overall customer satisfaction 10% by June 2024",
          status: "active",
        },
        "customer_experience",
      ],
      [
        {
          project_name: "Department of Subways North Star",
          description: "Increase overall customer satisfaction 10% by June 2024",
          status: "active",
        },
        "customer_experience",
      ],
      [
        {
          project_name: "Five-Year Diversity, Equity, and Inclusion (DEI) Strategic Plan NYCT Initiatives",
          status: "Year 1 Progress Report",
          description: "Year 1 (July 1, 2023 - June 30, 2024) Progress Report",
        },
        "planning_or_report",
      ],
      [
        {
          project_name: "MYmta App for Paratransit",
          description: "Launch of the MYmta App for Paratransit which saw an increase in usage in April and May 2023.",
        },
        "technology_system",
      ],
      [
        {
          project_name: "Promoting Public Safety",
          description: "MTA initiative promoting public safety, including homeless outreach partnership with NYC Department of Homeless Services",
        },
        "accessibility_or_safety",
      ],
      [
        {
          project_name: "Achieve Financial Stability",
          description: "NYS Budget eliminates projected deficits through 2027",
        },
        "finance_or_funding",
      ],
      [
        {
          project_name: "Saving Taxpayer Money",
          description: "Achieve Financial Stability & Viability initiative",
        },
        "finance_or_funding",
      ],
      [
        {
          project_name: "GCT Short-Term Retail Licensing Program Modification",
          description:
            "Expansion of the GCT Short-Term Retail Licensing Program to include Retail Kiosks throughout GCT, removes rental range, allows flexible RMU term durations of no more than 36 months",
        },
        "real_estate_or_property",
      ],
      [
        {
          project_name: "East New York Central Maintenance Facility lease",
          description: "Funding for East New York Central Maintenance Facility lease as a new/enhanced investment in 2025 budget.",
          status: "funded in 2025 Final Proposed Budget",
        },
        "real_estate_or_property",
      ],
      [
        {
          project_name: "Jamaica Terminal relocation",
          description: "Jamaica Terminal relocation, including expenses for construction, rent for terminal and swing room space, utilities, and janitorial services.",
          status: "funded in 2025 Final Proposed Budget",
        },
        "real_estate_or_property",
      ],
      [{ project_name: "East End Gateway 33 St entrance", description: "2020 completion project", status: "completed" }, "capital_or_infrastructure"],
      [
        {
          project_name: "Grand Central Terminal and East Side Access Unified Trash Facility",
          description: "2020 project award",
          status: "awarded",
        },
        "capital_or_infrastructure",
      ],
      [
        {
          project_name: "Grand Central Terminal Improvements to terminal building",
          description: "Grand Central Terminal Improvements to terminal building",
          program: "MTA Metro-North Railroad",
          status: "proposed",
        },
        "capital_or_infrastructure",
      ],
      [
        {
          project_name: "Infrastructure Refurb Hudson Line",
          description: "Infrastructure Refurb Hudson Line Oysterland State of Good Repair",
          program: "MTA Metro-North Railroad",
        },
        "capital_or_infrastructure",
      ],
      [{ project_name: "Track 1 Times Square Shuttle", description: "Mentioned under Strengthen & Expand Network section" }, "capital_or_infrastructure"],
      [
        {
          project_name: "Improvements to the Robert F. Kennedy Bridge and its approaches on Randall's Island",
          description: "Ongoing improvements to the RFK Bridge and its approaches on Randall's Island, requiring property interests via Option Agreement modifications.",
        },
        "capital_or_infrastructure",
      ],
      [
        {
          project_name: "Grand Concourse",
          description: "Under budget while repairing 45% more defects than planned",
          _merged_field_values: { description: ["Worksite access improvement on the Grand Concourse Line finished ahead of schedule."] },
        },
        "capital_or_infrastructure",
      ],
      [
        {
          project_name: "Elmont-UBS Arena Station Two-Way Service",
          description: "First new LIRR station in almost 50 years. Now accommodates both eastbound and westbound trains on event days.",
        },
        "capital_or_infrastructure",
      ],
      [{ project_name: "Saga NH 44.32", description: "Interim repair bascule support framing, Phase 1 (Westport, CT)" }, "capital_or_infrastructure"],
      [{ project_name: "Mott Haven Yard Design improvements to reduce fueling time", description: "Mott Haven Yard Design improvements to reduce fueling time" }, "capital_or_infrastructure"],
      [
        {
          project_name: "Moving NY Forward Program (C&D Acceleration)",
          description: "B&T advanced $144 M of work in 2020 to be performed while traffic volumes were reduced.",
        },
        "capital_or_infrastructure",
      ],
      [{ project_name: "Park Avenue Viaduct Update", description: "Park Avenue Viaduct Update", status: "in_progress" }, "capital_or_infrastructure"],
      [{ project_name: "Sandy Recovery & Resilience Program", description: "Locations with one or more post-Sandy coastal surge protections installed" }, "capital_or_infrastructure"],
      [{ project_name: "Transforming 42 St-Grand Central", description: "Grand Central Subway transformation project" }, "capital_or_infrastructure"],
      [
        {
          project_name: "Brewster Yard Union Depot Reorganization",
          description: "Brewster Yard Union Depot Reorganization",
          program: "MTA Metro-North Railroad",
          status: "proposed",
        },
        "capital_or_infrastructure",
      ],
      [{ project_name: "Metro-North White Plains Station Project", description: "Transformative project at Metro-North's White Plains Station" }, "capital_or_infrastructure"],
      [
      {
        project_name: "Metro-North Virtual Reality Training Program",
        description: "VR Training program developed by Metro-North's Operations Training Department with immersive modules; trained employees since January 2025.",
      },
      "internal_operations",
    ],
      [
        {
          project_name: "NTSB Recommendations Update",
          description: "The committee will receive an update on the status of Recommendations issued to the MTA by the NTSB.",
          _merged_field_values: {
            description: ["Four remaining recommendations classified as Open-Acceptable Action; two open investigations (NYCT)."],
          },
        },
        "accessibility_or_safety",
      ],
    ];

    for (const [payload, family] of cases) {
      expect(project(payload).project_family).toBe(family);
    }
  });

  it("keeps no-type project-family cleanup guards narrow", () => {
    expect(project({ project_name: "Operating Efficiency", description: "Generic operating efficiency initiative." }).project_family).toBeUndefined();
    expect(project({ project_name: "Department of Buses North Star", description: "General performance goals." }).project_family).toBeUndefined();
    expect(project({ project_name: "DEI Initiative", description: "General diversity discussion without a progress report." }).project_family).toBeUndefined();
    expect(project({ project_name: "MYmta Paratransit", description: "Generic paratransit app discussion." }).project_family).toBeUndefined();
    expect(project({ project_name: "Promoting Public Safety", description: "Generic safety update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Financial Stability", description: "Generic budget update." }).project_family).toBeUndefined();
    expect(project({ project_name: "Student Raffle", description: "Generic student raffle for school attendance." }).project_family).toBeUndefined();
    expect(project({ project_name: "Station Accessibility", description: "Generic accessibility improvements at stations without schedule or budget." }).project_family).toBeUndefined();
    expect(project({ project_name: "ADA Station Work", description: "Generic ADA station work." }).project_family).toBeUndefined();
    expect(project({ project_name: "Station Developer Contribution", description: "Station improvements funded by developer at own expense." }).project_family).toBeUndefined();
    expect(project({ project_name: "Grant Availability", description: "Federal grant availability for possible transit projects." }).project_family).toBeUndefined();
    expect(project({ project_name: "Retail License Discussion", description: "License and lease options for station retail space." }).project_family).toBeUndefined();
    expect(project({ project_name: "Trackwork Schedule", description: "Trackwork schedule planning discussion without out-of-service details." }).project_family).toBeUndefined();
    expect(project({ project_name: "NTSB recommendation status discussion", description: "Generic NTSB recommendation update." }).project_family).toBeUndefined();
    expect(
      project({
        project_name: "Mixed Corridor Bundle",
        description: "Bus lanes, truck loading zones, turn bays, taxi stand relocation, and parking changes.",
      }).project_family,
    ).toBeUndefined();
    expect(project({ project_name: "RFK Bridge Fender", description: "Generic bridge fender rehabilitation discussion." }).project_family).toBeUndefined();
    expect(
      project({
        project_name: "125th Street Curb Regulations",
        description: "General curb regulation discussion without parking or loading-zone changes.",
      }).project_family,
    ).toBeUndefined();
    expect(project({ description: "Pilot operating model will be evaluated next year." }).project_family).toBeUndefined();
    expect(project({ project_name: "Increase Ridership", description: "Generic ridership goals for subway and rail service." }).project_family).toBeUndefined();
    expect(
      project({
        project_name: "Paratransit Procurement",
        description: "Procurement contract for Access-A-Ride paratransit service providers.",
      }).project_family,
    ).toBeUndefined();
  });

	  it("maps exact crossing, bridge, trackwork, and CBTC project types to capital infrastructure", () => {
    expect(project({ project_type: "grade crossing elimination" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "crossing_renewal" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "design-build bridge replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge maintenance" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge preservation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge rehabilitation" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge repair program" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge_repair" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge timber replacement" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "bridge waterproofing" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "flag repair" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "flood protection" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "flood protection / resiliency" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "flood mitigation and signal repair" }).project_family).toBe("capital_or_infrastructure");
    expect(
      project({
        project_type: "ESA readiness project",
        project_name: "Great Neck Pocket Track",
        description: "GCM readiness project providing additional train storage and operational flexibility in support of new service to Grand Central Madison.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "subway expansion" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "track work" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "trackwork" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "trackwork program" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "Communications Based Train Control" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "CBTC signal modernization" }).project_family).toBe("capital_or_infrastructure");
    expect(project({ project_type: "signals_train_control" }).project_family).toBe("capital_or_infrastructure");
	    expect(project({ project_type: "maintenance" }).project_family).toBe("other");
	    expect(project({ project_type: "rehabilitation" }).project_family).toBe("other");
	    expect(project({ project_type: "installation" }).project_family).toBe("other");
    expect(project({ project_type: "design-build" }).project_family).toBe("other");
    expect(project({ project_type: "design-build contract" }).project_family).toBe("other");
    expect(project({ project_type: "demolition" }).project_family).toBe("other");
    expect(project({ project_type: "equipment replacement" }).project_family).toBe("other");
    expect(project({ project_type: "signaling system contract modification" }).project_family).toBe("other");
		    expect(project({ project_type: "recreational trail" }).project_family).toBe("other");
		    expect(
		      project({
		        project_name: "Fjord Trail",
		        project_type: "recreational trail",
		        description: "Proposed Fjord Trail; the Breakneck Connector is a portion of the trail.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(
		      project({
		        project_name: "Maybrook Trailway",
		        project_type: "trail",
		        description: "23-mile segment of the Empire State Trail built by Metro-North alongside the Beacon Line.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "trail", description: "Generic public trail program." }).project_family).toBe("other");
		    expect(
		      project({
		        project_type: "recreational trail",
		        description: "Breakneck Connector includes Breakneck Bridge, station improvements, high-level platforms, ADA ramps, and parking.",
		      }).project_family,
		    ).toBe("capital_or_infrastructure");
		    expect(project({ project_type: "resiliency" }).project_family).toBe("other");
	    expect(project({ project_type: "climate resilience strategy" }).project_family).toBe("other");
    expect(project({ project_type: "ESA readiness project", description: "Readiness planning for new service." }).project_family).toBe("other");
    expect(project({ project_type: "ESA readiness project", description: "Train storage planning without a pocket track asset." }).project_family).toBe("other");
	  });

  it("maps exact expansion labels only when payload proves rail or station capital expansion", () => {
    expect(project({ project_type: "expansion", project_name: "Second Avenue Subway", description: "Next phase of Second Avenue Subway, funded by Congestion Pricing." }).project_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      project({
        project_type: "expansion",
        project_name: "Penn Reconstruction",
        description: "Part of the MTA Expansion Program with additional funding from NJ Transit and Amtrak for the 2020-2024 Capital Program.",
      }).project_family,
    ).toBe("capital_or_infrastructure");
    expect(project({ project_type: "expansion", description: "General expansion study update." }).project_family).toBe("planning_or_report");
    expect(
      project({
        project_type: "expansion",
        project_name: "Second Avenue Subway West",
        project_family: "capital_or_infrastructure",
        description: "Part of the MTA Expansion Program with $16.0 million added to the 2020-2024 Capital Program.",
        _merged_field_values: {
          project_type: ["expansion", "study"],
          description: ["$16.0 million for a Second Avenue Subway West study, not a part of Second Avenue Subway Phase 2."],
          project_family: ["capital_or_infrastructure", "planning_or_report"],
        },
      }).project_family,
    ).toBe("planning_or_report");
    expect(project({ project_type: "expansion", description: "Analytics expansion for internal reporting tools." }).project_family).toBe("other");
    expect(project({ project_type: "analytics expansion", description: "Analytics expansion for internal reporting tools." }).project_family).toBe("other");
    expect(project({ project_type: "license expansion", description: "Expansion of a retail licensing program." }).project_family).toBe("other");
    expect(project({ project_type: "service_expansion", description: "Expand CityTicket to peak hour travel." }).project_family).toBe("service_change");
    expect(project({ project_type: "pilot program expansion", description: "Triple enrollment in the E-hail pilot program." }).project_family).toBe("pilot");
    expect(project({ project_type: "enforcement expansion", description: "Expand automated bus lane enforcement cameras." }).project_family).toBe("enforcement_program");
  });
});

describe("treatment bus stop and boarding family", () => {
  it("maps exact bus-stop and boarding literals without generic station matching", () => {
    expect(treatment({ treatment_kind: "SBS station" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "bus pad" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "bus shelter" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "improved station amenities" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "station amenities" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "enhanced stations" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "stop_consolidation" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "stop spacing optimization" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "bus lay-by lane" }).treatment_family).toBe("bus_stop_or_boarding");

    expect(treatment({ treatment_kind: "station" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "stations" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "revised station spacing" }).treatment_family).toBe("service_pattern");
  });

  it("does not infer bus boarding scope from a generic platform literal", () => {
    expect(treatment({ treatment_kind: "platform" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "platform safety barrier" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform barrier" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform barriers" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform bollards" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform edge barrier" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform screen doors" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "platform heating" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "platform replacement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "elevated platform" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "bus boarding platform" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "boarding platform" }).treatment_family).toBe("bus_stop_or_boarding");
  });

  it("maps exact non-station treatment literals without widening ambiguous matches", () => {
    expect(treatment({ treatment_kind: "branding" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "passenger information" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "real-time bus information system" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "new low-floor buses" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus equipment" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "route_reroute" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "Route re-alignment" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "route rerouting" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "route segment discontinuation and replacement" }).treatment_family).toBe(
      "service_pattern",
    );
    expect(treatment({ treatment_kind: "route shortening" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "route truncation" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "bus priority lane" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "bus tunnel" }).treatment_family).toBe("traffic_restriction");
    expect(treatment({ treatment_kind: "daylighting" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "roadway improvement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "elevator installation" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "advanced payment" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "delivery zone" }).treatment_family).toBe("curb_management");
    expect(treatment({ treatment_kind: "bus only lanes" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "flexible bollards" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "passenger information display" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "operator barrier" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "electric_bus" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "video surveillance" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "low-floor bus" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "low floor buses" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "low_floor_three_door_bus" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "autonomous pantograph dispenser" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus_interior_modification" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "information display" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "passenger counting technology" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "limited stop discontinuation" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "bus layover space" }).treatment_family).toBe("service_pattern");
    expect(treatment({ treatment_kind: "quick kurb" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "qwik kurb" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "Leading Bus Interval" }).treatment_family).toBe("signal_priority");
    expect(treatment({ treatment_kind: "transitway" }).treatment_family).toBe("busway");
    expect(treatment({ treatment_kind: "lane realignment" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "roadway redesign" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "street design improvements" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "two-way conversion" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "upgraded crosswalk" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "detectable warning strips" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "tactile_warning_strips" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "wide_aisle_gates" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "Hearing Loops" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "Navilens" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "digital information screen" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "MTA Trip Planner" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "wayfinding sign" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "station improvement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "station_improvement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "station building improvement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "station enhancement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "station lighting" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "station lighting upgrade" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "LED lighting" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "lighting_upgrade" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "canopy_installation" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "restroom_improvement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "new entrance" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "entrance reconfiguration" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "help_point_installation" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "Communications-Based Train Control" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "Communications Based Train Control (CBTC)" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "ultrasonic_rail_testing" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "track maintenance" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "grade crossing replacement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "Crossing Renewal" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "switch installation" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "autonomous_track_inspection" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "positive_train_control_data_radios" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "DC electrical substation" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "bridge_replacement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "flood_protection" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "drainage capacity upgrade" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "catch basin cleaning" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "fire suppression system replacement" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "real-time bus information" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "Passenger Info" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "real-time arrival information" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "real-time bus arrival signs" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "customer_display" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "public_address_system_installation" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "passenger counting" }).treatment_family).toBe("customer_information");
    expect(treatment({ treatment_kind: "ticket_checking" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "ticket_vending_machine_installation" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "Pre-Payment" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "automated_revenue_recovery_system" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "Revenue Recovery System" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "All-Electronic Open-Road Tolling" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "tolling system replacement" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "toll detection system" }).treatment_family).toBe("fare_collection");
    expect(treatment({ treatment_kind: "low-floor three-door articulated buses" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "new_bus_fleet" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus_operator_protection" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus_operator_barrier" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "enclosed_operator_compartments" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus design" }).treatment_family).toBe("vehicle_or_fleet");
    expect(treatment({ treatment_kind: "bus contra-flow lane" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "Bus & Truck Only lane" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "physical_separation" }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "bollard installation" }).treatment_family).toBe("bus_lane");
    expect(
      treatment({
        component_kind: "curbside bus lane",
        description: "Single Curbside Lane design for 50-foot wide street: 14' Curbside Bus Lane.",
        treatment_family: "bus_lane",
      }).treatment_kind,
    ).toBe("curbside bus lane");
    expect(
      treatment({
        component_kind: "offset bus lane",
        description: "Single Offset Lane design for 50-foot wide street: 12' Offset Bus Lane.",
        treatment_family: "bus_lane",
      }).treatment_kind,
    ).toBe("offset bus lane");
    expect(
      treatment({
        component_kind: "mixed bus lane",
        description: "One curbside and one offset lane design for 50-foot wide street with Curbside Bus Lane and Offset Bus Lane.",
        treatment_family: "bus_lane",
      }).treatment_kind,
    ).toBe("mixed bus lane");
    expect(treatment({ component_kind: "curbside bus lane", description: "Generic curbside bus lane option.", treatment_family: "bus_lane" }).treatment_kind).toBeUndefined();
    expect(treatment({ treatment_kind: "bus tunnel (one-way)" }).treatment_family).toBe("traffic_restriction");
    expect(treatment({ treatment_kind: "bus tunnel (two-way)" }).treatment_family).toBe("traffic_restriction");
    expect(treatment({ treatment_kind: "elevator" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "elevators" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "escalator" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "bus shelter" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "bus stop amenity" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "capital project" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "repair" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "upgrade" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "bus_priority" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "sbs_features" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "bus rapid transit improvements" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "stations" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "technology" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "hardware upgrade" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "sensor" }).treatment_family).toBe("other");
  });

  it("promotes runner-owned other but preserves an existing concrete treatment family", () => {
    expect(treatment({ treatment_kind: "SBS station", treatment_family: "other" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "shelters and benches", treatment_family: "shelters_and_benches" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "bus_priority", component_kind: "bus_boarder", treatment_family: "other" }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "hardware upgrade", component_kind: "bus validator mounting bracket", treatment_family: "other" }).treatment_family).toBe(
      "vehicle_or_fleet",
    );
    expect(treatment({ treatment_kind: "bus_priority", component_kind: "transit_freight_priority_street", treatment_family: "other" }).treatment_family).toBe(
      "traffic_restriction",
    );
    expect(treatment({ treatment_kind: "SBS station", treatment_family: "customer_information" }).treatment_family).toBe("customer_information");
  });

  it("maps narrow physical modification anti-back-cocking records from payload context only", () => {
    expect(treatment({ treatment_kind: "physical_modification", description: "Modified turnstiles to prevent back-cocking" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "physical_modification", description: "Implemented delayed egress at over 70 stations" }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "physical_modification", description: "Generic physical modification" }).treatment_family).toBe("other");
  });

  it("maps station-renewal cleaning and Re-NEW-vation records only with payload proof", () => {
    expect(treatment({ treatment_kind: "cleaning_initiative", description: "Enhance cleaning initiatives including power washing and heavy duty cleaning" }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(treatment({ treatment_kind: "cleaning_initiative", description: "General cleaning program" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "renovation", description: "Re-NEW-vation program - Increase Appeal for Customers" }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "renovation", description: "General renovation" }).treatment_family).toBe("other");
  });

  it("maps generic station labels only when payload proves bus boarding context", () => {
    expect(treatment({ treatment_kind: "station", description: "Curbside stations placed on existing sidewalk with bus shelters and ticket vending machines" }).treatment_family).toBe(
      "bus_stop_or_boarding",
    );
    expect(treatment({ treatment_kind: "stations", description: "SBS stations with shelters, fare collection machines, bus bulbs, and higher curbs for easier boarding" }).treatment_family).toBe(
      "bus_stop_or_boarding",
    );
    expect(treatment({ treatment_kind: "station", description: "Station building renovation" }).treatment_family).toBe("other");
    expect(treatment({ treatment_kind: "stations" }).treatment_family).toBe("other");
  });

  it("maps repair labels only when payload proves elevator or escalator accessibility assets", () => {
    expect(treatment({ treatment_kind: "repair", description: "Emergency Stop Button Activations, Power issues", location_text: "Penn EXI-ESC-10E" }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "Main valve issues and replacements", locations: "Atlantic Terminal 2 Elevator" }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "Main valve issues and replacements", locations: ["Atlantic Terminal 2 Elevator"] }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "Main Valve issues and replacements", locations: "Atlantic Terminal 2" }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "GC warranty repairs", label: "Locust Manor A Elevator - GC Warranty Repairs" }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "GC warranty issues, repairs", label: "Valley Stream Escalator - GC Warranty Issues/Repairs" }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "repair", description: "Step chain replacement" }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "repair", description: "GC warranty repairs" }).treatment_family).toBe("other");
  });

  it("maps cross-section labels only when payload proves street layout design", () => {
    expect(treatment({ treatment_kind: "cross-section", description: "Cross-section view showing existing and proposed street layouts" }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(treatment({ treatment_kind: "cross-section", description: "Cross-section appendix" }).treatment_family).toBe("other");
  });

  it("maps draft-plan labels only when payload proves street layout design", () => {
    expect(treatment({ treatment_kind: "draft_plan", description: "Draft plan showing existing and proposed street layout." }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(
      treatment({
        treatment_kind: "draft_plan",
        description: "Draft plan for 125 Street at Lexington Avenue intersection.",
        location_text: "125 Street at Lexington Avenue",
      }).treatment_family,
    ).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "draft_plan", description: "Draft plan appendix." }).treatment_family).toBe("other");
  });

  it("maps draft-plan labels only when payload proves traffic-signage diagrams", () => {
    expect(treatment({ treatment_kind: "draft_plan", description: "Traffic signage plan; signs indicate proposed bus lane regulations." }).treatment_family).toBe(
      "signage_and_markings",
    );
    expect(treatment({ treatment_kind: "draft_plan", description: "Traffic signs appendix." }).treatment_family).toBe("other");
  });

  it("maps key-design-piece labels only when payload proves a concrete bus-lane design", () => {
    expect(treatment({ treatment_kind: "key_design_piece", description: "Bus lane replaces parking lane." }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "key_design_piece", description: "Widening of travel lanes and intersection redesign." }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(treatment({ treatment_kind: "key_design_piece", description: "ADA accessible bus stops with landing platforms." }).treatment_family).toBe(
      "bus_stop_or_boarding",
    );
    expect(treatment({ treatment_kind: "key_design_piece", description: "General design element." }).treatment_family).toBe("other");
  });

  it("maps capital-improvements labels only when payload proves SBS station stop improvements", () => {
    expect(treatment({ treatment_kind: "capital_improvements", description: "Capital improvements at SBS stations." }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "capital_improvements", description: "Medians, streetscaping, and bus bulbs." }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(treatment({ treatment_kind: "capital_improvements", description: "General capital improvements." }).treatment_family).toBe("other");
  });

  it("maps capital-design/SBS labels only when payload proves roadway capital work and SBS implementation", () => {
    expect(
      treatment({
        treatment_kind: "capital_design_and_sbs_implementation",
        description: "Capital roadway improvements and Select Bus Service implementation.",
      }).treatment_family,
    ).toBe("bus_priority");
    expect(treatment({ treatment_kind: "capital_design_and_sbs_implementation", description: "General SBS planning." }).treatment_family).toBe("other");
  });

  it("maps capital project labels only when payload proves infrastructure work", () => {
    expect(
      treatment({
        treatment_kind: "capital_project",
        description: "Great Streets capital toolkit with pedestrian safety improvements, curb extensions, widened medians, bus lanes, bus stops, signal timing, and curb management.",
      }).treatment_family,
    ).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "capital_project", description: "Water main project." }).treatment_family).toBe("capital_or_infrastructure");
    expect(treatment({ treatment_kind: "capital_project", description: "General capital project." }).treatment_family).toBe("other");
  });

  it("maps transit-priority labels only when payload proves curbside bus-stop improvements", () => {
    expect(treatment({ treatment_kind: "transit_priority", description: "Improved curbside bus stops." }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "targeted_transit_priority_treatments", description: "Improved curbside bus stops." }).treatment_family).toBe(
      "bus_stop_or_boarding",
    );
    expect(treatment({ treatment_kind: "transit_priority", description: "General transit priority." }).treatment_family).toBe("other");
  });

  it("maps implementation timelines only when payload proves bus-priority implementation", () => {
    expect(treatment({ treatment_kind: "implementation_timeline", description: "Bus priority will be implemented by summer." }).treatment_family).toBe("bus_priority");
    expect(treatment({ treatment_kind: "implementation_timeline", description: "General implementation timeline." }).treatment_family).toBe("other");
  });

  it("maps bus-priority labels only when payload proves regulated curbside bus lanes", () => {
    expect(treatment({ treatment_kind: "bus_priority", description: "Curbside bus lane 7a-7p." }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "bus_priority", description: "Curbside bus lane with no standing anytime." }).treatment_family).toBe("bus_lane");
    expect(treatment({ treatment_kind: "bus_priority_improvements", description: "Targeted bus priority improvements." }).treatment_family).toBe("bus_priority");
    expect(treatment({ treatment_kind: "bus_priority", description: "General bus priority." }).treatment_family).toBe("other");
  });

  it("maps upgrade labels only when payload proves concrete street infrastructure work", () => {
    expect(treatment({ treatment_kind: "upgrade", description: "Bus stops with sidewalk extensions, shortened crossings, and medians." }).treatment_family).toBe(
      "capital_or_infrastructure",
    );
    expect(treatment({ treatment_kind: "upgrade", description: "General upgrade." }).treatment_family).toBe("other");
  });

  it("maps addition labels only when payload proves pedestrian/public-realm access features", () => {
    expect(treatment({ treatment_kind: "addition", description: "Raised crosswalk." }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "addition", description: "Additional crossings and street trees." }).treatment_family).toBe("pedestrian_or_accessibility");
    expect(treatment({ treatment_kind: "addition", description: "General addition." }).treatment_family).toBe("other");
  });

  it("maps deployment labels only when payload proves gate-guard safety work", () => {
    expect(treatment({ treatment_kind: "deployment", description: "Gate guards deployed at stations." }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "deployment", description: "General deployment." }).treatment_family).toBe("other");
  });

  it("maps sensor labels only when payload proves bridge-strike safety mitigation", () => {
    expect(treatment({ treatment_kind: "sensor", description: "Bridge strike mitigation sensor." }).treatment_family).toBe("safety");
    expect(treatment({ treatment_kind: "sensor", description: "General sensor." }).treatment_family).toBe("other");
  });

  it("maps license and easement labels only when payload proves pedestrian overpass access work", () => {
    expect(treatment({ treatment_kind: "construction_license", description: "Pedestrian overpass construction access." }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "permanent_easement", description: "Pedestrian overpass access easement." }).treatment_family).toBe(
      "pedestrian_or_accessibility",
    );
    expect(treatment({ treatment_kind: "construction_license", description: "General construction license." }).treatment_family).toBe("other");
  });

  it("maps amenities labels only when payload proves bus shelter stop amenities", () => {
    expect(treatment({ treatment_kind: "amenities", description: "Bus shelters and related stop amenities." }).treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment({ treatment_kind: "amenities", description: "General amenities." }).treatment_family).toBe("other");
  });

  it("maps station-agent mobility operational changes only with customer-service proof", () => {
    expect(treatment({ treatment_kind: "operational_change", description: "Station agents outside booths providing customer service at turnstiles." }).treatment_family).toBe(
      "service_pattern",
    );
    expect(treatment({ treatment_kind: "operational_change", description: "General operational change." }).treatment_family).toBe("other");
  });

  it("marks route-type taxonomy records as contextual rather than actionable treatments", () => {
    const local = treatment({
      treatment_kind: "route_type",
      treatment_type: "Local",
      description: "Connects local neighborhoods, key transit hubs, and important destinations. Color: green. Average stop spacing: 1,000-1,320 feet.",
    });
    expect(local.treatment_family).toBe("service_pattern");
    expect(local.treatment_record_scope).toBe("route_taxonomy_context");
    expect(local.treatment_record_scope_reason).toBe("route_type_taxonomy");

    const express = treatment({
      treatment_kind: "route_type",
      treatment_type: "Express",
      description: "Connects outer borough neighborhoods to Manhattan CBD via highway. Shown in purple. Mostly peak-hour service. Average stop spacing: ~1/3 mile.",
    });
    expect(express.treatment_record_scope).toBe("route_taxonomy_context");
    expect(express.treatment_record_scope_reason).toBe("route_type_taxonomy");
  });

  it("keeps route-type taxonomy scope narrow around implementation records", () => {
    expect(treatment({ treatment_kind: "route_type", treatment_type: "Local", description: "Generic local route category." }).treatment_record_scope).toBeUndefined();
    expect(
      treatment({
        treatment_kind: "route_type",
        treatment_type: "Local",
        description: "Route change implemented with bus lanes, stop changes, and transit signal priority.",
      }).treatment_record_scope,
    ).toBeUndefined();
  });

  it("marks generic bus-priority literals when payload proves a concrete treatment family", () => {
    const busLane = treatment({
      treatment_kind: "bus_priority",
      component_kind: "bus_lane",
      description: "Bus lanes separate buses from general traffic, improving speed and reliability.",
    });
    expect(busLane.treatment_family).toBe("bus_lane");
    expect(busLane.treatment_record_scope).toBe("generic_bus_priority_literal_context");
    expect(busLane.treatment_record_scope_reason).toBe("concrete_treatment_family_payload");

    const boarder = treatment({
      treatment_kind: "bus_priority",
      component_kind: "bus_boarder",
      description: "Bus bulbs and durable bus boarders extend the sidewalk at bus stops.",
    });
    expect(boarder.treatment_family).toBe("bus_stop_or_boarding");
    expect(boarder.treatment_record_scope).toBe("generic_bus_priority_literal_context");

    const signal = treatment({
      treatment_kind: "bus_priority",
      component_kind: "bus_queue_jump_and_tsp",
      description: "Dedicated bus signal phases allow a bus to bypass waiting queues.",
    });
    expect(signal.treatment_family).toBe("signal_priority");
    expect(signal.treatment_record_scope).toBe("generic_bus_priority_literal_context");

    const restriction = treatment({
      treatment_kind: "bus_priority",
      component_kind: "transit_freight_priority_street",
      description: "Provides dedicated space for buses and trucks while limiting other through traffic.",
    });
    expect(restriction.treatment_family).toBe("traffic_restriction");
    expect(restriction.treatment_record_scope).toBe("generic_bus_priority_literal_context");
  });

  it("keeps generic bus-priority scope off umbrella package records", () => {
    expect(treatment({ treatment_kind: "bus_priority", description: "General bus priority toolkit." }).treatment_record_scope).toBeUndefined();
    expect(treatment({ treatment_kind: "bus_priority", treatment_family: "bus_priority", description: "SBS package with multiple features." }).treatment_record_scope).toBeUndefined();
  });

  it("marks bus-priority feature/toolkit list records as aggregate context", () => {
    const sbsFeatures = treatment({
      treatment_kind: "sbs_features",
      treatment_family: "bus_priority",
      description: "Dedicated bus lanes, transit signal priority, off-board fare payment, limited stops, and low-floor articulated buses.",
    });
    expect(sbsFeatures.treatment_record_scope).toBe("aggregate_treatment_package_context");
    expect(sbsFeatures.treatment_record_scope_reason).toBe("bus_priority_feature_or_toolkit_list");

    const toolkit = treatment({
      treatment_kind: "bus priority toolkit",
      treatment_family: "bus_priority",
      description: "Tools to improve bus service: bus-only lanes, queue jumps, transit signal priority, wider stop spacing, improved curb regulations, and wayfinding.",
    });
    expect(toolkit.treatment_record_scope).toBe("aggregate_treatment_package_context");

    const operations = treatment({
      treatment_kind: "operational treatment",
      treatment_family: "bus_priority",
      description: "Other tools under consideration: traffic signal timing, Transit Signal Priority (TSP), and bus lane camera enforcement.",
    });
    expect(operations.treatment_record_scope).toBe("aggregate_treatment_package_context");
  });

  it("marks bus-priority implementation deadlines as timeline context", () => {
    const timeline = treatment({
      treatment_kind: "implementation_timeline",
      treatment_family: "bus_priority",
      component_type: "deadline",
      description: "34th Street Bus Priority will be implemented by end of 2008.",
    });
    expect(timeline.treatment_record_scope).toBe("implementation_timeline_context");
    expect(timeline.treatment_record_scope_reason).toBe("timeline_not_treatment_component");
  });

  it("keeps aggregate treatment scope narrow around concrete and non-bus records", () => {
    const curbsideLane = treatment({ treatment_kind: "bus_priority", description: "Curbside bus lane 7a-7p." });
    expect(curbsideLane.treatment_record_scope).toBe("generic_bus_priority_literal_context");
    expect(curbsideLane.treatment_record_scope).not.toBe("aggregate_treatment_package_context");
    expect(treatment({ treatment_kind: "bus_priority", component_kind: "bus_lane", description: "Bus lanes separate buses from general traffic." }).treatment_record_scope).toBe(
      "generic_bus_priority_literal_context",
    );
    expect(treatment({ treatment_kind: "mural", treatment_family: "amenity_or_public_art", description: "Large mosaic mural on a subway platform." }).treatment_record_scope).toBeUndefined();
    expect(
      treatment({
        treatment_kind: "vending machine installation",
        treatment_family: "amenity_or_public_art",
        description: "Installation and maintenance of vending machines under license agreements.",
      }).treatment_record_scope,
    ).toBeUndefined();
  });

  it("marks exact side-street traffic monitoring context as non-intervention", () => {
    const sideStreet = treatment({
      treatment_kind: "monitoring",
      description: "Continue to monitor traffic on side streets.",
    });
    expect(sideStreet.treatment_family).toBe("monitoring");
    expect(sideStreet.treatment_record_scope).toBe("non_intervention_monitoring_context");
    expect(sideStreet.treatment_record_scope_reason).toBe("continue_to_monitor_not_treatment");

    expect(treatment({ treatment_kind: "monitoring", description: "Install electronic monitoring equipment." }).treatment_record_scope).toBeUndefined();
    expect(treatment({ treatment_kind: "monitoring", description: "Deploy security camera monitor system." }).treatment_record_scope).toBeUndefined();
  });
});

describe("metric C4 cost & service-delivery companions", () => {
  it("keeps workforce unit aliases exact and leaves workforce-like rates unresolved", () => {
    expect(metric({ metric_name: "workforce_demographics", unit: "employees" }).unit_normalized).toEqual({
      raw_text: "employees",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "total_positions", unit: "FTE" }).unit_normalized).toEqual({
      raw_text: "FTE",
      normalized_unit: "full_time_equivalents",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "vision_zero_employee_training", unit: "employees trained" }).unit_normalized).toEqual({
      raw_text: "employees trained",
      normalized_unit: "employees_trained",
      unit_family: "workforce",
    });

    expect(metric({ metric_name: "employee_rate", unit: "per 100 employees" }).unit_normalized).toEqual({
      raw_text: "per 100 employees",
      normalized_unit: "per_100_employees",
      unit_family: "rate",
    });
    expect(metric({ metric_name: "employee_accident_rate", unit: "accidents per 100 employees" }).unit_normalized).toEqual({
      raw_text: "accidents per 100 employees",
      normalized_unit: "accidents_per_100_employees",
      unit_family: "safety_rate",
    });

    expect(metric({ metric_name: "employee_availability", unit: "days per employee" }).unit_normalized).toEqual({
      raw_text: "days per employee",
      normalized_unit: "days_per_employee",
      unit_family: "duration_rate",
    });
  });

  it("normalizes scaled ridership and traffic units while leaving broad literals unresolved", () => {
    expect(metric({ metric_name: "annual_ridership", unit: "million passengers" }).unit_normalized).toEqual({
      raw_text: "million passengers",
      normalized_unit: "riders",
      unit_family: "ridership",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "annual_ridership", unit: "million trips" }).unit_normalized).toEqual({
      raw_text: "million trips",
      normalized_unit: "trips",
      unit_family: "ridership",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "weekday_bus_boardings", unit: "boardings" }).unit_normalized).toEqual({
      raw_text: "boardings",
      normalized_unit: "boardings",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "traffic_volume", unit: "millions of vehicles" }).unit_normalized).toEqual({
      raw_text: "millions of vehicles",
      normalized_unit: "vehicles",
      unit_family: "count",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "paid_traffic", unit: "crossings" }).unit_normalized).toEqual({
      raw_text: "crossings",
      normalized_unit: "crossings",
      unit_family: "count",
    });
    expect(metric({ metric_name: "monthly_ridership_all_modes", unit: "Millions", raw_value_text: "O-22 143" }).unit_normalized).toEqual({
      raw_text: "Millions",
      normalized_unit: "riders",
      unit_family: "ridership",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "fixed_route_ridership", unit: "thousands", raw_value_text: "86,217" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "riders",
      unit_family: "ridership",
      scale: 1_000,
    });
    expect(metric({ metric_name: "monthly_ridership", unit: "customers", raw_value_text: "7.2 million customers" }).unit_normalized).toEqual({
      raw_text: "customers",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "event_ridership", unit: "customers", raw_value_text: "154,000 customers" }).unit_normalized).toEqual({
      raw_text: "customers",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "daily_ridership", unit: "customers", raw_value_text: "34,000" }).unit_normalized).toEqual({
      raw_text: "customers",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "new_customers", unit: "customers", raw_value_text: "Add 2,400 customers" }).unit_normalized).toEqual({
      raw_text: "customers",
      normalized_unit: "customers",
      unit_family: "count",
    });
    expect(metric({ metric_name: "wheelchair_ramp_usage", unit: "customers", raw_value_text: "1,019,601" }).unit_normalized).toEqual({
      raw_text: "customers",
      normalized_unit: "customers",
      unit_family: "count",
    });

    for (const unit of ["millions", "crossings per hour", "daily crossings"]) {
      expect(metric({ metric_name: "broad_count", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: unit.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, ""),
        unit_family: "other",
      });
    }
  });

  it("normalizes exact enforcement count units without catching enforcement rates", () => {
    expect(metric({ metric_name: "fare_evasion_arrests", unit: "arrests" }).unit_normalized).toEqual({
      raw_text: "arrests",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "summons_issued", unit: "summons" }).unit_normalized).toEqual({
      raw_text: "summons",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "summonses_issued", unit: "summonses" }).unit_normalized).toEqual({
      raw_text: "summonses",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "tos_c_summons", unit: "C-Summons" }).unit_normalized).toEqual({
      raw_text: "C-Summons",
      normalized_unit: "criminal_summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "enforcement_action_count", unit: "criminal_summons" }).unit_normalized).toEqual({
      raw_text: "criminal_summons",
      normalized_unit: "criminal_summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "toll_violator_interdictions", unit: "violators" }).unit_normalized).toEqual({
      raw_text: "violators",
      normalized_unit: "violators",
      unit_family: "enforcement",
    });
  });

  it("normalizes exact count-like residual units without catching rates", () => {
    for (const [unit, normalizedUnit] of [
      ["incidents", "incidents"],
      ["complaints", "complaints"],
      ["stations", "stations"],
      ["trains", "trains"],
      ["ties", "ties"],
      ["spaces", "spaces"],
      ["felonies", "felonies"],
      ["projects", "projects"],
      ["delays", "delays"],
      ["actions", "actions"],
      ["lawsuits", "lawsuits"],
      ["entrapments", "entrapments"],
      ["switches", "switches"],
      ["inspections", "inspections"],
      ["cars", "cars"],
      ["firms", "firms"],
      ["contracts", "contracts"],
      ["tests", "tests"],
      ["audits", "audits"],
      ["parking spaces", "parking_spaces"],
      ["installations", "installations"],
      ["tickets", "tickets"],
      ["defects", "defects"],
      ["cards", "cards"],
      ["machines", "machines"],
      ["locomotives", "locomotives"],
      ["joints", "joints"],
      ["cases", "cases"],
      ["transfers", "transfers"],
      ["deficiencies", "deficiencies"],
      ["timbers", "timbers"],
      ["reports", "reports"],
      ["assessments", "assessments"],
      ["work orders", "work_orders"],
      ["visits", "visits"],
      ["invoices", "invoices"],
      ["loans", "loans"],
      ["outages", "outages"],
      ["payments", "payments"],
      ["businesses", "businesses"],
      ["depots", "depots"],
      ["railcars", "railcars"],
      ["subway cars", "subway_cars"],
      ["applications", "applications"],
      ["elevators", "elevators"],
      ["substations", "substations"],
      ["bases", "bases"],
      ["bicycles", "bicycles"],
      ["detection points", "detection_points"],
      ["errors", "errors"],
      ["panels", "panels"],
      ["systems", "systems"],
      ["taps", "taps"],
      ["transactions", "transactions"],
      ["vehicle crossings", "vehicle_crossings"],
      ["welds", "welds"],
      ["buildings", "buildings"],
      ["bus depots", "bus_depots"],
      ["subway lines", "subway_lines"],
      ["observations", "observations"],
      ["circuit breakers", "circuit_breakers"],
      ["commitments", "commitments"],
      ["CVMs", "cvms"],
      ["ea", "each"],
      ["event days", "event_days"],
      ["facilities", "facilities"],
      ["findings", "findings"],
      ["notices", "notices"],
      ["operations", "operations"],
      ["patrols", "patrols"],
      ["potholes", "potholes"],
      ["rail cars", "railcars"],
      ["runs", "runs"],
      ["stops", "stops"],
      ["uses", "uses"],
      ["units", "units"],
      ["ABLE systems", "able_systems"],
      ["agencies", "agencies"],
      ["audit projects", "audit_projects"],
      ["bridges", "bridges"],
      ["bus routes", "bus_routes"],
      ["catch basins", "catch_basins"],
      ["encampments", "encampments"],
      ["gates", "gates"],
      ["items", "items"],
      ["loading zones", "loading_zones"],
      ["customers", "customers"],
      ["calls", "calls"],
      ["cars equipped", "cars_equipped"],
      ["drains", "drains"],
      ["electric buses", "electric_buses"],
      ["grade crossings", "grade_crossings"],
      ["housing units", "housing_units"],
      ["interviews", "interviews"],
      ["lanes", "lanes"],
      ["meetings", "meetings"],
      ["pages", "pages"],
      ["placements", "placements"],
      ["plazas", "plazas"],
      ["pump rooms", "pump_rooms"],
      ["railroad equipment platforms", "railroad_equipment_platforms"],
      ["railroad substations", "railroad_substations"],
      ["railroad ties", "railroad_ties"],
      ["sales", "sales"],
      ["shoes", "shoes"],
      ["signal relays", "signal_relays"],
      ["signals", "signals"],
      ["siphons", "siphons"],
      ["speed increases", "speed_increases"],
      ["station entrances", "station_entrances"],
      ["subway fan plants", "subway_fan_plants"],
      ["subway hatches", "subway_hatches"],
      ["subway manholes", "subway_manholes"],
      ["subway stairways", "subway_stairways"],
      ["subway yards", "subway_yards"],
      ["terminals", "terminals"],
      ["track panels", "track_panels"],
      ["trainings", "trainings"],
      ["transponders", "transponders"],
      ["transformers", "transformers"],
      ["tree pits", "tree_pits"],
      ["tree_pits", "tree_pits"],
      ["trucks", "trucks"],
      ["tubes", "tubes"],
      ["vehicular tunnel flood doors", "vehicular_tunnel_flood_doors"],
      ["vending machines", "vending_machines"],
      ["assignments", "assignments"],
      ["bathrooms", "bathrooms"],
      ["customer service centers", "customer_service_centers"],
      ["daily trains", "trains_per_day"],
      ["pieces", "pieces"],
      ["proposers", "proposers"],
      ["proposals", "proposals"],
      ["recommendations", "recommendations"],
      ["remarketing agents", "remarketing_agents"],
      ["rentable square feet", "square_feet"],
      ["scenarios", "scenarios"],
      ["seats", "seats"],
      ["service updates", "service_updates"],
      ["shops_and_yards", "shops_and_yards"],
      ["sites", "sites"],
      ["submissions", "submissions"],
      ["time periods", "time_periods"],
      ["transports", "transports"],
      ["venues", "venues"],
      ["wheels", "wheels"],
      ["work plans", "work_plans"],
      ["zones", "zones"],
    ]) {
      expect(metric({ metric_name: "count_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: unit === "daily trains" ? "count_rate" : unit === "rentable square feet" ? "area" : "count",
      });
    }

    expect(metric({ metric_name: "fatality_count", unit: "fatalities" }).unit_normalized).toEqual({
      raw_text: "fatalities",
      normalized_unit: "fatalities",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "severe_injury_count", unit: "severe injuries" }).unit_normalized).toEqual({
      raw_text: "severe injuries",
      normalized_unit: "severe_injuries",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "fire_count", unit: "fires" }).unit_normalized).toEqual({
      raw_text: "fires",
      normalized_unit: "fires",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "derailment_count", unit: "derailments" }).unit_normalized).toEqual({
      raw_text: "derailments",
      normalized_unit: "derailments",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "major_crimes", unit: "crimes" }).unit_normalized).toEqual({
      raw_text: "crimes",
      normalized_unit: "crimes",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "major_crime_categories", unit: "robberies" }).unit_normalized).toEqual({
      raw_text: "robberies",
      normalized_unit: "robberies",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "bus_mirror_collisions", unit: "collisions" }).unit_normalized).toEqual({
      raw_text: "collisions",
      normalized_unit: "collisions",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "trespasser_harm", unit: "injuries and fatalities" }).unit_normalized).toEqual({
      raw_text: "injuries and fatalities",
      normalized_unit: "injuries_and_fatalities",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "crash_harm", unit: "fatalities and severe injuries" }).unit_normalized).toEqual({
      raw_text: "fatalities and severe injuries",
      normalized_unit: "fatalities_and_severe_injuries",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "crash_severe_injuries", unit: "people severely injured" }).unit_normalized).toEqual({
      raw_text: "people severely injured",
      normalized_unit: "severe_injuries",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "membership_count", unit: "members" }).unit_normalized).toEqual({
      raw_text: "members",
      normalized_unit: "members",
      unit_family: "population",
    });
    expect(metric({ metric_name: "veteran_hires", unit: "veterans" }).unit_normalized).toEqual({
      raw_text: "veterans",
      normalized_unit: "veterans",
      unit_family: "population",
    });
    expect(metric({ metric_name: "commuters_into_cbd", unit: "commuters" }).unit_normalized).toEqual({
      raw_text: "commuters",
      normalized_unit: "commuters",
      unit_family: "population",
    });
    expect(metric({ metric_name: "newsletter_subscribers", unit: "subscribers" }).unit_normalized).toEqual({
      raw_text: "subscribers",
      normalized_unit: "subscribers",
      unit_family: "population",
    });
    expect(metric({ metric_name: "active_users", unit: "users" }).unit_normalized).toEqual({
      raw_text: "users",
      normalized_unit: "users",
      unit_family: "population",
    });
    expect(metric({ metric_name: "fatality_person_count", unit: "persons" }).unit_normalized).toEqual({
      raw_text: "persons",
      normalized_unit: "persons",
      unit_family: "population",
    });
    expect(metric({ metric_name: "bicycle_volume", unit: "cyclists" }).unit_normalized).toEqual({
      raw_text: "cyclists",
      normalized_unit: "cyclists",
      unit_family: "population",
    });
    expect(metric({ metric_name: "bus_operators", unit: "operators" }).unit_normalized).toEqual({
      raw_text: "operators",
      normalized_unit: "operators",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "tracks_program_outreach", unit: "individuals", raw_value_text: "over 7,000 individuals" }).unit_normalized).toEqual({
      raw_text: "individuals",
      normalized_unit: "people",
      unit_family: "population",
    });
    for (const [unit, normalizedUnit] of [
      ["headcount", "headcount"],
      ["officers", "officers"],
      ["personnel", "personnel"],
      ["workers", "workers"],
      ["FTEs", "full_time_equivalents"],
      ["hires", "hires"],
      ["dispatchers", "dispatchers"],
      ["drivers", "drivers"],
      ["maintainers", "maintainers"],
    ]) {
      expect(metric({ metric_name: "workforce_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "workforce",
      });
    }
    expect(metric({ metric_name: "rider_preference_votes", unit: "votes" }).unit_normalized).toEqual({
      raw_text: "votes",
      normalized_unit: "votes",
      unit_family: "engagement",
    });
    expect(metric({ metric_name: "outreach_comments", unit: "comments" }).unit_normalized).toEqual({
      raw_text: "comments",
      normalized_unit: "comments",
      unit_family: "engagement",
    });
    for (const [unit, normalizedUnit] of [
      ["contacts", "contacts"],
      ["in-person contacts", "contacts"],
      ["interactions", "interactions"],
      ["impressions", "impressions"],
      ["followers", "followers"],
      ["engagements", "engagements"],
      ["speakers", "speakers"],
      ["views", "views"],
    ]) {
      expect(metric({ metric_name: "engagement_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "engagement",
      });
    }
    expect(metric({ metric_name: "advertising_impressions", unit: "M impressions" }).unit_normalized).toEqual({
      raw_text: "M impressions",
      normalized_unit: "impressions",
      unit_family: "engagement",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "social_media_engagement", unit: "M engagements" }).unit_normalized).toEqual({
      raw_text: "M engagements",
      normalized_unit: "engagements",
      unit_family: "engagement",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "workshop_attendance", unit: "participants" }).unit_normalized).toEqual({
      raw_text: "participants",
      normalized_unit: "participants",
      unit_family: "participation",
    });
    expect(metric({ metric_name: "program_registration", unit: "registrants" }).unit_normalized).toEqual({
      raw_text: "registrants",
      normalized_unit: "registrants",
      unit_family: "participation",
    });

    expect(metric({ metric_name: "incident_rate", unit: "incidents per day" }).unit_normalized).toEqual({
      raw_text: "incidents per day",
      normalized_unit: "incidents_per_day",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "incident_rate", unit: "incidents per million vehicles" }).unit_normalized).toEqual({
      raw_text: "incidents per million vehicles",
      normalized_unit: "incidents_per_million_vehicles",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "felony_rate", unit: "felonies per day" }).unit_normalized).toEqual({
      raw_text: "felonies per day",
      normalized_unit: "felonies_per_day",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "train_frequency", unit: "trains per hour" }).unit_normalized).toEqual({
      raw_text: "trains per hour",
      normalized_unit: "trains_per_hour",
      unit_family: "frequency",
    });
    expect(metric({ metric_name: "daily_traffic", unit: "vehicles per day" }).unit_normalized).toEqual({
      raw_text: "vehicles per day",
      normalized_unit: "vehicles_per_day",
      unit_family: "count_rate",
    });
  });

  it("normalizes exact residual volume, duration, distance, area, and money units", () => {
    expect(metric({ metric_name: "fuel_consumption", unit: "gallons" }).unit_normalized).toEqual({
      raw_text: "gallons",
      normalized_unit: "gallons",
      unit_family: "volume",
    });
    expect(metric({ metric_name: "water_volume", unit: "million gallons" }).unit_normalized).toEqual({
      raw_text: "million gallons",
      normalized_unit: "gallons",
      unit_family: "volume",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "water_volume", unit: "M gallons" }).unit_normalized).toEqual({
      raw_text: "M gallons",
      normalized_unit: "gallons",
      unit_family: "volume",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "pumping_rate", unit: "gallons per hour" }).unit_normalized).toEqual({
      raw_text: "gallons per hour",
      normalized_unit: "gallons_per_hour",
      unit_family: "volume_rate",
    });
    expect(metric({ metric_name: "emissions_avoided", unit: "metric tons" }).unit_normalized).toEqual({
      raw_text: "metric tons",
      normalized_unit: "metric_tons",
      unit_family: "mass",
    });
    expect(metric({ metric_name: "emissions_avoided", unit: "metric tons of CO2" }).unit_normalized).toEqual({
      raw_text: "metric tons of CO2",
      normalized_unit: "metric_tons_co2",
      unit_family: "mass",
    });
    expect(metric({ metric_name: "annual_emissions", unit: "metric tons per year" }).unit_normalized).toEqual({
      raw_text: "metric tons per year",
      normalized_unit: "metric_tons_per_year",
      unit_family: "mass_rate",
    });
    expect(metric({ metric_name: "deicer_usage", unit: "tons" }).unit_normalized).toEqual({
      raw_text: "tons",
      normalized_unit: "tons",
      unit_family: "mass",
    });
    expect(metric({ metric_name: "track_panel_weight", unit: "pounds" }).unit_normalized).toEqual({
      raw_text: "pounds",
      normalized_unit: "pounds",
      unit_family: "mass",
    });
    expect(metric({ metric_name: "grout_quantity", unit: "cubic feet" }).unit_normalized).toEqual({
      raw_text: "cubic feet",
      normalized_unit: "cubic_feet",
      unit_family: "volume",
    });

    for (const [unit, normalizedUnit] of [
      ["years", "years"],
      ["months", "months"],
      ["month", "months"],
      ["weeks", "weeks"],
      ["workdays", "workdays"],
      ["business days", "business_days"],
      ["calendar days", "calendar_days"],
      ["days", "days"],
      ["min", "minutes"],
      ["person-hours", "person_hours"],
    ]) {
      expect(metric({ metric_name: "duration_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "duration",
      });
    }
    expect(metric({ metric_name: "employee_availability", unit: "days per year" }).unit_normalized).toEqual({
      raw_text: "days per year",
      normalized_unit: "days_per_year",
      unit_family: "duration_rate",
    });
    expect(metric({ metric_name: "injury_frequency", unit: "days per injury" }).unit_normalized).toEqual({
      raw_text: "days per injury",
      normalized_unit: "days_per_injury",
      unit_family: "duration_rate",
    });
    expect(metric({ metric_name: "passenger_delay", unit: "hours per weekday" }).unit_normalized).toEqual({
      raw_text: "hours per weekday",
      normalized_unit: "hours_per_weekday",
      unit_family: "duration_rate",
    });

    for (const [unit, normalizedUnit] of [
      ["linear feet", "feet"],
      ["lineal ft", "feet"],
      ["ft", "feet"],
      ["mi", "miles"],
      ["inches", "inches"],
      ["track feet", "track_feet"],
      ["track miles", "track_miles"],
      ["lane miles", "lane_miles"],
      ["revenue car miles", "revenue_car_miles"],
    ]) {
      expect(metric({ metric_name: "distance_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "distance",
      });
    }

    for (const [unit, normalizedUnit] of [
      ["sq. ft.", "square_feet"],
      ["ft2", "square_feet"],
      ["square foot", "square_feet"],
      ["square miles", "square_miles"],
      ["acres", "acres"],
    ]) {
      expect(metric({ metric_name: "area_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "area",
      });
    }

    expect(metric({ metric_name: "capital_cost", unit: "$ billion" }).unit_normalized).toEqual({
      raw_text: "$ billion",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000_000,
    });
    expect(metric({ metric_name: "capital_cost", unit: "M USD" }).unit_normalized).toEqual({
      raw_text: "M USD",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "monthly_cost", unit: "USD/month" }).unit_normalized).toEqual({
      raw_text: "USD/month",
      normalized_unit: "dollars_per_month",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "fuel_price", unit: "$/gal" }).unit_normalized).toEqual({
      raw_text: "$/gal",
      normalized_unit: "dollars_per_gallon",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "fuel_price", unit: "$/bbl" }).unit_normalized).toEqual({
      raw_text: "$/bbl",
      normalized_unit: "dollars_per_barrel",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "swap_notional", unit: "$000" }).unit_normalized).toEqual({
      raw_text: "$000",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000,
    });
    expect(metric({ metric_name: "total_debt_outstanding", unit: "USD x1000" }).unit_normalized).toEqual({
      raw_text: "USD x1000",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000,
    });
    expect(metric({ metric_name: "annual_savings", unit: "USD per year" }).unit_normalized).toEqual({
      raw_text: "USD per year",
      normalized_unit: "dollars_per_year",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "casino_revenue", unit: "millions of dollars per year" }).unit_normalized).toEqual({
      raw_text: "millions of dollars per year",
      normalized_unit: "dollars_per_year",
      unit_family: "money_rate",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "revenue_per_vehicle", unit: "$ per vehicle" }).unit_normalized).toEqual({
      raw_text: "$ per vehicle",
      normalized_unit: "dollars_per_vehicle",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "price_per_bus_per_month", unit: "USD per bus per month" }).unit_normalized).toEqual({
      raw_text: "USD per bus per month",
      normalized_unit: "dollars_per_bus_per_month",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "per_bus_schedule_compensation", unit: "USD per bus" }).unit_normalized).toEqual({
      raw_text: "USD per bus",
      normalized_unit: "dollars_per_bus",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "per_bus_schedule_compensation", unit: "dollars per bus" }).unit_normalized).toEqual({
      raw_text: "dollars per bus",
      normalized_unit: "dollars_per_bus",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "price_per_square_foot", unit: "USD per SF" }).unit_normalized).toEqual({
      raw_text: "USD per SF",
      normalized_unit: "dollars_per_square_foot",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "appraised_value", unit: "USD/square_foot" }).unit_normalized).toEqual({
      raw_text: "USD/square_foot",
      normalized_unit: "dollars_per_square_foot",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "rent_per_square_foot", unit: "dollars per square foot per annum" }).unit_normalized).toEqual({
      raw_text: "dollars per square foot per annum",
      normalized_unit: "dollars_per_square_foot_per_year",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "weekly_license_fee", unit: "dollars per week" }).unit_normalized).toEqual({
      raw_text: "dollars per week",
      normalized_unit: "dollars_per_week",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "base_rent", unit: "per annum", raw_value_text: "$109,345.32 per annum" }).unit_normalized).toEqual({
      raw_text: "per annum",
      normalized_unit: "dollars_per_year",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "monthly_rent", unit: "per month", raw_value_text: "$9,112.91 per month" }).unit_normalized).toEqual({
      raw_text: "per month",
      normalized_unit: "dollars_per_month",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "rent_per_square_foot", unit: "per square foot", raw_value_text: "$36.45 per square foot" }).unit_normalized).toEqual({
      raw_text: "per square foot",
      normalized_unit: "dollars_per_square_foot",
      unit_family: "money_rate",
    });
    expect(
      metric({
        metric_name: "cost_per_daily_rider",
        unit: "2027 $M",
        raw_value_text: "Second Avenue Subway Phase 2 $62,500",
        scope: "Second Avenue Subway Phase 2",
        value: 62500,
      }).unit_normalized,
    ).toEqual({
      raw_text: "2027 $M",
      normalized_unit: "dollars_per_average_daily_rider",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "term_length", unit: "per annum", raw_value_text: "1" }).unit_normalized).toEqual({
      raw_text: "per annum",
      normalized_unit: "per_annum",
      unit_family: "other",
    });
    expect(metric({ metric_name: "monthly_cost", unit: "$/month" }).unit_normalized).toEqual({
      raw_text: "$/month",
      normalized_unit: "dollars_per_month",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "daily_rate", unit: "USD/day" }).unit_normalized).toEqual({
      raw_text: "USD/day",
      normalized_unit: "dollars_per_day",
      unit_family: "money_rate",
    });
    expect(metric({ metric_name: "bulb_energy", unit: "kWh/bulb" }).unit_normalized).toEqual({
      raw_text: "kWh/bulb",
      normalized_unit: "kilowatt_hours_per_bulb",
      unit_family: "energy_rate",
    });
    expect(metric({ metric_name: "power_capacity", unit: "MW" }).unit_normalized).toEqual({
      raw_text: "MW",
      normalized_unit: "megawatts",
      unit_family: "power",
    });
    expect(metric({ metric_name: "ambient_temperature", unit: "degrees Fahrenheit" }).unit_normalized).toEqual({
      raw_text: "degrees Fahrenheit",
      normalized_unit: "degrees_fahrenheit",
      unit_family: "temperature",
    });
    expect(metric({ metric_name: "system_replacement_value", unit: "trillion dollars" }).unit_normalized).toEqual({
      raw_text: "trillion dollars",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000_000_000,
    });
    expect(metric({ metric_name: "capital_program_budget", unit: "millions", raw_value_text: "$54,799 covering the years 2020-2024" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "fuel_cost_vs_budget", unit: "millions", currency: "USD", raw_value_text: "(44.393)" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "executive_budget_component", unit: "M", raw_value_text: "$492M" }).unit_normalized).toEqual({
      raw_text: "M",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "cash_and_invested_assets", unit: "thousands", raw_value_text: "$953,681" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000,
    });
    expect(metric({ metric_name: "capital_commitment_actual", unit: "B", currency: "USD", raw_value_text: "5.4" }).unit_normalized).toEqual({
      raw_text: "B",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000_000,
    });
    expect(metric({ metric_name: "budget_total", unit: "millions", raw_value_text: "54.7" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "millions",
      unit_family: "other",
    });
  });

  it("normalizes scale-only units only with bounded metric context", () => {
    expect(metric({ metric_name: "total_assets", unit: "millions", raw_value_text: "140" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "losses_and_lae_incurred", unit: "thousands", raw_value_text: "70,472" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000,
    });
    expect(metric({ metric_name: "variance", unit: "millions", description: "Debt service variance" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "traffic_volume", unit: "millions", entity: "MTA Bridges and Tunnels" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "vehicle_crossings",
      unit_family: "count",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "traffic", unit: "millions", entity: "MTA Bridges and Tunnels" }).unit_normalized).toEqual({
      raw_text: "millions",
      normalized_unit: "vehicle_crossings",
      unit_family: "count",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "fare_evasion_novis", unit: "thousands" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "notices_of_violation",
      unit_family: "count",
      scale: 1_000,
    });
    expect(metric({ metric_name: "fare_evasion_warnings", unit: "thousands" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "warnings",
      unit_family: "count",
      scale: 1_000,
    });
    expect(metric({ metric_name: "customers_gated", unit: "thousands" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "customers",
      unit_family: "count",
      scale: 1_000,
    });

    for (const payload of [
      { metric_name: "budget_total", unit: "millions", raw_value_text: "54.7" },
      { metric_name: "traffic_volume", unit: "millions", scope: "regional traffic" },
      { metric_name: "ambiguous_metric", unit: "thousands", scope: "New York City" },
    ]) {
      expect(metric(payload).unit_normalized).toEqual({
        raw_text: payload.unit,
        normalized_unit: payload.unit,
        unit_family: "other",
      });
    }
  });

  it("normalizes context-only residual metric units without broad aliases", () => {
    expect(metric({ metric_name: "employment", unit: "thousands", scope: "New York City" }).unit_normalized).toEqual({
      raw_text: "thousands",
      normalized_unit: "jobs",
      unit_family: "access",
      scale: 1_000,
    });
    expect(metric({ metric_name: "employment_mta_service_area", unit: "Millions of jobs" }).unit_normalized).toEqual({
      raw_text: "Millions of jobs",
      normalized_unit: "jobs",
      unit_family: "access",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "non_agricultural_employment", unit: "thousand jobs" }).unit_normalized).toEqual({
      raw_text: "thousand jobs",
      normalized_unit: "jobs",
      unit_family: "access",
      scale: 1_000,
    });
    expect(metric({ metric_name: "lost_time_injury_rate", unit: "rate" }).unit_normalized).toEqual({
      raw_text: "rate",
      normalized_unit: "lost_time_injury_rate",
      unit_family: "safety_rate",
    });
    expect(metric({ metric_name: "lost_time_incident_rate", unit: "rate" }).unit_normalized).toEqual({
      raw_text: "rate",
      normalized_unit: "lost_time_incident_rate",
      unit_family: "safety_rate",
    });
    expect(metric({ metric_name: "total_recordable_incident_rate", unit: "rate" }).unit_normalized).toEqual({
      raw_text: "rate",
      normalized_unit: "total_recordable_incident_rate",
      unit_family: "safety_rate",
    });
    expect(
      metric({
        metric_name: "emergency_relief_funding",
        unit: "billions",
        scope: "FTA emergency relief funding to MTA for Superstorm Sandy",
      }).unit_normalized,
    ).toEqual({
      raw_text: "billions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000_000,
    });
    expect(metric({ metric_name: "gross_subsidies", unit: "Uillions" }).unit_normalized).toEqual({
      raw_text: "Uillions",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(
      metric({
        metric_name: "support_to_mass_transit",
        unit: "million dollars... wait, the table shows amounts in millions. Let me re-read.",
      }).unit_normalized,
    ).toEqual({
      raw_text: "million dollars... wait, the table shows amounts in millions. Let me re-read.",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });
    expect(
      metric({
        metric_name: "ambiguous_note",
        unit: "million dollars... wait, the table shows amounts in millions. Let me re-read.",
      }).unit_normalized,
    ).toEqual({
      raw_text: "million dollars... wait, the table shows amounts in millions. Let me re-read.",
      normalized_unit: "million_dollars_wait_the_table_shows_amounts_in_millions_let_me_re_read",
      unit_family: "other",
    });
    expect(metric({ metric_name: "pedestrian_crossings", unit: "crossings per hour" }).unit_normalized).toEqual({
      raw_text: "crossings per hour",
      normalized_unit: "pedestrians_per_hour",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "daily_crossings", unit: "daily crossings", entity: "MTA Bridges and Tunnels" }).unit_normalized).toEqual({
      raw_text: "daily crossings",
      normalized_unit: "vehicle_crossings_per_day",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "major_felonies_rate", unit: "per 1M riders" }).unit_normalized).toEqual({
      raw_text: "per 1M riders",
      normalized_unit: "felonies_per_million_riders",
      unit_family: "safety_rate",
    });
    expect(metric({ metric_name: "weekend_ridership_above_baseline_count", unit: "weekends" }).unit_normalized).toEqual({
      raw_text: "weekends",
      normalized_unit: "weekends",
      unit_family: "count",
    });
    expect(metric({ metric_name: "agreement_term", unit: "year", description: "Term of the kiosk license agreement" }).unit_normalized).toEqual({
      raw_text: "year",
      normalized_unit: "years",
      unit_family: "duration",
    });
    expect(metric({ metric_name: "market_share_change", unit: "x" }).unit_normalized).toEqual({
      raw_text: "x",
      normalized_unit: "multiple",
      unit_family: "ratio",
    });
  });

  it("normalizes exact residual safety, count, denominator, percentage, and ridership rates", () => {
    for (const [unit, normalizedUnit, family] of [
      ["collisions per million vehicles", "collisions_per_million_vehicles", "safety_rate"],
      ["collisions per million miles", "collisions_per_million_miles", "safety_rate"],
      ["collisions per VRM", "collisions_per_vehicle_revenue_mile", "safety_rate"],
      ["injury collisions per million vehicles", "collisions_with_injury_per_million_vehicles", "safety_rate"],
      ["collisions with injuries per million vehicles", "collisions_with_injury_per_million_vehicles", "safety_rate"],
      ["injuries per million customers", "injuries_per_million_customers", "safety_rate"],
      ["injuries per one million customers", "injuries_per_million_customers", "safety_rate"],
      ["injuries per million vehicles", "injuries_per_million_vehicles", "safety_rate"],
      ["injuries per week", "injuries_per_week", "safety_rate"],
      ["accidents per million customers", "accidents_per_million_customers", "safety_rate"],
      ["accidents per one million customers", "accidents_per_million_customers", "safety_rate"],
      ["injuries per 200,000 hours worked", "injuries_per_200000_hours_worked", "safety_rate"],
      ["injuries per 200,000 hours", "injuries_per_200000_hours_worked", "safety_rate"],
      ["injuries per 200,000 work hours", "injuries_per_200000_hours_worked", "safety_rate"],
      ["injuries per VRM", "injuries_per_vehicle_revenue_mile", "safety_rate"],
      ["accidents per 200,000 hours worked", "accidents_per_200000_hours_worked", "safety_rate"],
      ["collisions with injury per million vehicles", "collisions_with_injury_per_million_vehicles", "safety_rate"],
      ["assaults per 1M rides", "assaults_per_million_rides", "safety_rate"],
      ["assaults per VRM", "assaults_per_vehicle_revenue_mile", "safety_rate"],
      ["fatalities per VRM", "fatalities_per_vehicle_revenue_mile", "safety_rate"],
      ["KSI per mile", "ksi_per_mile", "safety_rate"],
      ["KSI/mile", "ksi_per_mile", "safety_rate"],
      ["pedestrians KSI per mile", "pedestrian_ksi_per_mile", "safety_rate"],
      ["people per mile", "ksi_per_mile", "safety_rate"],
      ["major crimes per million customers", "major_crimes_per_million_customers", "safety_rate"],
      ["crimes per million rides", "crimes_per_million_rides", "safety_rate"],
      ["collisions per one million vehicles", "collisions_per_million_vehicles", "safety_rate"],
      ["injuries per 200000 hours worked", "injuries_per_200000_hours_worked", "safety_rate"],
      ["injuries/month", "injuries_per_month", "safety_rate"],
      ["incident rate", "incident_rate", "safety_rate"],
      ["incidents per 200,000 work hours", "incidents_per_200000_hours_worked", "count_rate"],
      ["incidents per 200,000 hours", "incidents_per_200000_hours_worked", "count_rate"],
      ["activities per month", "activities_per_month", "count_rate"],
      ["applications per month", "applications_per_month", "count_rate"],
      ["calls per month", "calls_per_month", "count_rate"],
      ["cars per 12 hours", "cars_per_12_hours", "count_rate"],
      ["completions per year", "completions_per_year", "count_rate"],
      ["downloads/week", "downloads_per_week", "count_rate"],
      ["locations per week", "locations_per_week", "count_rate"],
      ["requests per month", "requests_per_month", "count_rate"],
      ["rows per day", "rows_per_day", "count_rate"],
      ["spaces per hour", "spaces_per_hour", "count_rate"],
      ["stations per month", "stations_per_month", "count_rate"],
      ["summons per quarter", "summonses_per_quarter", "count_rate"],
      ["taps per day", "taps_per_day", "count_rate"],
      ["track_outages_per_year", "track_outages_per_year", "count_rate"],
      ["trains per day", "trains_per_day", "count_rate"],
      ["trains per peak period", "trains_per_peak_period", "count_rate"],
      ["trains_per_week", "trains_per_week", "count_rate"],
      ["transfers per day", "transfers_per_day", "count_rate"],
      ["seats per car", "seats_per_car", "count_rate"],
      ["transactions per quarter", "transactions_per_quarter", "count_rate"],
      ["pedestrians per hour per block", "pedestrians_per_hour_per_block", "count_rate"],
      ["buses per hour", "buses_per_hour", "count_rate"],
      ["pedestrians per hour", "pedestrians_per_hour", "count_rate"],
      ["pedestrians/hour", "pedestrians_per_hour", "count_rate"],
      ["vehicles per hour", "vehicles_per_hour", "count_rate"],
      ["vehicles per weekday", "vehicles_per_weekday", "count_rate"],
      ["trucks per day", "trucks_per_day", "count_rate"],
      ["buses per day", "buses_per_day", "count_rate"],
      ["buses per weekday", "buses_per_weekday", "count_rate"],
      ["buses per direction daily", "buses_per_direction_per_day", "count_rate"],
      ["buses per direction per day", "buses_per_direction_per_day", "count_rate"],
      ["buses per hour per direction", "buses_per_hour_per_direction", "count_rate"],
      ["bus trips per peak hour", "bus_trips_per_peak_hour", "count_rate"],
      ["cyclists_per_12_hours", "cyclists_per_12_hours", "count_rate"],
      ["cyclists per 12-hour weekday", "cyclists_per_12_hour_weekday", "count_rate"],
      ["movements per hour", "movements_per_hour", "count_rate"],
      ["count per day", "count_per_day", "count_rate"],
      ["incidents per month", "incidents_per_month", "count_rate"],
      ["interactions_per_month", "interactions_per_month", "count_rate"],
      ["events per VRM", "events_per_vehicle_revenue_mile", "count_rate"],
      ["awards per year", "awards_per_year", "count_rate"],
      ["rate per million vehicles", "per_million_vehicles", "rate"],
      ["per million customers", "per_million_customers", "rate"],
      ["per 1 million customers", "per_million_customers", "rate"],
      ["per 1M customers", "per_million_customers", "rate"],
      ["per 1 million", "per_million", "rate"],
      ["per million", "per_million", "rate"],
      ["per one million vehicles", "per_million_vehicles", "rate"],
      ["per 1 million vehicles", "per_million_vehicles", "rate"],
      ["per million miles", "per_million_miles", "rate"],
      ["per 1,000 residents", "per_1000_residents", "rate"],
      ["per 200,000 hours worked", "per_200000_hours_worked", "rate"],
      ["per 200,000 work hours", "per_200000_hours_worked", "rate"],
      ["per 200,000 worker hours", "per_200000_hours_worked", "rate"],
      ["per 200k hours", "per_200000_hours_worked", "rate"],
      ["per_200000_hours", "per_200000_hours_worked", "rate"],
      ["rate per 200,000 work hours", "per_200000_hours_worked", "rate"],
      ["per 1,000 scheduled trips", "per_1000_scheduled_trips", "rate"],
      ["per_1000_trips", "per_1000_trips", "rate"],
      ["no-shows per trip", "no_shows_per_trip", "rate"],
      ["inches per hour", "inches_per_hour", "rate"],
    ]) {
      expect(metric({ metric_name: "rate_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: family,
      });
    }

    expect(metric({ metric_name: "benefit_cost_ratio", unit: "ratio" }).unit_normalized).toEqual({
      raw_text: "ratio",
      normalized_unit: "ratio",
      unit_family: "ratio",
    });
    expect(metric({ metric_name: "load_factor", unit: "load factor" }).unit_normalized).toEqual({
      raw_text: "load factor",
      normalized_unit: "load_factor",
      unit_family: "ratio",
    });
    for (const [unit, normalizedUnit] of [
      ["decimal fraction", "fraction"],
      ["fraction", "fraction"],
      ["times more likely", "times_more_likely"],
      ["multiples", "multiple"],
      ["proportion", "proportion"],
    ]) {
      expect(metric({ metric_name: "ratio_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "ratio",
      });
    }
    expect(metric({ metric_name: "app_store_rating", unit: "stars" }).unit_normalized).toEqual({
      raw_text: "stars",
      normalized_unit: "stars",
      unit_family: "rating",
    });
    expect(metric({ metric_name: "ridership_rank", unit: "rank" }).unit_normalized).toEqual({
      raw_text: "rank",
      normalized_unit: "rank",
      unit_family: "rating",
    });
    expect(metric({ metric_name: "safety_percentile", unit: "percentile" }).unit_normalized).toEqual({
      raw_text: "percentile",
      normalized_unit: "percentile",
      unit_family: "rating",
    });
    expect(metric({ metric_name: "book_yield_change", unit: "bps" }).unit_normalized).toEqual({
      raw_text: "bps",
      normalized_unit: "basis_points",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "compensation", unit: "percent_of_gross_sales" }).unit_normalized).toEqual({
      raw_text: "percent_of_gross_sales",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "ridership_recovery_assumption", unit: "percent_point_increase" }).unit_normalized).toEqual({
      raw_text: "percent_point_increase",
      normalized_unit: "percentage_point",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "pedestrian_crash_ksi", unit: "KSI" }).unit_normalized).toEqual({
      raw_text: "KSI",
      normalized_unit: "killed_or_severely_injured",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "pedestrian_crash_ksi", unit: "KSI (killed or severely injured)" }).unit_normalized).toEqual({
      raw_text: "KSI (killed or severely injured)",
      normalized_unit: "killed_or_severely_injured",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "percentage_metric", unit: "percentage" }).unit_normalized).toEqual({
      raw_text: "percentage",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "recovery_metric", unit: "% of 2019" }).unit_normalized).toEqual({
      raw_text: "% of 2019",
      normalized_unit: "percent_of_2019",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "ridership_recovery_metric", unit: "% of Jan 2017 baseline" }).unit_normalized).toEqual({
      raw_text: "% of Jan 2017 baseline",
      normalized_unit: "percent_of_jan_2017_baseline",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "consumer_price_index", unit: "CPI-U index" }).unit_normalized).toEqual({
      raw_text: "CPI-U index",
      normalized_unit: "cpi_u_index",
      unit_family: "scale",
    });
    expect(metric({ metric_name: "cpi_w_index_change", unit: "index points" }).unit_normalized).toEqual({
      raw_text: "index points",
      normalized_unit: "index_points",
      unit_family: "scale",
    });

    for (const [unit, normalizedUnit] of [
      ["millions of trips", "trips"],
      ["million passenger trips", "trips"],
      ["millions of riders", "riders"],
      ["riders/day", "riders_per_day"],
      ["customers per day", "riders_per_day"],
      ["boardings per weekday", "boardings_per_weekday"],
      ["riders per peak hour", "riders_per_peak_hour"],
      ["riders per half hour", "riders_per_half_hour"],
      ["customers per weekday", "riders_per_weekday"],
      ["customers/day", "riders_per_day"],
      ["ridership", "ridership"],
      ["alightings", "alightings"],
      ["daily bus riders", "riders_per_day"],
      ["daily ridership", "riders_per_day"],
      ["passengers per year", "riders_per_year"],
      ["passengers/day", "riders_per_day"],
      ["people per day", "riders_per_day"],
      ["people per weekday", "riders_per_weekday"],
      ["riders per car", "riders_per_car"],
      ["passengers per car", "riders_per_car"],
      ["riders per year", "riders_per_year"],
      ["trips per month", "trips_per_month"],
    ]) {
      expect(metric({ metric_name: "ridership_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "ridership",
        ...([
          "riders/day",
          "customers per day",
          "boardings per weekday",
          "riders per peak hour",
          "riders per half hour",
          "customers per weekday",
          "customers/day",
          "ridership",
          "alightings",
          "daily bus riders",
          "daily ridership",
          "passengers per year",
          "passengers/day",
          "people per day",
          "people per weekday",
          "riders per car",
          "passengers per car",
          "riders per year",
          "trips per month",
        ].includes(unit)
          ? {}
          : { scale: 1_000_000 }),
      });
    }
    expect(metric({ metric_name: "commutation_ridership", unit: "thousands of riders" }).unit_normalized).toEqual({
      raw_text: "thousands of riders",
      normalized_unit: "riders",
      unit_family: "ridership",
      scale: 1_000,
    });
    expect(metric({ metric_name: "average_weekday_ridership", unit: "thousand riders" }).unit_normalized).toEqual({
      raw_text: "thousand riders",
      normalized_unit: "riders",
      unit_family: "ridership",
      scale: 1_000,
    });
    expect(metric({ metric_name: "annual_ridership", unit: "billion rides" }).unit_normalized).toEqual({
      raw_text: "billion rides",
      normalized_unit: "rides",
      unit_family: "ridership",
      scale: 1_000_000_000,
    });
    expect(metric({ metric_name: "traffic_volume", unit: "million vehicle crossings" }).unit_normalized).toEqual({
      raw_text: "million vehicle crossings",
      normalized_unit: "vehicle_crossings",
      unit_family: "count",
      scale: 1_000_000,
    });
    expect(metric({ metric_name: "paid_traffic", unit: "millions of crossings" }).unit_normalized).toEqual({
      raw_text: "millions of crossings",
      normalized_unit: "crossings",
      unit_family: "count",
      scale: 1_000_000,
    });

    for (const unit of [
      "millions",
      "thousands",
      "M",
      "B",
      "year",
      "rate",
      "per_annum",
      "per square foot",
      "Millions of jobs",
      "thousand jobs",
      "individuals",
      "weekends",
      "crossings per hour",
      "daily crossings",
      "per 1M riders",
      "Uillions",
      "x",
      "2027 $M",
      "billions",
      "million dollars... wait, the table shows amounts in millions. Let me re-read.",
      "units per hour",
    ]) {
      expect(metric({ metric_name: "ambiguous_metric", unit }).unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: unit.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, ""),
        unit_family: "other",
      });
    }
  });

  it("infers exact missing farebox ratio units from audited decimal raw values", () => {
    expect(metric({ metric_name: "farebox_recovery_ratio", raw_value_text: "0.251", value: 0.251 }).unit_normalized).toEqual({
      raw_text: "0.251",
      normalized_unit: "ratio",
      unit_family: "ratio",
    });
    expect(metric({ metric_name: "farebox_operating_ratio", raw_value_text: "0.065 (6.5000000000000002E-2)", value: 0.065 }).unit_normalized).toEqual({
      raw_text: "0.065 (6.5000000000000002E-2)",
      normalized_unit: "ratio",
      unit_family: "ratio",
    });
    expect(metric({ metric_name: "farebox_operating_ratio", raw_value_text: "25%", value: 25 }).unit_normalized).toBeUndefined();
    expect(metric({ metric_name: "ambiguous_ratio", raw_value_text: "0.251", value: 0.251 }).unit_normalized).toBeUndefined();
  });

  it("infers exact missing safety, enforcement, workforce, and ridership metric units", () => {
    expect(metric({ metric_name: "major_felony_count", raw_value_text: "1632", value: 1632 }).unit_normalized).toEqual({
      raw_text: "1632",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "major_felonies", raw_value_text: "31", value: 31 }).unit_normalized).toEqual({
      raw_text: "31",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "hate_crime_count", raw_value_text: "3", value: 3 }).unit_normalized).toEqual({
      raw_text: "3",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "total_major_felonies", raw_value_text: "823", value: 823 }).unit_normalized).toEqual({
      raw_text: "823",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "violations_issued", raw_value_text: "120,886", value: 120886 }).unit_normalized).toEqual({
      raw_text: "120,886",
      normalized_unit: "violations",
      unit_family: "count",
    });
    expect(metric({ metric_name: "number_of_payments", raw_value_text: "34,044", value: 34044 }).unit_normalized).toEqual({
      raw_text: "34,044",
      normalized_unit: "payments",
      unit_family: "count",
    });
    expect(metric({ metric_name: "cases_adjudicated", raw_value_text: "3,236", value: 3236 }).unit_normalized).toEqual({
      raw_text: "3,236",
      normalized_unit: "cases",
      unit_family: "count",
    });
    expect(metric({ metric_name: "hate_crimes_by_motivation", raw_value_text: "8", value: 8 }).unit_normalized).toEqual({
      raw_text: "8",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "hate_crimes", raw_value_text: "9", value: 9 }).unit_normalized).toEqual({
      raw_text: "9",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "hate_crime_incidents_by_crime_name", raw_value_text: "Assault 3 3", value: 3 }).unit_normalized).toEqual({
      raw_text: "Assault 3 3",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "historical_january_crime_count", raw_value_text: "Robbery 44", value: 44 }).unit_normalized).toEqual({
      raw_text: "Robbery 44",
      normalized_unit: "incidents",
      unit_family: "count",
    });
    expect(metric({ metric_name: "bridge_strikes", raw_value_text: "7 bridge strikes", value: 7 }).unit_normalized).toEqual({
      raw_text: "7 bridge strikes",
      normalized_unit: "bridge_strikes",
      unit_family: "count",
    });
    expect(metric({ metric_name: "major_felonies_per_day", raw_value_text: "5.98", value: 5.98 }).unit_normalized).toEqual({
      raw_text: "5.98",
      normalized_unit: "felonies_per_day",
      unit_family: "count_rate",
    });
    expect(metric({ metric_name: "regular_payments_count", raw_value_text: "25,151", value: 25151 }).unit_normalized).toEqual({
      raw_text: "25,151",
      normalized_unit: "payments",
      unit_family: "count",
    });
    expect(metric({ metric_name: "trains_scheduled", raw_value_text: "223,284", value: 223284 }).unit_normalized).toEqual({
      raw_text: "223,284",
      normalized_unit: "trains",
      unit_family: "count",
    });
    expect(metric({ metric_name: "title_vi_complaints_by_basis", raw_value_text: "Race 20 0 20", value: 20 }).unit_normalized).toEqual({
      raw_text: "Race 20 0 20",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "external_eeo_complaints_by_basis", raw_value_text: "Age 7% 3", value: 3 }).unit_normalized).toEqual({
      raw_text: "Age 7% 3",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "employment_discrimination_complaints_by_basis", raw_value_text: "Disability 3 2", value: 5 }).unit_normalized).toEqual({
      raw_text: "Disability 3 2",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "internal_eeo_complaints_by_basis", raw_value_text: "Age 7% 2", value: 2 }).unit_normalized).toEqual({
      raw_text: "Age 7% 2",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "title_vii_external_complaints_by_basis", raw_value_text: "Race/Color 2 2", value: 2 }).unit_normalized).toEqual({
      raw_text: "Race/Color 2 2",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "title_vi_complaints", raw_value_text: "12 Title VI complaints were filed", value: 12 }).unit_normalized).toEqual({
      raw_text: "12 Title VI complaints were filed",
      normalized_unit: "complaints",
      unit_family: "count",
    });
    expect(metric({ metric_name: "enforcement_activity", category: "Total Arrests", raw_value_text: "42", value: 42 }).unit_normalized).toEqual({
      raw_text: "42",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "enforcement_activity_count", category: "TOS C-Summ", raw_value_text: "7", value: 7 }).unit_normalized).toEqual({
      raw_text: "7",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "total_arrests", raw_value_text: "694", value: 694 }).unit_normalized).toEqual({
      raw_text: "694",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "total_summons", raw_value_text: "10,625", value: 10625 }).unit_normalized).toEqual({
      raw_text: "10,625",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "enforcement_action_count", category: "TOS Arrests", raw_value_text: "342", value: 342 }).unit_normalized).toEqual({
      raw_text: "342",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "enforcement_action_count", category: "TOS TABs", raw_value_text: "8,929", value: 8929 }).unit_normalized).toEqual({
      raw_text: "8,929",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "tos_arrests", raw_value_text: "338", value: 338 }).unit_normalized).toEqual({
      raw_text: "338",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "activity_count", category: "Total Arrests", raw_value_text: "21227 12863 8364 65.0%", value: 21227 }).unit_normalized).toEqual({
      raw_text: "21227 12863 8364 65.0%",
      normalized_unit: "arrests",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "summons_count", raw_value_text: "Total Summons 2024 16152 2023 12102 Diff 4050 33.5%", value: 16152 }).unit_normalized).toEqual({
      raw_text: "Total Summons 2024 16152 2023 12102 Diff 4050 33.5%",
      normalized_unit: "summonses",
      unit_family: "enforcement",
    });
    expect(metric({ metric_name: "pedestrian_ksi", category: "pedestrian_fatalities", raw_value_text: "Ped Fatalities: 1", value: 1 }).unit_normalized).toEqual({
      raw_text: "Ped Fatalities: 1",
      normalized_unit: "fatalities",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "pedestrian_ksi", category: "pedestrian_killed_or_severely_injured", raw_value_text: "Ped KSI: 5", value: 5 }).unit_normalized).toEqual({
      raw_text: "Ped KSI: 5",
      normalized_unit: "killed_or_severely_injured",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "fatalities", raw_value_text: "16 fatalities", value: 16 }).unit_normalized).toEqual({
      raw_text: "16 fatalities",
      normalized_unit: "fatalities",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "crash_fatalities_and_severe_injuries", raw_value_text: "Avenue H 0 fatalities, 8 severe injuries", value: 8 }).unit_normalized).toEqual({
      raw_text: "Avenue H 0 fatalities, 8 severe injuries",
      normalized_unit: "fatalities_and_severe_injuries",
      unit_family: "safety",
    });
    expect(metric({ metric_name: "total_positions", raw_value_text: "381", value: 381 }).unit_normalized).toEqual({
      raw_text: "381",
      normalized_unit: "positions",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "new_hires", raw_value_text: "16 new hires", value: 16 }).unit_normalized).toEqual({
      raw_text: "16 new hires",
      normalized_unit: "hires",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "total_workforce", raw_value_text: "873 strong", value: 873 }).unit_normalized).toEqual({
      raw_text: "873 strong",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "workforce_by_sex_ethnicity", raw_value_text: "Asian Male 286", value: 286 }).unit_normalized).toEqual({
      raw_text: "Asian Male 286",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "headcount", raw_value_text: "total headcount was 6,345", value: 6345 }).unit_normalized).toEqual({
      raw_text: "total headcount was 6,345",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "net_employee_change", raw_value_text: "net decrease of 8 self-identified male employees", value: -8 }).unit_normalized).toEqual({
      raw_text: "net decrease of 8 self-identified male employees",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "hires", raw_value_text: "Asian 14", value: 14 }).unit_normalized).toEqual({
      raw_text: "Asian 14",
      normalized_unit: "hires",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "separations", raw_value_text: "80 employees separated", value: 80 }).unit_normalized).toEqual({
      raw_text: "80 employees separated",
      normalized_unit: "employees",
      unit_family: "workforce",
    });
    expect(metric({ metric_name: "contract_amount", raw_value_text: "$4,682,050,000", value: 4682050000 }).unit_normalized).toEqual({
      raw_text: "$4,682,050,000",
      normalized_unit: "dollars",
      unit_family: "money",
    });
    expect(metric({ metric_name: "license_annual_rental", raw_value_text: "Year 1 $121,750.00", value: 121750, currency: "USD" }).unit_normalized).toEqual({
      raw_text: "Year 1 $121,750.00",
      normalized_unit: "dollars",
      unit_family: "money",
    });
    expect(metric({ metric_name: "expenses", raw_value_text: "$969,392", value: 969392, currency: "USD" }).unit_normalized).toEqual({
      raw_text: "$969,392",
      normalized_unit: "dollars",
      unit_family: "money",
    });
    expect(metric({ metric_name: "yield_per_nov", raw_value_text: "$48.23", value: 48.23 }).unit_normalized).toEqual({
      raw_text: "$48.23",
      normalized_unit: "dollars",
      unit_family: "money",
    });
    expect(metric({ metric_name: "weekday_ridership_percent_increase", raw_value_text: "+34%", value: 34 }).unit_normalized).toEqual({
      raw_text: "+34%",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "weekend_ridership_percent_increase", raw_value_text: "+38%", value: 38 }).unit_normalized).toEqual({
      raw_text: "+38%",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "on-time performance", raw_value_text: "97.1%", value: 97.1 }).unit_normalized).toEqual({
      raw_text: "97.1%",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "pct_days_over_3min_free_flow", raw_value_text: "2024: 10%, 2025: 6%", value: 10 }).unit_normalized).toEqual({
      raw_text: "2024: 10%, 2025: 6%",
      normalized_unit: "percent",
      unit_family: "percentage",
    });
    expect(metric({ metric_name: "average_weekday_ridership", raw_value_text: "54000", value: 54000 }).unit_normalized).toEqual({
      raw_text: "54000",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "revenue_passengers", raw_value_text: "106", value: 106 }).unit_normalized).toEqual({
      raw_text: "106",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "daily_ridership", raw_value_text: "close to 6,000 daily riders", value: 6000 }).unit_normalized).toEqual({
      raw_text: "close to 6,000 daily riders",
      normalized_unit: "riders_per_day",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "total_ridership", raw_value_text: "65,219,000 people in 2023", value: 65219000 }).unit_normalized).toEqual({
      raw_text: "65,219,000 people in 2023",
      normalized_unit: "riders",
      unit_family: "ridership",
    });
    expect(metric({ metric_name: "weekday_ridership", raw_value_text: "46,000 passengers per weekday", value: 46000 }).unit_normalized).toEqual({
      raw_text: "46,000 passengers per weekday",
      normalized_unit: "riders_per_weekday",
      unit_family: "ridership",
    });
	    expect(metric({ metric_name: "weekday_bus_boardings", raw_value_text: "8,838", value: 8838 }).unit_normalized).toEqual({
	      raw_text: "8,838",
	      normalized_unit: "boardings_per_weekday",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "state_tax_refund_payments", raw_value_text: "8,516", value: 8516 }).unit_normalized).toEqual({
	      raw_text: "8,516",
	      normalized_unit: "payments",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "lost_time_incidents", raw_value_text: "Seven (7) lost time incidents", value: 7 }).unit_normalized).toEqual({
	      raw_text: "Seven (7) lost time incidents",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "recordable_incidents_ytd", raw_value_text: "33 Recordable incidents have been reported YTD", value: 33 }).unit_normalized).toEqual({
	      raw_text: "33 Recordable incidents have been reported YTD",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "trains_canceled", raw_value_text: "230", value: 230 }).unit_normalized).toEqual({
	      raw_text: "230",
	      normalized_unit: "trains_canceled",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "hate_crime_count_by_type", raw_value_text: "Assault 5", value: 5 }).unit_normalized).toEqual({
	      raw_text: "Assault 5",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "murder_count", raw_value_text: "5", value: 5 }).unit_normalized).toEqual({
	      raw_text: "5",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "lawsuits_filed", raw_value_text: "There were 3 Lawsuits filed", value: 3 }).unit_normalized).toEqual({
	      raw_text: "There were 3 Lawsuits filed",
	      normalized_unit: "lawsuits",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_crashes", raw_value_text: "1,144", value: 1144 }).unit_normalized).toEqual({
	      raw_text: "1,144",
	      normalized_unit: "crashes",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "severe_injuries", raw_value_text: "2 severe injuries", value: 2 }).unit_normalized).toEqual({
	      raw_text: "2 severe injuries",
	      normalized_unit: "severe_injuries",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "title_vi_complaints_filed", raw_value_text: "6 Title VI complaints were filed", value: 6 }).unit_normalized).toEqual({
	      raw_text: "6 Title VI complaints were filed",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "eeo_complaints_filed", raw_value_text: "14 EEO complaints were filed", value: 14 }).unit_normalized).toEqual({
	      raw_text: "14 EEO complaints were filed",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "arrest_count", raw_value_text: "Total Arrests 2024 1468", value: 1468 }).unit_normalized).toEqual({
	      raw_text: "Total Arrests 2024 1468",
	      normalized_unit: "arrests",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "tos_tabs", raw_value_text: "62935", value: 62935 }).unit_normalized).toEqual({
	      raw_text: "62935",
	      normalized_unit: "summonses",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "summonses_issued", raw_value_text: "54,734", value: 54734 }).unit_normalized).toEqual({
	      raw_text: "54,734",
	      normalized_unit: "summonses",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "hires_count", raw_value_text: "Asian 12", value: 12 }).unit_normalized).toEqual({
	      raw_text: "Asian 12",
	      normalized_unit: "hires",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "net_change", raw_value_text: "net change for females was a positive 361 employees", value: 361 }).unit_normalized).toEqual({
	      raw_text: "net change for females was a positive 361 employees",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "workforce_change", raw_value_text: "decreased by 45 employees", value: -45 }).unit_normalized).toEqual({
	      raw_text: "decreased by 45 employees",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "employees_by_job_category", raw_value_text: "Professionals 85", value: 85 }).unit_normalized).toEqual({
	      raw_text: "Professionals 85",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "contract_modification_amount", raw_value_text: "$8,684,603", value: 8684603 }).unit_normalized).toEqual({
	      raw_text: "$8,684,603",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "cost_savings", raw_value_text: "$15,003,000", value: 15003000 }).unit_normalized).toEqual({
	      raw_text: "$15,003,000",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "adjusted_mrt_receipts", raw_value_text: "$8,347,705.11", value: 8347705.11 }).unit_normalized).toEqual({
	      raw_text: "$8,347,705.11",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "total_payment", raw_value_text: "$14,176,327.42", value: 14176327.42 }).unit_normalized).toEqual({
	      raw_text: "$14,176,327.42",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "dwell_time_percent_change", raw_value_text: "7.0%", value: 7 }).unit_normalized).toEqual({
	      raw_text: "7.0%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "ridership change", raw_value_text: "-51.9%", value: -51.9 }).unit_normalized).toEqual({
	      raw_text: "-51.9%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "consumer_price_index", raw_value_text: "319.21", value: 319.21 }).unit_normalized).toEqual({
	      raw_text: "319.21",
	      normalized_unit: "cpi_u_index",
	      unit_family: "scale",
	    });
	    expect(metric({ metric_name: "Total Recordable Incident Rate (TRIR)", raw_value_text: "2.58", value: 2.58 }).unit_normalized).toEqual({
	      raw_text: "2.58",
	      normalized_unit: "total_recordable_incident_rate",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "monthly_revenue_passengers", raw_value_text: "74,193,419", value: 74193419 }).unit_normalized).toEqual({
	      raw_text: "74,193,419",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "weekday_ridership_pilot_increase", raw_value_text: "3,464", value: 3464 }).unit_normalized).toEqual({
	      raw_text: "3,464",
	      normalized_unit: "riders_per_weekday",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "major_events", raw_value_text: "23 major events", value: 23 }).unit_normalized).toEqual({
	      raw_text: "23 major events",
	      normalized_unit: "events",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "bus_count", raw_value_text: "12 buses", value: 12 }).unit_normalized).toEqual({
	      raw_text: "12 buses",
	      normalized_unit: "buses",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "bus_route_count", raw_value_text: "four routes", value: 4 }).unit_normalized).toEqual({
	      raw_text: "four routes",
	      normalized_unit: "routes",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "dbe_new_applications", raw_value_text: "88 new applications", value: 88 }).unit_normalized).toEqual({
	      raw_text: "88 new applications",
	      normalized_unit: "applications",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "procurement_actions_count", raw_value_text: "seven actions", value: 7 }).unit_normalized).toEqual({
	      raw_text: "seven actions",
	      normalized_unit: "actions",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "track_intrusion_incidents", raw_value_text: "2 intrusions", value: 2 }).unit_normalized).toEqual({
	      raw_text: "2 intrusions",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "complaints_filed", raw_value_text: "2 complaints were filed", value: 2 }).unit_normalized).toEqual({
	      raw_text: "2 complaints were filed",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "eeo_complaints_received", raw_value_text: "5 complaints received", value: 5 }).unit_normalized).toEqual({
	      raw_text: "5 complaints received",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "title_vi_complaints_total", raw_value_text: "17 Title VI complaints", value: 17 }).unit_normalized).toEqual({
	      raw_text: "17 Title VI complaints",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "employees_trained", raw_value_text: "6,403", value: 6403 }).unit_normalized).toEqual({
	      raw_text: "6,403",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "new_hires_by_sex", raw_value_text: "Females 29% 286", value: 286 }).unit_normalized).toEqual({
	      raw_text: "Females 29% 286",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "total_full_time_positions", raw_value_text: "163 full-time positions", value: 163 }).unit_normalized).toEqual({
	      raw_text: "163 full-time positions",
	      normalized_unit: "positions",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "serious_injuries", raw_value_text: "2 serious injuries", value: 2 }).unit_normalized).toEqual({
	      raw_text: "2 serious injuries",
	      normalized_unit: "injuries",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "lost_time_incident_rate", raw_value_text: "1.90", value: 1.9 }).unit_normalized).toEqual({
	      raw_text: "1.90",
	      normalized_unit: "lost_time_incident_rate",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "total_recordable_incident_rate", raw_value_text: "2.87", value: 2.87 }).unit_normalized).toEqual({
	      raw_text: "2.87",
	      normalized_unit: "total_recordable_incident_rate",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "survey_respondents", raw_value_text: "1,024 respondents", value: 1024 }).unit_normalized).toEqual({
	      raw_text: "1,024 respondents",
	      normalized_unit: "respondents",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "daily_passengers", raw_value_text: "56,000 daily passengers", value: 56000 }).unit_normalized).toEqual({
	      raw_text: "56,000 daily passengers",
	      normalized_unit: "riders_per_day",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "daily_riders", raw_value_text: "65,000+ daily riders", value: 65000 }).unit_normalized).toEqual({
	      raw_text: "65,000+ daily riders",
	      normalized_unit: "riders_per_day",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "peak_daily_ridership", raw_value_text: "over 250,000 customers", value: 250000 }).unit_normalized).toEqual({
	      raw_text: "over 250,000 customers",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
		    expect(metric({ metric_name: "construction_cost", raw_value_text: "$30 - $125 million", value_min: 30000000, value_max: 125000000 }).unit_normalized).toEqual({
		      raw_text: "$30 - $125 million",
		      normalized_unit: "dollars",
		      unit_family: "money",
		    });
	    expect(metric({ metric_name: "additional_trains_operated", raw_value_text: "4 trains", value: 4 }).unit_normalized).toEqual({
	      raw_text: "4 trains",
	      normalized_unit: "trains",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "audit_findings", raw_value_text: "9 findings", value: 9 }).unit_normalized).toEqual({
	      raw_text: "9 findings",
	      normalized_unit: "findings",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "compliance_site_visits", raw_value_text: "12 visits", value: 12 }).unit_normalized).toEqual({
	      raw_text: "12 visits",
	      normalized_unit: "visits",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "major_felonies_count", raw_value_text: "31 felonies", value: 31 }).unit_normalized).toEqual({
	      raw_text: "31 felonies",
	      normalized_unit: "felonies",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "vehicles_towed", raw_value_text: "15 vehicles towed", value: 15 }).unit_normalized).toEqual({
	      raw_text: "15 vehicles towed",
	      normalized_unit: "vehicles",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "title_vii_lawsuits", raw_value_text: "There were 14 Title VII Lawsuits filed", value: 14 }).unit_normalized).toEqual({
	      raw_text: "There were 14 Title VII Lawsuits filed",
	      normalized_unit: "lawsuits",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "eeo_complaints_handled", raw_value_text: "18 EEO complaints handled", value: 18 }).unit_normalized).toEqual({
	      raw_text: "18 EEO complaints handled",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "external_eeo_complaints_filed", raw_value_text: "4 external EEO complaints filed", value: 4 }).unit_normalized).toEqual({
	      raw_text: "4 external EEO complaints filed",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "title_vi_complaints_count", raw_value_text: "3 Title VI complaints", value: 3 }).unit_normalized).toEqual({
	      raw_text: "3 Title VI complaints",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "fine_amount", raw_value_text: "$115 to $150", value_min: 115, value_max: 150 }).unit_normalized).toEqual({
	      raw_text: "$115 to $150",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "acquisition_amount", raw_value_text: "$410,000", value: 410000 }).unit_normalized).toEqual({
	      raw_text: "$410,000",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "passenger_revenue_change_vs_prepandemic", raw_value_text: "$12.5 million", value: 12500000 }).unit_normalized).toEqual({
	      raw_text: "$12.5 million",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "ksi", raw_value_text: "5 people killed or severely injured", value: 5 }).unit_normalized).toEqual({
	      raw_text: "5 people killed or severely injured",
	      normalized_unit: "people",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "covered_population", raw_value_text: "2,000 residents covered", value: 2000 }).unit_normalized).toEqual({
	      raw_text: "2,000 residents covered",
	      normalized_unit: "people",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "population_within_walk", raw_value_text: "7,500 residents within walk", value: 7500 }).unit_normalized).toEqual({
	      raw_text: "7,500 residents within walk",
	      normalized_unit: "residents",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "crash injuries", raw_value_text: "6 people injured in crashes", value: 6 }).unit_normalized).toEqual({
	      raw_text: "6 people injured in crashes",
	      normalized_unit: "people",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "pedestrian_crashes", raw_value_text: "10 pedestrian crashes", value: 10 }).unit_normalized).toEqual({
	      raw_text: "10 pedestrian crashes",
	      normalized_unit: "crashes",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "arrests_made", raw_value_text: "14 arrests made", value: 14 }).unit_normalized).toEqual({
	      raw_text: "14 arrests made",
	      normalized_unit: "arrests",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "enforcement_summonses", raw_value_text: "57 summonses", value: 57 }).unit_normalized).toEqual({
	      raw_text: "57 summonses",
	      normalized_unit: "summonses",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "average_weekday_passengers", raw_value_text: "8,000 average weekday passengers", value: 8000 }).unit_normalized).toEqual({
	      raw_text: "8,000 average weekday passengers",
	      normalized_unit: "riders_per_day",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "daily_alightings", raw_value_text: "1,300 daily alightings", value: 1300 }).unit_normalized).toEqual({
	      raw_text: "1,300 daily alightings",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "net_change_female", raw_value_text: "net change female employees: 8", value: 8 }).unit_normalized).toEqual({
	      raw_text: "net change female employees: 8",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "new_hires_count", raw_value_text: "22 new hires", value: 22 }).unit_normalized).toEqual({
	      raw_text: "22 new hires",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "positions_variance", raw_value_text: "positions variance: -3", value: -3 }).unit_normalized).toEqual({
	      raw_text: "positions variance: -3",
	      normalized_unit: "positions",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "veterans_hired", raw_value_text: "6 veterans hired", value: 6 }).unit_normalized).toEqual({
	      raw_text: "6 veterans hired",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "number_of_payments_ytd", raw_value_text: "118,028", value: 118028 }).unit_normalized).toEqual({
	      raw_text: "118,028",
	      normalized_unit: "payments",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "direct_payments_regular_count", raw_value_text: "29,041", value: 29041 }).unit_normalized).toEqual({
	      raw_text: "29,041",
	      normalized_unit: "payments",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "state_tax_refund_count", raw_value_text: "4,361", value: 4361 }).unit_normalized).toEqual({
	      raw_text: "4,361",
	      normalized_unit: "payments",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_cases_adjudicated_ytd", raw_value_text: "12,860", value: 12860 }).unit_normalized).toEqual({
	      raw_text: "12,860",
	      normalized_unit: "cases",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "trains_over_15_min_late", raw_value_text: "2,300", value: 2300 }).unit_normalized).toEqual({
	      raw_text: "2,300",
	      normalized_unit: "trains",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "title_vi_complaint_bases", raw_value_text: "citing 22 separate bases", value: 22 }).unit_normalized).toEqual({
	      raw_text: "citing 22 separate bases",
	      normalized_unit: "bases",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "toll_evasion_interdictions", description: "Vehicles interdicted for persistent toll violations", value: 172 }).unit_normalized).toEqual({
	      raw_text: "toll_evasion_interdictions",
	      normalized_unit: "vehicles",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "vision_zero_employee_trainings_conducted", description: "Vision Zero Employee Trainings Conducted in 2025", value: 6493 }).unit_normalized).toEqual({
	      raw_text: "vision_zero_employee_trainings_conducted",
	      normalized_unit: "trainings",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "planned_audits", value: 94 }).unit_normalized).toEqual({
	      raw_text: "planned_audits",
	      normalized_unit: "audits",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "state_tax_refund_amount_paid_ytd", raw_value_text: "$5,800,352", value: 5800352 }).unit_normalized).toEqual({
	      raw_text: "$5,800,352",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "yield_per_nov_ytd", raw_value_text: "$81.10", value: 81.1 }).unit_normalized).toEqual({
	      raw_text: "$81.10",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "daily_bus_passengers", description: "Over 36,000+ daily bus passengers", raw_value_text: "36,000+", value: 36000 }).unit_normalized).toEqual({
	      raw_text: "36,000+",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "daily_bus_riders", raw_value_text: "28,000+ daily bus riders", value: 28000 }).unit_normalized).toEqual({
	      raw_text: "28,000+ daily bus riders",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "daily_boardings", raw_value_text: "1,900 riders boarding", value: 1900 }).unit_normalized).toEqual({
	      raw_text: "1,900 riders boarding",
	      normalized_unit: "boardings",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "eeo_complaints_handled_total", raw_value_text: "MTA BUS handled a total of 26 EEO complaints", value: 26 }).unit_normalized).toEqual({
	      raw_text: "MTA BUS handled a total of 26 EEO complaints",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "title_vii_complaints_total", raw_value_text: "19 complaints were filed citing 26 separate bases", value: 19 }).unit_normalized).toEqual({
	      raw_text: "19 complaints were filed citing 26 separate bases",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_hires_count", raw_value_text: "165 new hires", value: 165 }).unit_normalized).toEqual({
	      raw_text: "165 new hires",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "total_separations_count", raw_value_text: "175 separations", value: 175 }).unit_normalized).toEqual({
	      raw_text: "175 separations",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "daily_vehicle_volume", raw_value_text: "~32,000 daily vehicles", value: 32000 }).unit_normalized).toEqual({
	      raw_text: "~32,000 daily vehicles",
	      normalized_unit: "vehicles_per_day",
	      unit_family: "count_rate",
	    });
	    expect(metric({ metric_name: "workforce_development_participants", raw_value_text: "1065", value: 1065 }).unit_normalized).toEqual({
	      raw_text: "1065",
	      normalized_unit: "participants",
	      unit_family: "participation",
	    });
	    expect(metric({ metric_name: "workforce_development", raw_value_text: "233", value: 233 }).unit_normalized).toBeUndefined();
	    expect(
	      metric({
	        metric_name: "workforce_development",
	        raw_value_text: "233",
	        value: 233,
	        comparison_period: "Target 2025",
	        scope: "MTA Bridges and Tunnels",
	      }).unit_normalized,
	    ).toBeUndefined();
	    expect(metric({ metric_name: "ridership_ranking", raw_value_text: "second-busiest cross-town bus route", value: 2 }).unit_normalized).toEqual({
	      raw_text: "second-busiest cross-town bus route",
	      normalized_unit: "rank",
	      unit_family: "rating",
	    });
	    expect(metric({ metric_name: "locomotive quantity", raw_value_text: "Option 2 for the purchase of six locomotives", value: 6 }).unit_normalized).toEqual({
	      raw_text: "Option 2 for the purchase of six locomotives",
	      normalized_unit: "locomotives",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "track_trespassing_incidents", raw_value_text: "469 incidents", value: 469 }).unit_normalized).toEqual({
	      raw_text: "469 incidents",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "train_derailments", description: "Mainline train derailments", value: 4 }).unit_normalized).toEqual({
	      raw_text: "train_derailments",
	      normalized_unit: "derailments",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "train_collisions", category: "mainline_train_collisions", raw_value_text: "0", value: 0 }).unit_normalized).toEqual({
	      raw_text: "0",
	      normalized_unit: "collisions",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "audit_projects_completed", raw_value_text: "Projects Completed 81", value: 81 }).unit_normalized).toEqual({
	      raw_text: "Projects Completed 81",
	      normalized_unit: "projects",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_revenue", raw_value_text: "$3,750,860", value: 3750860 }).unit_normalized).toEqual({
	      raw_text: "$3,750,860",
	      normalized_unit: "dollars",
	      unit_family: "money",
	    });
	    expect(metric({ metric_name: "annual_funding", raw_value_text: "$9.4M per year", value: 9400000 }).unit_normalized).toEqual({
	      raw_text: "$9.4M per year",
	      normalized_unit: "dollars_per_year",
	      unit_family: "money_rate",
	    });
	    expect(metric({ metric_name: "tos_arrest_count", raw_value_text: "TOS Arrests 2024 536", value: 536 }).unit_normalized).toEqual({
	      raw_text: "TOS Arrests 2024 536",
	      normalized_unit: "arrests",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "tos_criminal_summons_count", raw_value_text: "TOS C-Summ 2024 100", value: 100 }).unit_normalized).toEqual({
	      raw_text: "TOS C-Summ 2024 100",
	      normalized_unit: "summonses",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "complaints_received", raw_value_text: "1375", value: 1375 }).unit_normalized).toEqual({
	      raw_text: "1375",
	      normalized_unit: "complaints",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "customer_reportable_injuries", raw_value_text: "Year Reportable Injuries 2024 66", value: 66 }).unit_normalized).toEqual({
	      raw_text: "Year Reportable Injuries 2024 66",
	      normalized_unit: "injuries",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "people_injured_or_killed", raw_value_text: "20", value: 20 }).unit_normalized).toEqual({
	      raw_text: "20",
	      normalized_unit: "people",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "major_felonies_annual", raw_value_text: "2333", category: "Total Major Felonies", value: 2333 }).unit_normalized).toEqual({
	      raw_text: "2333",
	      normalized_unit: "felonies",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "subway_fires", raw_value_text: "Monthly Fires for September 2023 (88)", value: 88 }).unit_normalized).toEqual({
	      raw_text: "Monthly Fires for September 2023 (88)",
	      normalized_unit: "fires",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "persistent_toll_violator_interdictions", raw_value_text: "6,180", value: 6180 }).unit_normalized).toEqual({
	      raw_text: "6,180",
	      normalized_unit: "vehicles",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "bus_operator_assaults_percent_change", raw_value_text: "-31.9%", value: -31.9 }).unit_normalized).toEqual({
	      raw_text: "-31.9%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "monthly_ridership", raw_value_text: "6.0 million customers", value: 6000000 }).unit_normalized).toEqual({
	      raw_text: "6.0 million customers",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "net_change_by_sex", raw_value_text: "The net change for females was a positive 3 employees", value: 3 }).unit_normalized).toEqual({
	      raw_text: "The net change for females was a positive 3 employees",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "ada_ramps_count", raw_value_text: "184 ADA ramps", value: 184 }).unit_normalized).toEqual({
	      raw_text: "184 ADA ramps",
	      normalized_unit: "ramps",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "existing_routes", raw_value_text: "113 existing routes", value: 113 }).unit_normalized).toEqual({
	      raw_text: "113 existing routes",
	      normalized_unit: "routes",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "controlled_self_assessments", raw_value_text: "1,365 Controlled Self Assessments", value: 1365 }).unit_normalized).toEqual({
	      raw_text: "1,365 Controlled Self Assessments",
	      normalized_unit: "assessments",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "contracts_with_dbe_goals", raw_value_text: "Total Number of Contracts with DBE Goals: 113", value: 113 }).unit_normalized).toEqual({
	      raw_text: "Total Number of Contracts with DBE Goals: 113",
	      normalized_unit: "contracts",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "elevator_count", raw_value_text: "the system has 393 elevators", value: 393 }).unit_normalized).toEqual({
	      raw_text: "the system has 393 elevators",
	      normalized_unit: "elevators",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "platform_barrier_installations", raw_value_text: "barriers have been fabricated and installed at 19 stations to date", value: 19 }).unit_normalized).toEqual({
	      raw_text: "barriers have been fabricated and installed at 19 stations to date",
	      normalized_unit: "stations",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "recommendations_issued", raw_value_text: "12 recommendations issued", value: 12 }).unit_normalized).toEqual({
	      raw_text: "12 recommendations issued",
	      normalized_unit: "recommendations",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "traffic_light_report_projects_reviewed", raw_value_text: "430 projects reviewed", value: 430 }).unit_normalized).toEqual({
	      raw_text: "430 projects reviewed",
	      normalized_unit: "projects",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "additional_residents_with_frequent_service", raw_value_text: "additional 200,000 Queens residents", value: 200000 }).unit_normalized).toEqual({
	      raw_text: "additional 200,000 Queens residents",
	      normalized_unit: "residents",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "KSI total (killed or severely injured)", raw_value_text: "14 killed or severely injured", value: 14 }).unit_normalized).toEqual({
	      raw_text: "14 killed or severely injured",
	      normalized_unit: "people",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "crosstown transit passengers per day", raw_value_text: "17,000 passengers per day", value: 17000 }).unit_normalized).toEqual({
	      raw_text: "17,000 passengers per day",
	      normalized_unit: "riders_per_day",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "total_weekday_bus_boardings", raw_value_text: "32,630 weekday boardings", value: 32630 }).unit_normalized).toEqual({
	      raw_text: "32,630 weekday boardings",
	      normalized_unit: "boardings_per_weekday",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "peak weekday ridership", raw_value_text: "nearly 104,000 weekday riders", value: 104000 }).unit_normalized).toEqual({
	      raw_text: "nearly 104,000 weekday riders",
	      normalized_unit: "riders_per_weekday",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "Lost Time Incident Rate (LTIR)", raw_value_text: "2.59", value: 2.59 }).unit_normalized).toEqual({
	      raw_text: "2.59",
	      normalized_unit: "lost_time_incident_rate",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "lost_time_injury_rate", raw_value_text: "4.9", value: 4.9 }).unit_normalized).toEqual({
	      raw_text: "4.9",
	      normalized_unit: "lost_time_injury_rate",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "average_major_felonies_per_day", raw_value_text: "2024 Avg/Per Per Day 6.13", value: 6.13 }).unit_normalized).toEqual({
	      raw_text: "2024 Avg/Per Per Day 6.13",
	      normalized_unit: "felonies_per_day",
	      unit_family: "count_rate",
	    });
	    expect(metric({ metric_name: "average_homeless_arriving_per_train", raw_value_text: "2.7", value: 2.7 }).unit_normalized).toEqual({
	      raw_text: "2.7",
	      normalized_unit: "people_per_train",
	      unit_family: "count_rate",
	    });
	    expect(metric({ metric_name: "felony_rate_per_1m_riders", raw_value_text: "2.5", value: 2.5 }).unit_normalized).toEqual({
	      raw_text: "2.5",
	      normalized_unit: "felonies_per_million_riders",
	      unit_family: "safety_rate",
	    });
	    expect(metric({ metric_name: "mask usage rate", raw_value_text: "92%", value: 92 }).unit_normalized).toEqual({
	      raw_text: "92%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "ridership as percent of pre-COVID baseline", raw_value_text: "42.8%", value: 42.8 }).unit_normalized).toEqual({
	      raw_text: "42.8%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "customer_collision_yoy_reduction", raw_value_text: "18% year-over-year reduction in customer collisions", value: 18 }).unit_normalized).toEqual({
	      raw_text: "18% year-over-year reduction in customer collisions",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "injury_collision_yoy_reduction", raw_value_text: "22% year-over-year decrease in injury related collisions", value: 22 }).unit_normalized).toEqual({
	      raw_text: "22% year-over-year decrease in injury related collisions",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "attendees at Open Data events", raw_value_text: "1050 ATTENDEES AT OPEN DATA EVENTS", value: 1050 }).unit_normalized).toEqual({
	      raw_text: "1050 ATTENDEES AT OPEN DATA EVENTS",
	      normalized_unit: "attendees",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "audible_pedestrian_turn_warning_systems_installed", description: "Audible Pedestrian Turn Warning Systems Installed in 2025", value: 169 }).unit_normalized).toEqual({
	      raw_text: "audible_pedestrian_turn_warning_systems_installed",
	      normalized_unit: "systems",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "customer_community_outreach", raw_value_text: "99,101", scope: "Long Island Rail Road", value: 99101 }).unit_normalized).toEqual({
	      raw_text: "99,101",
	      normalized_unit: "people_reached",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "customer_comments_collected", raw_value_text: "100+ customer comments", value: 100 }).unit_normalized).toEqual({
	      raw_text: "100+ customer comments",
	      normalized_unit: "comments",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "customer_feedback_count", raw_value_text: "500+ M23 customers", value: 500 }).unit_normalized).toEqual({
	      raw_text: "500+ M23 customers",
	      normalized_unit: "customers",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "customer_stations_count", raw_value_text: "126", value: 126 }).unit_normalized).toEqual({
	      raw_text: "126",
	      normalized_unit: "stations",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "customers_benefited", raw_value_text: "nearly 40,000 customers", value: 40000 }).unit_normalized).toEqual({
	      raw_text: "nearly 40,000 customers",
	      normalized_unit: "customers",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "daily_users", raw_value_text: "515 pedestrians", value: 515 }).unit_normalized).toEqual({
	      raw_text: "515 pedestrians",
	      normalized_unit: "users_per_day",
	      unit_family: "count_rate",
	    });
	    expect(metric({ metric_name: "data stewards identified", raw_value_text: "46 data stewards identified to help maintain our open data", value: 46 }).unit_normalized).toEqual({
	      raw_text: "46 data stewards identified to help maintain our open data",
	      normalized_unit: "data_stewards",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "first_responders_trained", raw_value_text: "1,788", value: 1788 }).unit_normalized).toEqual({
	      raw_text: "1,788",
	      normalized_unit: "first_responders",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "in_person_grade_crossing_outreach_contacts", raw_value_text: "557", value: 557 }).unit_normalized).toEqual({
	      raw_text: "557",
	      normalized_unit: "contacts",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "management_interviews_conducted", raw_value_text: "A total of 82 management interviews were conducted", value: 82 }).unit_normalized).toEqual({
	      raw_text: "A total of 82 management interviews were conducted",
	      normalized_unit: "interviews",
	      unit_family: "count",
	    });
	    for (const [metricName, rawValueText, value] of [
	      ["TrafDir_A_count", "1008", 1008],
	      ["TrafDir_T_count", "2144", 2144],
	      ["TrafDir_W_count", "913", 913],
	      ["boro_count_BK", "569", 569],
	      ["boro_count_BX", "797", 797],
	      ["boro_count_BX_MN", "31", 31],
	      ["boro_count_MAN", "1304", 1304],
	      ["boro_count_QNS", "1083", 1083],
	      ["boro_count_SI", "284", 284],
	      ["days_count_7", "2567", 2567],
	      ["direction_count_EB", "827", 827],
	      ["direction_count_NB", "1292", 1292],
	      ["direction_count_SB", "1149", 1149],
	      ["direction_count_WB", "787", 787],
	      ["hours_count_24", "2295", 2295],
	      ["lane_color_count_Red", "2929", 2929],
	      ["lane_type_count_Curbside", "1771", 1771],
	      ["lane_type_count_Offset", "1913", 1913],
	      ["lane_type1_count_BusLane", "2572", 2572],
	      ["lane_type1_count_SharedLane", "1111", 1111],
	      ["lane_width_count_Double", "61", 61],
	      ["lane_width_count_Single", "3919", 3919],
	      ["sbs_route1_count_BX41", "202", 202],
	      ["sbs_route1_count_M15", "381", 381],
	      ["sbs_route1_count_Q52", "270", 270],
	      ["sbs_route1_count_S79", "204", 204],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: "rows",
	        unit_family: "count",
	      });
	    }
	    for (const [metricName, rawValueText, value] of [
	      ["ezpass_traffic", "23,059,188", 23059188],
	      ["paid_traffic_volume", "253,184,133", 253184133],
	      ["tolls_by_mail_traffic", "1,864,128", 1864128],
	      ["total_paid_traffic", "24,923,316", 24923316],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: "crossings",
	        unit_family: "count",
	      });
	    }
	    expect(metric({ metric_name: "new datasets published", raw_value_text: "42 new datasets published in 2022", value: 42 }).unit_normalized).toEqual({
	      raw_text: "42 new datasets published in 2022",
	      normalized_unit: "datasets",
	      unit_family: "data",
	    });
	    expect(metric({ metric_name: "new datasets published in 2024", raw_value_text: "28 NEW DATASETS", value: 28 }).unit_normalized).toEqual({
	      raw_text: "28 NEW DATASETS",
	      normalized_unit: "datasets",
	      unit_family: "data",
	    });
	    expect(metric({ metric_name: "outreach_customers_reached", raw_value_text: "500+ M23 customers", value: 500 }).unit_normalized).toEqual({
	      raw_text: "500+ M23 customers",
	      normalized_unit: "customers",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "public_comment_count", raw_value_text: "over 11,000 comments", value: 11000 }).unit_normalized).toEqual({
	      raw_text: "over 11,000 comments",
	      normalized_unit: "comments",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "records in largest dataset (Bus Hourly Ridership)", raw_value_text: "115,979,419 RECORDS IN OUR LARGEST DATASET, BUS HOURLY RIDERSHIP", value: 115979419 }).unit_normalized).toEqual({
	      raw_text: "115,979,419 RECORDS IN OUR LARGEST DATASET, BUS HOURLY RIDERSHIP",
	      normalized_unit: "records",
	      unit_family: "data",
	    });
	    expect(metric({ metric_name: "speaking engagements in 2024", raw_value_text: "20 SPEAKING ENGAGEMENTS", value: 20 }).unit_normalized).toEqual({
	      raw_text: "20 SPEAKING ENGAGEMENTS",
	      normalized_unit: "engagements",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "submissions to Open Data Challenge", raw_value_text: "over 100 submissions", value_min: 100, value_max: 10000 }).unit_normalized).toEqual({
	      raw_text: "over 100 submissions",
	      normalized_unit: "submissions",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "supported open datasets", raw_value_text: "144 SUPPORTED OPEN DATASETS", value: 144 }).unit_normalized).toEqual({
	      raw_text: "144 SUPPORTED OPEN DATASETS",
	      normalized_unit: "datasets",
	      unit_family: "data",
	    });
	    expect(metric({ metric_name: "survey_respondent_count", raw_value_text: "nearly 80,000 NYCT customers responded", value: 80000 }).unit_normalized).toEqual({
	      raw_text: "nearly 80,000 NYCT customers responded",
	      normalized_unit: "respondents",
	      unit_family: "engagement",
	    });
	    expect(metric({ metric_name: "total open datasets portfolio", raw_value_text: "over 160 open datasets", value_min: 160, value_max: 10000 }).unit_normalized).toEqual({
	      raw_text: "over 160 open datasets",
	      normalized_unit: "datasets",
	      unit_family: "data",
	    });
	    expect(metric({ metric_name: "track_miles", raw_value_text: "over 750 track miles of territory", value: 750 }).unit_normalized).toEqual({
	      raw_text: "over 750 track miles of territory",
	      normalized_unit: "track_miles",
	      unit_family: "distance",
	    });
	    expect(metric({ metric_name: "users_served", raw_value_text: "over 75,000 employees and retirees", value: 75000 }).unit_normalized).toEqual({
	      raw_text: "over 75,000 employees and retirees",
	      normalized_unit: "users",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "vision_zero_employee_trainings", raw_value_text: "6,493", value: 6493 }).unit_normalized).toEqual({
	      raw_text: "6,493",
	      normalized_unit: "trainings",
	      unit_family: "count",
	    });
	    for (const [metricName, rawValueText, value, normalizedUnit] of [
	      ["audit_claims", "2", 2, "claims"],
	      ["audit_contract_close_outs", "96", 96, "closeouts"],
	      ["audit_contracts_completed", "278", 278, "contracts"],
	      ["audit_overhead_reviews", "159", 159, "reviews"],
	      ["audit_pre_award_reviews", "16", 16, "reviews"],
	      ["control_assessments_results", "1,358 passed, 57 failed", 1358, "assessments"],
	      ["enterprise_risk_changes", "there were 82 changes in 2023", 82, "changes"],
	      ["inspections_audits_external", "8,952", 8952, "inspections_audits"],
	      ["inspections_audits_internal", "4,100", 4100, "inspections_audits"],
	      ["pension_calculation_errors_identified", "identified 205 errors", 205, "errors"],
	      ["rfp_procurement_counts", "distributed to 60 firms, 49 viewed/downloaded, 7 submitted proposals", 60, "firms"],
	      ["rfp_response_counts", "Twenty-nine firms requested the RFP package, of which two submitted proposals", 2, "proposals"],
	      ["mwbe_proposals_received", "ten from M/WBE certified firms", 10, "proposals"],
	      ["hedge_counterparty_count", "3 counterparties", 3, "counterparties"],
	      ["outstanding_hedges", "24 outstanding hedges with 4 counterparties", 24, "hedges"],
	      ["outstanding_hedges_count", "24 outstanding hedges with 3 counterparties", 24, "hedges"],
	      ["complaint_bases_count", "22 separate bases", 22, "bases"],
	      ["eeo_complaint_bases", "citing 147 separate bases", 147, "bases"],
	      ["title_vi_basis_count", "race (6)", 6, "bases"],
	      ["title_vi_lawsuits_filed", "There were 0 Title VI Lawsuits filed", 0, "lawsuits"],
	      ["title_vii_lawsuits_filed", "The were 0 Lawsuits filed", 0, "lawsuits"],
	      ["felonies_in_major_crime_categories", "26 felonies", 26, "felonies"],
	      ["grand_larceny", "109", 109, "incidents"],
	      ["incidents_causing_delays", "12 incidents which resulted in 10 or more late trains", 12, "incidents"],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: normalizedUnit,
	        unit_family: "count",
	      });
	    }
	    for (const [metricName, rawValueText, value] of [
	      ["eeo_total_complaints", "9 EEO complaints were filed citing 16 separate bases", 9],
	      ["title_vi_complaints_internal", "Race 41", 41],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: "complaints",
	        unit_family: "count",
	      });
	    }
	    for (const [metricName, rawValueText, value, normalizedUnit] of [
	      ["criminal_summonses_count", "over 500 criminal summonses", 500, "summonses"],
	      ["tab_summonses", "43,000 TAB summonses issued in 2024", 43000, "summonses"],
	      ["tos_csumm", "TOS C-Summ 12", 12, "summonses"],
	      ["violations_issued_annual", "Y-T-D 2022: 165,819", 165819, "violations"],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: normalizedUnit,
	        unit_family: "enforcement",
	      });
	    }
	    for (const [metricName, rawValueText, value, normalizedUnit] of [
	      ["safety_incidents_by_hazard_type", "Slip, Trip, Fall: 46 total, 21% of grand total", 46, "incidents"],
	      ["Workplace Violence Case Count Comparison", "Mar 2021 222 Mar 2022 116", 116, "cases"],
	      ["workplace_violence_assault_cases", "15", 15, "cases"],
	      ["workplace_violence_harassment_cases", "190", 190, "cases"],
	      ["pedestrian_fatalities", "1 pedestrian fatality (2008-2012)", 1, "fatalities"],
	      ["crash_fatalities", "Fatalities 1 (motor vehicle)", 1, "fatalities"],
	      ["crash fatalities", "2", 2, "fatalities"],
	      ["crash_injuries", "317 people were injured", 317, "injuries"],
	      ["crash_injuries", "Bicyclist 74 injuries", 74, "injuries"],
	      ["crash_injuries", "Total 466 injuries from crashes on 34th St, 2019-2023", 466, "injuries"],
	      ["track_trespassing_fatalities", "88 fatalities", 88, "fatalities"],
	      ["crash severe injuries", "12", 12, "severe_injuries"],
	      ["pedestrian_injuries", "39 non-fatal pedestrian injuries (2008-2012)", 39, "injuries"],
	      ["bicyclist_traffic_injuries", "Bicyclist 13 0 1 1", 13, "injuries"],
	      ["motor_vehicle_occupant_traffic_injuries", "Motor Vehicle Occupant 265 6 0 6", 265, "injuries"],
	      ["pedestrian_traffic_injuries", "Pedestrian 41 5 1 6", 41, "injuries"],
	      ["pedestrian killed or severely injured", "2", 2, "killed_or_severely_injured"],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: normalizedUnit,
	        unit_family: "safety",
	      });
	    }
	    expect(
	      metric({
	        metric_name: "subway_derailments",
	        raw_value_text: "1",
	        value: 1,
	        description: "Subway mainline derailments YTD 2023",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "1",
	      normalized_unit: "derailments",
	      unit_family: "safety",
	    });
	    for (const [metricName, rawValueText, value, normalizedUnit] of [
	      ["branches_above_otp_goal", "six branches operated at or above goal", 6, "branches"],
	      ["equipment_count", "over 6,000 buses and 1,200 portable radios", 6000, "equipment_items"],
	      ["escalators_count", "36", 36, "escalators"],
	      ["frequent_route_counts", "26 routes every 10 min or better; 19 routes every 15 min or better; 21 routes below threshold", 26, "routes"],
	      ["major_routing_changes", "36", 36, "routing_changes"],
	      ["route_count_change", "additional twelve routes", 12, "routes"],
	      ["stairs_per_station", "7", 7, "stairs"],
	      ["trains_scheduled_annual", "223,000", 223000, "trains"],
	      ["waiting_rooms_per_station", "1", 1, "waiting_rooms"],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: normalizedUnit,
	        unit_family: "count",
	      });
	    }
	    for (const [metricName, rawValueText, value, normalizedUnit] of [
	      ["female_representation_change", "Female representation remained constant with a net change of 14 employees", 14, "employees"],
	      ["minority_employee_net_change", "net change of 1204 employees", 1204, "employees"],
	      ["minority_representation_change", "Minority representation increased by one percentage point with a net change of 84 employees", 84, "employees"],
	      ["net_change_pwd_employees", "Net decrease of 6 self-identified individuals with a disability", -6, "employees"],
	      ["net_increase_female_employees", "net increase of 315 self-identified females", 315, "employees"],
	      ["net_increase_minority_employees", "net increase of 1,122 minority employees", 1122, "employees"],
	      ["new_hires_minorities", "LIRR hired 568 employees, 299 minorities", 299, "employees"],
	      ["new_hires_non_minorities", "LIRR hired 568 employees, 299 minorities and 269 non-minorities", 269, "employees"],
	      ["non_reimbursable_headcount", "6,212 (152) variance", 6212, "full_time_equivalents"],
	      ["reimbursable_headcount", "469 (235) variance", 469, "full_time_equivalents"],
	      ["separations_minorities", "268 employees separated from LIRR, 100 minorities and 168 non-minorities", 100, "employees"],
	      ["separations_non_minorities", "268 employees separated from LIRR, 100 minorities and 168 non-minorities", 168, "employees"],
	      ["team_size", "over 250 Special Inspectors and Fare Enforcement Agents", 250, "personnel"],
	      ["total_full_time_equivalent_positions", "187", 187, "full_time_equivalents"],
	      ["total_full_time_equivalents", "176", 176, "full_time_equivalents"],
	      ["total_position_vacancies", "204", 204, "positions"],
	      ["total_positions_budgeted", "1,217", 1217, "positions"],
	      ["total_positions_filled", "1,013", 1013, "positions"],
	    ] as const) {
	      expect(metric({ metric_name: metricName, raw_value_text: rawValueText, value }).unit_normalized).toEqual({
	        raw_text: rawValueText,
	        normalized_unit: normalizedUnit,
	        unit_family: "workforce",
	      });
	    }
	    expect(metric({ metric_name: "paid_rides", raw_value_text: "4 million paid rides", value: 4000000 }).unit_normalized).toEqual({
	      raw_text: "4 million paid rides",
	      normalized_unit: "rides",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "ridership", raw_value_text: "post-COVID high of 195,000 riders", value: 195000 }).unit_normalized).toEqual({
	      raw_text: "post-COVID high of 195,000 riders",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "ridership", raw_value_text: "increased from 6,000 to roughly 7,000 riders on the Brooklyn shuttle", value_min: 6000, value_max: 7000 }).unit_normalized).toEqual({
	      raw_text: "increased from 6,000 to roughly 7,000 riders on the Brooklyn shuttle",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(metric({ metric_name: "vacancies", raw_value_text: "3,181 vacancies", value: 3181 }).unit_normalized).toEqual({
	      raw_text: "3,181 vacancies",
	      normalized_unit: "vacancies",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "summonses_total_increase_pct", raw_value_text: "increased 36% over the same time period", value: 36 }).unit_normalized).toEqual({
	      raw_text: "increased 36% over the same time period",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "subway_fires_change", raw_value_text: "decreased over 25%", value_min: 25, value_max: 0 }).unit_normalized).toEqual({
	      raw_text: "decreased over 25%",
	      normalized_unit: "percent",
	      unit_family: "percentage",
	    });
	    expect(metric({ metric_name: "budgeted_resources", raw_value_text: "Budgeted Resources: 61", value: 61 }).unit_normalized).toEqual({
	      raw_text: "Budgeted Resources: 61",
	      normalized_unit: "resources",
	      unit_family: "count",
	    });
	    expect(
	      metric({
	        metric_name: "collisions",
	        raw_value_text: "753.67",
	        value: 753.67,
	        source_system: "National Transit Database (NTD)",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "753.67",
	      normalized_unit: "collisions",
	      unit_family: "safety",
	    });
	    expect(
	      metric({
	        metric_name: "felony_crimes_per_day",
	        raw_value_text: "lowest number of felony crimes per day in the subway system since 2010",
	        value: 0,
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "lowest number of felony crimes per day in the subway system since 2010",
	      normalized_unit: "crimes_per_day",
	      unit_family: "count_rate",
	    });
	    expect(
	      metric({
	        metric_name: "subway_fires_12mo_rolling",
	        raw_value_text: "853 --> 942, +10.4%",
	        value: 942,
	        scope: "systemwide",
	        mode: "subway",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "853 --> 942, +10.4%",
	      normalized_unit: "fires",
	      unit_family: "safety",
	    });
	    expect(
	      metric(
	        {
	          metric_name: "ridership",
	          raw_value_text: "6.8 million",
	          value: 6800000,
	          period: "April 2025",
	          entity: "Long Island Rail Road",
	        },
	        { evidence_quotes: ["LIRR President Rob Free began the report for April ridership with 6.8 million riders."] },
	      ).unit_normalized,
	    ).toEqual({
	      raw_text: "6.8 million",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(
	      metric(
	        {
	          metric_name: "vacancies",
	          raw_value_text: "2,643",
	          value: 2643,
	          entity: "MTA All Agencies",
	        },
	        { evidence_quotes: ["MTA All Agencies vacancies 2,643"] },
	      ).unit_normalized,
	    ).toEqual({
	      raw_text: "2,643",
	      normalized_unit: "vacancies",
	      unit_family: "workforce",
	    });
	    expect(
	      metric(
	        {
	          metric_name: "subway_fires",
	          raw_value_text: "85",
	          value: 85,
	          scope: "NYCT Subway",
	        },
	        { evidence_quotes: ["Monthly Fires Dec-22 85"] },
	      ).unit_normalized,
	    ).toEqual({
	      raw_text: "85",
	      normalized_unit: "fires",
	      unit_family: "safety",
	    });
	    expect(
	      metric(
	        {
	          metric_name: "train_derailments",
	          raw_value_text: "2",
	          value: 2,
	          period: "2024 YTD",
	        },
	        { evidence_quotes: ["Long Island Rail Road train derailments 2024 YTD 2"] },
	      ).unit_normalized,
	    ).toEqual({
	      raw_text: "2",
	      normalized_unit: "derailments",
	      unit_family: "safety",
	    });
	    expect(
	      metric(
	        {
	          metric_name: "revenue_vehicles",
	          raw_value_text: "28,709,452",
	          value: 28709452,
	          scope: "MTA Bridges & Tunnels",
	          period: "July 2022",
	        },
	        { evidence_quotes: ["Revenue Passengers and Vehicles MTA Bridges & Tunnels 28,709,452"] },
	      ).unit_normalized,
	    ).toEqual({
	      raw_text: "28,709,452",
	      normalized_unit: "vehicles",
	      unit_family: "count",
	    });
	    expect(
	      metric({
	        metric_name: "ridership",
	        raw_value_text: "6.8 million",
	        value: 6800000,
	        period: "April 2025",
	        entity: "Long Island Rail Road",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "6.8 million",
	      normalized_unit: "riders",
	      unit_family: "ridership",
	    });
	    expect(
	      metric({
	        metric_name: "vacancies",
	        raw_value_text: "2,643",
	        value: 2643,
	        entity: "MTA All Agencies",
	        period: "December 2025",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "2,643",
	      normalized_unit: "vacancies",
	      unit_family: "workforce",
	    });
	    expect(
	      metric({
	        metric_name: "subway_fires",
	        raw_value_text: "85",
	        value: 85,
	        scope: "NYCT Subway",
	        date: "Dec-22",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "85",
	      normalized_unit: "fires",
	      unit_family: "safety",
	    });
	    expect(
	      metric({
	        metric_name: "traffic_fatalities_and_injuries",
	        raw_value_text: "22 fatalities and over 3,000 injuries from Queens Boulevard to the Addabbo Bridge from 2009-2013",
	        value: 3000,
	        value_min: 22,
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "22 fatalities and over 3,000 injuries from Queens Boulevard to the Addabbo Bridge from 2009-2013",
	      normalized_unit: "injuries_and_fatalities",
	      unit_family: "safety",
	    });
	    expect(metric({ metric_name: "major_felony_change", raw_value_text: "-17", value: -17, change: -17, comparison_period: "December 2022", category: "Total Major Felonies" }).unit_normalized).toEqual({
	      raw_text: "-17",
	      normalized_unit: "felonies",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_major_felonies_change", raw_value_text: "-35", value: -35, period: "January through May 2025 vs 2024", comparison: "year-over-year" }).unit_normalized).toEqual({
	      raw_text: "-35",
	      normalized_unit: "felonies",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "total_arrests_change", raw_value_text: "5772", value: 5772, period: "Jan-May 2025 vs 2024", comparison: "year-over-year" }).unit_normalized).toEqual({
	      raw_text: "5772",
	      normalized_unit: "arrests",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "tos_arrests_change", raw_value_text: "363", value: 363, period: "May 2025 vs May 2024", comparison: "year-over-year" }).unit_normalized).toEqual({
	      raw_text: "363",
	      normalized_unit: "arrests",
	      unit_family: "enforcement",
	    });
	    expect(metric({ metric_name: "hate_crime_count_change", raw_value_text: "1", value: 1, period: "Jan 1 - Jun 1 2025 vs 2024", comparison: "year-over-year" }).unit_normalized).toEqual({
	      raw_text: "1",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "hate_crimes_change", raw_value_text: "-18", value: -18, change: -18, comparison_period: "2022", category: "Hate Crimes" }).unit_normalized).toEqual({
	      raw_text: "-18",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "Secondary Screening Score", raw_value_text: "610 Points", value: 610 }).unit_normalized).toEqual({
	      raw_text: "610 Points",
	      normalized_unit: "score",
	      unit_family: "rating",
	    });
	    expect(metric({ metric_name: "Bell-Curve Grade Threshold - A", raw_value_text: ">= 3.7", value: 3.7, description: "Grade A threshold on 4.0 GPA scale" }).unit_normalized).toEqual({
	      raw_text: ">= 3.7",
	      normalized_unit: "score_4_point_gpa",
	      unit_family: "rating",
	    });
	    expect(metric({ metric_name: "hires_separations_count", raw_value_text: "AI/AN 0 0", value: 0, description: "Hires and Separations" }).unit_normalized).toEqual({
	      raw_text: "AI/AN 0 0",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(metric({ metric_name: "hires_separations_count", raw_value_text: "AI/AN 0 0", value: 0, category: "AI/AN", scope: "LIRR" }).unit_normalized).toEqual({
	      raw_text: "AI/AN 0 0",
	      normalized_unit: "employees",
	      unit_family: "workforce",
	    });
	    expect(
	      metric({
	        metric_name: "track_trespassing_winter_comparison",
	        raw_value_text: "469 incidents in Dec 2021-Feb 2022, 329 incidents in Dec 2022-Feb 2023, a 30% decrease",
	        value_min: 329,
	        value_max: 469,
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "469 incidents in Dec 2021-Feb 2022, 329 incidents in Dec 2022-Feb 2023, a 30% decrease",
	      normalized_unit: "incidents",
	      unit_family: "count",
	    });
	    expect(
	      metric({
	        metric_name: "debt_service_monthly_by_agency",
	        description: "Debt Service by Agency subtotals for September 2023: NYC Transit $119.2, Commuter Railroads $72.4",
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "debt_service_monthly_by_agency",
	      normalized_unit: "dollars",
	      unit_family: "money",
	      scale: 1000000,
	    });
	    expect(metric({ metric_name: "pension_errors_financial_impact", raw_value_text: "Errors Identified with Financial Impact 75", value: 75 }).unit_normalized).toEqual({
	      raw_text: "Errors Identified with Financial Impact 75",
	      normalized_unit: "errors",
	      unit_family: "count",
	    });
	    expect(metric({ metric_name: "revenue_observation_tests_completed", raw_value_text: "Revenue tests completed" }).unit_normalized).toEqual({
	      raw_text: "Revenue tests completed",
	      normalized_unit: "tests",
	      unit_family: "count",
	    });
	    expect(
	      metric({
	        metric_name: "revenue_observation_tests_completed",
	        extra_fields: { LIRR_tests: 4441, MNR_tests: 3904, total_tests: 8345 },
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "revenue_observation_tests_completed",
	      normalized_unit: "tests",
	      unit_family: "count",
	    });
	    expect(
	      metric({
	        metric_name: "plan_members",
	        raw_value_text: "approximately 150,000 active NYC Transit represented employees, retirees, and their dependents",
	        value: 150000,
	      }).unit_normalized,
	    ).toEqual({
	      raw_text: "approximately 150,000 active NYC Transit represented employees, retirees, and their dependents",
	      normalized_unit: "members",
	      unit_family: "population",
	    });
	    expect(metric({ metric_name: "plan_participants", raw_value_text: "Approximately 6,500 employees currently participate", value: 6500 }).unit_normalized).toEqual({
	      raw_text: "Approximately 6,500 employees currently participate",
	      normalized_unit: "participants",
	      unit_family: "participation",
	    });

			    expect(metric({ metric_name: "enforcement_activity", category: "Warnings", raw_value_text: "9", value: 9 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "enforcement_action_count", category: "Warnings", raw_value_text: "9", value: 9 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "activity_count", category: "Warnings", raw_value_text: "9", value: 9 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "pedestrian_ksi", category: "vehicle_injuries", raw_value_text: "Vehicle injuries: 3", value: 3 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "title_vi_complaints_by_basis", raw_value_text: "Race 20%", value: 20 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "title_vi_complaints_filed", raw_value_text: "20%", value: 20 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "contract_amount", raw_value_text: "4,682,050,000", value: 4682050000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "expenses", raw_value_text: "969,392", value: 969392 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "contract_modification_amount", raw_value_text: "8,684,603", value: 8684603 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "construction_cost", raw_value_text: "$310,943 to $325,000", value: "range" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "construction_cost", raw_value_text: "30 - 125 million", value_min: 30000000, value_max: 125000000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "weekday_ridership_percent_increase", raw_value_text: "+34", value: 34 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "on-time performance", raw_value_text: "97.1", value: 97.1 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "dwell_time_percent_change", raw_value_text: "7.0", value: 7 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "workforce_change", raw_value_text: "4%", value: 4 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "complaints_filed", raw_value_text: "20%", value: 20 }).unit_normalized).toBeUndefined();
		    expect(metric({ metric_name: "train_derailments", raw_value_text: "2", value: 2 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "subway_derailments", raw_value_text: "1", value: 1 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "subway_fires", raw_value_text: "1", value: 1 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "subway_fires_12mo_rolling", raw_value_text: "853 --> 942, +10.4%", value: 942 }).unit_normalized).toBeUndefined();
		    expect(metric({ metric_name: "Secondary Screening Score", raw_value_text: "610", value: 610 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "Bell-Curve Grade Threshold - A", raw_value_text: ">= 3.7", value: 3.7 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "Bell-Curve Grade Threshold - A", raw_value_text: ">= 4.7", value: 4.7, description: "Grade threshold on 4.0 GPA scale" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "total_arrests_change", raw_value_text: "5772", value: 5772 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "major_felony_change", raw_value_text: "-17", value: -17 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "total_major_felonies_change", raw_value_text: "-35", value: -35 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "hate_crimes_change", raw_value_text: "-18", value: -18 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "revenue_vehicles", raw_value_text: "28,709,452", value: 28709452, scope: "MTA Bridges & Tunnels" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "traffic_fatalities_and_injuries", raw_value_text: "3,000", value: 3000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "ridership_recovery_rate", raw_value_text: "86%, 90%", value: 0 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "procurement_amount", raw_value_text: "$4 million" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "pension_errors_financial_impact", raw_value_text: "$3.93M financial impact", value: 3930000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "revenue_observation_tests_completed", raw_value_text: "Revenue observation", value: 12 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "revenue_observation_tests_completed", extra_fields: { LIRR_observations: 4441 } }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "debt_service_monthly_by_agency", description: "Agency subtotals without currency", value: 119.2 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "acquisition_amount", raw_value_text: "410,000", value: 410000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "state_tax_refund_amount_paid", raw_value_text: "234,365", value: 234365 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "annual_funding", raw_value_text: "9.4M per year", value: 9400000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "eeo_complaints_handled", raw_value_text: "20%", value: 20 }).unit_normalized).toBeUndefined();
		    expect(metric({ metric_name: "daily_ridership", raw_value_text: "6,000", value: 6000, scope: "general count" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "separations", raw_value_text: "12 veteran separations", value: 12 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "total_paid_traffic_change", raw_value_text: "24,923,316", value: 24923316 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "total_paid_traffic", raw_value_text: "24,923,315", value: 24923316 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "mask usage rate", raw_value_text: "92", value: 92 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "ada_ramps_count", raw_value_text: "184 ADA ramps" }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "customer_feedback", raw_value_text: "500+ M23 customers", value: 500 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "new datasets", raw_value_text: "28 NEW DATASETS", value: 28 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "crash_injuries", raw_value_text: "317", value: 317 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "crash_injuries", raw_value_text: "18 fatalities and 250 severe injuries", value: 250 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "internal_eeo_complaints_by_basis", raw_value_text: "6 EEO complaints were filed citing 12 separate bases", value: 8 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "ridership", raw_value_text: "6.8 million", value: 6800000 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "vacancies", raw_value_text: "3,181", value: 3181 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "boro_count_MN", raw_value_text: "569", value: 569 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "sbs_route1_count_B44", raw_value_text: "381", value: 381 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "direction_count_NB", raw_value_text: "1292", value: 1292.5 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "lane_type_count_Curbside", raw_value_text: "1770", value: 1771 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "paid_traffic_volume", raw_value_text: "253,184,132", value: 253184133 }).unit_normalized).toBeUndefined();
	    expect(metric({ metric_name: "track_miles", raw_value_text: "750", value: 750 }).unit_normalized).toBeUndefined();
    expect(metric({ metric_name: "major_felony_count", unit: "felonies", value: 3 }).unit_normalized).toEqual({
      raw_text: "felonies",
      normalized_unit: "felonies",
      unit_family: "count",
    });
    expect(
      metric({
        metric_name: "total_positions",
        value: 3,
        unit_normalized: { raw_text: "manual", normalized_unit: "manual_positions", unit_family: "workforce" },
      }).unit_normalized,
    ).toEqual({ raw_text: "manual", normalized_unit: "manual_positions", unit_family: "workforce" });
    expect(
      metric({
        metric_name: "new_hires",
        value: 3,
        unit_normalized: { raw_text: "manual", normalized_unit: "manual_hires", unit_family: "workforce" },
      }).unit_normalized,
    ).toEqual({ raw_text: "manual", normalized_unit: "manual_hires", unit_family: "workforce" });
    expect(metric({ metric_name: "revenue_passengers", raw_value_text: "106" }).unit_normalized).toBeUndefined();
    expect(metric({ metric_name: "new_hires", raw_value_text: "three new hires", value: "three" }).unit_normalized).toBeUndefined();
  });

  it("derives cost_type capital vs operating", () => {
    expect(metric({ metric_name: "capital_cost", unit: "dollars" }).cost_type).toBe("capital");
    expect(metric({ metric_name: "operating_cost", unit: "dollars" }).cost_type).toBe("operating");
  });

  it("derives funding_source and time_horizon for cost metrics", () => {
    expect(metric({ metric_name: "federal_grant_funding", value: 1 }).funding_source).toBe("federal");
    expect(metric({ metric_name: "annual_operating_cost", unit: "dollars", period: "per year" }).time_horizon).toBe("annual");
  });

  it("gates cost dimensions on cost context (no funding_source/time_horizon for a place-scoped or per-day metric)", () => {
    const out = metric({ metric_name: "daily_ridership", unit: "riders_per_day", scope: "NYC", period: "per day" });
    expect(out.funding_source).toBeUndefined();
    expect(out.time_horizon).toBeUndefined();
  });

  it("flags benefit_denominator_stated for cost-rate metrics only", () => {
    expect(metric({ metric_name: "fine_amount", unit: "dollars_per_violation" }).benefit_denominator_stated).toBe("stated");
    expect(metric({ metric_name: "total_ridership", unit: "riders" }).benefit_denominator_stated).toBeUndefined();
  });

  it("derives cause_attribution no_operator vs no_vehicle", () => {
    expect(metric({ metric_name: "cancelled_trips_no_operator" }).cause_attribution).toBe("no_operator");
    expect(metric({ metric_name: "cancelled_trips_no_vehicle" }).cause_attribution).toBe("no_vehicle");
  });

  it("stays inert on a plain dimensionless metric (mechanism only)", () => {
    const out = metric({ metric_name: "travel_time", unit: "minutes", value: 12 });
    expect(out.cost_type).toBeUndefined();
    expect(out.funding_source).toBeUndefined();
    expect(out.cause_attribution).toBeUndefined();
  });
});
