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
app.get('/google/oauth', function(req, res) {
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/calendar'
        ],
        state: encodeURIComponent(JSON.stringify({
            auth_id: req.query.auth_id
        }))
    })
    res.redirect(url);
});

// Handles callback from Google OAuth2
app.get('/connect/callback', function(req, res) {
    var authId = JSON.parse(decodeURIComponent(req.query.state)).auth_id;
    var code = req.query.code;
    oauth2Client.getToken(code, function (err, tokens) {
        // Now tokens contains an access_token and an optional refresh_token. Save them.
        if (!err) {
            oauth2Client.setCredentials(tokens);
            User.findByIdAndUpdate(authId, { $set: {google: tokens}}, function(err, user) {
                if (err) {
                    res.send({success: false, error: err});
                }
                else {
                    res.send({success: true});
                }
            })
        }
        else {
            console.log("ERR", err);
            res.send({success: false});
        }
    });

})

// Handle interactive message actions
app.post('/slack/interactive', function(req, res) {

    // Payload contains the interactive message information and event
    var payload = JSON.parse(req.body.payload);

    // Must retrieve token associated with user stored in database
    User.findOne({slackId: payload.user.id}, function(err, user) {
      let pending;
        if (err) {
            console.log("ERROR FINDING USER", err);
        }
        else {
            var pendingState = JSON.parse(user.pendingState);
            // If user hits cancel, update the message text
            if (payload.actions[0].value === 'cancel') {
                var attachment = payload.original_message.attachments[0];
                delete attachment.actions;
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
                oauth2Client.setCredentials({
                    'access_token': user.google.access_token,
                    'refresh_token': user.google.refresh_token
                });

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
                        'summary': 'EVENT SUMMARY',
                        'location': '',
                        'description': '',
                        'start': {
                            'date': '2017-06-19'
                        },
                        'end': {
                            'date': '2017-06-19'
                        }
                    }
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
                  console.log('PENDING STATE', pendingState);
                  var startTimeStr = pendingState.date + ' ' + pendingState.startTime; // concatenate date and time to make a date obj later
                  var startTime = new Date(startTimeStr).toISOString(); // create date object for start time
                  var endTime = (pendingState.endTime === '' ? // if end time isn't specified
                    new Date(new Date(startTimeStr).getTime() + 30*60*1000).toISOString() : // make end time 30 minutes later than start time
                    new Date(pendingState.date + ' ' + pendingState.endTime).toISOString()); // otherwise, make endtime as specified


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
                    var attendees = [];
                    for (var i = 0; i < pendingState.invitees.length; i++) {
                        let user = rtm.dataStore.getUserById(pendingState.invitees[i]);
                        attendees.push({
                            'email' : user.profile.email
                        });
                    }

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
                //added for the time conflict resolution
            } else if (payload.actions[0].selected_options.value){
              var selected = JSON.parse(payload.actions[0].selected_options.value)
              //store the time they have selected as a new meetingEvent
              var newerMeeting = new Meeting({
                  date: pendingState.date,
                  startTime: startTime,
                  invitees: pendingState.invitees || [],
                  userId: payload.user.id,
                  subject: pendingState.description,
                  location: pendingState.location,
                  endTime: endTime,
                  status: '',
                  createdAt: new Date().toISOString()
              })
              newerMeeting.save(function(err, res) {
                  if (err) {
                      console.log("ERR", err);
                  }
                  else {
                      calendar.events.insert({
                          auth: oauth2Client,
                          'calendarId': 'primary',
                          'resource': meetingEvent
                      }, function(err2, resp) {
                          if (err2) {
                              console.log("ERROR INSERTING MEETING INTO GOOGLE CALENDAR: ", err2);
                          }
                          else {
                              console.log("MEETING INSERTED INTO GOOGLE CALENDAR", resp);
                          }
                      })
                  }
              })

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
