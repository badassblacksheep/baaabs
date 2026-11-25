"""Keep previously published asset URLs available in the Pages artifact."""
import json
import shutil
import sys
from pathlib import Path

def stage_aliases(output):
    mapping = Path(__file__).with_name("legacy-asset-urls.json")
    for old_url, canonical_url in json.loads(mapping.read_text()).items():
        source = output / canonical_url
        target = output / old_url
        if target.exists():
            raise FileExistsError(f"Legacy URL collides with staged content: {old_url}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)

if __name__ == "__main__":
    stage_aliases(Path(sys.argv[1]))
