const cheerio = require('cheerio')
const mtg = require('mtg-json')
const request = require('request')

const RtmClient = require('@slack/client').RtmClient
const TOKEN = process.env.SLACK_TOKEN

const blacklist = [
  'Our Market Research Shows That Players Like Really Long Card Names So We Made this Card to Have the Absolute Longest Card Name Ever Elemental'
]

const random = {
  integer: function(min,max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  },
  index: function(arr) {
    var index = Math.floor(arr.length*Math.random())
    return arr[index]
  }
}

// functions for rendering the card attributes in the mtgapi object
const attributes = {
  colors: function(card) {
    return (card.colors ? card.colors.join("-") : "colorless")
  },
  power: function(card) {
    return card.power
  },
  toughness: function(card) {
    return card.toughness
  },
  supertypes: function(card) {
    if (card.supertypes)
      return card.supertypes.join(" ")
    else return false
  },
  types: function(card) {
    return card.types.join(" ")
  },
  subtypes: function(card) {
    if (card.subtypes)
      return card.subtypes.join(" ")
    else return false
  },
  set: function(card) {
    return "from " + card.printings[0]
  },
  manaCost: function(card) {
    return "costing " + card.manaCost
  },
  text: function(card) {
    if (card.text && card.text.replace(/\s*/g,""))
      return "that reads: “" + card.text + "”"
    else return false
  },
  flavor: function(card) {
    if (card.flavor && card.flavor.replace(/\s*/g,""))
      return "whose flavor text is “" + card.flavor + "”"
    else return false
  }
}

function ngrams(array, n) {
// Adapted from Natural
// (https://github.com/NaturalNode/natural/blob/master/lib/natural/ngrams/ngrams.js#L45):
// copyright (c) 2011, Rob Ellis, Chris Umbel
  var result = []
  const count = array.length - n + 1

  for (var i = 0; i < count; i++)
    result.push(array.slice(i, i + n))

  return result
}

function info(pick, callback) {
  // '+l%3Aen' specifies English-language results
  const query = `http://magiccards.info/query?q=${pick}+l%3Aen&v=card&s=cname`

  const reqOpts = {
    url: query,
    headers: {
      'User-Agent': 'SLACK DOT COM OH HELL'
    }
  }

  // run an search on magiccards.info and pluck a random result
  request(reqOpts, (err, response, body) => {
    if (err)
      return callback(err)

    if (body.match("Your query did not match any cards."))
      return callback(new Error('No results for ' + pick))

    const $ = cheerio.load(body)
    // the first centered table is not part of the search results
    const results = $('table[align=center]')

    var mtgName, href, isBlacklisted

    const randomPick = random.integer(1, results.length - 1)
    const selection = results.eq(randomPick).children().first().children().eq(1).children().first() // lol

    console.log(`selection: ${selection}`)

    // remove whitespace and linebreaks
    mtgName = selection.text().replace(/\\\\n/g,"")
    mtgName = mtgName.trim()

    href = selection.children().first().attr('href')

    isBlacklisted = blacklist.some((value, index, array) => {
      return value === mtgName
    })

    if (mtgName && href && !isBlacklisted)
      return callback(null,{name: mtgName, href: href})
    else
      return callback(new Error('Bad response for query: ' + pick))
  })
}

const rtm = new RtmClient(TOKEN)
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload if you want to cache it
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  console.log('[hacker voice] im in')
})

rtm.start()

//////// needs to persist across message events
const currentCard = {}

rtm.on('message', (message) => {
  if (!(message.type === 'message' && message.text))
    return;

  console.log(message);

  // keep a separate record for each channel the bot is in
  if (!currentCard[message.channel])
    currentCard[message.channel] = {}

  if (currentCard[message.channel].time) {
    const diff = Date.now() - currentCard[message.channel].time
    // if five minutes have elapsed and the card name hasn't been
    // guessed, reset
    if (diff > 300000)
      currentCard[message.channel] = {}
  }

  // if we're waiting for someone to guess the right answer
  if (currentCard[message.channel].name) {
    currentCard[message.channel].name = currentCard[message.channel].name.toLowerCase()
    const answer = message.text.toLowerCase().indexOf(currentCard[message.channel].name)
    if (answer > -1) {
      rtm.sendMessage(`HELL YEAH OH YEAH ${currentCard[message.channel].url}`, message.channel)
      currentCard[message.channel] = {}
    }
  }

  // if we're not waiting for someone to guess the right answer
  else {
    const tokens = message.text.split(" ")

    let pick
    if (tokens.length > 1) {
      const bigrams = ngrams(tokens,2)
      pick = random.index(bigrams).join(" ")
    }
    else {
      pick = message.text
    }

    console.log(`searching for ${pick}`)

    // card is { name, href }
    info(pick.replace(/\ /, '+'), (err, response) => {
      if (err)
        return err

      const path = response.href.replace(/html/,"jpg")
            .replace(/^\/([^\/]*)\/([^\/]*)/,"$2/$1")
      const img = 'http://magiccards.info/scans/' + path

      mtg('cards', __dirname, { extras: true }).then(json => {
        const card = json[response.name]

        const util = require('util')
        console.log(util.inspect(card))

        // don't even bother if the card name is in the card text
        if (card.text && card.text.indexOf(card.name) >= 0) {
          console.log('The card name is in the text, forget it.')
          return
        }

        currentCard[message.channel].name = card.name
        currentCard[message.channel].url = img
        currentCard[message.channel].time = Date.now()

        const introductions = [
          "hey did i just hear someone mention the",
          "oh cool are we talking about the",
          "glad i'm not the only one thinking about the",
          "haha nice that reminds me of the"
        ]

        let reply = `${random.index(introductions)} ${attributes.colors(card)} `

        if (card.power && card.toughness && random.integer(0,1) === 1) {
          var pt = [
            attributes.power(card),
            attributes.toughness(card)
          ].join("/")
          reply += `${pt} `
        }

        var supType = attributes.supertypes(card)
        if (supType && random.integer(0,1) === 1) {
          reply += `${supType} `
        }

        var subType = attributes.subtypes(card)
        if (subType && random.integer(0,1) === 1) {
          reply += `${subType} `
        }

        reply += `${attributes.types(card)} `

        var misc2 = [
          attributes.set(card),
          attributes.manaCost(card)
        ]
        reply += `${random.index(misc2)} `

        var text = attributes.text(card)
        if (text)
          reply += `${text} `

        // var flavor = attributes.flavor(card)
        // if (flavor && random.integer(0,2) === 1) {
        //   reply += flavor
        // }

        console.log(`${reply} (${card.name})`)
        return rtm.sendMessage(reply, message.channel)
      })
    })
  }
})
