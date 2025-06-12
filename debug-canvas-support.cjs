/**
 * Debug script to test Channel Canvas support
 * Run with: node debug-canvas-support.js
 */

const { WebClient } = require('@slack/web-api')

async function testChannelCanvasSupport() {
  // You'll need to set these
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'xoxb-your-token-here'
  const CHANNEL_ID = process.env.CHANNEL_ID || 'C090TACJ9KN' // Your channel ID

  const client = new WebClient(SLACK_BOT_TOKEN)

  console.log('🔍 Testing Channel Canvas Support...\n')

  try {
    // 1. Check channel info
    console.log('📋 Step 1: Checking channel information...')
    const channelInfo = await client.conversations.info({
      channel: CHANNEL_ID,
      include_num_members: true
    })

    if (!channelInfo.ok) {
      console.error(`❌ Failed to get channel info: ${channelInfo.error}`)
      return
    }

    const channel = channelInfo.channel
    console.log(`✅ Channel Info:`)
    console.log(`   - Name: ${channel.name}`)
    console.log(
      `   - Type: ${channel.is_channel ? 'Public Channel' : channel.is_group ? 'Private Channel' : 'Other'}`
    )
    console.log(`   - Is Member: ${channel.is_member}`)
    console.log(`   - Is Archived: ${channel.is_archived}`)
    console.log(
      `   - Existing Channel Canvas: ${channel.properties?.canvas?.file_id || 'None'}\n`
    )

    // 2. Test Channel Canvas creation with minimal content
    console.log('🎨 Step 2: Testing Channel Canvas creation...')

    try {
      const result = await client.conversations.canvases.create({
        channel_id: CHANNEL_ID,
        document_content: {
          type: 'markdown',
          markdown:
            '# Test Canvas\n\nThis is a test channel canvas created by debug script.'
        }
      })

      if (result.ok) {
        console.log(`✅ SUCCESS! Channel Canvas created: ${result.canvas_id}`)
        console.log(`📋 Your channel DOES support Channel Canvases!`)

        // Clean up - delete the test canvas
        try {
          await client.canvases.delete({ canvas_id: result.canvas_id })
          console.log(`🧹 Test canvas cleaned up.`)
        } catch (cleanupError) {
          console.log(
            `⚠️ Couldn't clean up test canvas: ${cleanupError.data?.error}`
          )
        }
      } else {
        console.log(`❌ Channel Canvas creation failed: ${result.error}`)
        analyzeError(result.error)
      }
    } catch (error) {
      console.log(
        `❌ Channel Canvas creation failed: ${error.data?.error || error.message}`
      )
      analyzeError(error.data?.error || error.message)
    }
  } catch (error) {
    console.error(`❌ Script failed: ${error.message}`)
  }
}

function analyzeError(errorCode) {
  console.log(`\n🔍 Error Analysis for: ${errorCode}\n`)

  switch (errorCode) {
    case 'canvas_creation_failed':
      console.log(`📝 Possible causes:`)
      console.log(`   1. Workspace doesn't support Channel Canvases`)
      console.log(`   2. Channel type incompatible with Channel Canvases`)
      console.log(`   3. Free tier limitations`)
      console.log(`   4. Admin disabled Channel Canvas features`)
      break

    case 'canvas_disabled_user_team':
      console.log(`📝 Canvas features are disabled in your workspace.`)
      console.log(`   Contact workspace admin to enable Canvas features.`)
      break

    case 'team_tier_cannot_create_channel_canvases':
      console.log(`📝 Your workspace tier doesn't support Channel Canvases.`)
      console.log(`   Note: You can still create standalone canvases!`)
      break

    case 'channel_canvas_already_exists':
      console.log(`📝 A Channel Canvas already exists for this channel.`)
      console.log(`   Check for a 'Canvas' tab in the channel header.`)
      break

    case 'not_in_channel':
      console.log(`📝 Bot is not a member of the channel.`)
      console.log(`   Add bot to channel: /invite @YourBotName`)
      break

    case 'missing_scope':
      console.log(`📝 Missing required permission 'canvases:write'.`)
      break

    default:
      console.log(`📝 Unknown error. This might indicate:`)
      console.log(`   1. Workspace-specific restrictions`)
      console.log(`   2. Channel Canvas feature not available`)
      console.log(`   3. API limitations`)
  }

  console.log(
    `\n💡 Alternative: The action could use standalone canvases instead!`
  )
}

// Run the test
testChannelCanvasSupport().catch(console.error)
