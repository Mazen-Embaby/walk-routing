# Generates a 100-character base64-encoded secure password
openssl rand -base64 100 | cut -c1-100