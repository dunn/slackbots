const express = require('express')
const app = express()

// http://expressjs.com/en/4x/api.html#req.body
const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/watch', watchUsers)
app.post('/unwatch', unwatchUsers)

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
});

const editUsers = require('./lib/edit_users.js')

function watchUsers(req, res) {
  const util = require('util')
  console.log(util.inspect(req))

  const users = req.body.text.split(' ')
  editUsers('add', users)
}

function unwatchUsers(req, res) {
  const users = req.body.text.split(' ')
  editUsers('remove', users)
}
