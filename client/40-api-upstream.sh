#!/bin/sh
# Runs before nginx starts (official nginx image executes /docker-entrypoint.d/*).
# Substitutes the API origin and the listen port into the server config so the
# same image works for docker-compose and for a PaaS that injects its own PORT.
conf=/etc/nginx/conf.d/default.conf

sed -i "s|__API_UPSTREAM__|${API_UPSTREAM:-http://api:5000}|g" "$conf"
sed -i "s|__PORT__|${PORT:-80}|g" "$conf"
