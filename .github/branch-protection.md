# Branch protection guidance for `main`

Recommended minimal settings to secure `main`:

- Require pull request reviews before merging (1-2 reviewers).
- Require status checks to pass: at minimum `build-and-test` and `e2e-tests`.
- Require linear history or disallow force pushes.
- Enforce branch protection for administrators.
- (Optional) Require signed commits and code owners approvals.

Example `gh` API / CLI commands (replace `{owner}` and `{repo}`):

1. Protect branch via the REST API (curl):

```bash
curl -X PUT -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/{owner}/{repo}/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["build-and-test","e2e-tests"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": false,
      "required_approving_review_count": 1
    },
    "restrictions": null
  }'
```

2. Using `gh` CLI (must be authenticated and have admin repo rights):

```bash
# Example: require checks and reviews (adjust contexts to your workflow names)
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  -f required_status_checks.contexts='["build-and-test","e2e-tests"]' \
  -f enforce_admins=true \
  -f required_pull_request_reviews.required_approving_review_count=1
```

Notes:

- Generating a GitHub token with `repo` and `admin:repo_hook` scopes is required for the curl example.
- `CODEOWNERS` entries will automatically require approval from listed owners when "Require review from Code Owners" is enabled in protection settings.
