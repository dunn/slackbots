const async = require('async')
const request = require('request')
const redis = require('redis').createClient()

const secrets = require('../config/secrets.json')

// @param [String] action Either 'add' or 'remove'
// @param [Array]
module.exports = function (action, list) {
  const opts = {
    url: `https://api.twitch.tv/kraken/users?login=${list.join(',')}`,
    headers: {
      "Accept": "application/vnd.twitchtv.v5+json",
      "Client-ID": secrets.twitch.client_id
    }
  }

  request(opts, (err, response, body) => {
    if (err)
      return console.error(err);

    const ids = JSON.parse(body)["users"].map((value, index, array) => { return value["_id"] })
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
