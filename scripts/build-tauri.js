const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '../app/api');
const backupDir = path.join(__dirname, '../app/_api_backup');

console.log('Preparing static export for Tauri build...');

// 1. Temporarily back up app/api to prevent static export errors
let backedUp = false;
if (fs.existsSync(apiDir)) {
  console.log('Temporarily moving app/api to prevent export errors...');
  fs.renameSync(apiDir, backupDir);
  backedUp = true;
}

try {
  // 2. Run next build with TAURI_BUILD env var
  console.log('Running next build for static export...');
  execSync('npx next build', { 
    stdio: 'inherit', 
    env: { 
      ...process.env, 
      TAURI_BUILD: 'true' 
    } 
  });
  console.log('Next.js static export completed successfully.');
} catch (error) {
  console.error('Next.js build failed:', error);
  process.exitCode = 1;
} finally {
  // 3. Restore the app/api directory
  if (backedUp && fs.existsSync(backupDir)) {
    console.log('Restoring app/api directory...');
    fs.renameSync(backupDir, apiDir);
  }
}
