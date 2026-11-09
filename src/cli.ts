#!/usr/bin/env node
/**
 * tab2mscz - Download tabs from Songsterr and convert Guitar Pro (.gp) to MuseScore (.mscz)
 * 
 * Standalone CLI - no dependency on songsterr-downloader web app.
 * For Songsterr URLs, it fetches the .gp directly from Songsterr's API.
 */

import { execSync } from 'child_process';
import { existsSync, copyFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, basename, extname, join, dirname } from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';

// ============ CONFIG ============

const DEFAULT_DOWNLOAD_DIR = join(homedir(), 'Downloads');
const MUSESCORE_PATHS = [
  'C:/Program Files/MuseScore 4/bin/MuseScore4.exe',
  'C:/Program Files/MuseScore 3/bin/MuseScore3.exe',
  'C:/Program Files (x86)/MuseScore 4/bin/MuseScore4.exe',
  'C:/Program Files (x86)/MuseScore 3/bin/MuseScore3.exe',
  join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 4/bin/MuseScore4.exe'),
  join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 3/bin/MuseScore3.exe'),
  '/usr/bin/mscore',
  '/usr/local/bin/mscore',
  '/Applications/MuseScore 4.app/Contents/MacOS/mscore',
];

// ============ HELPERS ============

function findMuseScore(): string | null {
  for (const path of MUSESCORE_PATHS) {
    if (existsSync(path)) return path;
  }
  // Try PATH
  try {
    execSync('mscore --version', { stdio: 'ignore' });
    return 'mscore';
  } catch {}
  try {
    execSync('MuseScore4.exe --version', { stdio: 'ignore' });
    return 'MuseScore4.exe';
  } catch {}
  return null;
}

function isMuseScoreWorking(cmd: string): boolean {
  try {
    execSync(`"${cmd}" --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

function extractTitleFromUrl(url: string): string {
  const match = url.match(/tab-([^?/]+)/) || url.match(/sheet-([^?/]+)/);
  return match ? match[1].replace(/-/g, ' ') : 'song';
}

function extractTitleFromPath(path: string): string {
  return basename(path, extname(path)).replace(/[_-]+/g, ' ');
}

// ============ SONGSTERR DOWNLOAD (direct, no web app needed) ============

async function downloadGpFromSongsterr(url: string): Promise<{ buffer: Buffer; title: string }> {
  // Extract song ID from URL: /a/wsa/artist-song-tab-s422494 or /a/wsa/song-sheet-s422494
  const match = url.match(/s(\d+)/);
  if (!match) throw new Error('Could not extract song ID from URL');
  const revisionId = match[1];
  
  const title = extractTitleFromUrl(url);
  
  // Songsterr API endpoint for revision data
  const apiUrl = `https://www.songsterr.com/api/song/${revisionId}/revision`;
  
  console.log(`🌐 Buscando dados do Songsterr: ${apiUrl}`);
  
  const res = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!res.ok) throw new Error(`Songsterr API failed: ${res.status}`);
  
  const data = await res.json();
  
  // The revision JSON contains the GP file encoded or a URL to it
  // Songsterr serves GP files via their CDN
  if (data.gpFileUrl) {
    const gpRes = await fetch(data.gpFileUrl);
    return { buffer: Buffer.from(await gpRes.arrayBuffer()), title };
  }
  
  // Fallback: try the direct download URL pattern
  const gpUrl = `https://www.songsterr.com/api/song/${revisionId}/revision/file.gp`;
  const gpRes = await fetch(gpUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!gpRes.ok) throw new Error(`Could not download .gp from Songsterr (${gpRes.status})`);
  
  return { buffer: Buffer.from(await gpRes.arrayBuffer()), title };
}

// ============ MAIN ============

export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
tab2mscz v1.0.0 - Download tabs from Songsterr + convert .gp to .mscz

Usage:
  tab2mscz <input> [title] [--out <dir>]

Arguments:
  input       Local .gp file path OR Songsterr URL
  title       Optional output title (default: extracted from input)
  --out       Output directory (default: ~/Downloads)

Examples:
  # Convert local file
  tab2mscz "E:/Downloads/song.gp"
  tab2mscz "song.gp" "My Song"
  
  # Download from Songsterr and convert
  tab2mscz "https://www.songsterr.com/a/wsa/artist-song-tab-s123456"
  
  # Custom output directory
  tab2mscz "song.gp" "My Song" --out "E:/Music"

Fallback (no MuseScore installed):
  Downloads .gp to output dir. Open in MuseScore 4 manually and Save As .mscz
`);
    process.exit(0);
  }

  const input = args[0];
  let customTitle: string | undefined;
  let outputDir = DEFAULT_DOWNLOAD_DIR;
  
  // Parse --out flag
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outputDir = resolve(args[outIdx + 1]);
    args.splice(outIdx, 2);
  }
  
  if (args.length > 1) customTitle = args[1];

  const isUrl = input.includes('songsterr.com');
  const isLocalGp = !isUrl && input.toLowerCase().endsWith('.gp') && existsSync(input);

  if (!isUrl && !isLocalGp) {
    console.error('❌ Input deve ser uma URL do Songsterr OU um arquivo .gp local');
    console.error('   Exemplos:');
    console.error('   URL:     https://www.songsterr.com/a/wsa/...');
    console.error('   Arquivo: E:/Downloads/song.gp');
    process.exit(1);
  }

  // Ensure output dir exists
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Find MuseScore
  const mscoreCmd = findMuseScore();
  const mscoreAvailable = mscoreCmd ? isMuseScoreWorking(mscoreCmd) : false;
  
  if (!mscoreAvailable) {
    console.warn('⚠️  MuseScore não encontrado neste computador.');
    console.warn('   Instale: https://musescore.org/download');
  }

  // Get .gp content
  let title: string;
  let gpPath: string;
  let isTemp = false;

  if (isLocalGp) {
    gpPath = resolve(input);
    title = customTitle || extractTitleFromPath(input);
    console.log(`🎵 Arquivo local: ${gpPath}`);
  } else {
    title = customTitle || extractTitleFromUrl(input);
    try {
      const { buffer, title: extractedTitle } = await downloadGpFromSongsterr(input);
      if (!customTitle) title = extractedTitle;
      
      const tempGp = join(tmpdir(), `tab2mscz_${Date.now()}.gp`);
      writeFileSync(tempGp, buffer);
      console.log(`✅ .gp baixado do Songsterr (${buffer.length} bytes)`);
      gpPath = tempGp;
      isTemp = true;
    } catch (error) {
      console.error('❌ Erro ao baixar do Songsterr:', error instanceof Error ? error.message : String(error));
      console.error('   Dica: use o songsterr-downloader (npm run dev) para baixar o .gp, depois rode gp2mscz no arquivo local');
      process.exit(1);
    }
  }

  const safeTitle = sanitizeFilename(title);
  const msczPath = join(outputDir, `${safeTitle}.mscz`);
  const gpOutputPath = join(outputDir, `${safeTitle}.gp`);

  if (!mscoreAvailable) {
    // FALLBACK: save .gp to output dir
    if (!isLocalGp) copyFileSync(gpPath, gpOutputPath);
    if (isTemp) unlinkSync(gpPath);
    
    console.log(`\n📥 Arquivo .gp salvo em: ${isLocalGp ? gpPath : gpOutputPath}`);
    console.log(`\n🔧 Para converter para .mscz:`);
    console.log(`   1. Instale MuseScore 4: https://musescore.org/download`);
    console.log(`      Depois rode: tab2mscz "${isLocalGp ? gpPath : gpOutputPath}" "${title}"`);
    console.log(`   2. Abra o .gp no MuseScore → File → Save As → .mscz`);
    process.exit(0);
  }

  console.log(`📁 Saída: ${msczPath}`);
  console.log(`🔄 Convertendo .gp → .mscz...`);

  try {
    execSync(`"${mscoreCmd}" -o "${msczPath}" "${gpPath}"`, {
      stdio: 'inherit',
      timeout: 180000
    });

    if (isTemp && existsSync(gpPath)) unlinkSync(gpPath);

    console.log(`\n✅ Pronto! ${msczPath}`);
  } catch (error) {
    console.error('\n❌ Erro na conversão:', error instanceof Error ? error.message : String(error));
    // Still save the .gp as fallback
    if (!isLocalGp) copyFileSync(gpPath, gpOutputPath);
    console.log(`📥 Arquivo .gp salvo em: ${gpOutputPath}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ Erro fatal:', e.message);
  process.exit(1);
});