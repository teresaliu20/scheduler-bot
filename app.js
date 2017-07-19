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

var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.DOMAIN + '/connect/callback'
);

var calendar = google.calendar('v3');

var models = require('./models');
var User = models.User;
var Reminder = models.Reminder;

// Redirects to Google OAuth2
app.get('/google/oauth', function(req, res) {
    // Generate a redirect url when user logs into google
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/calendar'
        ],
        // Encodes the auth_id from the passed in query that saves current user's id
        state: encodeURIComponent(JSON.stringify({
            auth_id: req.query.auth_id
        }))
    })
    // Redirect to the generated URL
    res.redirect(url);
});

// Handles callback created from Google OAuth2 when the user logs in
app.get('/connect/callback', function(req, res) {
    // Decodes the auth_id from query, used to find current user from database
    var authId = JSON.parse(decodeURIComponent(req.query.state)).auth_id;
    // Authorization code generated from the google server using the request token
    var code = req.query.code;
    console.log("AUTH ID : ", authId);
    oauth2Client.getToken(code, function (err, tokens) {
        // Now tokens contains an access_token and an optional refresh_token that we save
        if (!err) {
            oauth2Client.setCredentials(tokens);
            console.log("TOKENS: ",tokens);
            // Save the tokens to the current user in the database to use later
            User.findByIdAndUpdate(authId, { $set: {google: tokens}}, function(err, user) {
                if (err) {
                    res.send({success: false, error: err});
                }
                else {
                    console.log('FOUND USER', user);
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
    console.log("OAUTH2CLIENT", oauth2Client);

    // Payload contains the interactive message information and event
    var payload = JSON.parse(req.body.payload);
    console.log('PAYLOAD INTERACTIVE', req.body);

    // Must retrieve token associated with user stored in database
    User.findOne({slackId: payload.user.id}, function(err, user) {
      let pending;

        if (err) {
            console.log("ERROR FINDING USER", err);
        }
        else {
            oauth2Client.setCredentials({
                'access_token': user.google.access_token,
                'refresh_token': user.google.refresh_token
            });
            var pendingState = JSON.parse(user.pendingState);
            console.log(pendingState);

            console.log('hi');

            // If the user clicked confirm, create Google Calendar event
            // if user has not clicked confirm or cancel they are still in 'pending' state
            if (payload.actions[0].value === 'confirm') {
                var attachment = payload.original_message.attachments[0]; // make a copy of attachments (the interactive part)
                delete attachment.actions; // delete buttons
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
                    'summary': 'test summary', // test data
                    'location': '221 7th St, San Francisco', // test data
                    'description': 'text Teresa',// test data
                    'start': {
                        'date': '2017-07-18'// test data
                    },
                    'end': {
                        'date': '2017-07-18'// test data
                    }
                }
                var newReminder = new Reminder({
                  subject: pendingState.subject,
                  date: pendingState.date,
                  userId: payload.user.id
                })
                newReminder.save();

                // Insert the event into the user's primary calendar
                calendar.events.insert({
                    auth: oauth2Client,
                    'calendarId': 'primary',
                    'resource': reminderEvent
                }, function(err, resp) {
                    if (err) {
                        console.log("ERROR INSERTING INTO GOOGLE CALENDAR: ", err);
                    }
                    else {
                        console.log("REMINDER INSERTED INTO GOOGLE CALENDAR");
                    }
                })
                user.pendingState = JSON.stringify({});

                user.save(function(err, found){
                  console.log(found);
                  if (err){
                    console.log('error finding user with id', user._id);
                  } else {
                    console.log('user found and pending state cleared! yay.');
                  }
                });

            }
            else {
                // If the cancel button is pressed instead, cancel the event
                var attachment = payload.original_message.attachments[0];
                delete attachment.actions;
                attachment.fallback = '';
                attachment.pretext = '';
                console.log(attachment);
                attachment.text = 'Cancelled reminder';
                attachment.color = '#DD4814'
                res.json({
                    replace_original: true,
                    text: 'Cancelled reminder :x:',
                    attachments: [attachment]
                });
                user.pendingState = JSON.stringify({});

                user.save(function(err, found){
                  console.log(found);
                  if (err){
                    console.log('error finding user with id', user._id);
                  } else {
                    console.log('user found and pending state cleared! yay.');
                  }
                });

            }
        }
    })
});

app.listen(3000, function() {
    console.log("Server listening on port");
});
