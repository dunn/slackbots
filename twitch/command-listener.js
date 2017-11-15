const editUsers = require('./lib/edit_users.js')
const listUsers = require('./lib/list_users.js')
const request = require('request')

const express = require('express')
const app = express()
// http://expressjs.com/en/4x/api.html#req.body
const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/unwatch', unwatchUsers)
app.post('/watchlist', watchList)
app.post('/watch', watchUsers)

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
});

function watchUsers(req, res) {
  // const util = require('util')
  // console.log(util.inspect(req))

  const users = req.body.text.split(' ')
  editUsers('add', users, (err) => {
    if (err) {
      console.error(err)
      res.status(500)
      return res.end()
    }

    const reply = {
      url: req.body["response_url"],
      method: 'POST',
      json: {
        "response_type": "in_channel",
        "text": `Added ${users.join(', ')} to the watch list.`
      }
    }

    return request(reply, (err, response, body) => {
      if (err)
        return console.error(err)

      console.log('Successfully updated watch list.')
      return res.end()
    })
  })
}

function unwatchUsers(req, res) {
  const users = req.body.text.split(' ')
  editUsers('remove', users, (err) => {
    if (err) {
      console.error(err)
      res.status(500)
      return res.end()
    }

    const reply = {
      url: req.body["response_url"],
      method: 'POST',
      json: {
        "response_type": "in_channel",
        "text": `Removed ${users.join(', ')} from the watch list.`
      }
    }

    return request(reply, (err, response, body) => {
      if (err)
        return console.error(err)

      console.log('Successfully updated watch list.')
      return res.end()
    })
  })
}

function watchList(req, res) {
  listUsers((err, result) => {
    if (err) {
      console.error(err)
      res.status(500)
      return res.end()
    }

    const reply = {
      url: req.body["response_url"],
      method: 'POST',
      json: {
        "text": `Watching these streamers:\n${result.map(value => { return `- ${value}` }).join('\n')}`
      }
    }

    return request(reply, (err, response, body) => {
      if (err) {
        console.error(err)
        res.status(500)
        return res.end()
      }

      return res.end()
    })
  })
}
