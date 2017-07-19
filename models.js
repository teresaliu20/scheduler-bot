const mongoose = require('mongoose');

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
    slackName: String,
    slackDMId: String,
    email: String,
    pendingState: String
});

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

var meetingSchema = mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  time: {
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
