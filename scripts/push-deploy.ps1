# Push to both remotes to trigger Vercel (frontend) and Render (backend)
# Vercel: https://github.com/shuruti-ke/rafiki-frontend (remote: vercel)
# Render: https://github.com/shuruti-ke/rafiki-at-work (remote: origin)

$branch = if ($args[0]) { $args[0] } else { "master" }

Write-Host "Pushing to origin (rafiki-at-work) -> Render backend..."
git push origin $branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing to vercel (rafiki-frontend) -> Vercel frontend..."
git push vercel $branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Both deployments should trigger."
