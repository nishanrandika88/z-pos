# Expense receipt processor

Deploy this as a Supabase Edge Function with JWT verification enabled.

Server-only secrets:

- `EXPENSE_OCR_PROVIDER=openai` enables automated extraction; any other value keeps manual fallback.
- `OPENAI_API_KEY` is required only for the OpenAI adapter.
- `EXPENSE_OCR_MODEL` is optional and defaults to `gpt-4.1-mini`.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never expose any OCR provider key through a `VITE_*` variable.
