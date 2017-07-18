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
    email: String,
    pendingState: {
      subject: String,
      date: String,
      userId: String
    }
});

var reminderSchema = mongoose.Schema({
  subject: String,
  date: String,
  userId: String
});

var User = mongoose.model('User', userSchema);
var Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = {
    User: User,
    Reminder: Reminder
};
