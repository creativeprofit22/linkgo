# Linkgo Agent Rules

- Build Linkgo feature-by-feature; keep the app runnable after every slice.
- Every feature needs a migration, types, schemas, data API, hook, UI, docs, and tests.
- Keep agent/runtime code out of UI folders. Use `src/agent` for model/tool contracts and `src/workflows` for durable orchestration when those slices land.
- Store shared frontend infrastructure in `src/lib`; keep Tauri-only OS integration in `src-tauri`.
- LinkedIn publishing and commenting must stay human approval-gated.
- Rate-limit and safety defaults must be conservative until metrics prove quality.
- Avoid pre-creating future tables. Add each table in the feature migration that uses it.
