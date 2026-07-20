// Supabase's OAuth redirect returns the session tokens as a URL *fragment*
// (`#access_token=...`), not a query string — React Native's URL parsing
// doesn't handle fragments reliably, so this uses expo-auth-session's
// QueryParams helper (the pattern Supabase's own Expo OAuth guide uses),
// which handles both fragment and query forms. Kept in its own file so
// auth.tsx doesn't need to know about this parsing detail directly.
export { getQueryParams } from 'expo-auth-session/build/QueryParams';
