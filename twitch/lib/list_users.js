const async = require('async')
const request = require('request')
const redis = require('redis').createClient()

const secrets = require('../config/secrets.json')

module.exports = function (callback) {
  redis.smembers('twitch:ids', (err, list) => {

    async.map(list, getUserName, (err, names) => {
      if (err)
        return callback(err)

      return callback(null, names)
    })
  })
}

function getUserName(id, callback) {
  const opts = {
    url: `https://api.twitch.tv/kraken/users/${id}`,
    headers: {
      "Accept": "application/vnd.twitchtv.v5+json",
      "Client-ID": secrets.twitch.client_id
    }
  }

  request(opts, (err, response, body) => {
    if (err)
      return callback(err);

    return callback(null, JSON.parse(body)["display_name"])
  })
}
