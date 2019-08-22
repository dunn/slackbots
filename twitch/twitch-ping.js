const async = require('async')
const request = require('request')
const redis = require('redis').createClient()

const twitch_client = require('./config/secrets.json').twitch.client_id
const slack_token = require('./config/secrets.json').slack.token

const { WebClient } = require('@slack/web-api')
const web = new WebClient(slack_token)

redis.smembers('twitch:ids', (err, twitch_ids) => {
  if (err)
    return console.error(err)

  return async.map(twitch_ids, getStream, (err, results) => {
    if (err)
      return console.error(err)

    return async.each(results, saveStreamStatus, (err) => {
      if (err)
        return console.error(err)

      return redis.quit()
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

  return request(opts, (err, response, body) => {
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

function saveStreamStatus(stream, callback) {
  return updateStreamStatus(stream, (err, new_status) => {
    if (err)
      return callback(err)

    return redis.set(stream["id"], new_status, (err, result) => {
      if (err)
        return callback(err)

      console.log(`Set ${stream["id"]} to ${new_status}`)
      return callback(null)
    })
  })
}

function updateStreamStatus(stream, callback) {
  return redis.get(stream["id"], (err, last_status) => {
    if (err)
      return callback(err)

    const new_status = (stream["stream"] === null ? "0" : "1")

    // return if they're not streaming
    if (stream["stream"] === null)
      return callback(null, new_status)

    // return if they're still streaming
    if (stream["stream"] !== null && last_status === "1")
      return callback(null, new_status)

    const username = stream["stream"]["channel"]["display_name"].toLowerCase()
    const game = stream["stream"]["channel"]["game"].toLowerCase()
    const url = stream["stream"]["channel"]["url"]

    return web.channels.list((err, info) => {
      info.channels.filter(value => { return value.is_member }).forEach(value => {
        web.chat.postMessage(value.id, `btw ${username} just started streaming ${game} ${url}`)

        return callback(null, new_status)
      })
    })
  })
}
