#!/usr/bin/env bash

# Compress and Base64 encode the JSON to avoid all escaping issues
json_string=$(jq -c '.' ../airflow/config/GTFS_CATALOG.json | base64 -w 0)

echo "Base64 string length: ${#json_string}"
# Safely update .env using python
python3 -c '
import sys
import re

env_file = ".env"
try:
    with open(env_file, "r") as f:
        content = f.read()
except FileNotFoundError:
    content = ""

json_str = sys.stdin.read().strip()

if re.search(r"^GTFS_CATALOG=.*", content, re.MULTILINE):
    content = re.sub(r"^GTFS_CATALOG=.*", lambda m: f"GTFS_CATALOG=\"{json_str}\"", content, flags=re.MULTILINE)
else:
    if content and not content.endswith("\n"):
        content += "\n"
    content += f"GTFS_CATALOG=\"{json_str}\"\n"

with open(env_file, "w") as f:
    f.write(content)
' <<< "$json_string"

echo "Updated GTFS_CATALOG in .env successfully (Base64)!"