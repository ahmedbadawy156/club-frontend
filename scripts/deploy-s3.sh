#!/usr/bin/env bash
# Publish the site to the S3 bucket club-web on Floci.
#   npm run deploy        (or: bash scripts/deploy-s3.sh)
# Then open http://localhost:4566/club-web/index.html
#
# Uploads only the site files (HTML, CSS, JS) with the right content types;
# browsers refuse JavaScript modules served with the wrong type. The bucket is
# readable by anyone who can reach Floci, so it must never hold secrets; the
# site holds none (no keys, only API addresses).
# "no-cache" makes browsers check for a newer file on every load, so a new
# deploy shows up at once.
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PROFILE="${AWS_PROFILE:-floci}" AWS_PAGER="" MSYS_NO_PATHCONV=1
if command -v aws >/dev/null 2>&1; then AWS=aws
elif [ -x "/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then AWS="/c/Program Files/Amazon/AWSCLIV2/aws.exe"
else echo "AWS CLI not found." >&2; exit 1; fi

BUCKET=club-web
"$AWS" sts get-caller-identity >/dev/null 2>&1 || { echo "Floci is not reachable (start it from club-membership-service)." >&2; exit 1; }

echo "== 1/3 Generate shared/config.local.js from the Membership deployment"
node scripts/make-local-config.mjs

echo "== 2/3 Bucket $BUCKET"
"$AWS" s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 || "$AWS" s3 mb "s3://$BUCKET" >/dev/null

echo "== 3/3 Upload site files"
EXCLUDES=(--exclude "*" --exclude "node_modules/*" --exclude "scripts/*" --exclude ".git/*")
upload() { # PATTERN CONTENT_TYPE
  # sync removes files deleted from the repository; cp then uploads every file
  # again so each one gets the content type and "no-cache" header.
  "$AWS" s3 sync . "s3://$BUCKET" "${EXCLUDES[@]}" --include "$1" --exclude "node_modules/*" \
    --exclude "scripts/*" --content-type "$2" --cache-control "no-cache" --delete --only-show-errors
  "$AWS" s3 cp . "s3://$BUCKET" --recursive "${EXCLUDES[@]}" --include "$1" --exclude "node_modules/*" \
    --exclude "scripts/*" --content-type "$2" --cache-control "no-cache" --only-show-errors
}
upload "*.html" "text/html; charset=utf-8"
upload "*.css"  "text/css; charset=utf-8"
upload "*.js"   "text/javascript; charset=utf-8"

echo
"$AWS" s3 ls "s3://$BUCKET" --recursive | awk '{print "   " $4}'
echo
echo "Site: http://localhost:4566/$BUCKET/index.html"
