#!/usr/bin/env node

var Slack = require('slack-client');
// api + search for library genesis:
var libgen = require('libgen');
// determine similarity of strings:
var distance = require('natural').JaroWinklerDistance;

// see https://github.com/slackhq/node-slack-client/blob/master/examples/simple.js
var token = require('./secrets.js').slack,
    autoReconnect = true,
    autoMark = true;

var slack = new Slack(token,autoReconnect,autoMark);

slack.on('message', function(message) {
  if (message.type === 'message' && message.text) {
    var channel = slack.getChannelGroupOrDMByID(message.channel);

    var isDM = false;
    // message._client.dms contains all the DM channels the bot is in
    for (var key in message._client.dms){
      if (message.channel === key) {
        isDM = true;
        break;
      }
    }

    var idIndex = message.text.toLowerCase().indexOf(slack.self.id.toLowerCase());
    var nameIndex = message.text.toLowerCase().indexOf(slack.self.name.toLowerCase());
    var mentioned = (idIndex > -1 || nameIndex > -1);

    if (mentioned || isDM){
      var string = '';
      if (idIndex > -1){
        // + 2 because the id is wrapped in <>
        string = message.text.slice(idIndex +
                                    slack.self.id.length + 2);
      }
      else if (nameIndex > -1){
        string = message.text.slice(nameIndex +
                                    slack.self.name.length + 1);
      }
      else {
        string = message.text;
      }
      // console.log(string);
      var query = string.replace(/^\s*/g,"");
      query = string.replace(/\s*$/g,"");

      if (query.length < 4){
        var oops = 'Queries must be at least 4 characters long!';
        channel.send(oops);
        return console.error(oops);
      }
      else {
        channel.send('Searching for “' + query + '”…');
        console.log('Searching for “' + query + '”…');
        var libOpts = {
          // https://github.com/dunn/libgen.js#usage-choosing-a-mirror
          // but http://libgen.org is down rn ¯\_(ツ)_/¯
          mirror: 'http://gen.lib.rus.ec',
          query: query,
          count: 5
        };

        libgen.search(libOpts, function(err,data){
          if (err) {
            channel.send('`' + err + '`');
            return console.error(err);
          }
          var response = 'Are you thinking of ';

          var similar = false,
              previous = [];

          var end = data.length;
          var i = 0;
          for (i; i < end; i++) {
            if (i > 0) {
              // check all previous titles for similarity
              previous = data.slice(0,i);
              similar = previous.some(function(value,index,array){
                var sim = (distance(data[i].Title,previous[index].Title) * 10);
                // don't treat titles as similar to themselves:
                return (i === index) ? false : sim >= 7;
              });
            }
            else {
              similar = false;
            }

            if (!similar) {
              if (i > 0) response += ' or ';
              response += '_' + data[i].Title + '_' +
                ' (http://gen.lib.rus.ec/book/index.php?md5=' +
                data[i].MD5.toLowerCase() + ')';
            }
          }
          channel.send(response);
          return console.log(response);
        });
      }
    }
  }
  else {
    console.error(message);
    return new Error('No text in message');
  }
});

slack.on('error', function(error) {
	return new Error('Error: %s', error);
});

slack.login();
