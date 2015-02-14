#!/usr/bin/env node

var Slack = require('slack-client');
var urban = require('urban');

var token = require('./secrets.js').slack,
    autoReconnect = true,
    autoMark = true;

var slack = new Slack(token,autoReconnect,autoMark);


var resCounter;

slack.on('message', function(message) {
  if (message.type === 'message' && message.text) {
    var channel = slack.getChannelGroupOrDMByID(message.channel);

    var isDM = false;
    // message._client.dms contains all the DM channels the bot is in
    for (var key in message._client.dms) {
      if (message.channel === key) {
        isDM = true;
        break;
      }
    }

    var idIndex = message.text.toLowerCase().indexOf(slack.self.id.toLowerCase());
    startsWithMention = (idIndex === 2)

    if (startsWithMention|| isDM) {
      var query;
      if (isDM) {
        if(startsWithMention) {
          return channel.send("you don't need to call me by _name_ here!\n This is just b/w us ;-)")
        }
        else{
          query = message.text.trim();
        }
      }
      else {
        query = message.text.slice(idIndex +
                                    slack.self.id.length + 2).trim();
      }// + 2 because the id is wrapped in <>

      if(query === "") {
        channel.send('_Nice try, bub. We see what u did there. GIVE US A STRING NEXT TIME._');
      }
      else if(query === "!next") {
        lookup.results(function(json) {
          resCounter++;
          if(resCounter >= json.length) {
            channel.send('`No more results, sry bb </3`');
          }
          else{
            channel.send(json[resCounter].definition);
            channel.send("*eg:*  " + json[resCounter].example)
          }
        });
      }
      else{
        resCounter = 0;
        channel.send('Searching for “' + query + '”…');
        console.log('Searching for “' + query + '”…');

        lookup = urban(query)

        lookup.first(function(json) {
          if(json) {
            channel.send(json.definition);
            channel.send("*eg:*  " + json.example)
          }
          else{
            channel.send("`Sry, we couldn't find that :'(`");
          }
        });
      }
    }
  }
});

slack.on('error', function(error) {
  return new Error('Error: %s', error);
});

slack.login();
