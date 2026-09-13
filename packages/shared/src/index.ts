// Pro-K-Logic shared constants and types.
// Enum arrays below mirror supabase/migrations/20260913000100_extensions_and_enums.sql
// exactly; keep them in sync when the SQL changes.

export type { Database, Json } from "./database.types";
export { createProkClient } from "./client";
export type { ProkClient } from "./client";

/** public.event_type — the passport stamps. Order carries no meaning. */
export const EVENT_TYPES = [
  // release and assignment
  "released",
  "assigned_to_shipment",
  // transport
  "picked_up",
  "tracking_started",
  "tracking_paused",
  "tracking_resumed",
  "permission_lost",
  "consent_revoked",
  "tracking_ended",
  "ping",
  "approach_ring_crossed",
  "border_crossed",
  "arrived",
  "delivered",
  // site
  "received",
  "inspected",
  "stored",
  "moved",
  "split",
  "transferred_to_project",
  "issued",
  "installed",
  // control
  "exception",
  "void",
  "correction",
  // reserved (lone-worker decision pending)
  "safety_checkin",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** public.custody_status — cached, derived from events only. */
export const CUSTODY_STATUSES = [
  "released",
  "ready_for_pickup",
  "picked_up",
  "in_transit",
  "arrived",
  "delivered",
  "received",
  "in_storage",
  "issued",
  "installed",
  "exception",
] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];

/** public.project_role — per-project roles. */
export const PROJECT_ROLES = [
  "coordinator",
  "shipper",
  "driver",
  "handler",
  "viewer",
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** public.tracking_mode */
export const TRACKING_MODES = ["manual", "auto"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

/** public.access_purpose — why a person looked at location data. */
export const ACCESS_PURPOSES = [
  "shipment_status",
  "proof_of_delivery",
  "exception_investigation",
  "worker_request",
  "safety",
  "support",
] as const;
export type AccessPurpose = (typeof ACCESS_PURPOSES)[number];

/** Short code printed on labels / paint-marked on units: PKL-XXXX-XXXX (Crockford-ish, no 0/1/I/L/O). */
export const SHORT_CODE_REGEX =
  /^PKL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** Hard cap on a single trip (14 h); the server ends tracking at this point. */
export const MAX_TRIP_MINUTES = 840;

/** Default approach rings, in km from the receiving zone, outermost first. */
export const DEFAULT_APPROACH_RINGS_KM = [40, 8, 0.5] as const;
