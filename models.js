const mongoose = require('mongoose');

// create a user schema to store login info accessed by Google OAuth and Slack
var userSchema = mongoose.Schema({
    google: {
      profile_id: String,
      profile_name: String,
      access_token: String,
      refresh_token: String,
      id_token: String,
      token_type: String,
      expiry_date: Number
    },
    slackId: String,
    fullName: String,
    slackDMId: String,
    email: String,
    pendingState: String
});

// create a reminder schema to store reminders for each user
// these will be accessed later using the user's slackId (userId)
var reminderSchema = mongoose.Schema({
  subject: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required:true
  },
  userId: String
});

// create a meeting schema to store meetings for each user
// these can be accessed later using their slackId (userId)
var meetingSchema = mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  invitees: {
    type: Array,
    required: true
  },
  subject: String,
  location: String,
  meetingLength: Number,
  endTime: String,
  status: String,
  createdAt: String,
  userId: String
})

var User = mongoose.model('User', userSchema);
var Reminder = mongoose.model('Reminder', reminderSchema);
var Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = {
    User: User,
    Reminder: Reminder,
    Meeting: Meeting
};
