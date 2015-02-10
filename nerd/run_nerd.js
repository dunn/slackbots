#!/usr/bin/env node

var request = require('request');
var cheerio = require('cheerio');
var Slack = require('slack-client');

var token = require('./secrets.js').slack,
    autoReconnect = true,
    autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);

var random = {
  integer: function(min,max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  index: function(arr){
    var index = Math.floor(arr.length*Math.random());
    return arr[index];
  }
};

// functions for rendering the card attributes in the mtgapi object
var attributes = {
  rarity: function(card){
    return card.rarity;
  },
  colors: function(card){
    return (card.colors ? card.colors.join("-") : "colorless");
  },
  power: function(card){
    return (card.power ? card.power : false);
  },
  toughness: function(card){
    return (card.toughness ? card.toughness : false);
  },
  supertypes: function(card){
    if (card.supertypes) {
      return card.supertypes.join(" ");
    }
    else return false;
  },
  types: function(card){
    return card.types.join(" ");
  },
  subtypes: function(card){
    if (card.subtypes) {
      return card.subtypes.join(" ");
    }
    else return false;
  },
  set: function(card){
    return "from " + card.printings[0];
  },
  manaCost: function(card){
    return "costing " + card.manaCost;
  },
  text: function(card){
    if (card.text && card.text.replace(/\s*/g,"")){
      return "that reads: “" + card.text + "”";
    }
    else return false;
  },
  flavor: function(card){
    if (card.flavor && card.flavor.replace(/\s*/g,"")){
      return "whose flavor text is “" + card.flavor + "”";
    }
    else return false;
  }
};

function ngrams(array,n){
// Adapted from Natural
// (https://github.com/NaturalNode/natural/blob/master/lib/natural/ngrams/ngrams.js#L45):
// copyright (c) 2011, Rob Ellis, Chris Umbel
  var result = [];
  var count = array.length - n + 1;
  for (var i = 0; i < count; i++) {
    // console.log(array.slice(i, i + n));
    result.push(array.slice(i, i + n));
  }
  return result;
}

function info(pick,callback){
  var query = "http://magiccards.info/query?q=" +
        // '+l%3Aen' specifies English-language results
        pick + "+l%3Aen&v=card&s=cname";
  // run an search on magiccards.info and pluck a random result
  request({url: query}, function(err,response,body){
    if (err) return callback(err);
    if (body.match("Your query did not match any cards.")){
      return callback(new Error('No results for ' + pick));
    }
    var $ = cheerio.load(body);


    var results = $('table[align=center]');
    // the first centered table is not part of the search results
    var randomPick = random.integer(1, results.length - 1);
    var selection = results.eq(randomPick).children().first().children().eq(1).children().first(); // lol

    // remove whitespace and linebreaks
    var mtgName = selection.text().replace(/\\\\n/g,"");
    mtgName = mtgName.replace(/^\s*/g,"");
    mtgName = mtgName.replace(/\s*$/g,"");

    var href = selection.children().first().attr('href');

    if (mtgName && href) {
      return callback(null,{name: mtgName, href: href});
    }
    else {
      return callback(new Error('Bad response for query: ' + pick));
    }
  });
}

//////// needs to persist across message events
var currentCard = {};

slack.on('message', function(message) {
  if (message.type === 'message' && message.text) {
    var channel = slack.getChannelGroupOrDMByID(message.channel);

    // keep a separate record for each channel the bot is in
    if (!currentCard[message.channel]) {
      currentCard[message.channel] = {};
    }

    if (currentCard[message.channel].time){
      var diff = Date.now() - currentCard[message.channel].time;
      // if five minutes have elapsed and the card name hasn't been
      // guessed, reset
      if (diff > 300000) {
        currentCard[message.channel] = {};
      }
    }

    // if we're waiting for someone to guess the right answer
    if (currentCard[message.channel].name) {
      currentCard[message.channel].name = currentCard[message.channel].name.toLowerCase();
      var answer = message.text.toLowerCase().indexOf(currentCard[message.channel].name);
      if (answer > -1){
        channel.send('HELL YEAH OH YEAH ' + currentCard[message.channel].url);
        currentCard[message.channel] = {};
      }
    }

    // if we're not waiting for someone to guess the right answer
    else {
      var tokens = message.text.split(" ");

      var pick = '';
      if (tokens.length > 1){
        var bigrams = ngrams(tokens,2);
        pick = random.index(bigrams).join(" ");
      }
      else {
        pick = message.text;
      }

      info(pick, function(err,card){
        if (err) return err;

        var path = card.href.replace(/html/,"jpg");
        path = path.replace(/^\/([^\/]*)\/([^\/]*)/,"$2/$1");
        var img = 'http://magiccards.info/scans/' + path;

        var apiQuery = 'http://api.mtgapi.com/v2/cards?name=' +
              encodeURIComponent(card.name);

        request({url: apiQuery}, function(err,response,body){
          if (err) return err;
          var json = JSON.parse(body);

          if (!json.cards){
            console.log(json);
            return new Error('Bad API response');
          }
          var card = JSON.parse(body).cards[0];

          // don't even bother if the card name is in the card text
          // (if there is card text)
          if (!card.text || card.text.indexOf(card.name) < 0) {
            currentCard[message.channel].name = card.name;
            currentCard[message.channel].url = img;
            currentCard[message.channel].time = Date.now();

            var reply = "";

            var introductions = [
              "hey did i just hear someone mention the",
              "oh cool are we talking about the",
              "glad i'm not the only one thinking about the",
              "haha nice that reminds me of the"
            ];
            reply += random.index(introductions);
            reply += " ";

            var misc = [
              attributes.rarity(card),
              attributes.colors(card)
            ];
            reply += random.index(misc);
            reply += " ";

            if (card.power && card.toughness &&
                random.integer(0,1) === 1){
              var pt = [
                attributes.power(card),
                attributes.toughness(card)
              ].join("/");
              reply += pt;
              reply += " ";
            }

            var supType = attributes.supertypes(card);
            if (supType && random.integer(0,1) === 1){
              reply += supType + " ";
            }

            var subType = attributes.subtypes(card);
            if (subType && random.integer(0,1) === 1){
              reply += subType + " ";
            }

            reply += attributes.types(card);
            reply += " ";

            var misc2 = [
              attributes.set(card),
              attributes.manaCost(card)
            ];
            reply += random.index(misc2);
            reply += " ";

            var text = attributes.text(card);
            if (text) {
              reply += text;
              reply += " ";
            }

            // var flavor = attributes.flavor(card);
            // if (flavor && random.integer(0,2) === 1){
            //   reply += flavor;
            // }

            console.log(reply + ' (' + card.name + ')');
            return channel.send(reply);
          }
        });
      });
    }
  }
});

slack.on('error', function(error) {
  console.error('Error: %s', error);
});

slack.login();
