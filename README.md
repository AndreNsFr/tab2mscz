# tab2mscz

Convert Guitar Pro (`.gp`) files to MuseScore (`.mscz`) using local MuseScore.

## Install

```bash
# Global (recommended)
npm install -g tab2mscz

# Or via npx (no install)
npx tab2mscz <input>

# Or from GitHub
git clone <repo-url>
cd gp2mscz-cli && npm install && npm link
```

## Usage

```bash
# Convert local .gp file
tab2mscz "E:/Downloads/song.gp"
tab2mscz "song.gp" "My Song Title"

# Download from Songsterr + convert
tab2mscz "https://www.songsterr.com/a/wsa/artist-song-tab-s123456"

# Custom output directory
tab2mscz "song.gp" "My Song" --out "E:/Music/Scores"
```

## Requirements

- **Node.js** >= 18
- **MuseScore 4.x** installed locally (for automatic conversion)

## Fallback (no MuseScore)

If MuseScore is not installed, the `.gp` file is saved to your Downloads folder. You can then:
1. Install MuseScore 4 and re-run `tab2mscz`
2. Open the `.gp` in MuseScore manually → Save As → `.mscz`

## How it works

1. Downloads `.gp` from Songsterr (or uses local file)
2. Runs `MuseScore4 -o output.mscz input.gp`
3. Outputs valid `.mscz` with style, thumbnails, and settings

## License

MIT