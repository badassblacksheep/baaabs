"""Solve the provisional survey-informed frame with the frozen iteration-06 solver.

Run from the repository: OPENBLAS_NUM_THREADS=1 python3 tools/solve-survey-model.py
All geometry comes from the generated survey recipe. The inherited solver is
extracted in a temporary directory, never modified, and checks load, equilibrium
and element consistency. No fabrication or occupancy release.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / "site/assets/earl-survey-model.json"
ARCHIVE = ROOT / "site/assets/downloads/structural/iteration-06-source.zip"

def sweep(deck_ft, length_ft):
    length_ft = min(deck_ft, length_ft)
    end = deck_ft - length_ft
    offsets = sorted({float(x) for x in range(int(end) + 1)} | {end, end / 2})
    return [(f"patch_{length_ft:g}ft_at_{x:g}ft", x, length_ft) for x in offsets]

def solve():
    recipe = json.loads(RECIPE.read_text())
    frame, loads = recipe["candidate"], recipe["loadInputs"]
    deck_ft = frame["deckLengthIn"] / 12
    with tempfile.TemporaryDirectory(prefix="baaabs-survey-") as temp:
        with zipfile.ZipFile(ARCHIVE) as archive:
            # Fixed trusted archive, extract only the original solver dependencies.
            for name in ("screen.py", "screen04.py", "bearing04.py", "hss-properties.json"):
                archive.extract(name, temp)
        sys.path.insert(0, temp)
        from screen04 import analyze, check_element
        from bearing04 import check_bearings
        check_element()
        check_bearings()
        def case(label, people=loads["people"], gear=loads["gearLbf"],
                 k=loads["shoreK_LbfPerIn"], refinement=3, alpha=loads["liveMultiplier"]):
            patches = sweep(deck_ft, 12) if people else []
            if people and people != 20:
                patches += sweep(deck_ft, .6 * people)
            rows, reactions = analyze(frame["members"], "workshop_rear",
                .93 * frame["roofWallNominalIn"] * .0254, True, "touching", refinement,
                dancers=people, patches=patches, shore_points=frame["shorePositions"],
                shore_k=k, live_multiplier=alpha, shore_dead_lbf=frame["shoreMassEachLbf"],
                panel_lbf=loads["panelAllowanceLbf"] + gear, nominal_mass=True)
            s = max(rows, key=lambda r: r["max_normal_MPa"])
            d = max(rows, key=lambda r: r["deck_drop_in"])
            v = max(rows, key=lambda r: r["shore_peak_lbf"])
            result = dict(label=label, people=people, gearLbf=gear, kLbfPerIn=k,
                liveMultiplier=alpha, refinement=refinement, cases=len(rows),
                stressMPa=s["max_normal_MPa"], governingMember=s["critical_member"],
                stressCase=s["case"], deckDropIn=d["deck_drop_in"], dropCase=d["case"],
                peakShoreLbf=v["shore_peak_lbf"], shoreCase=v["case"],
                peakSeatLbf=max(abs(r["Fz_lbf"]) for r in reactions),
                peakUpliftLbf=max(0, -min(r["Fz_lbf"] for r in reactions)),
                frameFloorShoreLbf=rows[0]["total_lbf"]-loads["panelAllowanceLbf"]-gear,
                totalAmplifiedLbf=rows[-1]["total_lbf"])
            print(json.dumps(result), flush=True)
            return result
        results = [case("baseline"), case("no-body-credit", k=0),
                   case("fine", refinement=5), case("8-people", people=8),
                   case("12-people", people=12), case("3x-live", alpha=3)]
    return dict(revision=recipe["revision"], surveyDate=recipe["surveyDate"],
        deckLengthIn=frame["deckLengthIn"], pairPitchIn=frame["pairPitchIn"],
        qualification=recipe["qualification"], assumptions=recipe["assumptions"],
        solver="Unmodified iteration-06 screen04.py from repository source archive",
        cases=results)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path,
        default=ROOT / "site/structural/survey-model/results.json")
    args = parser.parse_args()
    result = solve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
