const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Step 1: Run TypeScript compiler to generate type definitions
execSync('tsc');

// Step 2: Copy CSV files to dist directories (for both ESM and CJS)
// Note: CSV files are copied to csv/ at the root of dist because esbuild bundles
// everything into index.js at the root, so __dirname will be dist/esm or dist/cjs
const csvFiles = [
  { source: 'src/data-mapper/csv/states.csv', dest: 'csv/states.csv' },
  { source: 'src/data-mapper/csv/countries.csv', dest: 'csv/countries.csv' }
];

csvFiles.forEach(({ source, dest }) => {
  const sourcePath = path.join(__dirname, '..', source);
  const destESM = path.join(__dirname, '..', 'dist/esm', dest);
  const destCJS = path.join(__dirname, '..', 'dist/cjs', dest);
  
  // Create destination directories if they don't exist
  fs.mkdirSync(path.dirname(destESM), { recursive: true });
  fs.mkdirSync(path.dirname(destCJS), { recursive: true });
  
  // Copy CSV files
  fs.copyFileSync(sourcePath, destESM);
  fs.copyFileSync(sourcePath, destCJS);
  
  console.log(`Copied ${source} to dist/esm and dist/cjs`);
});

// Step 3: Use esbuild to bundle JavaScript files

// Build for ESM
esbuild.build({
  entryPoints: ['bin/index.ts'],
  bundle: true,
  outdir: 'dist/esm',
  format: 'esm',
  platform: 'node',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  external: ['integration-core', 'axios', 'jsonwebtoken']
}).catch(() => process.exit(1));

// Build for CJS
esbuild.build({
  entryPoints: ['bin/index.ts'],
  bundle: true,
  outdir: 'dist/cjs',
  format: 'cjs',
  platform: 'node',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  external: ['integration-core', 'axios', 'jsonwebtoken']
}).catch(() => process.exit(1));