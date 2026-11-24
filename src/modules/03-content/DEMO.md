# Module 3 presentation demo

From the repository root in Windows PowerShell:

```powershell
$env:C3L_CONTENT_DEMO = '1'
$env:NODE_ENV = 'development'
bun run --no-env-file .\src\modules\03-content\demo.server.ts
```

- [Demo sign-in](http://127.0.0.1:3103/03-content/login)
- [Course dashboard](http://127.0.0.1:3103/03-content)
- [Instructor Workspace](http://127.0.0.1:3103/03-content/manage?courseId=DEMO-101)
- [Student Learning](http://127.0.0.1:3103/03-content/learn?courseId=DEMO-101)

The accounts, authentication, assignment, and enrollment are simulated and apply only to the localhost presentation server.

| Username | Password | Course access |
| --- | --- | --- |
| `instructor` | `C3L-Demo-101` | Manage `DEMO-101` |
| `student` | `C3L-Demo-101` | Study `DEMO-101` |
| `unenrolled` | `C3L-Demo-101` | Empty dashboard and denied course APIs |

After signing in, select the assigned or enrolled course from the dashboard. Use **Sign out** to switch accounts. Sessions last up to four hours and end when the demo server restarts.

Modules, their publication and visibility settings, units, and material metadata persist in `.c3l-content-data/demo.sqlite`. Uploaded files persist in `.c3l-content-data/demo-uploads/`. The student APIs return units and public material metadata for published, visible modules. Unit management and resource browsing are currently API-only, and the demo has no student download endpoint.

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
