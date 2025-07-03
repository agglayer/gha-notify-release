# Slack Release Notifier Action

A GitHub Action that sends beautiful release notifications to Slack using a bot
token with intelligent breaking change and configuration change detection.

## Features

- 🚀 Sends formatted release notifications to Slack
- ⚠️ **Smart breaking change detection** from release notes and conventional
  commits
- ⚙️ **Configuration change detection** for config files and diffs
- 📋 **Persistent releases list** - maintains a running list of all releases per
  channel
- 🎨 **Visual highlighting** with color-coded messages for different release
  types
- 📝 Supports custom messages
- 🔗 Includes release URLs
- ✨ Beautiful formatting with emojis and timestamps
- 🎯 Flexible channel targeting
- 🔧 Simple setup with Slack bot tokens

## Intelligent Detection

The action automatically analyzes release notes and detects different types of
changes:

### 🔍 Breaking Change Detection

1. **Conventional Commits**: Detects `!` markers (e.g., `feat!:`, `fix!:`)
2. **BREAKING CHANGE sections**: Finds explicit "BREAKING CHANGES" sections
3. **Keywords**: Identifies breaking change keywords like "removed",
   "deprecated", "incompatible"
4. **Major versions**: Detects major version bumps (e.g., v2.0.0, v3.0.0)

### ⚙️ Configuration Change Detection

1. **Config file links**: Detects markdown links to config files (`.json`,
   `.yaml`, `.env`, etc.)
2. **Configuration diffs**: Finds code blocks with config file changes
3. **Before/After sections**: Identifies configuration comparisons
4. **Config mentions**: Catches bullet points mentioning config updates

### 🧪 E2E Workflow Detection

1. **GitHub Actions workflows**: Detects links to e2e workflow runs and files
2. **Workflow status**: Determines if workflows passed or failed from context
3. **E2E workflow files**: Identifies e2e-related workflow file links

### 📋 Persistent Releases List

When enabled, the action maintains a single Canvas document per channel that
contains all releases:

- **Auto-updating**: Each new release updates the same Canvas
- **Smart formatting**: Visual indicators for breaking/config changes
- **Historical tracking**: Keeps last 50 releases with dates
- **Per-channel**: Separate Canvas for each Slack channel used
- **Rich formatting**: Beautiful structured markdown with statistics and legends
- **Easy access**: Canvas appears as a tab in the channel header

### �� Visual Indicators

- **Normal releases**: 🚀 Green sidebar, "New Release"
- **E2E workflow releases**: 🧪🚀 Cyan sidebar, "E2E WORKFLOW RELEASE"
- **Config updates**: ⚙️🚀 Yellow sidebar, "CONFIG UPDATE"
- **Breaking releases**: ⚠️🚀 Orange sidebar, "BREAKING RELEASE" (highest
  priority)

## Quick Start

Add this to your workflow to send release notifications:

```yaml
- name: Notify Slack
  uses: agglayer/gha-notify-release@v1
  with:
    slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
    release-version: ${{ github.event.release.tag_name }}
    release-url: ${{ github.event.release.html_url }}
    custom-message: '🎉 New release is now available!'
```

## Setup

### 1. Create a Slack App and Bot

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name your app (e.g., "Release Notifier") and select your workspace
4. Go to **"OAuth & Permissions"** in the sidebar
5. Scroll down to **"Scopes"** and add these Bot Token Scopes:
   - `chat:write` - Send messages
   - `chat:write.public` - Send messages to channels the app isn't in
   - `canvases:write` - Create and edit canvases (required for releases list
     feature)
6. Click **"Install to Workspace"** at the top
7. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)

### 2. Add the Bot to Channels

For each channel where you want notifications:

1. Go to the Slack channel
2. Type `/invite @YourBotName` (replace with your bot's name)
3. Or go to channel settings → Integrations → Add apps

### 3. Add the Bot Token to GitHub Secrets

1. In your GitHub repository, go to Settings → Secrets and variables → Actions
2. Click **"New repository secret"**
3. Name: `SLACK_BOT_TOKEN` (or use your own secret name)
4. Value: Your bot token from step 1 (starts with `xoxb-`)
5. Click **"Add secret"**

## Usage

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          release-version: ${{ github.event.release.tag_name }}
          slack-channel: 'releases' # or '#releases' or channel ID
          release-url: ${{ github.event.release.html_url }}
          custom-message: '🎉 Our latest release is now available!'
```

## Inputs

| Input                    | Description                                                    | Required | Default                   |
| ------------------------ | -------------------------------------------------------------- | -------- | ------------------------- |
| `release-version`        | The version of the release                                     | Yes      | `X.Y.Z`                   |
| `slack-bot-token`        | Slack Bot Token (starts with xoxb-)                            | Yes      | -                         |
| `slack-channel`          | Channel name (#releases), name (releases), or ID (C1234567890) | No       | `#feed_agglayer-notifier` |
| `release-url`            | URL to the release page                                        | No       | -                         |
| `custom-message`         | Custom message to include with the release notification        | No       | -                         |
| `maintain-releases-list` | Enable persistent releases list maintenance                    | No       | `true`                    |

## Outputs

| Output                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `notification-sent`     | Whether the notification was sent successfully (`true`/`false`) |
| `timestamp`             | ISO timestamp of when the notification was sent                 |
| `channel`               | The channel where the notification was sent                     |
| `releases-list-updated` | Whether the releases list was updated (if enabled)              |

## Channel Formats

You can specify the Slack channel in multiple ways:

- **Channel name**: `releases` or `general`
- **With hash**: `#releases` or `#general`
- **Channel ID**: `C1234567890` (useful for private channels)

## Example Notifications

### Normal Release

```
🚀 New Release: v1.2.3
📦 Repository: owner/repo

🎉 Bug fixes and improvements are here!

🔗 View Release

Released at 2024-01-15T10:30:00.000Z
```

### Config Update Release

```
⚙️🚀 CONFIG UPDATE: v1.3.0
📦 Repository: owner/repo

🎉 Updated configuration for new features!

⚙️ CONFIGURATION CHANGES

Configuration Files:
• config.json
• .env.example

Configuration Updates:
• Database configuration updated for better performance
• API timeout settings modified

📋 Review configuration changes before deploying!
🔗 View Release
```

### E2E Workflow Release

```
🧪🚀 E2E WORKFLOW RELEASE: v1.4.0
📦 Repository: owner/repo

🎉 Release with e2e workflow validation!

🧪 E2E WORKFLOWS DETECTED

🔄 E2E Tests Workflow (owner/repo)
✅ Status: Passed

📋 Integration Tests (owner/repo)
❌ Status: Failed

🔗 View Release
```

### Breaking Release (with Config)

```
⚠️🚀 BREAKING RELEASE: v2.0.0
📦 Repository: owner/repo

🎉 Major update with new features!

⚠️ BREAKING CHANGES DETECTED

Conventional Commit Breaking Changes:
• feat!: redesigned authentication system

Breaking Changes from Release Notes:
• Removed legacy /v1 endpoints

🔍 Please review the changes carefully before updating!

⚙️ CONFIGURATION CHANGES

Configuration Files:
• config.json
• settings.yaml

📋 Review configuration changes before deploying!
🔗 View Release
```

### Persistent Releases List (Canvas)

```markdown
# 📦 MyProject Releases

_Last updated: Mon, Jan 15, 2024, 10:30 AM PST_

---

## 🚀 Recent Releases

### ⚠️🚀 v2.0.0

**Jan 15, 2024** • ⚠️ _Breaking_ • ⚙️ _Config_

### ⚙️🚀 v1.3.0

**Jan 10, 2024** • ⚙️ _Config_

### 🚀 v1.2.3

**Jan 5, 2024**

---

### 📋 All Releases (15 total)

- ⚠️🚀 **v2.0.0** • Jan 15, 2024 • ⚠️ _Breaking_ • ⚙️ _Config_
- ⚙️🚀 **v1.3.0** • Jan 10, 2024 • ⚙️ _Config_
- 🚀 **v1.2.3** • Jan 5, 2024
- 🚀 **v1.2.2** • Dec 28, 2023

---

## 📊 Release Statistics

- **Total releases tracked:** 15
- **Breaking changes:** 2
- **Configuration updates:** 4
- **Normal releases:** 9

## 📖 Legend

- 🚀 **Normal Release** - Regular updates and improvements
- ⚠️🚀 **Breaking Changes** - May require code changes
- ⚙️🚀 **Config Updates** - Configuration files may need updates

---

_This canvas is automatically maintained by the release notification system._
```

## Breaking Change Examples

The action detects various patterns of breaking changes:

### Conventional Commits

```markdown
- feat!: redesign user authentication
- fix!: remove deprecated payment methods
- chore!: update dependencies with breaking changes
```

### Explicit Sections

```markdown
## BREAKING CHANGES

- Removed legacy API endpoints
- Changed response format
```

### Keywords

```markdown
- Removed support for Node.js < 16
- Deprecated old authentication system
- API change: updated all endpoints
- No longer supports Internet Explorer
```

## Advanced Usage

### Multiple Channels

```yaml
- name: Notify Multiple Channels
  strategy:
    matrix:
      channel: ['releases', 'general', 'engineering']
  uses: agglayer/gha-notify-release@v1
    with:
    release-version: ${{ github.event.release.tag_name }}
    slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack-channel: ${{ matrix.channel }}
```

### Conditional Notifications

```yaml
- name: Notify Slack (Production Only)
  if: startsWith(github.event.release.tag_name, 'v')
  uses: agglayer/gha-notify-release@v1
    with:
    slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
    release-version: ${{ github.event.release.tag_name }}
    slack-channel: 'releases'
```

## How It Works

### Breaking Change Analysis

The action automatically analyzes the release notes from the GitHub release
event using multiple detection methods:

1. **Regex patterns** for conventional commit markers (`!`)
2. **Section parsing** for explicit "BREAKING CHANGES" sections
3. **Keyword detection** for common breaking change terms
4. **Version analysis** for major version bumps

Results are formatted with appropriate visual indicators and detailed
breakdowns.

## Troubleshooting

### Bot Token Issues

- Make sure your token starts with `xoxb-`
- Verify the bot has `chat:write`, `chat:write.public`, and `canvases:write`
  permissions
- Check that the bot is installed in your workspace
- Ensure the `SLACK_BOT_TOKEN` secret is properly set in your repository

### Channel Issues

- Ensure the bot is added to private channels
- Use channel ID for private channels if channel name doesn't work
- Verify channel name spelling (case-sensitive)

### Permission Errors

- Add the bot to the target channel: `/invite @YourBotName`
- For public channels, `chat:write.public` scope allows posting without
  invitation

### Breaking Change Detection

- The action automatically uses the release body from the GitHub release event
- Use conventional commit format for best detection: `type!: description`
- Include explicit "BREAKING CHANGES" sections in release notes
- Check that keywords like "removed", "deprecated" are properly formatted

### Canvas Issues

- Ensure the bot has `canvases:write` permission in your Slack app settings
- Verify the bot is added to the target channel: `/invite @YourBotName`
- Check that `maintain-releases-list` is set to `true` (default since v1.1.0)
- Canvas creation may fail silently - check GitHub Actions logs for errors
- Ensure your Slack workspace supports Canvas features (newer feature)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

### Complete Workflow Examples

#### Basic Release Workflow

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack of Release
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          release-version: ${{ github.event.release.tag_name }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: |
            🎉 New ${{ github.repository }} release is available!

            **Repository:** ${{ github.repository }}
            **Actor:** ${{ github.actor }}
```

#### Advanced Multi-Channel Notification

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-release:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        notification:
          - channel: 'releases'
            message: '🚀 Production release deployed!'
          - channel: 'engineering'
            message: '👨‍💻 New version available for review'
          - channel: 'product'
            message: '📋 Release notes ready for documentation'
    steps:
      - name: Notify Slack Channel
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          release-version: ${{ github.event.release.tag_name }}
          slack-channel: ${{ matrix.notification.channel }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: ${{ matrix.notification.message }}
```

#### Conditional Breaking Change Alerts

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack of Release
        uses: agglayer/gha-notify-release@v1
        with:
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          release-version: ${{ github.event.release.tag_name }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: |
            ${{ startsWith(github.event.release.tag_name, 'v') && contains(github.event.release.body, 'BREAKING') && '🚨 **CRITICAL UPDATE** 🚨' || '✨ Regular update available' }}

            Release: ${{ github.event.release.tag_name }}
            Changelog: See release notes for details
```
