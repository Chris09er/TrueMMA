const baseConfig = require('./app.json');

// google-services.json is gitignored (public repo) and instead delivered at
// EAS Build time via the GOOGLE_SERVICES_JSON file-type env var (see
// docs/ARCHITECTURE.md -> Build & deployment). Locally it just reads the
// file you placed at the project root after downloading it from Firebase.
module.exports = {
  ...baseConfig.expo,
  android: {
    ...baseConfig.expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
};
