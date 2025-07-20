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

// Build Popup Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/popup.ts'],
    outfile: './dist/popup.js',
  })
  .catch(() => process.exit(1));

// Build Background Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/background/service-worker.ts'],
    outfile: './dist/service-worker.js',
  })
  .catch(() => process.exit(1));

// Build Theme Loader Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/theme-loader.ts'],
    outfile: './dist/theme-loader.js',
  })
  .catch(() => process.exit(1));

// Build Utility Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/utils.ts'],
    outfile: './dist/utils.js',
  })
  .catch(() => process.exit(1));

// Build ApiService Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/services/ApiService.ts'],
    outfile: './dist/api-service.js',
  })
  .catch(() => process.exit(1));

// Build StorageManager Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/storage/storage-manager.ts'],
    outfile: './dist/storage-manager.js',
  })
  .catch(() => process.exit(1));

// Build JobDetails Component Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/components/JobDetails.ts'],
    outfile: './dist/job-details.js',
  })
  .catch(() => process.exit(1));

// Build JobItem Component Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/components/JobItem.ts'],
    outfile: './dist/job-item.js',
  })
  .catch(() => process.exit(1));

// Build SearchForm Component Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/components/SearchForm.ts'],
    outfile: './dist/search-form.js',
  })
  .catch(() => process.exit(1));

// Build StatusHeader Component Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/components/StatusHeader.ts'],
    outfile: './dist/status-header.js',
  })
  .catch(() => process.exit(1));

// Build Background Config Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/background/config.ts'],
    outfile: './dist/background-config.js',
  })
  .catch(() => process.exit(1));

// Build Audio Service Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/background/audio-service.ts'],
    outfile: './dist/audio-service.js',
  })
  .catch(() => process.exit(1));

// Build Types Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/types.ts'],
    outfile: './dist/types.js',
  })
  .catch(() => process.exit(1));

// Build AppState Script
esbuild
  .build({
    ...commonConfig,
    entryPoints: ['./src/popup/state/AppState.ts'],
    outfile: './dist/app-state.js',
  })
  .catch(() => process.exit(1));
