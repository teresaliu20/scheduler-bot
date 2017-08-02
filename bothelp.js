var RtmClient = require('@slack/client').RtmClient;
var WebClient = require('@slack/client').WebClient;
var moment = require('moment-timezone');
// var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
// var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var bot_token = process.env.SLACK_BOT_TOKEN || '';
var token = process.env.SLACK_API_TOKEN || '';

var rtm = new RtmClient(bot_token);
var web = new WebClient(bot_token);

var reminderResponse = function(parameters) {
  var dateStr = moment(parameters.date, "America/Los_Angeles").format('dddd, LL'); // format: Wednesday, July 19, 2017
  var words = 'Creating reminder: ' + parameters.subject + ' on ' + dateStr;
  return words;
}

var meetingResponse = function(parameters, user) {
  var dateStr = moment(parameters.date, "America/Los_Angeles").format('dddd, LL'); // format: Wednesday, July 19, 2017
  var timeStr = parameters.time[0].substring(0, 5) + (parseInt(parameters.time[0].substring(0, 2)) > 11? ' PM' : ' AM') // format: 1:49 PM
  var invitees = '';
  var pendingStateObj = JSON.parse(user.pendingState);
  for (var i = 0; i < pendingStateObj.invitees.length; i++) { // add all invitees to invitees
    // if not yet reached the end of the invitee list or there is only one invitee, then add invitee name to title
    let name = rtm.dataStore.getUserById(pendingStateObj.invitees[i]).profile.real_name;
    if (i !== pendingStateObj.invitees.length - 1 || i === pendingStateObj.invitees.length - 1 && i === 0) {
      invitees += name;
    }
    // else if at the last name in invitee list, and an 'and' before the end
    else {
      invitees = invitees + ' and ' + name;
    }
  }
  var words = 'Schedule a meeting with ' + invitees + ' on ' + dateStr + ' at ' + timeStr;
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

var durationObject = {
    "text": "How long would you like to have your meeting?",
    "response_type": "in_channel",
    "attachments": [
        {
            "text": "Select how long you would like your meeting",
            "fallback": "If you could read this message, the user is selecting the duration of the meeting.",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "callback_id": "duration_selection",
            "actions": [
                {
                    "name": "duration_list",
                    "text": "Choose a length of time",
                    "type": "select",
                    "options": [
                        {
                            "text": "15 minutes",
                            "value": "15"
                        },
                        {
                            "text": "30 minutes",
                            "value": "30"
                        },
                        {
                          "text": "45 minutes",
                          "value": "45"
                        }
                    ]
                }
            ]
        }
    ]
}


function meetOrRemind(data, message, user){
  if (JSON.parse(user.pendingState).invitees.length === 0 && data.result.action === "meeting:add") {
    rtm.sendMessage("With whom do you want to meet?", message.channel);
  }
  else if (data.result.actionIncomplete) {
    rtm.sendMessage(data.result.fulfillment.speech, message.channel);
  }
  else if (data.result.action === 'reminder:add') {
    web.chat.postMessage(message.channel, reminderResponse(data.result.parameters), messageObject);
    user.pendingState = JSON.stringify({
      type: 'reminder',
      date: data.result.parameters.date,
      subject: data.result.parameters.subject
    });
    user.save(function(err, found){
    if (err){
      console.log('error finding user with id', user._id);
      } else {
      console.log('1. user found and pending state set! yay.');
      }
    })
  }
  else if (data.result.action === 'meeting:add') {

    var slackIdsInvitees = JSON.parse(user.pendingState);

    user.pendingState = JSON.stringify({
      type: 'meeting',
      date: data.result.parameters.date,
      startTime: data.result.parameters.time[0], // startTime in time array
      endTime: data.result.parameters.time[1] || '', // endTime in time array
      invitees: slackIdsInvitees.invitees,
      description: data.result.parameters.subject || '',
      location: data.result.parameters.location || ''
    });
    user.save()
    .then(savedUser => {
      web.chat.postMessage(message.channel, meetingResponse(data.result.parameters, savedUser), messageObject);
      console.log('duration', data.result.parameters);
      if (data.result.parameters.duration !== '') {
        web.chat.postMessage(message.channel, "How long?", durationObject);b
      }
    })
    .catch(err => console.log("ERROR: ", err))
  }
  else {
    rtm.sendMessage('I don\'t understand that. Sorry!', message.channel);
  }
}

module.exports = {
    meetOrRemind: meetOrRemind,
    rtm: rtm,
    web: web,
};
