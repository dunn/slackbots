const async = require('async')
const request = require('request')
const redis = require('redis').createClient()

const twitch_client = require('./config/secrets.json').twitch.client_id
const slack_token = require('./config/secrets.json').slack.token
const rtm = new(require('@slack/client').RtmClient)(slack_token)
const web = new(require('@slack/client').WebClient)(slack_token)

rtm.start()

redis.smembers('twitch:ids', (err, twitch_ids) => {
  if (err)
    return console.error(err)

  async.map(twitch_ids, getStream, (err, results) => {
    if (err)
      return console.error(err)

    async.each(results, updateStreamStatus, (err) => {
    })
  })
})

function getStream(id, callback) {
  const opts = {
    url: `https://api.twitch.tv/kraken/streams/${id}`,
    headers: {
      "Accept": "application/vnd.twitchtv.v5+json",
      "Client-ID": twitch_client
    }
  }

  request(opts, (err, response, body) => {
    if (err)
      return callback(err)

    return callback(
      null,
      {
        id: id,
        stream: JSON.parse(body)["stream"]
      }
    )
  })
}

function updateStreamStatus(stream, callback) {
  redis.get(stream["id"], (err, last_status) => {
    if (err)
      return callback(err)

    const posting_channels = web.channels.list((err, info) => {
      info.channels.filter(value => { return value.is_member })
        .map(value => { return value.id })
    })

    // do nothing if they aren't streaming
    if (stream["stream"] === null)
      return callback(null)

    // do nothing if they're still streaming
    if (stream["stream"] !== null && last_status === "1")
      return callback(null)

    const username = stream["channel"]["display_name"].toLowerCase()
    const game = stream["channel"]["game"].toLowerCase()
    const url = stream["channel"]["url"]

    return posting_channels.forEach(value => {
      rtm.sendMessage(`${username} just started streaming ${game}: ${url}`, value)
    })
  })
}
