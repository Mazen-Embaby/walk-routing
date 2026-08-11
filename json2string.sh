#!/usr/bin/env bash

# Minify/compact JSON into a single line
json_string=$(jq -c '.' ../airflow/config/GTFS_CATALOG.json)

echo "$json_string"
# Output: {"name":"Alice","age":30,"active":true}
# Safely update .env using python (escapes single quotes for bash sourcing)
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
# Escape backslashes first, then escape double quotes, then escape $ for dotenv-expand safe double-quoting
escaped_json = json_str.replace("\\", "\\\\").replace("\"", "\\\"").replace("$", "\\$")

if re.search(r"^GTFS_CATALOG=.*", content, re.MULTILINE):
    content = re.sub(r"^GTFS_CATALOG=.*", lambda m: f"GTFS_CATALOG=\"{escaped_json}\"", content, flags=re.MULTILINE)
else:
    if content and not content.endswith("\n"):
        content += "\n"
    content += f"GTFS_CATALOG=\"{escaped_json}\"\n"

with open(env_file, "w") as f:
    f.write(content)
' <<< "$json_string"

echo "Updated GTFS_CATALOG in .env successfully!"