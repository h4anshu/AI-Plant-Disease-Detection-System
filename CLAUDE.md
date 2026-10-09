# Project rules for Claude Code

## Background servers and tasks
- Whenever you start a server, preview, watcher or any other background task (preview_start, `run_in_background`,
  `setsid nohup`, Docker containers, WSL jobs), stop it as soon as the work that needed it is done, before
  ending your turn: `preview_stop` for previews, stop/kill background shells and tasks, `docker stop`/`docker rm`
  for containers you started, and remove temporary images you built only for a check.
- Leave nothing running that the user did not ask to keep running. If something must keep running (a long
  training job, a server the user wants to use), say so explicitly in your reply, with how to stop it.
- Also clean up temporary files created for a check (for example `client/public/__e2e`).
