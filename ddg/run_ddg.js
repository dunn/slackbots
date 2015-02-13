#!/usr/bin/env node

var Slack = require('slack-client');
var ddg = require('ddg');

var token = require('./secrets.js').slack,
    autoReconnect = true,
    autoMark = true;

var slack = new Slack(token,autoReconnect,autoMark);

slack.on('message', function(message) {
  if (message.type === 'message') {
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
    var nameIndex = message.text.toLowerCase().indexOf(slack.self.name.toLowerCase());
    var mentioned = (idIndex > -1 || nameIndex > -1);

    if (mentioned || isDM) {
      var string = '';
      if (idIndex > -1) {
        // + 2 because the id is wrapped in <>
        string = message.text.slice(idIndex +
                                    slack.self.id.length + 2);
      }
      else if (nameIndex > -1) {
        string = message.text.slice(nameIndex +
                                    slack.self.name.length + 1);
      }
      else {
        string = message.text;
      }
      // console.log(string);
      var query = string.replace(/^\s*/g,"");
      query = string.replace(/\s*$/g,"");

      channel.send('Searching for “' + query + '”…');
      console.log('Searching for “' + query + '”…');
      var duckDuckOpts = {
        format: 'json'
      };

      ddg.query(query, duckDuckOpts, function(err,data) {
        if (err) {
          channel.send('`' + err + '`');
          return console.error(err);
        }
        // console.log(data);
        if (!data.RelatedTopics.length) {
          channel.send('`No results found!`');
          return new Error('No results found for ' + query);
        }

        var firstAnswer = data.RelatedTopics[0].Text;
        // firstAnswer = firstAnswer.replace(/^[^\ ]*\ /,"");

        var reply = firstAnswer;
        reply += ' (more: ' + data.RelatedTopics[0].FirstURL + ')';

        console.log(reply);
        return channel.send(reply);
      });
    }
  }
});

slack.on('error', function(error) {
  return new Error('Error: %s', error);
});

slack.login();
