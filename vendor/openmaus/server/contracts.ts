export type ProviderErrorCode =
  | "missing_cli"
  | "invalid_credentials"
  | "inactive_subscription"
  /** The account has no credit left for a pay-as-you-go model. */
  | "insufficient_funds"
  | "quota_or_region_restriction"
  | "upstream_outage"
  | "model_catalog_outage";


