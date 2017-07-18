// Slack RTM set-up
var RtmClient = require('@slack/client').RtmClient;
var WebClient = require('@slack/client').WebClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var bot_token = process.env.SLACK_BOT_TOKEN || '';
var token = process.env.SLACK_API_TOKEN || '';

var rtm = new RtmClient(bot_token);
var web = new WebClient(bot_token);

var axios = require('axios');

// Mongoose Setup
var mongoose = require('mongoose');
var connect = process.env.MONGODB_URI || '';
mongoose.connect(connect);
var models = require('./models');
var User = models.User;

let channel;

// Authorization for Google Calendar
// Client ID and API key from the Developer Console
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

/**
*  Initializes the API client library and sets up sign-in state
*  listeners.
*/
function initClient() {
gapi.client.init({
    discoveryDocs: DISCOVERY_DOCS,
    clientId: GOOGLE_CLIENT_ID,
    scope: SCOPES
}).then(function () {
    // Listen for sign-in state changes.
    gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

    // Handle the initial sign-in state.
    updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    authorizeButton.onclick = handleAuthClick;
    signoutButton.onclick = handleSignoutClick;
});
}




// curl: 'https://api.api.ai/api/query?v=20150910&query=Remind%20me%20to%20eat&lang=en&sessionId=7bb85bf1-182a-4cb1-af4f-d0eb0bff7aa4&timezone=2017-07-17T17:46:37-0700' -H 'Authorization:Bearer 6b8e724b1c5844e3afbf4232cb1686cc'

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  for (const c of rtmStartData.channels) {
    if (c.is_member && c.name ==='general') { channel = c.id }
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

// you need to wait for the client to fully connect before you can send messages
// rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
//     rtm.sendMessage("Beep.", channel);
// });


rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    var dm = rtm.dataStore.getDMByUserId(message.user);
    if (!dm || dm.id !== message.channel) {
        return;
    }
    User.findOne({slackId: message.user}, function(err, user) {
        if (err) {
            res.send({failure: true, error: err});
        }
        else if (!user) {
            var userInfo = rtm.dataStore.getUserById(message.user);
            var newUser = new User({
                slackId: message.user,
                slackName: userInfo.name,
                email: userInfo.profile.email
            });
            newUser.save(function(err, user){
                if (err) {
                    res.send({failure: true, error: err});
                }
                else {
                    rtm.sendMessage('Click on this link to log into your google account: ' + process.env.DOMAIN + '/google/oauth?auth_id=' + user._id, message.channel);
                }
            })
        }
        else {
            console.log(message);
            axios.get('https://api.api.ai/api/query', {
                params: {
                    v: '20150910',
                    lang: 'en',
                    timezone: '2017-07-17T16:55:33-0700',
                    query: message.text,
                    sessionId: message.user
                },
                headers: {
                  'Authorization': `Bearer ${process.env.API_AI_TOKEN}`
                }
              })
            .then(({ data }) => {
                console.log(data);
                if (data.result.actionIncomplete !== false) {
                    rtm.sendMessage(data.result.fulfillment.speech, message.channel);
                }
                else if (data.result.action === 'reminder:add') {
                    console.log('ACTION IS COMPLETE', data.result);
                    web.chat.postMessage(message.channel, 'Creating reminder for ' + data.result.parameters.subject + ' on ' + data.result.parameters.date, {
                        "text": "Would you like to play a game?",
                        "attachments": [
                           {
                               "text": "Choose an action",
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
                    })

                }
                else {
                    rtm.sendMessage('I don\'t understand that. Sorry!', message.channel);
                }
            })
        }
    })
});

rtm.start();
