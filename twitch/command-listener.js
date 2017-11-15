const async = require('async')
const request = require('request')
const redis = require('redis').createClient()

const twitch_client = require('./config/secrets.json').twitch.client_id
const TOKEN = require('./config/secrets.json').slack.token
const rtm = new require('@slack/client').RtmClient(TOKEN)

rtm.start()

// @param [String] action Either 'add' or 'remove'
// @param [Array]
function editUsers(action, list) {
  const opts = {
    url: `https://api.twitch.tv/kraken/users?login=${list.join(',')}`,
    headers: {
      "Accept": "application/vnd.twitchtv.v5+json",
      "Client-ID": twitch_client
    }
  }

  request(opts, (err, response, body) => {
    if (err)
      return console.error(err);

    const ids = body["users"].map((value, index, array) => { return value["_id"] })
    const command = (action === "add" ? "sadd" : "srem")

    return async.each(
      // list of Twitch IDs corresponding to the users given
      ids,
      // Either add or remove them from the redis set
      function (user, callback) {
        redis[command]('twitch:ids', user, (err, result) => {
          if (err)
            return callback(err)

          return callback(null)
        })
      },
      // done
      (err) => {
        if (err)
          return console.error(err)

        return true
      })
  })
}
