var express = require('express');
var app = express();
var axios = require('axios');
var path = require('path');
var moment = require('moment-timezone');
require('./bot.js');

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

var google = require('googleapis');
var calendar = google.calendar('v3');
var plus = google.plus('v1');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.DOMAIN + '/connect/callback'
);

var models = require('./models');
var User = models.User;
var Reminder = models.Reminder;
var Meeting = models.Meeting;

var bothelp = require('./bothelp');
var rtm = bothelp.rtm;

// Redirects to Google OAuth2
// User must allow slackBot to access their google calendar
app.get('/google/oauth', function(req, res) {
  var url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/calendar',
        'email'
    ],
    state: encodeURIComponent(JSON.stringify({
        auth_id: req.query.auth_id
    }))
  })
  res.redirect(url);
});

// Handle callback from Google OAuth2
app.get('/connect/callback', function(req, res) {
  var authId = JSON.parse(decodeURIComponent(req.query.state)).auth_id;
  var code = req.query.code;
  oauth2Client.getToken(code, function (err, tokens) {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (!err) {
      oauth2Client.setCredentials(tokens);
      // Update the user's information in the database with google token information
      // This allows us to keep them authorized (Google OAuth)
      plus.people.get({userId: 'me', auth: oauth2Client}, function(err, response) {
        if (err) {
          console.log('error', err);
        }
        else {
          var newUser = new User({
            slackId: authId,
            slackName: rtm.dataStore.getUserById(authId).profile.real_name,
            email: response.emails[0].value,
            pendingState: JSON.stringify({
                invitees: []
            }),
            google: tokens
          });

          newUser.save()
          .then(result => {
            console.log("NEW USER SAVED WITH GOOGLE INFORMATION")
            res.send("Successfully logged into google")
          })
          .catch(err => {
            console.log("ERROR SAVING USER WITH GOOGLE INFORMATION")
            res.send({success: false, message: "Error trying to log into google"})
          })
        }
      })
    }
    else {
      res.send({success: false, error: err});
    }
  });
})

// Handle interactive message actions
app.post('/slack/interactive', function(req, res) {

  // Payload contains the interactive message information and event
  var payload = JSON.parse(req.body.payload);

  // Retrieve token associated with user from database
  User.findOne({slackId: payload.user.id}, function(err, user) {
    let pending;
      if (err) {
        console.log("ERROR FINDING USER", err);
      }
      else {
          // Since user.pendingState is a JSON string, parse the information
          var pendingState = JSON.parse(user.pendingState);
          // If user hits cancel, update the message text
          if (payload.actions[0].value === 'cancel') {
              var attachment = payload.original_message.attachments[0];
              delete attachment.actions;
              // Check to see if the pending state is a reminder or meeting
              // Then, respond accordingly
              if (pendingState.type === 'reminder') {
                  var dateStr = moment(pendingState.date, "America/Los_Angeles").format('dddd, LL');
                  attachment.text = 'Cancelled reminder: ' + pendingState.subject + ' on ' + dateStr;
                  attachment.color = '#DD4814';
                  res.json({
                      replace_original: true,
                      text: 'Cancelled reminder :x:',
                      attachments: [attachment]
                  });
              }
              else if (pendingState.type === 'meeting') {
                  var timeStr = pendingState.startTime.substring(0, 5) + (parseInt(pendingState.startTime.substring(0, 2)) > 11? ' PM' : ' AM') // format: 1:49 PM
                  var title = 'Meeting';
                  //otherwise, title becomes 'Meeting with ...'
                  if (pendingState.invitees !== []) {
                    title += ' with '
                    for (var i = 0; i < pendingState.invitees.length; i++) { // add all invitees to title
                      // if not yet reached the end of the invitee list or there is only one invitee, then add invitee name to title
                      if (i !== pendingState.invitees.length - 1 || i === pendingState.invitees.length - 1 && i === 0) {
                        title += pendingState.invitees[i]
                      }
                      // else if at the last name in invitee list, and an 'and' before the end
                      else {
                        title = title + ' and ' + pendingState.invitees[i]
                      }
                    }
                  }
                  attachment.text = 'Cancelled meeting';
                  attachment.color = '#DD4814';
                  res.json({
                      replace_original: true,
                      text: 'Cancelled ' + title + ' at ' + timeStr + ' :x:',
                      attachments: [attachment]
                  });
              }
          }
          else if (payload.actions[0].value === 'confirm') {

              oauth2Client.setCredentials(user.google);

              var attachment = payload.original_message.attachments[0]; // make a copy of attachments (the interactive part)
              delete attachment.actions; // delete buttons

              if (pendingState.type === 'reminder') {
                  var dateStr = moment(pendingState.date, "America/Los_Angeles").format('dddd, LL');
                  attachment.text = 'Reminder set: ' + pendingState.subject + ' on ' + dateStr; // change the text after the the confirm button was clicked
                  attachment.color = '#53B987' // change the color to green
                  res.json({
                      replace_original: true, // replace the original interactive message box with a new messagee
                      text: 'Created reminder :white_check_mark:',
                      attachments: [attachment]
                  });
                  // Retrieving the subject of the event in attachment fallback
                  var subject = pendingState.subject;
                  // Retrieving the date of the event in attachment pretext
                  var date = pendingState.date;
                  // Create the event for the Google Calendar API
                  let reminderEvent = {
                      'summary': subject,
                      'location': '',
                      'description': '',
                      'start': {
                          'date': date
                      },
                      'end': {
                          'date': date
                      }
                  }
                  // Save the reminder to the database
                  var newReminder = new Reminder({
                    subject: pendingState.subject,
                    date: pendingState.date,
                    userId: payload.user.id
                  })
                  newReminder.save(function(err, res) {
                      if (err) {
                          console.log("ERR", err);
                      }
                      else {
                        //Insert reminder into user's Google Calendar
                          calendar.events.insert({
                              auth: oauth2Client,
                              'calendarId': 'primary',
                              'resource': reminderEvent
                          }, function(err, resp) {
                              if (err) {
                                  console.log("ERROR INSERTING INTO GOOGLE CALENDAR: ", err);
                              }
                              else {
                                  console.log("REMINDER INSERTED INTO GOOGLE CALENDAR", resp);
                              }
                          })
                      }
                  })
              }
              else if (pendingState.type === 'meeting') {
                var startTimeStr = pendingState.date + ' ' + pendingState.startTime; // concatenate date and time to make a date obj later
                var startTime = new Date(startTimeStr).toISOString(); // create date object for start time

                // If end time isn't specified, set default end time to 30 minutes after start time
                // otherwise, set endtime
                var endTime = (pendingState.endTime === '' ?
                  new Date(new Date(startTimeStr).getTime() + 30*60*1000).toISOString() :
                  new Date(pendingState.date + ' ' + pendingState.endTime).toISOString());

                // Format proper title/summary for each event based on the invitee list
                // If the invitee list is empty, then title is just 'Meeting'
                var title = 'Meeting: ' + rtm.dataStore.getUserById(user.slackId).profile.real_name;
                //otherwise, title becomes 'Meeting with ...'
                if (pendingState.invitees !== []) {
                  for (var i = 0; i < pendingState.invitees.length; i++) { // add all invitees to title
                    // if not yet reached the end of the invitee list or there is only one invitee, then add invitee name to title
                    if (i !== pendingState.invitees.length - 1) {
                      let userInfo = rtm.dataStore.getUserById(pendingState.invitees[i]);
                      title += ", " + userInfo.profile.real_name;
                    }
                    // else if at the last name in invitee list, and an 'and' before the end
                    else {
                      let userInfo = rtm.dataStore.getUserById(pendingState.invitees[i]);
                      title = title + ' and ' + userInfo.profile.real_name;
                    }
                  }
                }
                // change the text after the the confirm button was clicked to green
                  attachment.text = 'Meeting set';
                  attachment.color = '#53B987';
                  var timeStr = pendingState.startTime.substring(0, 5) + (parseInt(pendingState.startTime.substring(0, 2)) > 11? ' PM' : ' AM') // format: 1:49 PM
                  // Replace the original interactive message with a new message, displaying confirmation information
                  res.json({
                      replace_original: true,
                      text: 'Created a ' + title + ' at ' + timeStr + ':white_check_mark:',
                      attachments: [attachment]
                  });

                  // Generate array of attendees
                  console.log("UPDATED PENDING INVITEES: ", pendingState.invitees)
                  let meetingEvent = {
                      'summary': title,
                      'location': pendingState.location,
                      'description': pendingState.description,
                      'start': {
                          'dateTime': startTime
                      },
                      'end': {
                          'dateTime': endTime
                      },
                      'attendees': attendees
                  }

                  // Create and save new meeting to database
                  var newMeeting = new Meeting({
                      date: pendingState.date,
                      startTime: startTime,
                      invitees: attendees,
                      userId: payload.user.id,
                      subject: pendingState.description,
                      location: pendingState.location,
                      endTime: endTime,
                      status: '',
                      createdAt: new Date().toISOString()
                  })

                  newMeeting.save(function(err, res) {
                      if (err) {
                          console.log("ERR", err);
                      }
                      else {
                          calendar.events.insert({
                              auth: oauth2Client,
                              'calendarId': 'primary',
                              'resource': meetingEvent
                          }, function(err, resp) {
                              if (err) {
                                  console.log("ERROR INSERTING MEETING INTO GOOGLE CALENDAR: ", err);
                              }
                              else {
                                  console.log("MEETING INSERTED INTO GOOGLE CALENDAR", resp);
                              }
                          })
                      }
                  })
              }
          }
      }
      // Reset pending state to an empty string after user has confirmed or cancelled action
      user.pendingState = JSON.stringify({
          invitees: []
      });
      user.save(function(err, found){
          if (err){
              console.log('error finding user with id', user._id);
          } else {
              console.log('3. user found and pending state cleared! yay.');
          }
      });
  })
});

app.listen(3000, function() {
  console.log("Server listening on port");
});
