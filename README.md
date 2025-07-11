# GitHub Release Slack Notifier

A GitHub Action to automatically send intelligent Slack notifications when new releases are published. The action detects breaking changes, configuration updates, and E2E test workflows to provide rich, contextual release notifications.

## Features

- 🚀 **Intelligent Release Detection**: Automatically identifies breaking changes, configuration updates, and E2E workflows
- ⚠️ **Breaking Changes**: Detects and highlights potentially breaking changes
- ⚙️ **Configuration Changes**: Identifies when configuration files are modified
- 🧪 **E2E Testing**: Detects and reports on end-to-end testing workflows
- 📢 **Rich Slack Messages**: Color-coded messages with appropriate emoji and formatting
- 🔧 **Customizable**: Add custom messages and configure for any repository

## 🚀 Instant Setup (Recommended)

**Want to try it immediately?** We've prepared a Slack bot token for instant testing!

```yaml
name: Release Notification
on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE }}
```

Just add `SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE` as a repository secret with the prepared token value (available in the agglayer GitHub org), and you're ready to go! No Slack app setup required.

## Quick Start

### 1. Create a Slack App

1. Go to [Slack API](https://api.slack.com/apps)
2. Create a new app
3. Add the following **OAuth scopes** under "OAuth & Permissions":
   - `chat:write` - Send messages to channels
   - `chat:write.public` - Send messages to public channels the app isn't in

### 2. Install the App

1. Install the app to your workspace
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
3. Add the token as a secret in your GitHub repository (`SLACK_BOT_TOKEN`)

### 3. Add to Your Workflow

```yaml
name: Release Notification
on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack-channel: releases  # Optional: specify channel name or ID
          custom-message: "🎉 New release available!"  # Optional: add custom message
          # release-version, release-url, release-body are auto-detected from release event
```

> **That's it!** The action will automatically detect the release information from the GitHub event and send an intelligent notification to your specified channel.

## Configuration

### Required Inputs

| Input | Description | Example |
|-------|-------------|---------|
| `slack-bot-token` | Slack bot token (xoxb-...) | `${{ secrets.SLACK_BOT_TOKEN }}` |

### Optional Inputs

| Input | Description | Default | Example |
|-------|-------------|---------|---------|
| `slack-channel` | Slack channel ID or name | `C090TACJ9KN` | `releases` or `C1234567890` |
| `release-version` | Release version/tag | Auto-detected from release event | `v1.2.3` |
| `release-url` | URL to release page | Auto-detected from release event | `https://github.com/owner/repo/releases/tag/v1.2.3` |
| `release-body` | Release notes content | Auto-detected from release event | Release notes markdown |
| `custom-message` | Custom message to include | None | `🎉 New release available!` |
| `repository-name` | Repository name | Auto-detected from context | `owner/repo` |

> **Note**: When triggered by a `release` event, all release information is automatically extracted from the GitHub context. You only need to provide inputs if you want to override the defaults or use the action outside of release events.

## Slack Message Examples

### Normal Release

```
🚀 New Release: `owner/repo` v1.2.3

🎉 Bug fixes and improvements!

🔗 View Release
```

### Breaking Release

```
⚠️🚀 BREAKING RELEASE: `owner/repo` v2.0.0

🎉 Major update with new features!

⚠️ BREAKING CHANGES DETECTED

• Removed legacy endpoints
• Changed API response format

🔗 View Release
```

### Configuration Update

```
⚙️🚀 CONFIG UPDATE: `owner/repo` v1.4.0

🎉 Configuration improvements!

⚙️ CONFIGURATION CHANGES

Configuration Files:
• config.json
• settings.yaml

Configuration Updates:
• Database timeout increased to 60s
• Added new API endpoints configuration

🔗 View Release
```

### E2E Testing

```
🧪🚀 E2E WORKFLOW RELEASE: `owner/repo` v1.4.0

🎉 Release with e2e workflow validation!

🧪 E2E WORKFLOWS DETECTED

🔄 E2E Tests Workflow (owner/repo)
✅ Status: Passed

📋 Integration Tests (owner/repo)
❌ Status: Failed

🔗 View Release
```

## Breaking Change Detection

The action automatically detects breaking changes using multiple patterns:

### Conventional Commits
```
- feat!: redesign user authentication
- fix!: remove deprecated endpoints
```

### Dedicated Sections
```markdown
## ⚠️ Breaking Changes
- Removed legacy /v1 API endpoints
- Changed response format for all user endpoints
```

### Keywords
- "removed", "incompatible"
- "major change", "api change"
- "no longer supports"

## Configuration Change Detection

### Dedicated Sections
```markdown
## 📋 Configuration Updates
- Database timeout increased to 60s
- Added new Redis configuration
```

### File Links
```markdown
See the updated [config.json](https://github.com/owner/repo/blob/main/config.json)
```

### Code Blocks
Configuration changes in diff format are automatically detected.

## E2E Testing Detection

### Dedicated Sections
```markdown
## ✅ Testing & Validation
- All E2E tests passing
- Integration tests updated
```

### Workflow Links
Direct links to GitHub Actions workflows are detected and displayed with status.

## Troubleshooting

### Common Issues

**Permission Errors:**
- Verify the bot has `chat:write` and `chat:write.public` permissions
- Ensure the bot is added to the target channel (or use `chat:write.public` for public channels)

**Channel Not Found:**
- Use channel ID (e.g., `C1234567890`) instead of name
- Verify the bot has access to the channel

**No Notifications:**
- Check that the action is triggered on `release: published` events
- Verify the `slack-bot-token` secret is correctly set

### Debug Mode

Enable debug logging by setting the `ACTIONS_STEP_DEBUG` secret to `true` in your repository settings.

## License

MIT
