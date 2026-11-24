# Module 3 presentation demo

From the repository root in Windows PowerShell:

```powershell
$env:C3L_CONTENT_DEMO = '1'
$env:NODE_ENV = 'development'
bun run --no-env-file .\src\modules\03-content\demo.server.ts
```

- [Instructor Workspace](http://127.0.0.1:3103/03-content/manage)
- [Student Learning](http://127.0.0.1:3103/03-content/learn)

The demo simulates authentication, instructor permissions, and enrollment for `DEMO-101`. Any local client that can connect can use the simulated views. Demo modules, their publication and visibility settings, learning units, and material metadata persist in `.c3l-content-data/demo.sqlite`. Uploaded files persist in `.c3l-content-data/demo-uploads/`. The demo exposes instructor APIs for units and material metadata. The existing pages provide no unit editor or student download endpoint.

## Reset demo data

Stop the demo with **Ctrl+C** and wait for PowerShell to return to the prompt. Run the following from the repository root before starting the demo again. It moves the demo database, any SQLite sidecar files, and demo uploads into a fresh backup folder under the same Git-ignored data directory. The normal application uses `content.sqlite` and its own upload location.

```powershell
$data = (Resolve-Path -LiteralPath '.\src\modules\03-content\.c3l-content-data' -ErrorAction Stop).Path
$backup = Join-Path $data ('demo-reset-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
foreach ($name in @('demo.sqlite', 'demo.sqlite-journal', 'demo.sqlite-wal', 'demo.sqlite-shm', 'demo-uploads')) {
    $source = Join-Path $data $name
    if (Test-Path -LiteralPath $source) {
        Move-Item -LiteralPath $source -Destination $backup -ErrorAction Stop
    }
}
Write-Output "Demo backup: $backup"
```

The next start creates an empty demo database. The first upload creates a fresh upload directory. If the data directory does not exist, there is no demo data to reset.
