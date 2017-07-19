// Import slack RTM and Web API dependencies
var bothelp = require('./bothelp');
var rtm = bothelp.rtm;
var web = bothelp.web;
var meetOrRemind = bothelp.meetOrRemind;

var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var axios = require('axios');

// Mongoose Setup
var mongoose = require('mongoose');
var connect = process.env.MONGODB_URI || '';
mongoose.connect(connect);
var models = require('./models');
var User = models.User;
var Reminder = models.Reminder;

let channel;

// Authorization for Google Calendar
// Client ID and API key from the Developer Console
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// curl: 'https://api.api.ai/api/query?v=20150910&query=Remind%20me%20to%20eat&lang=en&sessionId=7bb85bf1-182a-4cb1-af4f-d0eb0bff7aa4&timezone=2017-07-17T17:46:37-0700' -H 'Authorization:Bearer 6b8e724b1c5844e3afbf4232cb1686cc'

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  for (const c of rtmStartData.channels) {
    if (c.is_member && c.name ==='general') {
      channel = c.id;
    }
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);

});

// Wait for the client to fully connect before you can send messages
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

      //store the user's information in the database if not already stored
      var newUser = new User({
          slackId: message.user,
          slackName: userInfo.name,
          email: userInfo.profile.email,
          pendingState: JSON.stringify({
            invitees: []
          })
      });
      newUser.save(function(err, user) {
        if (err) {
          res.send({failure: true, error: err, text: "error"});
        }
        else {
          rtm.sendMessage('Click on this link to log into your google account: ' + process.env.DOMAIN + '/google/oauth?auth_id=' + user._id, message.channel);
        }
      });
    }
    else {
      // send message text as query to Paul, the Api.Ai schedule bot brain
      
      // Replace the <@SlackId> with the user's real name for Api.Ai
      var pendingStateObj = JSON.parse(user.pendingState);

      if (message.text.indexOf('<@U') > -1) {
        var toReplace = message.text.substring(message.text.indexOf('<@U'), message.text.indexOf('<@U') + 12);
        let userInfo = rtm.dataStore.getUserById(toReplace.substring(2, 11));
        message.text = message.text.replace(toReplace, userInfo.profile.real_name);

        pendingStateObj.invitees.push(toReplace.substring(2, 11));
        var newInvitees = pendingStateObj.invitees;
        user.pendingState = JSON.stringify({
          invitees: newInvitees
        })
        user.save(function(err, res) {
          if (err) {
            console.log("Error saving new invitees");
          }
          else {
            console.log("NEW INVITEES SAVED")
          }
        }) 
      }

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

        User.findOne({slackId: message.user}, function(err, user){
          var id = user._id;
          if (err){
            console.log('Database error', err);
          } else {
            // check if the user has not confirmed or cancelled a previous action
            if (user.pendingState){
              var state = JSON.parse(user.pendingState);
              if (state.subject){
                rtm.sendMessage(`Sorry! Looks like you haven't confirmed or cancelled our last task! Please pick an action to continue.`, message.channel);
                return;
              }
            }
            // At this point, the user has no pending actions,
            // so we allow them to make meetings and reminders using meetOrRemind
            meetOrRemind( data, message, user );
            return;
          }
        })
      })
      .catch((err) => {
        console.log('error:', err);
      });
    }
  });
});


rtm.start();
