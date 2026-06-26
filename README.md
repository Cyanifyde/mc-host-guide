# mc-host-guide

Local Python CMS and generated GitHub Pages site for Minecraft hosting recommendations.

## Local workflow

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000/> to manage hosts.

The CMS writes host data to `data/hosts.json`. Use the Build page or run:

```powershell
python build_site.py
```

Generated GitHub Pages files are written to `docs/`.

## GitHub Pages

This repo is intended to use GitHub Pages from the `main` branch and `/docs` folder.

If automatic Pages configuration fails, open the GitHub repo settings and choose:

- Source: deploy from a branch
- Branch: `main`
- Folder: `/docs`

## Data model

Rankings are manual. Each host has a tier, rank, category picks, CPU/GHz fields, hosting feature notes, source URLs, status, and trust notes.

Tier values:

- `top_pick`
- `recommended`
- `situational`
- `avoid`
- `unreviewed`

Category values:

- `overall`
- `budget`
- `performance`
- `modded`
- `free`
- `small_servers`
- `large_servers`
- `regional`
