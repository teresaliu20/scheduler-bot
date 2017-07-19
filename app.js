var express = require('express');
var app = express();
var axios = require('axios');
var path = require('path');
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


// Route to handle interactive message actions
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
                    attachment.text = 'Cancelled reminder';
                    attachment.color = '#DD4814';
                    res.json({
                        replace_original: true,
                        text: 'Cancelled reminder :x:',
                        attachments: [attachment]
                    });
                }
                else if (pendingState.type === 'meeting') {
                    attachment.text = 'Cancelled meeting';
                    attachment.color = '#DD4814';
                    res.json({
                        replace_original: true,
                        text: 'Cancelled meeting :x:',
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
                    attachment.text = 'Reminder set'; // change the text after the the confirm button was clicked
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

                  // format proper title/summary for each event based on the invitee list
                  var title = 'Meeting'; // if the invitee list is empty, then title is just 'Meeting'
                  if (pendingState.invitees !== []) { // otherwise, title becomes 'Meeting with ...'
                    title += ' with '
                    for (var i = 0; i < pendingState.invitees.length; i++) { // add all invitees to title
                      // if not yet reached the end of the invitee list or there is only one invitee, then add invitee name to title
                      if (i !== pendingState.invitees.length - 1 || i === pendingState.invitees.length - 1 && i === 0) {
                        title += pendingState.invitees[i]
                      }
                      else { // else if at the last name in invitee list, and an 'and' before the end
                        title = title + ' and ' + pendingState.invitees[i]
                      }
                    }
                  }

                    attachment.text = 'Meeting set'; // change the text after the the confirm button was clicked
                    attachment.color = '#53B987' // change the color to green
                    res.json({
                        replace_original: true, // replace the original interactive message box with a new messagee
                        text: 'Created a ' + title + 'at ' + pendingState.startTime + ':white_check_mark:', // display confirmation information
                        attachments: [attachment]
                    });
                    let meetingEvent = {
                        'summary': title,
                        'location': pendingState.location,
                        'description': pendingState.description,
                        'start': {
                            'dateTime': startTime
                        },
                        'end': {
                            'dateTime': endTime
                        }
                    }
                    console.log("SAVE MEETIN HERE");
                    console.log("PENDING STATE", pendingState);
                    var newMeeting = new Meeting({
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
        user.pendingState = JSON.stringify({});
        user.save(function(err, found){
            if (err){
                console.log('error finding user with id', user._id);
            } else {
                console.log('user found and pending state cleared! yay.');
            }
        });
    })
});

app.listen(3000, function() {
    console.log("Server listening on port");
});
