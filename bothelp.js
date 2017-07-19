var RtmClient = require('@slack/client').RtmClient;
var WebClient = require('@slack/client').WebClient;
// var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
// var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var bot_token = process.env.SLACK_BOT_TOKEN || '';
var token = process.env.SLACK_API_TOKEN || '';

var models = require('./models');
var User = models.User;

var rtm = new RtmClient(bot_token);
var web = new WebClient(bot_token);


var response = function(parameters){
  var dateStr = (new Date(parameters.date)).toDateString();
  var words = 'Creating reminder "' + parameters.subject + '" on ' + dateStr;
  return words;
}

var messageObject = {
  "text": "Would you like to play a game?",
  "attachments": [
    {
      "text": "Would you like to confirm?",
      "fallback": "You are unable to choose an action",
      "callback_id": "action",
      "color": "#3AA3E3",
      "attachment_type": "default",
      "actions": [
        {
          "name": "action",
          "text": "Confirm",
          "type": "button",
          "value": "confirm"
        },
        {
          "name": "action",
          "text": "Cancel",
          "type": "button",
          "value": "cancel"
        }
      ]
    }
  ]
}

var distinguish = function(data, message){
  if (data.result.action === 'reminder:add'){
    messageObject.text="Would you like to set this Reminder?";
  } else if (data.result.action === 'meeting:add'){
    messageObject.text="Would you like to set the Meeting?";
  } else {
    console.log('Action: ', data.result.action);
  }
  web.chat.postMessage(message.channel, response(data.result.parameters), messageObject)
}

function meetOrRemind(data, message, user){
  console.log(data);
  if (data.result.actionIncomplete) {
    rtm.sendMessage(data.result.fulfillment.speech, message.channel);
  }
  else if (data.result.action === 'reminder:add' || data.result.action === 'meeting:add') {
    distinguish(data, message);
    user.pendingState = JSON.stringify({
      date: data.result.parameters.date,
      subject: data.result.parameters.subject
    });

    user.save(function(err, found){
      console.log(found);
      if (err){
        console.log('error finding user with id', user._id);
      } else {
        console.log('user found and pending state set! yay.');
      }
    })

  } else if (!data.result.actionIncomplete){
    rtm.sendMessage(data.result.fulfillment.speech, message.channel);
  } else {
    rtm.sendMessage('I don\'t understand that. Sorry!', message.channel);
  }
}

module.exports = {
    meetOrRemind: meetOrRemind,
    rtm: rtm,
    web: web,
};
