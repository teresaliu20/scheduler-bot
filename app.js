var express = require('express');
var app = express();
var axios = require('axios');
var path = require('path');
require('./index.js');

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

var models = require('./models');
var User = models.User;

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
    console.log("AUTH ID : ", authId);
    oauth2Client.getToken(code, function (err, tokens) {
        // Now tokens contains an access_token and an optional refresh_token. Save them.
        if (!err) {
            oauth2Client.setCredentials(tokens);
            console.log("TOKENS: ",tokens);
            User.findByIdAndUpdate(authId, { $set: {google: tokens}}, function(err, user) {
                if (err) {
                    res.send({success: false, error: err});
                }
                else {
                    console.log(user);
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
app.post('/slack/message_action', function(req, res) {
    var payload = JSON.parse(req.body.payload);
    console.log("PAYLOAD: ", payload)
    if (payload.actions[0].value === 'confirm') {
        res.send('Created reminder :white_check_mark:');
    } else {
        res.send('Cancelled :x:');
    }
});

app.listen(3000, function() {
    console.log("Server listening on port");
});
