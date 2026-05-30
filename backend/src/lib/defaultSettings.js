// Default settings for ASK Kiosk.
// All tunable values live here and are overridable per kiosk at runtime
// via the Setting table. Code reads settings, never hardcoded numbers.

const DEFAULT_SETTINGS = {
  // Pricing (rupees)
  rate_bw_single: 1, // per single-sided BW page
  rate_color_single: 3, // per single-sided color page
  rate_bw_double_sheet: 1.5, // per double-sided BW sheet (2 pages)
  rate_color_double_sheet: 4.5, // per double-sided color sheet (2 pages); adjustable
  currency: "INR",

  // Limits
  max_sheets_per_job: 50, // total sheets printed (pages x copies, after duplex)
  max_file_size_mb: 25,
  max_copies: 20,

  // Codes
  code_digits: 6,
  code_expiry_minutes: 45,
  code_max_attempts: 5,

  // Print behaviour
  print_max_retries: 3, // auto retries before refund
  print_retry_delay_ms: 4000,

  // Misc behaviour
  sms_code_enabled: false,
  busy_message: "Kiosk is printing another job. Please wait a moment.",
  support_contact: "",

  // Multi-file (uploading several files in one job)
  multi_file_enabled: true, // turn the feature on/off per kiosk
  multi_file_max: 10, // max files per batch
  multi_file_mode: "shared", // "shared" (one config for all) or "per_file" (each file own config)

  // Data retention for job metadata (files are deleted right after print)
  metadata_retention_days: 14,
};

module.exports = { DEFAULT_SETTINGS };
