# Research Data

- `raw/<phase>/` — unmodified Bright Data output and run logs. **Git-ignored**:
  it may contain public posts by minors and other personal data. Kept locally
  so every finding can be traced and the study rerun.
- `derived/<phase>/` — anonymised tables (no usernames, handles, or profile
  links) used by the phase documents. Safe to commit.

Each run log records: command, input, timestamp, status, record count, and
request count. API keys are never written here.
