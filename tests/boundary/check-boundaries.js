/**
 * Boundary enforcement test
 * Ensures Clean Architecture layer dependencies are respected
 * 
 * Rules:
 * - Domain layer MUST NOT import from: next, expo, react-native, drizzle, vercel, marketplace SDKs
 * - Application layer may only import from domain
 * - Infrastructure layers (database, integrations, auth) implement domain ports
 */

const fs = require('fs');
const path = require('path');

// Forbidden imports for domain layer
const FORBIDDEN_DOMAIN_IMPORTS = [
  'next',
  'react',
  'react-native',
  'expo',
  '@vercel',
  'drizzle-orm',
  '@tokopedia',
  '@shopee',
  '@bukalapak',
  '@lazada',
  '@blibli',
];

// Check if a line contains a forbidden import
function hasForbiddenImport(line, forbiddenPatterns) {
  if (!line.includes('import') && !line.includes('require')) {
    return null;
  }
  
  for (const pattern of forbiddenPatterns) {
    if (line.includes(`'${pattern}`) || line.includes(`"${pattern}`)) {
      return pattern;
    }
  }
  return null;
}

// Recursively find all TypeScript files in a directory
function findTsFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && item !== 'node_modules' && item !== 'dist') {
      results.push(...findTsFiles(fullPath));
    } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Check a single file for violations
function checkFile(filePath, forbiddenPatterns) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  lines.forEach((line, index) => {
    const forbidden = hasForbiddenImport(line, forbiddenPatterns);
    if (forbidden) {
      violations.push({
        file: filePath,
        line: index + 1,
        content: line.trim(),
        forbidden,
      });
    }
  });
  
  return violations;
}

// Main test
function main() {
  console.log('🔍 Checking Clean Architecture boundaries...\n');
  
  const domainPath = path.join(__dirname, '../../packages/domain/src');
  
  if (!fs.existsSync(domainPath)) {
    console.error('❌ Domain package not found at:', domainPath);
    process.exit(1);
  }
  
  const domainFiles = findTsFiles(domainPath);
  console.log(`📁 Found ${domainFiles.length} files in domain layer\n`);
  
  let totalViolations = 0;
  
  for (const file of domainFiles) {
    const violations = checkFile(file, FORBIDDEN_DOMAIN_IMPORTS);
    
    if (violations.length > 0) {
      totalViolations += violations.length;
      console.error(`❌ ${path.relative(process.cwd(), file)}:`);
      
      violations.forEach(v => {
        console.error(`   Line ${v.line}: Forbidden import '${v.forbidden}'`);
        console.error(`   ${v.content}`);
      });
      console.error('');
    }
  }
  
  if (totalViolations > 0) {
    console.error(`\n❌ Found ${totalViolations} boundary violation(s)!`);
    console.error('\nDomain layer must not import from:');
    FORBIDDEN_DOMAIN_IMPORTS.forEach(pattern => {
      console.error(`  - ${pattern}`);
    });
    process.exit(1);
  }
  
  console.log('✅ All boundary checks passed!');
  console.log('✅ Domain layer has no forbidden framework dependencies\n');
  process.exit(0);
}

main();
