/* eslint-env node */
/* eslint-disable no-undef */
import * as esbuild from 'esbuild';

const commonConfig = {
  bundle: true,
  minify: false, // Set to true for production build
  sourcemap: true, // Generate sourcemaps
  platform: 'browser',
  external: ['webextension-polyfill'], // Exclude polyfill as it's loaded separately
};

// Define all build targets.
// Each target is an object with an entry point and an output file.
// This structure allows for parallel building and centralized error handling.
const buildTargets = [
  // Popup scripts
  { entry: './src/popup/popup.ts', output: './dist/popup.js' },
  { entry: './src/popup/theme-loader.ts', output: './dist/theme-loader.js' },
  { entry: './src/popup/services/ApiService.ts', output: './dist/api-service.js' },
  { entry: './src/popup/state/AppState.ts', output: './dist/app-state.js' },

  // Popup component scripts
  { entry: './src/popup/components/JobDetails.ts', output: './dist/job-details.js' },
  { entry: './src/popup/components/JobItem.ts', output: './dist/job-item.js' },
  { entry: './src/popup/components/SearchForm.ts', output: './dist/search-form.js' },
  { entry: './src/popup/components/StatusHeader.ts', output: './dist/status-header.js' },

  // Background scripts
  { entry: './src/background/service-worker.ts', output: './dist/service-worker.js' },
  { entry: './src/background/config.ts', output: './dist/background-config.js' },
  { entry: './src/background/audio-service.ts', output: './dist/audio-service.js' },

  // Shared modules
  { entry: './src/storage/storage-manager.ts', output: './dist/storage-manager.js' },
  { entry: './src/utils/utils.ts', output: './dist/utils.js' },
  // Note: 'types.ts' is intentionally not bundled as its types are compile-time only
  // and its runtime code (isGraphQLResponse) is bundled with its consumers (e.g., service-worker).
];

// Use Promise.all to build all targets in parallel.
// This is faster than building sequentially and provides better error handling.
Promise.all(
  buildTargets.map((target) =>
    esbuild.build({
      ...commonConfig,
      entryPoints: [target.entry],
      outfile: target.output,
    })
  )
)
  .then(() => {
    console.log('All targets built successfully.');
  })
  .catch((error) => {
    console.error('A build failed:', error);
    process.exit(1);
  });
