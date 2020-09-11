(async () => {
  require('dotenv').config()

  const got = require('got')
  const redis = require('redis').createClient({
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
  })

  const { WebClient } = require('@slack/web-api')
  const web = new WebClient(process.env.SLACK_TOKEN)

  const twitch_client = process.env.TWITCH_CLIENT
  const twitch_token = process.env.TWITCH_TOKEN
  const twitch_users = process.env.TWITCH_USERS.split(',')
  const twitch_api_headers = {
    headers: {
      "Client-ID": twitch_client,
      "Authorization": `Bearer ${twitch_token}`,
    },
  }

  async function getUserId(user) {
    let user_res
    try {
      user_res = await got(`https://api.twitch.tv/helix/users?login=${user}`,
                           twitch_api_headers)
    } catch (err) {
      throw new Error(err.response.body)
    }

    return JSON.parse(user_res.body).data[0].id
  }

  async function getStream(user_id) {
    let stream_res
    try {
      stream_res = await got(`https://api.twitch.tv/helix/streams?user_id=${user_id}`,
                             twitch_api_headers)
    } catch (err) {
      throw new Error(err.response.body)
    }

    const stream = JSON.parse(stream_res.body)

    if (stream.data.length < 1) {
      return {
        user_id: user_id,
        live: false,
      }
    }

    const game_id = stream.data[0].game_id

    let game_res
    try {
      game_res = await got(`https://api.twitch.tv/helix/games?id=${game_id}`,
                           twitch_api_headers)
    } catch (err) {
      throw new Error(err.response.body)
    }

    const game = JSON.parse(game_res.body).data[0].name

    return {
      game: game,
      live: true,
      title: stream.data[0].title,
      user: stream.data[0].user_name,
      user_id: user_id,
    }
  }

  function saveStreamStatus(stream, callback) {
    return updateStreamStatus(stream, (err, new_status) => {
      if (err)
        return callback(err)

      return redis.set(stream.user_id, new_status, (err, result) => {
        if (err)
          return callback(err)

        console.log(`Set ${stream.user_id} to ${new_status}`)
        return callback(null)
      })
    })
  }

  async function updateStreamStatus(stream, callback) {
    return redis.get(stream.user_id, async (err, last_status) => {
      if (err)
        return callback(err)

      const new_status = (stream.live ? "1" : "0")

      // return if they're not streaming
      if (!stream.live) {
        console.log(`${stream.user_id} is offline`)
        return callback(null, new_status)
      }

      // return if they're still streaming
      if (stream.live && last_status === "1") {
        console.log(`${stream.user_id} (${stream.user}) is still goin'`)
        return callback(null, new_status)
      }

      // console.dir(stream)
      const username = stream.user.toLowerCase()
      const game = stream.game.toLowerCase()

      const info = await web.conversations.list()
      const joined = info.channels.filter(value => { return value.is_member })

      for (const ch of joined) {
        await web.chat.postMessage({
          channel: ch.id,
          text: `btw ${username} just started streaming ${game} https://twitch.tv/${username}`,
        })
      }
      return callback(null, new_status)
    })
  }

  let stream, id
  for (const user of twitch_users) {
    console.log(user)
    id = await getUserId(user)

    try {
      stream = await getStream(id)
    } catch (error) {
      console.error(error)
      continue
    }

    console.dir(stream)

    saveStreamStatus(stream, (rerr) => {
      if (rerr)
        return console.error(rerr)

      // lol
      if (twitch_users.indexOf(user) === twitch_users.length - 1) {
        return redis.quit()
      } else {
        return true
      }
    })
  }
})()
