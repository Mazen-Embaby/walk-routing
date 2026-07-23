# Minify/compact JSON into a single line
json_string=$(jq -c '.' GTFS_CATALOG.json)

echo "$json_string"
# Output: {"name":"Alice","age":30,"active":true}