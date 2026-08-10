// ──────────────────────────────────────────────────────────────
//  App configuration
//
//  The Supabase URL + anon key are PUBLIC by design (every request is
//  still gated by Supabase Row Level Security), so they are safe to ship
//  in the bundle. This is the same project used by mobile.mjmnursery.com,
//  so logins and data are shared across both apps.
//
//  The Gemini key is SENSITIVE. It is read from an environment variable
//  at build time (VITE_GEMINI_KEY). For true protection it should live in
//  a Supabase Edge Function instead — see README. If it is not set, the
//  AI document-scan feature is hidden and manual DO entry still works.
// ──────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://kibqjztozokohqmhqqqf.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYnFqenRvem9rb2hxbWhxcXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzQzNjIsImV4cCI6MjA4OTgxMDM2Mn0.J7qJUZhWXYf5b9oey4wXJkjdi66jomEMw_NeV9NWF7M';

// The main MJM portal this app is one module of. The "Back to Portal" button
// on the dashboard sends a Field Conductor there — it is a different site, so
// this is a full URL rather than a route.
export const MAIN_PORTAL_URL = 'https://ai.mjmnursery.com';

// Optional — only needed for the AI "Take Photo" DO scan.
export const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || '';
export const AI_SCAN_ENABLED = !!GEMINI_KEY;
