// Supabase anon key is public by design; RLS restricts it to select-only
// (see supabase/schema.sql). Project ref: gfwrsuwqhejmgolpemhl.
export const CONFIG = {
  supabaseUrl: "https://gfwrsuwqhejmgolpemhl.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmd3JzdXdxaGVqbWdvbHBlbWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNTkyMjksImV4cCI6MjEwMDYzNTIyOX0.jSzOm9wmisvWJfPojNCfO7WaD05BekI9bcXatWJm4co",
  submitReelUrl: "https://gfwrsuwqhejmgolpemhl.supabase.co/functions/v1/submit-reel",
};
