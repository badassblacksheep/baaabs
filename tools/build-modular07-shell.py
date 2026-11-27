"""Project the current workshop datum and DJ trim into the Rev 07 viewer."""
import argparse
import json
from pathlib import Path

import numpy as np

from dj_booth import APERTURE, fitted_rim
from survey_fit import LongitudinalFit

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "site/structural/modular-07"


def projection():
    design = json.loads((DIR / "design.json").read_text())
    panels = json.loads((DIR / design["inputs"]["panels"]).resolve().read_text())
    frame, = [item for item in panels["special_items"] if item["component"] == "dj_rim"]
    fit = LongitudinalFit()
    return {
        "datum": "Surveyed front bumper in workshop coordinates. Subtract this x from installed vertices once.",
        "frontBumperWorldXM": float(fit.target[0]),
        "surveyDate": fit.date,
        "frameId": frame["id"],
        "rimFacesWorldM": [np.round(face, 8).tolist() for face in fitted_rim(panels["pieces"])],
        "apertureWorldXZM": APERTURE.tolist(),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = DIR / "shell-data.json"
    data = projection()
    if args.check:
        old = json.loads(target.read_text())
        faces = old.pop("rimFacesWorldM")
        expected = data.pop("rimFacesWorldM")
        if (old != data or len(faces) != len(expected)
                or any(not np.allclose(a, b, rtol=0, atol=1e-7) for a, b in zip(faces, expected))):
            raise SystemExit("Regenerate shell-data.json with tools/build-modular07-shell.py")
    else:
        target.write_text(json.dumps(data, indent=2) + "\n")
