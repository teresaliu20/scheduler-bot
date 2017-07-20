
var mongoose = require('mongoose');
var Reminder = require('./models').Reminder;

//import slack rtm dependencies
var rtm = require('./bothelp').rtm;
var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

//connect to database using mongoose
var connect = process.env.MONGODB_URI || '';
mongoose.connect(connect);

//When the user is connected, find all their reminders and send a message to them containing all reminders
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  var today = new Date().toISOString().substring(0, 10); // change today's date to 'yyyy-mm-dd' format
  var tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10); // change tomorrow's date to 'yyyy-mm-dd' format
  Reminder.find({date: {$in: [today, tomorrow]}})
  .remove({date: today})
  .exec(function(err, reminders) { // find all reminders due today or tomorrow
    if (err) {
      console.log('error finding reminder ', err);
    }
    else {
      reminders.forEach((reminder) => {
        var dm = rtm.dataStore.getDMByUserId(reminder.userId); // dm object by userId
        var channel = dm.id; // dm channel by userId
        var date = (reminder.date === today? "today" : "tomorrow") // converts date to string 'today' or 'tomorrow'
        rtm.sendMessage('Reminder: You need to ' + reminder.subject + ' ' + date, channel) // send message to DM
      })
      rtm.disconnect();
      mongoose.connection.close();
    }
  })
});

rtm.start();
