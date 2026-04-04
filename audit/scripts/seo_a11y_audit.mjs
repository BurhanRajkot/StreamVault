import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const RED = '\x1b[0;31m';
const YELLOW = '\x1b[0;33m';
const GREEN = '\x1b[0;32m';
const CYAN = '\x1b[0;36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let totalWarnings = 0;
let totalErrors = 0;

function warn(msg) {
  console.log(`${YELLOW}[WARN]${RESET}  ${msg}`);
  totalWarnings++;
}

function error(msg) {
  console.log(`${RED}[ERROR]${RESET} ${msg}`);
  totalErrors++;
}

function success(msg) {
  console.log(`${GREEN}[OK]${RESET}    ${msg}`);
}

function info(msg) {
  console.log(`${CYAN}[INFO]${RESET}  ${msg}`);
}

function findFiles(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(filePath, exts));
    } else {
      if (exts.includes(path.extname(file))) {
        results.push(filePath);
      }
    }
  }
  return results;
}

console.log(`\n${BOLD}=== SEO & Accessibility (A11y) Static Code Analysis ===${RESET}\n`);

// 1. Check index.html for core SEO tags
const indexHtmlPath = path.resolve(PROJECT_ROOT, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  info(`Analyzing ${path.relative(PROJECT_ROOT, indexHtmlPath)}...`);
  const content = fs.readFileSync(indexHtmlPath, 'utf8');
  
  if (!/<title[^>]*>.*?<\/title>/i.test(content)) {
    error('Missing <title> tag in index.html');
  } else {
    success('Found <title> tag.');
  }

  if (!/<meta\s+name=["']description["']/i.test(content)) {
    error('Missing <meta name="description"> tag in index.html');
  } else {
    success('Found <meta name="description"> tag.');
  }
  
  if (!/<meta\s+name=["']viewport["']/i.test(content)) {
    error('Missing viewport meta tag for mobile responsiveness.');
  } else {
    success('Found viewport meta tag.');
  }

  // Basic check for HTML lang attribute
  if (!/<html[^>]*lang=["'][^"']+["']/i.test(content)) {
    warn('Missing `lang` attribute on <html> tag (improves accessibility and translation).');
  } else {
    success('Found `lang` attribute on <html> tag.');
  }
} else {
  warn('index.html not found at project root. Skipping base HTML SEO checks.');
}

// 2. Scan React components for basic A11y and SEO practices
const srcDir = path.resolve(PROJECT_ROOT, 'src');
const sourceFiles = findFiles(srcDir, ['.tsx', '.jsx', '.ts', '.js']);

info(`\nScanning ${sourceFiles.length} source files in \`/src\` for structural Accessibility / SEO issues...`);

let filesWithImgIssues = 0;
let filesWithHeadingIssues = 0;
let filesWithRoleIssues = 0;

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(PROJECT_ROOT, file);
  
  // Img tags without alt
  const imgRegex = /<img(?![^>]*\balt=)[^>]*>/gi;
  if (imgRegex.test(content)) {
    warn(`${relPath}: Found <img> tag without 'alt' attribute.`);
    filesWithImgIssues++;
  }

  // Links without href (button acting as link or a11y defect)
  const aRegex = /<a(\s+[^>]*?)?(?<!\bhref=)[>](?!.*?<button)/gi;
  // A naive check for <a> tags missing href. 
  // It's a bit rigid, so we'll do a simpler match:
  if (/<a\s+(?!.*?href=)[^>]*>/i.test(content)) {
    warn(`${relPath}: Found <a> tag possibly missing 'href' attribute.`);
  }

  // Avoid div with onClick but no a11y role or tabIndex
  const divTags = [];
  let idx = 0;
  while ((idx = content.toLowerCase().indexOf('<div', idx)) !== -1) {
    let endIdx = idx + 4;
    let braceLevel = 0;
    while (endIdx < content.length) {
      if (content[endIdx] === '{') braceLevel++;
      if (content[endIdx] === '}') braceLevel--;
      if (content[endIdx] === '>' && braceLevel === 0) {
        endIdx++;
        break;
      }
      endIdx++;
    }
    divTags.push(content.substring(idx, endIdx));
    idx = endIdx;
  }
  for (const tag of divTags) {
    if (/onClick/i.test(tag) && !/role=/i.test(tag) && !/tabIndex=/i.test(tag)) {
      warn(`${relPath}: Interactive <div> (has onClick) but no 'role' or 'tabIndex' provided.`);
      filesWithRoleIssues++;
    }
  }

  // Basic check to see if we have multiple H1s inside a single component
  const h1Count = (content.match(/<h1/gi) || []).length;
  if (h1Count > 1) {
    warn(`${relPath}: Multiple <h1> tags detected. Typically, a page should have only one <h1>.`);
    filesWithHeadingIssues++;
  }
}

console.log(`\n${BOLD}--- Analysis Summary ---${RESET}`);
if (totalErrors === 0 && totalWarnings === 0) {
  console.log(`${GREEN}✔ No obvious SEO/A11y issues found! Great job.${RESET}`);
} else {
  console.log(`Found ${YELLOW}${totalWarnings} warning(s)${RESET} and ${RED}${totalErrors} error(s)${RESET}.`);
  console.log(`- Files with image accessibility warnings: ${filesWithImgIssues}`);
  console.log(`- Files with interactive structural warnings: ${filesWithRoleIssues}`);
}

process.exit(totalErrors > 0 ? 1 : 0);
