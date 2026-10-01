// Stand-in for @supabase/supabase-js in the preview build, which has no cloud.
export function createClient() {
  throw new Error('Cloud sync is not available in the preview')
}
