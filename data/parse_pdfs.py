#!/usr/bin/env python3
"""
Parse all E1 timing sheet PDFs into structured JSON.
Handles Classification, Analysis, Grid, and Championship PDFs.
"""
import pdfplumber
import json
import os
import re
import glob
from collections import defaultdict

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(DATA_DIR, "pdfs")
OUTPUT_DIR = os.path.join(DATA_DIR, "json")

def parse_time(t):
    """Convert time string to seconds for comparison."""
    if not t or t == '-':
        return None
    t = t.strip()
    parts = t.split(':')
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    elif len(parts) == 1:
        return float(parts[0])
    return None

def parse_classification(text, filepath):
    """Parse a Classification PDF text into structured data."""
    lines = text.strip().split('\n')

    result = {
        "type": "classification",
        "race_round": "",
        "location": "",
        "session": "",
        "laps": None,
        "distance": "",
        "wind": "",
        "fastest_lap": None,
        "results": [],
        "date": ""
    }

    # Extract header info
    for line in lines[:6]:
        # Round & location: "R01 - Jeddah"
        m = re.match(r'(R\d+)\s*-\s*(.+)', line)
        if m:
            result["race_round"] = m.group(1)
            result["location"] = m.group(2).strip()

        # Session name with laps: "Race 1 Group A (6 Laps, 9,1 km.)"
        m = re.match(r'(.+?)\s*\((\d+)\s*Laps?,\s*([\d,\.]+)\s*km\.?\)', line)
        if m:
            result["session"] = m.group(1).strip()
            result["laps"] = int(m.group(2))
            result["distance"] = m.group(3).replace(',', '.')

    # If session not found from header with laps, try without
    if not result["session"]:
        for line in lines[:6]:
            if line.strip() and line.strip() not in ['Classification', 'UIM E1 World Championship'] and not re.match(r'R\d+', line):
                if 'Best Lap' not in line and 'No' not in line[:5]:
                    result["session"] = line.strip()
                    break

    # Extract wind
    wind_match = re.search(r'Wind:\s*([\d,\.]+)\s*Kph', text)
    if wind_match:
        result["wind"] = wind_match.group(1).replace(',', '.')

    # Extract date
    date_match = re.search(r'(\d{2}/\d{2}/\d{4})', text)
    if date_match:
        result["date"] = date_match.group(1)

    # Extract fastest lap
    fl_match = re.search(r'Fastest Lap:\s*Lap\s*(\d+)\s+(.+?)\s+(\d+:\d+\.\d+)\s+([\d\.]+)\s*Kph', text)
    if fl_match:
        result["fastest_lap"] = {
            "lap": int(fl_match.group(1)),
            "pilot": fl_match.group(2).strip(),
            "time": fl_match.group(3),
            "kph": float(fl_match.group(4))
        }

    # Parse result rows
    # Pattern: pos no+PilotName Team Racebird Class Laps TotalTime Gap Kph BestLapNo BestLapTime BestLapKph
    # Example: "1 88Lucas ORDOÑEZ Westbrook Racing RB02 WESTBR 6 6:48.686 - 80.4 3 1:06.084 82.9"
    row_pattern = re.compile(
        r'^(\d+|DNS|DNF|DSQ|EX)\s+'  # pos
        r'(\d+)'                      # number
        r'([A-Z][a-záéíóúñäëïöüàèìòù]+(?: [A-Z\'\-]+(?:\s+[A-Z\'\-]+)*))\s+'  # pilot name
        r'(.+?)\s+'                   # team
        r'(RB\d+)\s+'                 # racebird
        r'([A-Z]+)\s+'               # class
        r'(\d+)\s+'                   # laps
        r'(\d+:\d+\.\d+)\s+'         # total time
        r'([+\-][\d:.]+|\-)\s+'      # gap
        r'([\d.]+)\s+'               # kph
        r'(\d+)\s+'                   # best lap number
        r'(\d+:\d+\.\d+)\s+'         # best lap time
        r'([\d.]+)',                  # best lap kph
        re.IGNORECASE
    )

    # Simpler fallback: use text-based parsing on each line
    for line in lines:
        line = line.strip()
        if not line or line.startswith('No') or line.startswith('Best') or 'Classification' in line:
            continue

        # Try to match result row - flexible pattern
        m = re.match(
            r'^(\d+|DNS|DNF|DSQ|EX)\s+'
            r'(\d+)'
            r'(.+?)'  # pilot name (everything until we hit known team/racebird pattern)
            r'\s+(RB\d+)\s+'
            r'([A-Z]+)\s+'
            r'(\d+)\s+'
            r'(\d+:\d+\.\d+)\s+'
            r'([+\-]?[\d:.]+|\-)\s+'
            r'([\d.]+)\s+'
            r'(\d+)\s+'
            r'(\d+:\d+\.\d+)\s+'
            r'([\d.]+)',
            line
        )
        if m:
            pos_str = m.group(1)
            no = m.group(2)
            pilot_team = m.group(3).strip()
            racebird = m.group(4)
            cl = m.group(5)

            # Split pilot_team into pilot and team
            # The pilot name ends where the team name begins
            # Team names typically start with "Team ", "Westbrook", "Aoki", etc.
            team_patterns = [
                r'(.*?)\s+(Team\s+.+)',
                r'(.*?)\s+(Westbrook\s+Racing.*)',
                r'(.*?)\s+(Aoki\s+Racing.*)',
                r'(.*?)\s+(Sergio\s+Perez.*)',
            ]
            pilot = pilot_team
            team = ""
            for tp in team_patterns:
                tm = re.match(tp, pilot_team)
                if tm:
                    pilot = tm.group(1).strip()
                    team = tm.group(2).strip()
                    break

            entry = {
                "pos": int(pos_str) if pos_str.isdigit() else pos_str,
                "no": no,
                "pilot": pilot,
                "team": team,
                "racebird": racebird,
                "class": cl,
                "laps": int(m.group(6)),
                "total_time": m.group(7),
                "gap": m.group(8) if m.group(8) != '-' else None,
                "kph": float(m.group(9)),
                "best_lap": {
                    "lap": int(m.group(10)),
                    "time": m.group(11),
                    "kph": float(m.group(12))
                }
            }
            result["results"].append(entry)
            continue

        # DNF/DNS rows (no time data)
        m2 = re.match(
            r'^(DNS|DNF|DSQ|EX)\s+'
            r'(\d+)'
            r'(.+?)'
            r'\s+(RB\d+)\s+'
            r'([A-Z]+)',
            line
        )
        if m2:
            pilot_team = m2.group(3).strip()
            pilot = pilot_team
            team = ""
            for tp in [r'(.*?)\s+(Team\s+.+)', r'(.*?)\s+(Westbrook\s+Racing.*)', r'(.*?)\s+(Aoki\s+Racing.*)']:
                tm = re.match(tp, pilot_team)
                if tm:
                    pilot = tm.group(1).strip()
                    team = tm.group(2).strip()
                    break

            entry = {
                "pos": m2.group(1),
                "no": m2.group(2),
                "pilot": pilot,
                "team": team,
                "racebird": m2.group(4),
                "class": m2.group(5),
                "laps": 0,
                "total_time": None,
                "gap": None,
                "kph": None,
                "best_lap": None,
                "note": m2.group(1)
            }
            result["results"].append(entry)

    return result

def parse_analysis(text, filepath):
    """Parse an Analysis/Sector Analysis PDF text."""
    lines = text.strip().split('\n')

    result = {
        "type": "analysis",
        "race_round": "",
        "location": "",
        "session": "",
        "teams": []
    }

    # Extract header
    for line in lines[:6]:
        m = re.match(r'(R\d+)\s*-\s*(.+)', line)
        if m:
            result["race_round"] = m.group(1)
            result["location"] = m.group(2).strip()
        if 'Race' in line or 'Final' in line or 'Semi' in line or 'Place' in line or 'Qualifying' in line or 'Practice' in line:
            if 'Sector' not in line and 'Analysis' not in line and 'UIM' not in line:
                result["session"] = line.strip()

    # Parse team blocks
    current_team = None
    current_no = None
    current_pilots = []
    current_class = None
    current_racebird = None
    current_laps = []

    team_pattern = re.compile(r'^(.+?)\s+(RB\d+)')
    pilot_pattern = re.compile(r'^(\d+)\s+(\d+\.[A-Z].*?)\s+([A-Z]+)$')
    no_pilot_pattern = re.compile(r'^(\d+)\s+(\d+\..*)')
    lap_pattern = re.compile(
        r'^(SL|LL|__)?\s*(\d+)\s+(\d+)\s+'
        r'(\d+:\d+\.\d+|\d+\.\d+)\s+'
        r'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+'
        r'([\d.]+)\s+'
        r'(\d+:\d+\.\d+)'
    )

    def save_team():
        if current_team and current_laps:
            result["teams"].append({
                "team": current_team,
                "no": current_no,
                "racebird": current_racebird,
                "class": current_class,
                "pilots": current_pilots,
                "laps": current_laps
            })

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip header lines
        if any(x in line for x in ['Sector Analysis', 'Invalidated', 'Personal Best', 'Session Best',
                                     'Lap P Time', 'UIM E1', 'Page 1']):
            continue

        # Team header: "Team Sierra Racing Club RB12"
        tm = team_pattern.match(line)
        if tm and 'RB' in line:
            save_team()
            current_team = tm.group(1).strip()
            current_racebird = tm.group(2)
            current_laps = []
            current_pilots = []
            current_no = None
            current_class = None
            continue

        # Number + pilot + class line: "06 1.Rianna O'MEARA-HUNT SIERRA"
        np = re.match(r'^(\d+)\s+(\d+\..+?)\s+([A-Z]{3,})\s*$', line)
        if np:
            current_no = np.group(1)
            current_pilots.append(np.group(2).strip())
            current_class = np.group(3)
            continue

        # Additional pilot line: "2.Erik STARK"
        pp = re.match(r'^(\d+\.[A-Z].+)', line)
        if pp and not re.match(r'^\d+\s+\d+\s+', line):
            current_pilots.append(pp.group(1).strip())
            continue

        # Lap data line
        lm = re.match(
            r'^(SL|LL|__)?\s*(\d+)\s+(\d+)\s+'
            r'(\d+:\d+\.\d+|\d+\.\d+)\s+'
            r'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+'
            r'([\d.]+)\s+'
            r'(\d+:\d+\.\d+)',
            line
        )
        if lm:
            try:
                s1 = float(lm.group(5)) if lm.group(5) != '...' else None
                s2 = float(lm.group(6)) if lm.group(6) != '...' else None
                s3 = float(lm.group(7)) if lm.group(7) != '...' else None
                kph = float(lm.group(8)) if lm.group(8) != '...' else None
            except ValueError:
                s1 = s2 = s3 = kph = None
            lap_entry = {
                "marker": lm.group(1) if lm.group(1) else None,
                "lap": int(lm.group(2)),
                "pilot_pos": int(lm.group(3)),
                "time": lm.group(4),
                "sector1": s1,
                "sector2": s2,
                "sector3": s3,
                "kph": kph,
                "elapsed": lm.group(9)
            }
            current_laps.append(lap_entry)
            continue

    save_team()
    return result

def parse_grid(text, filepath):
    """Parse a Starting Grid PDF."""
    lines = text.strip().split('\n')

    result = {
        "type": "grid",
        "race_round": "",
        "location": "",
        "session": "",
        "grid": []
    }

    for line in lines[:6]:
        m = re.match(r'(R\d+)\s*-\s*(.+)', line)
        if m:
            result["race_round"] = m.group(1)
            result["location"] = m.group(2).strip()
        if any(x in line for x in ['Race', 'Final', 'Semi', 'Place', 'Qualifying', 'Eliminator', 'Race Off', 'Play-Off']):
            if 'Starting' not in line and 'UIM' not in line and 'Director' not in line:
                result["session"] = line.strip()

    # Grid entries: position, pilot name, number, team
    # Format varies - sometimes position numbers followed by pilot names
    # Parse number + name patterns
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Look for position numbers (e.g., "1 2 3" or just "1")
        pos_match = re.match(r'^(\d+)(?:\s+(\d+))?(?:\s+(\d+))?\s*$', line)
        if pos_match and int(pos_match.group(1)) <= 10:
            positions = [int(x) for x in pos_match.groups() if x]
            # Next line(s) should be pilot names
            if i + 1 < len(lines):
                pilot_line = lines[i+1].strip()
                pilots = re.split(r'\s{2,}', pilot_line)
                if i + 2 < len(lines):
                    no_line = lines[i+2].strip()
                    numbers = re.split(r'\s{2,}', no_line)
                    if i + 3 < len(lines):
                        team_line = lines[i+3].strip()
                        teams = re.split(r'\s{2,}', team_line)

                        for j, pos in enumerate(positions):
                            entry = {
                                "pos": pos,
                                "pilot": pilots[j] if j < len(pilots) else "",
                                "no": numbers[j] if j < len(numbers) else "",
                                "team": teams[j] if j < len(teams) else ""
                            }
                            result["grid"].append(entry)
                        i += 4
                        continue
        i += 1

    return result

def parse_championship(text, filepath):
    """Parse a Championship standings PDF."""
    lines = text.strip().split('\n')

    result = {
        "type": "championship",
        "location": "",
        "standings": []
    }

    for line in lines:
        # Match: "1 Team Brady 41 20 1 20" etc.
        m = re.match(r'^(\d+)\s+(.+?)\s+(\d+)\s+', line)
        if m:
            pos = int(m.group(1))
            rest = m.group(2).strip()
            points = int(m.group(3))
            result["standings"].append({
                "pos": pos,
                "team": rest,
                "points": points
            })

    # Get location from header
    for line in lines[:5]:
        if line.strip() and line.strip() not in ['UIM E1 World Championship', 'Classification']:
            m = re.match(r'(R\d+)\s*-\s*(.+)', line)
            if m:
                result["location"] = m.group(2).strip()
            elif 'After' in line or 'Jeddah' in line or 'Venice' in line:
                result["location"] = line.strip()

    return result

def process_all_pdfs():
    """Process all PDFs and output structured JSON."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_data = {
        "seasons": {}
    }

    stats = {"total": 0, "parsed": 0, "errors": 0, "skipped": 0}

    # Walk through the PDF directory structure
    for season_dir in sorted(glob.glob(os.path.join(PDF_DIR, "Season*"))):
        season_name = os.path.basename(season_dir)
        season_key = season_name  # e.g., "Season 1 - 2024"
        all_data["seasons"][season_key] = {"races": {}}

        for race_dir in sorted(glob.glob(os.path.join(season_dir, "R*"))):
            race_name = os.path.basename(race_dir)
            all_data["seasons"][season_key]["races"][race_name] = {"events": {}}

            # Walk through event types and sessions
            for root, dirs, files in os.walk(race_dir):
                for filename in sorted(files):
                    if not filename.lower().endswith('.pdf'):
                        continue

                    filepath = os.path.join(root, filename)
                    rel_path = os.path.relpath(filepath, race_dir)
                    stats["total"] += 1

                    # Determine PDF type
                    fname_lower = filename.lower()

                    # Skip weather, entry list, race instructions, timetables, course maps
                    if any(x in fname_lower for x in ['weather', 'entry list', 'race instruction',
                                                        'timetable', 'race course', 'race_course']):
                        stats["skipped"] += 1
                        continue

                    try:
                        with pdfplumber.open(filepath) as pdf:
                            text = ""
                            for page in pdf.pages:
                                page_text = page.extract_text()
                                if page_text:
                                    text += page_text + "\n"

                        if not text.strip():
                            stats["skipped"] += 1
                            continue

                        # Parse based on type
                        if 'classification' in fname_lower or 'combinedclassification' in fname_lower:
                            if 'championship' in fname_lower or 'teams championship' in fname_lower.replace('_', ' '):
                                parsed = parse_championship(text, filepath)
                            else:
                                parsed = parse_classification(text, filepath)
                        elif 'analysis' in fname_lower:
                            parsed = parse_analysis(text, filepath)
                        elif 'grid' in fname_lower:
                            parsed = parse_grid(text, filepath)
                        elif 'championship' in fname_lower or 'teams championship' in fname_lower.replace('_', ' '):
                            parsed = parse_championship(text, filepath)
                        elif 'fastestlap' in fname_lower.replace('_', '').replace(' ', ''):
                            parsed = parse_classification(text, filepath)
                        else:
                            parsed = parse_classification(text, filepath)

                        parsed["source_file"] = rel_path

                        # Store in structure
                        session_dir_name = os.path.basename(os.path.dirname(filepath))
                        event_dir = os.path.relpath(os.path.dirname(filepath), race_dir)

                        if event_dir not in all_data["seasons"][season_key]["races"][race_name]["events"]:
                            all_data["seasons"][season_key]["races"][race_name]["events"][event_dir] = []

                        all_data["seasons"][season_key]["races"][race_name]["events"][event_dir].append(parsed)
                        stats["parsed"] += 1

                    except Exception as e:
                        print(f"  ERROR parsing {filepath}: {e}")
                        stats["errors"] += 1

    # Save the master JSON
    output_path = os.path.join(OUTPUT_DIR, "e1_all_data.json")
    with open(output_path, 'w') as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Total PDFs: {stats['total']}")
    print(f"Parsed: {stats['parsed']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"Errors: {stats['errors']}")
    print(f"Output: {output_path}")
    print(f"Size: {os.path.getsize(output_path) / 1024 / 1024:.1f} MB")

    return all_data

if __name__ == "__main__":
    process_all_pdfs()
